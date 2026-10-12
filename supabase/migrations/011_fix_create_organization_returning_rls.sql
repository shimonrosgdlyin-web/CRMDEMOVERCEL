-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 011: fix create_organization_with_owner()'s RETURNING/RLS bug
--
-- Fixes a live bug in 009_create_organization_rpc.sql's
-- create_organization_with_owner() — every real signup through /register was
-- failing with:
--
--   new row violates row-level security policy for table "organizations"
--
-- This was live-debugged extensively before the actual cause was found.
-- Two other theories were investigated and ruled out along the way, both
-- real issues in their own right (fixed separately, not by this migration):
-- a stale @supabase/ssr pin that broke server-side session recognition
-- entirely (see src/lib/CLAUDE.md's supabase/server.ts section, fixed in
-- commit 5139f44), and a suspicion around JWT signing-key configuration.
-- Neither was the cause of this specific error. What actually settled it was
-- a temporary diagnostic version of this function — deliberately raising an
-- exception that surfaced auth.uid(), current_user, and the full JWT claims
-- immediately before the failing insert — run live against the real
-- project. It proved conclusively that the auth context was completely
-- valid at every point in the function's execution: auth.uid() was
-- non-null and correct, role was 'authenticated', JWT claims were
-- well-formed. So the failure had nothing to do with who the caller was.
--
-- 001-010 are confirmed applied/authored and treated as frozen (never
-- edited in place) — see supabase/CLAUDE.md for 010's own separate
-- applied/not-applied status, which this migration does not change either
-- way. This migration only replaces 009's function body — no table/column/
-- policy changes, and (see the closing note below) no dependency on
-- anything 010 introduces.
--
-- ─────────────────────────────────────────────────────────────────────────
-- THE ACTUAL BUG: PostgreSQL RLS enforces a table's SELECT policy against
-- rows produced by a RETURNING clause — not only the INSERT's own WITH
-- CHECK expression. This is easy to miss and worth understanding precisely,
-- since it's a general trap, not something specific to this one function
-- (see the callout added to supabase/CLAUDE.md's RLS Patterns section,
-- category 5, for the forward-looking version of this note aimed at
-- whoever writes the next function like this — this section is the
-- specific story of how it bit this one).
--
-- For a plain `insert into t (...) values (...)`, Postgres only evaluates
-- t's INSERT policy `with check` expression against the new row. But
-- `insert into t (...) values (...) returning ...` is different: because
-- RETURNING hands the row's contents back to the client — which is
-- functionally a read, not just a write — Postgres ALSO evaluates t's
-- SELECT policy `using` expression against that same new row before
-- including it in the RETURNING result. Critically, this is NOT like a
-- plain SELECT silently filtering out rows the caller can't see: for
-- INSERT/UPDATE/DELETE ... RETURNING, a row that fails this SELECT-policy
-- check raises a hard error instead of being silently omitted — the
-- statement already claims to have written that row, so silently returning
-- nothing would misrepresent what actually happened. And the error Postgres
-- raises for that failure uses the exact same generic wording as a WITH
-- CHECK failure — "new row violates row-level security policy for table
-- X" — with nothing in the message itself to tell the two cases apart.
-- That indistinguishable wording is exactly what made this look like an
-- auth.uid()/JWT problem for so long: every symptom pointed at "the INSERT
-- policy is rejecting this row," when the actual failure was one step
-- later, in the implicit SELECT-policy check RETURNING triggers.
--
-- Applied to this function specifically: 009's version did
--   insert into public.organizations (name) values (org_name)
--   returning id into new_org_id;
-- `organizations`' SELECT policy (004_organizations.sql) is
--   using (public.is_org_member(id))
-- At the exact moment this statement runs, the caller is NOT YET a member
-- of the brand-new org — that only happens on the NEXT statement, the
-- insert into organization_members. So is_org_member(new_org_id) evaluates
-- false for the row this INSERT just created, the RETURNING clause's
-- implicit SELECT-policy check fails, and the whole statement errors out —
-- even though the row was, in every other respect, inserted correctly, and
-- the INSERT policy itself (`with check (auth.uid() is not null)`) was
-- fully satisfied. The organization_members insert right after it was never
-- part of this bug: it has no RETURNING clause and never did, in either
-- 009 or this migration, so it was never subject to this interaction at
-- all.
--
-- ─────────────────────────────────────────────────────────────────────────
-- THE FIX: stop using RETURNING on the organizations insert entirely, by
-- generating the id up front instead of asking Postgres to hand it back.
-- `new_org_id uuid := uuid_generate_v4()` uses the exact same generator
-- every other id in this schema already defaults to (uuid-ossp's
-- uuid_generate_v4(), enabled since 001_initial_schema.sql) — this isn't a
-- new mechanism, just moving the same generation from "implicit column
-- default, read back via RETURNING" to "generated explicitly in this
-- function, inserted explicitly." The insert becomes:
--   insert into public.organizations (id, name) values (new_org_id, org_name);
-- with no RETURNING clause at all. The INSERT policy's `with check` is
-- still evaluated exactly as before (unchanged, still passes); there is
-- simply no RETURNING-triggered SELECT-policy check left to fail, because
-- there's no RETURNING clause left to trigger it. The function already has
-- new_org_id in a local variable from the moment it generated it, so it
-- never needed Postgres to hand the id back in the first place —
-- `return new_org_id;` at the end works exactly as before, unchanged.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER — unchanged, not re-litigated here: this fix does not
-- touch that decision at all. 009's header (and supabase/CLAUDE.md's RLS
-- Patterns category 5) already give the full reasoning for why this
-- function deliberately runs as the caller rather than as its owner, and
-- that reasoning is untouched by this migration — both inserts are still
-- gated by exactly the RLS policies a two-separate-request client flow
-- would have hit (organizations' INSERT `with check`, organization_members'
-- self-bootstrap INSERT policy). The only thing this migration changes is
-- how the organizations row's id gets from the database into this
-- function's hands — generated up front instead of read back — which has
-- no bearing on whose privileges the function runs with.
--
-- ─────────────────────────────────────────────────────────────────────────
-- GRANTS — verified, not assumed: does `create or replace function` require
-- 009's `revoke execute ... from public` / `grant execute ... to
-- authenticated` (its last two lines) to be reissued here? No. Per
-- PostgreSQL's documented CREATE FUNCTION behavior: when CREATE OR REPLACE
-- FUNCTION replaces an existing function of the SAME name and SAME argument
-- types (i.e. a true replace, not a new overload — which is exactly this
-- case, org_name text, unchanged from 009), the function's identity (OID)
-- is preserved, and its ownership and previously-granted privileges are NOT
-- reset — only the function's body/other properties are updated to what
-- the new definition specifies. This differs from DROP FUNCTION + CREATE
-- FUNCTION, which genuinely creates a new object and WOULD lose prior
-- grants, resetting to Postgres's default (PUBLIC execute) until
-- re-granted. Since this migration is a plain `create or replace` with an
-- identical signature, 009's grants carry over untouched — that is exactly
-- why they are deliberately not repeated below; reissuing them here would
-- be redundant, not protective. (Attempted to also confirm this empirically
-- against the live project via the read-only Supabase MCP before writing
-- this migration, per this schema's usual practice — every mcp__supabase__
-- call in this session routes through crm-team's approval-gate hook
-- regardless of read-only status, so that live check is queued rather than
-- completed; the finding above rests on documented core PostgreSQL
-- semantics, not Supabase-specific behavior, and isn't contingent on that
-- queued check.)
--
-- ─────────────────────────────────────────────────────────────────────────
-- APPLIED STATUS — read carefully, this migration is NOT in the usual
-- "authored, not yet applied" state most new migrations in this schema
-- start in: this exact SQL was already manually applied to the live
-- Supabase project (kkupywoohslzsasjuikz) via the SQL Editor, during the
-- live debugging session that diagnosed this bug — confirmed working
-- against real signups before this file was written. This file exists to
-- formally capture that already-applied fix as a permanent, numbered,
-- documented migration, matching how every other change to this schema is
-- tracked — it is not a pending change for a human to go apply.
--
-- Note the out-of-order application relative to 010:
-- 010_organization_invites.sql is still authored-but-NOT-applied (unchanged
-- by this migration — see supabase/CLAUDE.md), while this migration,
-- numbered after it, IS applied. That is safe and deliberate, not a mistake
-- to reconcile: this migration only replaces 009's function body and has
-- zero dependency on anything 010 introduces (organization_invites, its two
-- RPCs, or the narrowed organization_members INSERT policy). A fresh
-- environment following supabase/CLAUDE.md's / crm/CLAUDE.md's numbered
-- setup list can still apply every migration in plain numeric order
-- (through 011) with no issue — the two are fully independent, whichever
-- order they land in on any given database.
--
-- ROLLBACK: technically, `create or replace function` back to 009's
-- original RETURNING-based body — but do not do this as a generic "undo,"
-- since it would reintroduce the exact bug this migration fixes (every
-- real signup would immediately start failing again). Only relevant if this
-- migration's *own* body ever needs to be backed out for some unrelated
-- reason found later, not as a way to revert to a known-working prior
-- state — 009's version is not a known-working prior state, it's the bug.
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

  insert into public.organizations (id, name)
  values (new_org_id, org_name);

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, auth.uid(), 'owner');

  return new_org_id;
end;
$$;
