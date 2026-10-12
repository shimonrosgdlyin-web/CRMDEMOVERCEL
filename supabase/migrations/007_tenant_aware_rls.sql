-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 007: tenant-aware RLS rewrite (Stage 2 of the multi-tenant
-- conversion roadmap — "the highest-risk phase")
--
-- Replaces the flat `using (auth.uid() = agent_id)` policies from
-- 001/002/003 on properties, clients, property_client_matches, and
-- inquiries with org-aware policies, per two now-resolved product
-- decisions. 004/005/006 are confirmed applied to the live project and are
-- treated as frozen (never edited in place); this migration only drops and
-- recreates policies on the 4 pre-existing business tables — it does not
-- touch organizations/organization_members at all.
--
-- ─────────────────────────────────────────────────────────────────────────
-- DECISION 1 — a user can belong to multiple organizations (no schema
-- change; organization_members already has no single-org-per-user
-- constraint, only unique(organization_id, user_id)).
--
-- This RLS design does not assume single-org-per-user, and needs no change
-- to do that: is_org_member(org_id)/is_org_admin(org_id) (from 004) both
-- take the SPECIFIC organization_id of the ROW being evaluated as their
-- argument and check "is auth.uid() a member/admin of *that* org" — never
-- "what is the user's one org." Every policy below calls one of these two
-- functions with that row's own organization_id, so correctness is
-- evaluated per-row, independent of how many other orgs the caller belongs
-- to. There is no "current active org" concept in RLS at all (that's a
-- session/UI concept for a later stage's workspace switcher) — a user with
-- rows in 3 different orgs simply gets each row evaluated against its own
-- organization_id, which is already exactly correct multi-org behavior.
--
-- DECISION 2 — cross-agent visibility within an org:
--   - properties: shared org-wide ("shop window") — any member of the
--     org can see/create/edit/delete any property belonging to that org.
--   - clients / property_client_matches / inquiries: private to the
--     assigned agent, except owner/admin who see everything (STSICONIC- /
--     real-brokerage-style: leads belong to a responsible agent, manager
--     has an oversight view).
--
-- Per-table mapping:
--   properties                — for select/insert/update/delete:
--                                is_org_member(organization_id)
--   clients                   — select/update/delete:
--                                agent_id = auth.uid() or is_org_admin(organization_id)
--                                insert (additionally requires org membership —
--                                this is the seed of "lead assignment": an
--                                admin/owner may insert a client assigned to
--                                a *different* agent, an ordinary agent may
--                                only insert one assigned to themselves):
--                                is_org_member(organization_id)
--                                and (agent_id = auth.uid() or is_org_admin(organization_id))
--   property_client_matches   — same shape as clients (a match reveals which
--                                client is interested in which property —
--                                that's lead data, follows the client's
--                                privacy rule, not the property's). Uses this
--                                table's own agent_id (002) / organization_id
--                                (005) columns.
--   inquiries                 — same shape as clients (activity log tied to
--                                a specific client relationship). Uses this
--                                table's own agent_id (003) / organization_id
--                                (005) columns.
--
-- ─────────────────────────────────────────────────────────────────────────
-- OPERATIONAL CONSEQUENCE — stated plainly, and precisely (see note below
-- on where a blanket "zero data" framing is and isn't accurate):
--
-- organization_id is still nullable and NULL on every row of all 4 tables
-- today — nothing in the app writes it yet (Stage 3's signup/invite flow).
-- is_org_member(NULL) and is_org_admin(NULL) both always evaluate false
-- (the helper functions' `where organization_id = target_org_id` never
-- matches on a NULL comparison in SQL). Concretely, the moment this
-- migration is applied:
--   - properties: SELECT/INSERT/UPDATE/DELETE are ALL blocked for
--     everyone. is_org_member(organization_id) is the *only* gate here, no
--     agent_id fallback exists in this table's policies at all, so this
--     table genuinely goes to zero rows/zero writes for every user.
--   - clients / property_client_matches / inquiries: INSERT is blocked for
--     everyone (the `is_org_member(organization_id) and (...)` AND-clause
--     is always false while organization_id is null) — no *new* rows can
--     be created in these 3 tables until Stage 3 populates organization_id.
--     SELECT/UPDATE/DELETE on *existing* rows, however, are NOT fully
--     blocked: `agent_id = auth.uid()` is unconditional in these 3 tables'
--     policies (it does not reference organization_id at all), so each
--     agent keeps seeing/editing/deleting their own already-existing rows
--     exactly as before. What's actually lost is only the *new* capability
--     this migration adds — org-admin oversight (`is_org_admin(organization_id)`,
--     always false while organization_id is null) — not baseline per-agent
--     access, which was never contingent on organization_id to begin with.
--
-- This is intentionally NOT a uniform "zero data for every table" outcome
-- once you look at clients/matches/inquiries' SELECT/UPDATE/DELETE
-- specifically — flagging this precisely rather than reporting it as
-- uniform, since getting this wrong in the riskiest stage of the plan would
-- defeat the point of stating it plainly. `properties`, and INSERT on all 3
-- other tables, do go fully to zero, exactly as described.
--
-- No fallback/workaround was added for null-org rows beyond what's
-- specified above (e.g. no `or organization_id is null` escape hatch
-- anywhere) — the only reason clients/matches/inquiries retain partial
-- access is that `agent_id = auth.uid()` was already unconditional in the
-- specified access shape itself, not because of anything added here to
-- preserve it.
--
-- ─────────────────────────────────────────────────────────────────────────
-- FLAGGED, NOT FIXED, IN THIS MIGRATION — organization_id reassignment on
-- clients/property_client_matches/inquiries (found while implementing the
-- specified shape; out of scope to silently redesign, so flagging for
-- security-reviewer/product rather than deciding unilaterally):
--
-- Because clients/property_client_matches/inquiries' UPDATE policy's
-- `with check` mirrors their `using` (`agent_id = auth.uid() or
-- is_org_admin(organization_id)`, no org-membership requirement), a caller
-- who owns a row via `agent_id = auth.uid()` can update that row's
-- `organization_id` to *any* organization UUID, including one they are not
-- a member of — e.g. `update clients set organization_id = '<org they do
-- not belong to>' where id = <their own client>`. That passes `with check`
-- purely because `agent_id = auth.uid()` still holds, regardless of the new
-- organization_id value. The effect: that target org's admins/owners would
-- gain SELECT visibility into the row (via their own is_org_admin check),
-- a cross-tenant leak of lead data, IF the caller already somehow knows a
-- specific target org's UUID (org UUIDs are not enumerable through this
-- schema's RLS — organizations.select is member-gated and
-- org_has_members()'s PUBLIC execute is revoked per 006 — so this requires
-- an out-of-band UUID leak to exploit, e.g. a future UI exposing it in a
-- URL; not exploitable today, no live tenant data, but worth closing before
-- Stage 3 makes organization_id meaningful).
--
-- `properties` does NOT have this gap: its UPDATE `with check` is purely
-- `is_org_member(organization_id)` (no agent_id escape hatch), so moving a
-- property to a different org already requires being a member of that
-- target org.
--
-- Not fixed here because a correct fix needs a trigger (RLS `with check`
-- alone can't distinguish "organization_id unchanged" from "organization_id
-- changing," and a naive OLD<>NEW-immutability trigger — the pattern used
-- for organization_members in 006 — would also block Stage 3's anticipated
-- one-time NULL-to-real-org backfill on existing rows, which is a
-- plausible legitimate future operation here, unlike organization_members'
-- user_id/organization_id which should never legitimately change). Designing
-- that correctly (something like: block the change unless
-- is_org_member(new.organization_id), so a NULL/first-population or
-- membership-verified move is allowed but an arbitrary cross-org move is
-- not) is a real fix but a nontrivial judgment call on exact semantics that
-- belongs in its own reviewed migration, not folded into this one silently.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Indexing: existing per-table agent_id-based indexes (001/002/003) and the
-- organization_id indexes (005) are left as-is. The new `agent_id =
-- auth.uid() or is_org_admin(organization_id)` filter shape is more complex
-- than the old flat equality check; revisit indexing once there's real
-- query load to profile against (premature to guess now, no live data).
--
-- ROLLBACK: to revert to the pre-Stage-2 flat-agent_id policies, run:
--   drop policy if exists "org members select properties" on public.properties;
--   drop policy if exists "org members insert properties" on public.properties;
--   drop policy if exists "org members update properties" on public.properties;
--   drop policy if exists "org members delete properties" on public.properties;
--   create policy "agents see own properties" on public.properties for all using (auth.uid() = agent_id);
--
--   drop policy if exists "owner or org admin select clients" on public.clients;
--   drop policy if exists "owner or org admin insert clients" on public.clients;
--   drop policy if exists "owner or org admin update clients" on public.clients;
--   drop policy if exists "owner or org admin delete clients" on public.clients;
--   create policy "agents see own clients" on public.clients for all using (auth.uid() = agent_id);
--
--   drop policy if exists "owner or org admin select matches" on public.property_client_matches;
--   drop policy if exists "owner or org admin insert matches" on public.property_client_matches;
--   drop policy if exists "owner or org admin update matches" on public.property_client_matches;
--   drop policy if exists "owner or org admin delete matches" on public.property_client_matches;
--   create policy "agents see own matches" on public.property_client_matches for all using (auth.uid() = agent_id);
--
--   drop policy if exists "owner or org admin select inquiries" on public.inquiries;
--   drop policy if exists "owner or org admin insert inquiries" on public.inquiries;
--   drop policy if exists "owner or org admin update inquiries" on public.inquiries;
--   drop policy if exists "owner or org admin delete inquiries" on public.inquiries;
--   create policy "agents see own inquiries" on public.inquiries for all using (auth.uid() = agent_id);
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── PROPERTIES: org-wide shared ────────────────────────────────────────────
drop policy if exists "agents see own properties" on public.properties;

create policy "org members select properties"
  on public.properties for select
  using (public.is_org_member(organization_id));

create policy "org members insert properties"
  on public.properties for insert
  with check (public.is_org_member(organization_id));

create policy "org members update properties"
  on public.properties for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "org members delete properties"
  on public.properties for delete
  using (public.is_org_member(organization_id));

-- ─── CLIENTS: private to assigned agent, except org admin/owner ────────────
drop policy if exists "agents see own clients" on public.clients;

create policy "owner or org admin select clients"
  on public.clients for select
  using (
    agent_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

create policy "owner or org admin insert clients"
  on public.clients for insert
  with check (
    public.is_org_member(organization_id)
    and (agent_id = auth.uid() or public.is_org_admin(organization_id))
  );

create policy "owner or org admin update clients"
  on public.clients for update
  using (
    agent_id = auth.uid()
    or public.is_org_admin(organization_id)
  )
  with check (
    agent_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

create policy "owner or org admin delete clients"
  on public.clients for delete
  using (
    agent_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

-- ─── PROPERTY_CLIENT_MATCHES: same privacy shape as clients ────────────────
drop policy if exists "agents see own matches" on public.property_client_matches;

create policy "owner or org admin select matches"
  on public.property_client_matches for select
  using (
    agent_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

create policy "owner or org admin insert matches"
  on public.property_client_matches for insert
  with check (
    public.is_org_member(organization_id)
    and (agent_id = auth.uid() or public.is_org_admin(organization_id))
  );

create policy "owner or org admin update matches"
  on public.property_client_matches for update
  using (
    agent_id = auth.uid()
    or public.is_org_admin(organization_id)
  )
  with check (
    agent_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

create policy "owner or org admin delete matches"
  on public.property_client_matches for delete
  using (
    agent_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

-- ─── INQUIRIES: same privacy shape as clients ───────────────────────────────
drop policy if exists "agents see own inquiries" on public.inquiries;

create policy "owner or org admin select inquiries"
  on public.inquiries for select
  using (
    agent_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

create policy "owner or org admin insert inquiries"
  on public.inquiries for insert
  with check (
    public.is_org_member(organization_id)
    and (agent_id = auth.uid() or public.is_org_admin(organization_id))
  );

create policy "owner or org admin update inquiries"
  on public.inquiries for update
  using (
    agent_id = auth.uid()
    or public.is_org_admin(organization_id)
  )
  with check (
    agent_id = auth.uid()
    or public.is_org_admin(organization_id)
  );

create policy "owner or org admin delete inquiries"
  on public.inquiries for delete
  using (
    agent_id = auth.uid()
    or public.is_org_admin(organization_id)
  );
