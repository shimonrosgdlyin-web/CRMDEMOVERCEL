-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 006: organization_members hardening
--
-- Fixes 2 issues qa-engineer and security-reviewer found in
-- 004_organizations.sql, before this schema is ever applied anywhere
-- (confirmed currently unreachable: not applied to any DB, no app code
-- touches it yet — cheapest possible time to fix). 004/005 are already
-- pushed to master and are treated as frozen per this repo's "never modify
-- existing migration files" rule (crm/supabase/CLAUDE.md) — this migration
-- only ever ADDS to / replaces policies on top of what 004 created, it never
-- edits 004/005 in place. Depends on 004_organizations.sql already having
-- been applied (it operates on functions/tables/policies 004 creates).
--
-- ─────────────────────────────────────────────────────────────────────────
-- FIX 1 — missing REVOKE on security-definer functions (qa-engineer and
-- security-reviewer independently found this).
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default. 004 only
-- added `grant ... to authenticated`, which is additive, not restrictive —
-- the default PUBLIC grant was never revoked. is_org_member/is_org_admin
-- are self-protecting (they gate on auth.uid(), which is null for an
-- unauthenticated/anon caller, so they always return false for one) but
-- org_has_members does not reference the caller at all — it is a genuine
-- boolean oracle callable by anyone via PostgREST's auto-exposed
-- /rest/v1/rpc/org_has_members for any org UUID they know or guess. Revoking
-- PUBLIC execute on all three below is defense-in-depth, even though only
-- the third is currently exploitable. The existing `grant ... to
-- authenticated` from 004 is a separate, explicit grant to a specific role
-- and is untouched by a PUBLIC revoke — it does not need to be reissued
-- here; authenticated callers (including RLS policy evaluation on behalf of
-- an authenticated user) keep working exactly as before.
--
-- FIX 2 — owner takeover via two ordinary admin UPDATEs (security-reviewer,
-- rated High as an intrinsic design flaw; not currently reachable, flagged
-- before this schema is wired to any app code).
--
-- 004's UPDATE policy on organization_members
-- (using (is_org_admin(organization_id)) with check (is_org_admin(organization_id)))
-- doesn't pin which row, or which columns, an admin may change. Concrete
-- 2-step exploit once reachable:
--   1. A non-owner admin runs
--      update organization_members set role = 'agent'
--        where organization_id = X and user_id = <owner>;
--      This passes 004's policy, because is_org_admin only checks the
--      caller's own membership, not the target row's current role.
--   2. The same admin then runs
--      update organization_members set role = 'owner'
--        where organization_id = X and user_id = <self>;
--      This now passes too — the real owner was just demoted in step 1, so
--      004's organization_members_one_owner_per_org partial unique index no
--      longer blocks a second 'owner' row.
--   Net effect: any admin can silently seize ownership of the org, with no
--   consent from the owner and no "last owner" protection.
-- Separately, 004's UPDATE policy never stopped an admin from changing
-- user_id or organization_id on an existing row (reassigning a membership
-- to a different person, or moving a member to a different org they
-- administer) — 004's comment claims role is "the only mutable field" on
-- this table, but nothing actually enforced that.
--
-- Two-part fix, both needed:
--   (a) Tighten the UPDATE policy so a row currently holding role = 'owner'
--       can only be updated by that same owner (using (... and (role <>
--       'owner' or user_id = auth.uid()))). Combined with 004's existing
--       organization_members_one_owner_per_org partial unique index (which
--       already blocks a second self-promoted owner while the real one
--       still holds the role), this fully closes the takeover path without
--       needing a separate "last owner" trigger: a non-owner admin can no
--       longer even target the owner's row for update, so step 1 above is
--       blocked at the RLS layer and step 2 never becomes reachable.
--   (b) A BEFORE UPDATE trigger rejecting any change to user_id or
--       organization_id. RLS's WITH CHECK alone can't cleanly compare OLD
--       vs NEW column-by-column on the same row, so this needs a trigger —
--       the standard tool for that comparison. This closes the
--       row-reassignment / move-between-orgs gap, and — because triggers
--       fire regardless of RLS/role — applies universally, not just to
--       RLS-governed callers.
--
-- CLARIFICATION on a 004 comment (wording only, not a functional change —
-- noting it here since 004 is frozen and a related comment is already being
-- added nearby): 004 describes organization_members_one_owner_per_org as
-- hard-enforcing "exactly one owner." A unique index only enforces *at
-- most* one — it does not guarantee an org has an owner at all (existence),
-- only that it can never have two simultaneously. Read 004's comment as "at
-- most one owner per org."
--
-- ROLLBACK ORDER NOTE: 005_organization_id_columns.sql adds organization_id
-- columns on properties/clients/property_client_matches/inquiries that
-- reference organizations(id). If 005 has also been applied, 004's own
-- rollback comment (drop table if exists public.organizations;) will error
-- with a dependency violation ("cannot drop table organizations because
-- other objects depend on it"). A full manual rollback of this whole Stage 1
-- foundation must go in order: this file's rollback below, then 005's
-- rollback, then 004's rollback last — never drop organizations first.
--
-- ROLLBACK (this migration only — reverts to 004's original, weaker state;
-- only do this to fully undo 006 specifically, not as a general template):
--   drop trigger if exists organization_members_prevent_identity_change on public.organization_members;
--   drop function if exists public.prevent_organization_member_identity_change();
--   drop policy if exists "org admins update member roles" on public.organization_members;
--   create policy "org admins update member roles"
--     on public.organization_members for update
--     using (public.is_org_admin(organization_id))
--     with check (public.is_org_admin(organization_id));
--   grant execute on function public.is_org_member(uuid) to public;
--   grant execute on function public.is_org_admin(uuid) to public;
--   grant execute on function public.org_has_members(uuid) to public;
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── FIX 1: revoke default PUBLIC execute on security-definer functions ────
revoke execute on function public.is_org_member(uuid), public.is_org_admin(uuid), public.org_has_members(uuid)
  from public;

-- ─── FIX 2a: a row currently holding role = 'owner' can only be updated by
-- that same owner; other members remain freely manageable by any admin ────
drop policy if exists "org admins update member roles" on public.organization_members;

create policy "org admins update member roles"
  on public.organization_members for update
  using (
    public.is_org_admin(organization_id)
    and (role <> 'owner' or user_id = auth.uid())
  )
  with check (public.is_org_admin(organization_id));

-- ─── FIX 2b: user_id / organization_id are immutable after insert ──────────
-- Not security definer — this only compares OLD vs NEW on a row the
-- statement already reached; no elevated privileges needed, matching the
-- plain (non-security-definer) style of set_updated_at() in 001.
create or replace function public.prevent_organization_member_identity_change()
returns trigger language plpgsql as $$
begin
  if old.user_id <> new.user_id or old.organization_id <> new.organization_id then
    raise exception 'organization_members.user_id and organization_members.organization_id are immutable after insert; delete and re-insert instead of moving a membership row';
  end if;
  return new;
end;
$$;

create trigger organization_members_prevent_identity_change
  before update on public.organization_members
  for each row execute procedure public.prevent_organization_member_identity_change();
