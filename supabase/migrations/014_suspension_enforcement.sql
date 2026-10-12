-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 014: suspension enforcement
--
-- 013_platform_admin_foundation.sql added suspended_at/suspended_by/
-- suspension_reason to organizations and profiles, and guarded them so only a
-- platform admin can set them. Nothing reads those columns for access control
-- yet — a "suspended" organization or user is, as of 013 alone, suspended in
-- name only. THIS is the migration that gives suspension teeth.
--
-- It is a SEPARATE file from 013 on purpose. 013 could not regress any
-- existing tenant's access no matter what bug it contained, because it never
-- recreates an existing policy or function. This one can: it `create or
-- replace`s two functions that ~16 policies across 4 migrations depend on, and
-- adds new policies to tables holding live tenant data. That is why it gets
-- its own review, its own apply step, and its own rollback, separate from
-- 013's. Do not apply this until 013 has been live and stable.
--
-- Depends on: 013 (suspended_at columns, is_platform_admin()). Same
-- discipline as 013: references nothing from 010_organization_invites.sql
-- (unapplied as of this writing) — the known gap that leaves is
-- accept_organization_invite() able to add a member to a suspended org is
-- deliberately deferred to a future migration gated on 010 actually landing,
-- not fixed here by editing a frozen, unapplied file.
--
-- ─────────────────────────────────────────────────────────────────────────
-- THE TWO HALVES, AND WHY NEITHER ALONE IS ENOUGH
--
-- HALF A — amend is_org_member()/is_org_admin() to also require the org isn't
-- suspended. These two functions gate roughly 16 policies across
-- organizations, organization_members, properties, clients,
-- property_client_matches and inquiries (004, 006, 007, 008). Two
-- `create or replace` statements therefore cascade everywhere, with zero
-- policies restated and zero transcription risk — the entire point of routing
-- suspension through the existing helpers instead of rewriting every policy
-- to add `and not suspended`. See "HALF A" below for the exact bodies and the
-- ARGUMENT for why they are provably a no-op when nothing is suspended.
--
-- HALF B — closes what HALF A structurally cannot reach. 007's header
-- (007_tenant_aware_rls.sql:77-100) documents, of its own accord, that
-- `agent_id = auth.uid()` is UNCONDITIONAL on clients/property_client_matches/
-- inquiries' SELECT/UPDATE/DELETE policies — it calls neither helper.
-- profiles' `for all using (auth.uid() = id)` (001:15-17) is the same shape.
-- So a "suspended" user, under HALF A alone, still reads, edits and DELETES
-- their own clients and their own profile. That is not a suspension. HALF B
-- adds one `as restrictive` policy per table — restrictive policies AND with
-- every permissive policy, so they compose without restating anything, and
-- (unlike amending a shared helper) a restrictive policy can only ever
-- SUBTRACT access, never grant it. See "HALF B" below.
--
-- ─────────────────────────────────────────────────────────────────────────
-- create_organization_with_owner() AND org_has_members() — both unaffected:
--
-- create_organization_with_owner() (011/012) is unaffected by HALF A. Traced
-- through its body: it inserts profiles, then organizations (both gated by
-- policies this migration never touches), then organization_members via
-- 004's "org admins or self-bootstrap insert membership" policy --
-- `is_org_admin(new_org_id) or (user_id = auth.uid() and role = 'owner' and
-- not org_has_members(new_org_id))`. is_org_admin(new_org_id) was already
-- FALSE before this migration (a brand-new org has zero membership rows, so
-- the EXISTS in is_org_admin's body is empty regardless of any suspension
-- check) -- the self-bootstrap branch is what actually carries every org
-- creation, and it calls org_has_members(), not is_org_admin() or
-- is_org_member(). A brand-new org also always has suspended_at = null (013's
-- column default). Unaffected on every count.
--
-- org_has_members() IS DELIBERATELY NOT TOUCHED BY THIS MIGRATION. It answers
-- a structural question -- "does this org have any members at all" -- used
-- solely by the self-bootstrap branch above. Adding a suspension check there
-- would let someone re-bootstrap ownership of a suspended, emptied org by
-- exploiting the exact narrowness that makes the bootstrap branch safe today.
-- If a future migration ever touches org_has_members, that consequence needs
-- its own review -- do not fold it into "obviously the same kind of change"
-- as is_org_member/is_org_admin.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK: if this migration is applied and needs to be undone, run, in this
-- order:
--
--   drop policy if exists "suspension blocks all access" on public.properties;
--   drop policy if exists "suspension blocks all access" on public.clients;
--   drop policy if exists "suspension blocks all access" on public.property_client_matches;
--   drop policy if exists "suspension blocks all access" on public.inquiries;
--   drop policy if exists "suspended users blocked" on public.profiles;
--   drop policy if exists "suspended users blocked" on public.organizations;
--   drop policy if exists "suspended users blocked" on public.organization_members;
--   drop function if exists public.is_access_suspended(uuid);
--   drop function if exists public.is_user_suspended();
--
--   -- restore is_org_member()/is_org_admin() to their exact 004 bodies:
--   create or replace function public.is_org_member(target_org_id uuid)
--   returns boolean language sql security definer set search_path = '' stable as $$
--     select exists (
--       select 1 from public.organization_members
--       where organization_id = target_org_id and user_id = auth.uid()
--     );
--   $$;
--
--   create or replace function public.is_org_admin(target_org_id uuid)
--   returns boolean language sql security definer set search_path = '' stable as $$
--     select exists (
--       select 1 from public.organization_members
--       where organization_id = target_org_id and user_id = auth.uid()
--         and role in ('owner','admin')
--     );
--   $$;
--
--   revoke execute on function public.is_org_member(uuid), public.is_org_admin(uuid) from public;
--   grant  execute on function public.is_org_member(uuid), public.is_org_admin(uuid) to authenticated;
--
-- After rolling back, any organization/user left with a non-null
-- suspended_at (set via the panel while this migration was live) goes back to
-- having FULL access immediately -- suspension reverts to name-only, exactly
-- 013's post-apply, pre-014 state. That is expected, not a bug in the
-- rollback: 013's own rollback is what actually removes the columns.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- MANUAL VERIFICATION BLOCK — run immediately after applying, BEFORE
-- declaring success. This is a live-tenant-facing change; do not skip this.
--
--   -- 1. No suspensions exist yet, so nothing should have changed for
--   --    anyone. Expect 0:
--   select count(*) from public.organizations where suspended_at is not null;
--
--   -- 2. As a real, known tenant member's session (or via the SQL editor's
--   --    "run as" if available), confirm normal access still resolves.
--   --    Expect true:
--   select public.is_org_member('<a real organization_id this account belongs to>');
--
--   -- 3. As the platform admin's session, BEFORE completing MFA for that
--   --    session. Expect false -- the database itself refuses a non-aal2
--   --    admin session, independent of anything the app layer does:
--   select public.is_platform_admin();
--
--   -- 4. The end-to-end suspension check, against a THROWAWAY org only:
--   --    a. select admin_set_organization_suspended('<throwaway org id>', true, 'verification');
--   --    b. as a member of that org: select * from public.properties; -- expect 0 rows
--   --       and an insert attempt should fail outright.
--   --    c. confirm a DIFFERENT, non-suspended org's member sees no change at all.
--   --    d. select admin_set_organization_suspended('<throwaway org id>', false, null);
--   --    e. re-check (b) -- full access must be restored.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- HALF A — is_org_member() / is_org_admin(), amended
--
-- Both bodies use `not exists (select ... where suspended_at is not null)`
-- rather than a join or a boolean flag comparison, specifically so the claim
-- "with zero suspended organizations, behavior is IDENTICAL to 004's original"
-- is provable by inspection, not just tested-and-believed: when the inner
-- EXISTS can never match (no row has a non-null suspended_at), this collapses
-- to exactly 004's body with a dead `and true` clause, term for term.
--
-- 006_organization_members_hardening.sql:15-31 established the rule this
-- migration follows again: `create or replace` on a security-definer function
-- does NOT need its grants restated for policies that call it to keep working
-- (Postgres re-resolves the function body immediately, no policy recreation
-- required) -- but the explicit revoke/grant pair is repeated below anyway
-- rather than assumed to survive the replace untouched. Postgres does in fact
-- preserve a function's ACL across CREATE OR REPLACE, but relying on that
-- silently is exactly the kind of assumption a future migration could get
-- wrong; restating it here costs nothing and removes the question entirely.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and not exists (
        select 1 from public.organizations o
        where o.id = m.organization_id and o.suspended_at is not null
      )
  );
