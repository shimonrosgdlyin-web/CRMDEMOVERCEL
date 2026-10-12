-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 008: organization_id change guard on clients / property_client_matches / inquiries
--
-- Closes the High-severity gap security-reviewer confirmed in
-- 007_tenant_aware_rls.sql (recorded as approval-queue entry ct-a91f7c2e,
-- action_type "security-block"): those 3 tables' UPDATE `with check` mirrors
-- their `using` (`agent_id = auth.uid() or is_org_admin(organization_id)`),
-- with no org-membership requirement, so any caller who owns a row via
-- `agent_id = auth.uid()` could reassign that row's `organization_id` to
-- *any* organization UUID — including one they are not a member of.
-- security-reviewer traced this into a full exploit chain (see the queue
-- entry for the complete write-up): an already-onboarded agent self-creates
-- a "shadow" org, self-bootstraps as its owner, adds an accomplice as admin,
-- then uses this gap to reassign real clients/matches/inquiries rows into
-- that shadow org — handing the accomplice `is_org_admin`-gated read/
-- update/delete access to real PII (client name/phone/email/budget/notes,
-- match data, inquiry messages). Reachable once 004+006+007 are all live,
-- independent of Stage 3.
--
-- 004-007 are confirmed applied/pushed and treated as frozen (never edited
-- in place). This migration only adds a trigger to clients/
-- property_client_matches/inquiries — it does not touch any policy, table,
-- or function from an earlier migration.
--
-- ─────────────────────────────────────────────────────────────────────────
-- FIX: a BEFORE UPDATE trigger on each of the 3 tables that blocks any
-- change to `organization_id` unless the caller is a member of the *new*
-- target organization (`is_org_member(new.organization_id)`). This permits:
--   - ordinary updates that don't touch organization_id at all (the
--     overwhelming majority of updates — e.g. changing a client's status)
--   - populating organization_id for the first time, NULL -> an org the
--     caller belongs to (Stage 3's anticipated backfill / normal write path)
--   - moving a row from one real org to a different real org, but only if
--     the caller is a member of the destination org
-- ...and blocks:
--   - moving a row (from NULL or from a real org) to an org the caller is
--     NOT a member of — this is precisely the gap above.
--
-- Why this needs a trigger rather than a tighter RLS `with check`: RLS
-- policies only ever see the proposed NEW row, never OLD — a `with check`
-- clause has no way to express "only when this specific column is actually
-- changing." A trigger is the only place OLD and NEW can be compared
-- column-by-column (same reason 006's identity-immutability trigger on
-- organization_members exists).
--
-- Deliberate asymmetry from 006's trigger — do not read this as the same
-- pattern reused: 006's `prevent_organization_member_identity_change`
-- enforces pure immutability (user_id/organization_id on
-- organization_members may NEVER change after insert, full stop — there is
-- no legitimate reason for a membership row's identity to move). This
-- trigger is conditional, not a blanket immutability guard: organization_id
-- on clients/property_client_matches/inquiries IS allowed to change, but
-- only to a value the caller is actually a member of. Also note the
-- comparison operator: 006 could safely use plain `<>` because
-- organization_members.user_id/organization_id are both `not null`. Here,
-- organization_id is nullable (005) and NULL -> value is exactly the
-- transition that must be permitted (Stage 3 backfill), so this trigger
-- uses the NULL-safe `is distinct from` — a plain `<>` would silently
-- evaluate to NULL (treated as false, i.e. "no change detected") for any
-- comparison involving a NULL side, which would have skipped the
-- membership check entirely on exactly the NULL -> value transition this
-- fix most needs to gate.
--
-- `properties` is deliberately NOT touched by this migration — it does not
-- have this gap. Its UPDATE `with check` (007) is purely
-- `is_org_member(organization_id)`, with no `agent_id` escape hatch, so
-- moving a property to a different org already requires membership in that
-- target org today, with no additional guard needed.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EXPLICITLY NOT CLOSED BY THIS MIGRATION — stated plainly, confirmed by
-- security-reviewer: this fix closes the "reassign into an org you're not
-- a member of" mechanism, but NOT the broader exploit chain's root cause.
-- An attacker who is genuinely `is_org_member` of their own self-created
-- shadow org passes this trigger's check trivially — self-creating that
-- shadow org, self-bootstrapping as its owner, and adding a consent-free
-- accomplice as admin are all still fully possible today, because
-- 004_organizations.sql's `organizations` INSERT policy is open to any
-- authenticated user (`with check (auth.uid() is not null)`, needed because
-- no membership exists yet at org-creation time) and its
-- `organization_members` INSERT policy allows an admin to add any user_id
-- with no acceptance/consent step from that user. This migration does not
-- change either of those policies. The root cause is a Stage 1 design
-- question (how should org creation and member-adding actually work once
-- there's a real invite flow — e.g. should adding a member require the
-- invitee's acceptance rather than being unilateral?) that belongs in
-- Stage 3's invite-flow design, not a narrow trigger fix here. Do not treat
-- this migration as fully closing the exploit chain security-reviewer
-- traced — only the specific reassignment step within it.
--
-- ROLLBACK: run
--   drop trigger if exists clients_guard_organization_id_change on public.clients;
--   drop trigger if exists property_client_matches_guard_organization_id_change on public.property_client_matches;
--   drop trigger if exists inquiries_guard_organization_id_change on public.inquiries;
--   drop function if exists public.guard_organization_id_change();
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.guard_organization_id_change()
returns trigger language plpgsql as $$
begin
  if old.organization_id is distinct from new.organization_id
     and not public.is_org_member(new.organization_id) then
    raise exception
      'cannot change % .organization_id to an organization you are not a member of (row id: %)',
      TG_TABLE_NAME, old.id;
  end if;
  return new;
end;
$$;

create trigger clients_guard_organization_id_change
  before update on public.clients
  for each row execute procedure public.guard_organization_id_change();

create trigger property_client_matches_guard_organization_id_change
  before update on public.property_client_matches
  for each row execute procedure public.guard_organization_id_change();

create trigger inquiries_guard_organization_id_change
  before update on public.inquiries
  for each row execute procedure public.guard_organization_id_change();
