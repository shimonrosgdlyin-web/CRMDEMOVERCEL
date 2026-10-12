-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 015: close the two suspension-bypass gaps left open by 010/014
-- (approval-queue ct-6f1a3d9e, ct-b84c2f05) — DRAFT, NOT APPLIED.
--
-- Authored 2026-08-30 during a security-review follow-up pass. No
-- mcp__supabase__* / Supabase access was available in that session, so this
-- file has been reviewed on paper (matched against 010's and 014's actual
-- committed bodies) but never run against any database, including a branch.
-- Treat it as a reviewable draft, not a verified fix — run the MANUAL
-- VERIFICATION BLOCK below in full before trusting it in production.
--
-- ─────────────────────────────────────────────────────────────────────────
-- HARD PRECONDITION — DO NOT APPLY BEFORE 010
--
-- This migration only makes sense once 010_organization_invites.sql is
-- live: it replaces a function 010 defines (accept_organization_invite) and
-- amends a policy 010 creates (organization_members's "self-bootstrap
-- insert membership only"). As of this writing, 010 is NOT yet applied to
-- the live project (crm/CLAUDE.md) — applying 015 first would either fail
-- outright (the DO block below raises if organization_invites doesn't
-- exist) or, worse, silently create a same-named function ahead of 010,
-- which 010's own `create or replace` would then clobber back to the
-- unpatched body the next time 010 runs. Sequence: 010, then 013+014 (if
-- not already live — see crm/CLAUDE.md's current status), then this.
--
-- Separately: per approval-queue ct-91d4f6a2, a full-schema policy sweep
-- meant to confirm no rogue/unauthorized objects exist beyond the two
-- already found and removed (a rogue is_platform_admin(uuid) overload, six
-- unauthorized platform_admins/admin_audit_log policies) was approved but
-- never shown to complete. This migration's `create or replace` on
-- is_org_member/is_org_admin-adjacent logic assumes 014's functions
-- (is_access_suspended, is_user_suspended) are exactly as committed in
-- 014_suspension_enforcement.sql — re-confirm that against the live
-- database (not just this file) before applying.
--
-- ─────────────────────────────────────────────────────────────────────────
-- WHAT THIS FIXES
--
-- Gap 1 (ct-b84c2f05, medium): accept_organization_invite() (010) never
-- references is_org_member/is_user_suspended/is_access_suspended at all —
-- it validates token/expiry/caller-email-match only, then unconditionally
-- inserts into organization_members. Once 010 lands on top of 013+014, this
-- lets (a) an invited user join a SUSPENDED organization, and (b) a
-- SUSPENDED user accept ANY invite — both fully bypassing suspension
-- enforcement via this one code path. Fixed below by adding an
-- is_access_suspended(invite.organization_id) check right after the email
-- match, before the membership insert — this checks BOTH the calling
-- user's own suspension and the target org's, in one call (014's own
-- definition).
--
-- Gap 2 (ct-6f1a3d9e, medium): organization_members's self-bootstrap INSERT
-- branch ("user_id = auth.uid() and role = 'owner' and not
-- org_has_members(organization_id)", introduced by 010) is keyed on
-- org_has_members() alone — it has no suspension check at all, on either
-- side, because it predates 014 and 014 deliberately does not touch
-- org_has_members() (014's own header: touching it "would let someone
-- re-claim ownership of a suspended, emptied org" was flagged as the wrong
-- fix). The actual gap: if an org is BOTH suspended AND becomes genuinely
-- memberless (today only reachable via an out-of-band auth.users deletion —
-- no self-service leave-org/delete-account flow exists in this app), a new,
-- non-suspended user could self-bootstrap-claim owner of that exact org
-- with zero suspension check firing. This grants no effective access while
-- the org stays suspended (014's restrictive policies still apply to
-- everything else), but plants a dormant privilege-escalation landmine: the
-- instant a platform admin legitimately restores that org, the squatter
-- gets owner-level access to any properties/clients/matches/inquiries rows
-- still attached to that organization_id. Fixed below by narrowing the
-- self-bootstrap policy to also require the target org isn't suspended.
--
-- ─────────────────────────────────────────────────────────────────────────
-- MANUAL VERIFICATION BLOCK — run in full, on a branch/staging project if at
-- all possible, before applying to production. Do not skip.
--
--   -- 1. Confirm the precondition actually holds before running this file:
--   select to_regclass('public.organization_invites'); -- must NOT be null
--
--   -- 2. Baseline — no orgs suspended yet in a byte-for-byte check:
--   select count(*) from public.organizations where suspended_at is not null;
--
--   -- 3. Suspend a THROWAWAY org, then attempt to accept a (throwaway,
--   --    freshly-created) invite into it as a real, non-suspended test
--   --    account whose email matches the invite:
--   --    a. select admin_set_organization_suspended('<throwaway org id>', true, 'verification');
--   --    b. as the invitee: select public.accept_organization_invite('<throwaway token>');
--   --       -- MUST raise, not succeed. Confirm no organization_members row
--   --       -- was inserted.
--   --    c. select admin_set_organization_suspended('<throwaway org id>', false, null);
--   --    d. re-run (b) with a fresh invite -- MUST now succeed.
--   --
--   -- 4. Suspend a THROWAWAY, already-memberless org (create one, suspend
--   --    it, confirm org_has_members() is false for it), then attempt
--   --    self-bootstrap as a different, non-suspended account:
--   --    a. insert into public.organization_members (organization_id, user_id, role)
--   --       values ('<throwaway suspended org id>', '<some other real user id>', 'owner');
--   --       -- MUST be rejected by RLS (no matching INSERT policy). Before
--   --       -- this migration, this insert would have SUCCEEDED.
--   --    b. restore the org, confirm self-bootstrap into a NON-suspended,
--   --       genuinely memberless org still works exactly as before (this
--   --       migration must not regress the legitimate case).
--
-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK: re-run 010's own accept_organization_invite/policy definitions
-- verbatim (see 010_organization_invites.sql's body) to restore the
-- pre-015 (suspension-unaware) versions. Rolling back re-opens both gaps —
-- only do this to fully undo this migration, not as a routine rollback.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.organization_invites') is null then
    raise exception '015_invite_suspension_check.sql: organization_invites does not exist -- apply 010_organization_invites.sql first (see this file''s header)';
  end if;
end
$$;

-- ─── Gap 1: accept_organization_invite() must respect suspension ───────────
create or replace function public.accept_organization_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  invite public.organization_invites%rowtype;
begin
  if caller_id is null then
    raise exception 'must be authenticated to accept an invite';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  select * into invite
    from public.organization_invites
    where token = invite_token
    for update;

  if invite.id is null then
    raise exception 'invite not found';
  end if;

  if invite.status <> 'pending' then
    raise exception 'invite is no longer pending';
  end if;

  if invite.expires_at <= now() then
    update public.organization_invites set status = 'expired' where id = invite.id;
    raise exception 'invite has expired';
  end if;

  if caller_email is null or lower(invite.email) <> lower(caller_email) then
    raise exception 'this invite is not addressed to your account';
  end if;

  -- NEW (015): reject if either the invitee's own account or the target
  -- org is suspended. Checked after the email-match (no point leaking
  -- suspension state to someone the invite wasn't even addressed to) and
  -- before any membership insert.
  if public.is_access_suspended(invite.organization_id) then
    raise exception 'this organization or account is suspended';
  end if;

  if exists (
    select 1 from public.organization_members
    where organization_id = invite.organization_id and user_id = caller_id
  ) then
    update public.organization_invites
      set status = 'accepted', accepted_at = now()
      where id = invite.id;
    return invite.organization_id;
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (invite.organization_id, caller_id, invite.role);

  update public.organization_invites
    set status = 'accepted', accepted_at = now()
    where id = invite.id;

  return invite.organization_id;
end;
$$;

revoke execute on function public.accept_organization_invite(uuid) from public;
grant execute on function public.accept_organization_invite(uuid) to authenticated;

-- ─── Gap 2: self-bootstrap must not claim a suspended org ──────────────────
drop policy if exists "self-bootstrap insert membership only" on public.organization_members;

create policy "self-bootstrap insert membership only"
  on public.organization_members for insert
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and not public.org_has_members(organization_id)
    and not exists (
      select 1 from public.organizations o
      where o.id = organization_id and o.suspended_at is not null
    )
  );