$$;

create or replace function public.is_org_admin(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
      and not exists (
        select 1 from public.organizations o
        where o.id = m.organization_id and o.suspended_at is not null
      )
  );
$$;

revoke execute on function public.is_org_member(uuid) from public;
revoke execute on function public.is_org_admin(uuid)  from public;
grant  execute on function public.is_org_member(uuid) to authenticated;
grant  execute on function public.is_org_admin(uuid)  to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- HALF B — the restrictive policies HALF A cannot reach
--
-- is_user_suspended(): the user-level check, used directly by profiles/
-- organizations/organization_members (none of those three have a meaningful
-- "which org" to check against for this purpose -- a suspended USER should
-- lose access to all of them regardless of which org they're looking at).
--
-- is_access_suspended(row_org_id): user OR the row's own org. Note this is
-- SAFE against a null row_org_id (organization_id is nullable on properties/
-- clients/property_client_matches/inquiries, per 005) without any special
-- casing: `o.id = null` can never match, so the org half of the OR is simply
-- false for a null-org row, and the check collapses to is_user_suspended()
-- alone -- exactly the right fallback for a row that predates org population.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.is_user_suspended()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.suspended_at is not null
  );
$$;

create or replace function public.is_access_suspended(row_org_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    public.is_user_suspended()
    or exists (
      select 1 from public.organizations o
      where o.id = row_org_id and o.suspended_at is not null
    );
$$;

revoke execute on function public.is_user_suspended()        from public;
revoke execute on function public.is_access_suspended(uuid)  from public;
grant  execute on function public.is_user_suspended()        to authenticated;
grant  execute on function public.is_access_suspended(uuid)  to authenticated;

-- `as restrictive`, not the default `as permissive`: PostgreSQL ORs every
-- permissive policy together but ANDs restrictive policies against that
-- result. A permissive policy here would be additive (it would OPEN access,
-- not close it) -- restrictive is the only shape that can subtract from an
-- unconditional branch like clients' `agent_id = auth.uid()`.
--
-- `for all`: covers select/insert/update/delete in one policy rather than
-- four, since the condition is identical for all of them.
--
-- `to authenticated`: explicit, unlike every pre-existing policy in this
-- schema (which specify no role and so apply to any role RLS is evaluated
-- for). Deliberate here, not an oversight -- these are net-new policies with
-- no existing convention to match, and `authenticated` is what Supabase's own
-- guidance recommends for a policy gated on `auth.uid()`/`auth.jwt()`, which
-- resolve to null/absent for anon regardless.
--
-- WHY THIS IS SAFE IN A WAY HALF A IS NOT: a restrictive policy can only ever
-- narrow what a permissive policy already granted. If no permissive policy
-- grants an operation, adding this changes nothing. The failure mode of a bug
-- here is bounded to "too little access" -- never "too much" -- which is not
-- true of amending a shared function. And in steady state (nothing
-- suspended), is_access_suspended()/is_user_suspended() are false for every
-- caller, so `not false` = true on every row: identical behavior to before
-- this migration, by the same zero-suspended-rows argument as HALF A.
create policy "suspension blocks all access"
  on public.properties as restrictive for all to authenticated
  using      (not public.is_access_suspended(organization_id))
  with check (not public.is_access_suspended(organization_id));

create policy "suspension blocks all access"
  on public.clients as restrictive for all to authenticated
  using      (not public.is_access_suspended(organization_id))
  with check (not public.is_access_suspended(organization_id));

create policy "suspension blocks all access"
  on public.property_client_matches as restrictive for all to authenticated
  using      (not public.is_access_suspended(organization_id))
  with check (not public.is_access_suspended(organization_id));

create policy "suspension blocks all access"
  on public.inquiries as restrictive for all to authenticated
  using      (not public.is_access_suspended(organization_id))
  with check (not public.is_access_suspended(organization_id));

-- profiles/organizations/organization_members: user-level suspension only.
-- Org-level suspension already reaches these three through HALF A (a
-- suspended org's is_org_member/is_org_admin already return false, which is
-- what organizations' and organization_members' own permissive policies are
-- keyed on) -- adding the org check again here would be redundant, not wrong,
-- but redundant conditions in a security-critical policy are their own risk
-- (two places to keep in sync instead of one).
create policy "suspended users blocked"
  on public.profiles as restrictive for all to authenticated
  using      (not public.is_user_suspended())
  with check (not public.is_user_suspended());

create policy "suspended users blocked"
  on public.organizations as restrictive for all to authenticated
  using      (not public.is_user_suspended())
  with check (not public.is_user_suspended());

create policy "suspended users blocked"
  on public.organization_members as restrictive for all to authenticated
  using      (not public.is_user_suspended())
  with check (not public.is_user_suspended());
