-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 012: make create_organization_with_owner() resilient to a
-- missing profiles row
--
-- Root cause found while adding Google OAuth sign-in
-- (src/app/auth/callback/route.ts): a real /setup-organization submission
-- failed with
--   insert or update on table "organization_members" violates foreign key
--   constraint "organization_members_user_id_fkey"
--   Key is not present in table "profiles".
-- for an authenticated caller with a fully valid session (auth.uid()
-- resolved correctly). This is NOT a recurrence of 011's bug — that was an
-- RLS violation on a RETURNING clause; this is a plain FK violation
-- (Postgres error code 23503). The caller's public.profiles row for that id
-- genuinely does not exist, even though on_auth_user_created
-- (001_initial_schema.sql) should always insert one synchronously with any
-- new auth.users row, regardless of provider (confirmed provider-agnostic —
-- see supabase/CLAUDE.md's "handle_new_user() is provider-agnostic" note,
-- added the same day this feature was built).
--
-- The specific account that hit this was very likely an orphan from earlier
-- manual test-data cleanup during this project's development — deleting a
-- profiles row directly without also deleting the corresponding auth.users
-- row doesn't violate any constraint at delete time (profiles.id references
-- auth.users(id) ON DELETE CASCADE only in that direction; nothing enforces
-- the reverse). This is not evidence handle_new_user() itself is unreliable
-- going forward, and this migration does not change or re-litigate that
-- trigger at all.
--
-- THE FIX, deliberately scoped narrowly: make this one function resilient to
-- that precondition being missing, rather than only ever assuming it holds.
-- This is exactly the kind of defensive backstop /setup-organization already
-- exists to provide (see src/app/setup-organization/CLAUDE.md — "recovery
-- path for an authenticated user with zero organizations," i.e. an account
-- already known to be in some inconsistent state) — so the RPC it calls
-- shouldn't itself assume a fully-consistent prior state either. Upserts the
-- caller's own profiles row (id = auth.uid(), the same empty-string
-- full_name default handle_new_user() already uses when no metadata is
-- supplied) immediately before the organization_members insert that depends
-- on it existing.
--
-- Still SECURITY INVOKER, unchanged from 009/011 (see those migrations'
-- headers for the full reasoning — not re-litigated here). This upsert is
-- gated by profiles' own existing RLS policy ("agents see own profile", FOR
-- ALL USING (auth.uid() = id) — Postgres uses the same expression as WITH
-- CHECK for INSERT when none is specified separately), which permits exactly
-- this: a user inserting/updating only their own row. No elevated privilege
-- needed or added.
--
-- `on conflict (id) do nothing` — the overwhelmingly common case is that the
-- profiles row already exists (this is a backstop for the rare orphaned-row
-- case, not the expected path), so this must never clobber an existing row's
-- real full_name/phone/agency_name with the empty-string default.
--
-- 001-011 are confirmed applied/authored and treated as frozen (never edited
-- in place). This migration only replaces create_organization_with_owner()'s
-- body again (same signature as 009/011) — no table/column/policy changes.
--
-- GRANTS: unchanged from 009/011's reasoning (CREATE OR REPLACE FUNCTION
-- with an identical signature preserves the function's OID and previously
-- granted privileges) — not reissued here, see 011's header for the full
-- argument.
--
-- ROLLBACK: `create or replace function` back to 011's body (drop the
-- profiles upsert block) — safe to revert on its own terms, but doing so
-- reopens this exact failure mode for any account that ever ends up with a
-- missing profiles row again.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.create_organization_with_owner(org_name text)
returns uuid
language plpgsql
as $$
declare
  new_org_id uuid := uuid_generate_v4();
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to create an organization';
  end if;

  insert into public.profiles (id, full_name)
  values (auth.uid(), '')
  on conflict (id) do nothing;

  insert into public.organizations (id, name)
  values (new_org_id, org_name);

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, auth.uid(), 'owner');

  return new_org_id;
end;
$$;
