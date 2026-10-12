-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 009: create_organization_with_owner() RPC
--
-- Stage 3 of the multi-tenant roadmap ("signup + current-org plumbing").
-- Gives the new signup flow a single atomic operation to create an
-- organization and insert its creator as 'owner', instead of two separate
-- client-driven requests — security-reviewer flagged in Stage 1 that a
-- two-step client-orchestrated "create org, then self-insert as owner" has
-- a narrow race window if the new org's id leaks or the client dies between
-- steps. A single function body is one implicit transaction: if either
-- insert fails, both roll back, so there is no way to end up with an org
-- that has no owner, or two competing owners from a retried request.
--
-- 001-008 are confirmed applied/pushed and treated as frozen (never edited
-- in place). This migration only adds one new function — no table/column/
-- policy changes.
--
-- ─────────────────────────────────────────────────────────────────────────
-- DELIBERATE CHOICE, FLAGGED FOR REVIEW: this function is SECURITY INVOKER
-- (Postgres's default — no `security definer` clause), not SECURITY
-- DEFINER, even though the brief that prompted this migration suggested
-- "ideally a SECURITY DEFINER function." Explaining the reasoning plainly
-- rather than silently picking one:
--
-- A SECURITY DEFINER function executes with the privileges of its owner
-- (typically the role that ran this migration), which BYPASSES RLS
-- entirely for everything the function does internally — that's the exact
-- mechanism 004's is_org_member()/is_org_admin() and 006/008's guard
-- functions rely on, deliberately, to avoid RLS self-recursion. Applied
-- here, a SECURITY DEFINER create_organization_with_owner would NOT
-- actually exercise 004's `organizations`/`organization_members` INSERT
-- policies at all — it would bypass them, and the function's own internal
-- checks would become the *sole* authority, silently replacing rather than
-- reusing the bootstrap-insert policies those tables already carry. Two
-- concrete downsides: (1) it duplicates authorization logic that already
-- exists in 004's policies, with a real risk of the two drifting out of
-- sync if either is changed later without remembering the other exists;
-- (2) it's the more invasive, higher-scrutiny option in general — every
-- security definer function in this schema so far has needed careful
-- search_path hardening and PUBLIC-execute revocation specifically because
-- of what bypassing RLS opens up, and none of that risk is actually needed
-- here.
--
-- A SECURITY INVOKER function (this migration's actual choice) runs as the
-- calling authenticated user, so its two inserts are gated by exactly the
-- same RLS policies a two-separate-request client flow would have hit —
-- `organizations`'s `with check (auth.uid() is not null)` and
-- `organization_members`'s admin-or-self-bootstrap policy (satisfied here
-- because this always inserts `user_id = auth.uid()`, `role = 'owner'`,
-- into a brand-new org with zero existing members). The *only* thing this
-- function adds over two separate client requests is transactional
-- atomicity — which is exactly, and only, what was asked for. If a future
-- stage decides org creation needs its own independent authorization rule
-- decoupled from the general INSERT policy (e.g. gated by billing/plan),
-- that would be a deliberate reason to revisit this as SECURITY DEFINER —
-- but that's not the case today, so defaulting to the smaller, safer,
-- RLS-respecting option.
--
-- Name-length validation is deliberately NOT duplicated inside this
-- function — the same 3-layer principle as everywhere else in this schema
-- applies: the API route validates `org_name` with Zod before ever calling
-- this RPC (nice Hebrew error message), and `organizations.name`'s existing
-- CHECK constraint (char_length between 1 and 200, from 004) is the final
-- backstop if that's ever bypassed. Duplicating the same bound inside this
-- function's body would just be a second place for that rule to drift out
-- of sync with 004's constraint.
--
-- ROLLBACK: run
--   drop function if exists public.create_organization_with_owner(text);
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.create_organization_with_owner(org_name text)
returns uuid
language plpgsql
as $$
declare
  new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to create an organization';
  end if;

  insert into public.organizations (name)
  values (org_name)
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, auth.uid(), 'owner');

  return new_org_id;
end;
$$;

revoke execute on function public.create_organization_with_owner(text) from public;
grant execute on function public.create_organization_with_owner(text) to authenticated;
