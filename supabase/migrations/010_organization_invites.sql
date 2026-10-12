-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 010: organization_invites (Stage 3c — the invite flow)
--
-- Owner/admin invites a teammate by email -> they accept -> they get an
-- organization_members row. This is also the fix for approval-queue
-- ct-2f8e91ab (medium, pending): 004's organization_members INSERT policy
-- has an admin-insert branch that lets any admin/owner add ANY user_id at
-- ANY role with zero consent from that user. This migration REMOVES that
-- branch entirely and replaces it with a consent-based accept-invite path —
-- see "WHAT THIS CLOSES, AND WHAT IT DOESN'T" near the end of this header.
--
-- 001-009 are confirmed applied and treated as frozen (never edited in
-- place). This migration adds one new table (organization_invites) with its
-- own RLS, two new functions, and narrows 004's organization_members INSERT
-- policy (drop + recreate, same pattern 006/008 already used for policies
-- on tables from earlier, frozen migrations).
--
-- ─────────────────────────────────────────────────────────────────────────
-- SCHEMA
--
-- organization_invites: id, organization_id, email, role ('admin'|'agent' —
-- deliberately EXCLUDES 'owner', see below), invited_by, token (uuid,
-- crypto-random via the same uuid_generate_v4() every other id in this
-- schema already uses — 122 bits of entropy, not sequential/guessable),
-- status ('pending'|'accepted'|'expired'|'revoked'), created_at, updated_at,
-- accepted_at, expires_at (default now() + 7 days).
--
-- 'owner' is excluded from invites' role CHECK on purpose: the
-- organization_members_one_owner_per_org partial unique index (006) means
-- only one owner can exist at a time, and ownership transfer is a more
-- sensitive operation than "add a teammate" — out of scope here, and
-- excluding it at the CHECK-constraint level gives a clean, early rejection
-- instead of letting an owner-role invite be created and only fail later,
-- confusingly, at accept time against that unique index.
--
-- A partial unique index (organization_id, lower(email)) where status =
-- 'pending' prevents duplicate pending invites to the same address (data
-- hygiene, not a security control) — POST /api/organizations/invites
-- handles the resulting 23505 conflict with a clean message rather than a
-- raw 500.
--
-- A BEFORE UPDATE trigger (guard_invite_update) restricts which columns can
-- ever change after insert to status/accepted_at/updated_at only — nothing
-- else (organization_id, email, role, token, invited_by, created_at,
-- expires_at) can be mutated. This specifically prevents a subtle integrity
-- gap: without it, an admin could edit an existing PENDING invite's role
-- after the invite email (showing the original role) was already sent, so
-- the invitee would unknowingly accept at a role they were never actually
-- shown. "Resend with a new token/expiry" is not built here — the simplest
-- available path today is revoke (status -> 'revoked') + create a fresh
-- invite; a dedicated resend/refresh operation is a small follow-up, not
-- needed for this to be a complete, correct v1.
--
-- ─────────────────────────────────────────────────────────────────────────
-- RLS on organization_invites
--
-- select/insert/update all gated by is_org_admin(organization_id) (insert
-- additionally requires invited_by = auth.uid() — never trust who's
-- "inviting" from anywhere but the session). No delete policy (deliberate,
-- same "revoke via status, keep the audit row" reasoning already used
-- elsewhere in this schema).
--
-- Deliberately NOT exposing invites to the invitee via RLS at all (no
-- policy branch matching "email = my own account's email") — the invitee
-- isn't an org member yet, so is_org_admin-gated select correctly excludes
-- them, and there's no safe way to let an arbitrary authenticated user
-- browse organization_invites by matching their own email without a lot
-- more care (and it isn't needed for the token-based flow this migration
-- implements). Instead, the two functions below are the invitee's only two
-- entry points, both deliberately narrow and security definer:
--
-- get_invite_preview(invite_token uuid) returns table(organization_name,
-- role) — lets the accept page show "you're invited to join <org> as
-- <role>" BEFORE the user commits, without needing any RLS access to the
-- underlying table. Returns zero rows for a bad/expired/consumed token
-- (clean "not found," no distinction leaked between "wrong token" and
-- "right token, wrong state" — nothing more specific is needed by the
-- caller and a uniform empty result is the safer default). Only ever
-- returns the org name + role for the token presented — never the
-- inviter's identity, the target email, or any other org's data. Callable
-- by any authenticated user (not gated by org membership, since the
-- invitee isn't a member yet) but NOT by anon/public — see grants below.
--
-- accept_organization_invite(invite_token uuid) returns uuid — the actual
-- accept operation: validates the token, locks the row (`for update`, so
-- two concurrent accept attempts on the same token can't both succeed —
-- enforces single-use under race conditions, not just via the status
-- check alone), verifies status = 'pending' and not expired (lazily marks
-- 'expired' if the clock has passed even if nothing proactively flipped
-- it), verifies the CALLER'S OWN account email matches the invite's target
-- email (the core IDOR protection — IS_NOT this a case of trusting a
-- client-supplied identity: caller_email is read from auth.users by this
-- function itself, via its security-definer privileges, never taken as a
-- parameter), then inserts the organization_members row using ONLY
-- organization_id/role from the looked-up invite row (never from any
-- request parameter) and marks the invite accepted. If the caller is
-- somehow already a member of that org (e.g. a duplicate invite accepted
-- twice), this is idempotent — marks the invite accepted without erroring
-- or attempting a second insert.
--
-- ─────────────────────────────────────────────────────────────────────────
-- DECISION, ON ITS OWN MERITS, NOT COPIED FROM 009: accept_organization_
-- invite (and get_invite_preview) are SECURITY DEFINER, unlike 009's
-- create_organization_with_owner (which is deliberately INVOKER). This is
-- the opposite choice for a concrete, structural reason, not a default:
--
-- 009 is invoker because the existing RLS policies it relies on ALREADY
-- permit the operation for a normal authenticated caller — invoker was
-- sufficient and safer (genuinely exercises 004's policies instead of
-- bypassing them). Here, the situation is the reverse: after this
-- migration NARROWS organization_members's INSERT policy (see below),
-- there is NO invoker-accessible path left that permits "insert a
-- membership row for someone who isn't already an admin of that org and
-- isn't self-bootstrapping a brand-new org" — by design, that's exactly
-- the branch being removed. A plain invoker function could not perform
-- this insert at all; only a security-definer function (bypassing RLS
-- for this one, tightly-validated operation) can. Definer is a structural
-- requirement here, not a convenience.
--
-- Separately, reading the caller's own email requires `select email from
-- auth.users where id = auth.uid()` — the `authenticated` role does not
-- have standing SELECT access to auth.users (Supabase restricts it for
-- privacy), so this also could not run as invoker. Security definer bypasses
-- that restriction for this function's own internal, narrow use (comparing
-- the caller's own email to one invite row) — it never exposes anyone's
-- email to the caller or lets them query other users' emails.
--
-- Both functions: `set search_path = ''` + fully-qualified names (same
-- hardening as every other security-definer function in this schema, see
-- 004's header), PUBLIC execute explicitly revoked, `authenticated` granted
-- (see 004/006's header for why the revoke matters — Postgres's default
-- grant-to-PUBLIC-on-every-new-function is additive, not restrictive).
--
-- ─────────────────────────────────────────────────────────────────────────
-- NARROWING organization_members's INSERT policy
--
-- 004's policy ("org admins or self-bootstrap insert membership") had two
-- branches: (a) is_org_admin(organization_id) — any admin/owner can insert
-- ANY user_id at ANY role, zero consent from that user (this is exactly
-- ct-2f8e91ab's complaint); (b) self-bootstrap — a user inserting
-- themselves as 'owner' into a brand-new org with zero existing members.
--
-- This migration drops that policy and replaces it with branch (b) ONLY.
-- Branch (a) is gone. After this migration, there is no RLS-permitted way
-- for anyone to directly INSERT a row into organization_members on behalf
-- of someone else — the ONLY paths to a new membership row are: self-
-- bootstrapping a brand-new org as its owner (unchanged, stays exactly as
-- it was), or accept_organization_invite (this migration), which requires
-- the invitee to be authenticated as the exact account the invite named.
--
-- ─────────────────────────────────────────────────────────────────────────
-- WHAT THIS CLOSES, AND WHAT IT DOESN'T (security-reviewer should confirm
-- this assessment, not just take it on faith):
--
-- CLOSES: the zero-consent add. Before this migration, an org admin could
-- unilaterally grant anyone (any user_id they could guess/know) org
-- membership with no action from that person at all. After this migration,
-- that is structurally impossible via RLS — the only remaining path
-- requires the named recipient to be authenticated as an account whose OWN
-- email matches the invite, and to have obtained the unguessable token
-- (delivered out of band, by email). This is genuine, verifiable consent,
-- not just a UI convention that could be bypassed by calling the API
-- directly — it's enforced at the RLS/function layer regardless of how the
-- request is made.
--
-- DOES NOT CLOSE (deliberately, and unchanged by design): the "self-create
-- a shadow org, self-bootstrap as its owner" precondition ct-2f8e91ab also
-- describes. That branch is untouched here, exactly as scoped ("stays as-
-- is"). ct-2f8e91ab's own prior assessment was that this precondition,
-- without a working zero-consent-add or reassignment path attached to it
-- (both now closed, by 008 and by this migration respectively), does not
-- by itself expose anyone else's existing data — an attacker's own shadow
-- org, populated only by their own consenting accounts, isn't a boundary
-- violation against any other tenant. Whether 004's fully-open org-creation
-- policy itself ever needs tightening (e.g. requiring some verification
-- step) is a separate, not-yet-decided product question this migration
-- does not attempt to resolve.
--
-- Residual, inherent-to-any-invite-system risk, not a flaw in this specific
-- design: social engineering (tricking a real person into knowingly
-- accepting an invite into a bad-faith org) is not something an access-
-- control layer can prevent — every invite-based system has this same
-- surface, and it's out of scope for what RLS/token design can address.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK: run
--   drop trigger if exists organization_invites_guard_update on public.organization_invites;
--   drop trigger if exists organization_invites_updated_at on public.organization_invites;
--   drop function if exists public.guard_invite_update();
--   drop function if exists public.accept_organization_invite(uuid);
--   drop function if exists public.get_invite_preview(uuid);
--   drop table if exists public.organization_invites;
--   drop policy if exists "self-bootstrap insert membership only" on public.organization_members;
--   create policy "org admins or self-bootstrap insert membership"
--     on public.organization_members for insert
--     with check (
--       public.is_org_admin(organization_id)
--       or (
--         user_id = auth.uid()
--         and role = 'owner'
--         and not public.org_has_members(organization_id)
--       )
--     );
-- (Reverting the policy re-opens ct-2f8e91ab's zero-consent-add gap — only
-- do this to fully undo this migration, not as a general rollback template.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── ORGANIZATION_INVITES ────────────────────────────────────────────────────
create table public.organization_invites (
  id           uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email        text not null check (char_length(email) <= 200),
  role         text not null default 'agent' check (role in ('admin','agent')),
  invited_by   uuid not null references public.profiles(id) on delete cascade,
  token        uuid not null unique default uuid_generate_v4(),
  status       text not null default 'pending'
               check (status in ('pending','accepted','expired','revoked')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  expires_at   timestamptz not null default (now() + interval '7 days')
);

alter table public.organization_invites enable row level security;

create index on public.organization_invites (organization_id);

create unique index organization_invites_one_pending_per_org_email
  on public.organization_invites (organization_id, lower(email))
  where status = 'pending';

create trigger organization_invites_updated_at
  before update on public.organization_invites
  for each row execute procedure public.set_updated_at();

-- Only status/accepted_at/updated_at may ever change after insert.
create or replace function public.guard_invite_update()
returns trigger language plpgsql as $$
begin
  if old.organization_id is distinct from new.organization_id
     or old.email is distinct from new.email
     or old.role is distinct from new.role
     or old.token is distinct from new.token
     or old.invited_by is distinct from new.invited_by
     or old.created_at is distinct from new.created_at
     or old.expires_at is distinct from new.expires_at
  then
    raise exception 'organization_invites: only status/accepted_at may change after insert';
  end if;
  return new;
end;
$$;

create trigger organization_invites_guard_update
  before update on public.organization_invites
  for each row execute procedure public.guard_invite_update();

-- ─── RLS: organization_invites ───────────────────────────────────────────────
create policy "org admins select invites"
  on public.organization_invites for select
  using (public.is_org_admin(organization_id));

create policy "org admins insert invites"
  on public.organization_invites for insert
  with check (
    public.is_org_admin(organization_id)
    and invited_by = auth.uid()
  );

create policy "org admins update invites"
  on public.organization_invites for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- No delete policy (deliberate) — revoke via status, keep the row for audit.

-- ─── FUNCTIONS: invite preview + accept (security definer, see header) ─────
create or replace function public.get_invite_preview(invite_token uuid)
returns table (organization_name text, role text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select o.name, i.role
    from public.organization_invites i
    join public.organizations o on o.id = i.organization_id
    where i.token = invite_token
      and i.status = 'pending'
      and i.expires_at > now();
end;
$$;

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

  if exists (
    select 1 from public.organization_members
    where organization_id = invite.organization_id and user_id = caller_id
  ) then
    -- Already a member (e.g. the same invite accepted twice, or a second
    -- pending invite to the same org) — idempotent success, no duplicate
    -- insert attempt against organization_members' own unique constraint.
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

revoke execute on function public.get_invite_preview(uuid) from public;
revoke execute on function public.accept_organization_invite(uuid) from public;
grant execute on function public.get_invite_preview(uuid) to authenticated;
grant execute on function public.accept_organization_invite(uuid) to authenticated;

-- ─── NARROW organization_members's INSERT policy (closes ct-2f8e91ab's ────
-- zero-consent-add mechanism — see header for full reasoning) ──────────────
drop policy if exists "org admins or self-bootstrap insert membership" on public.organization_members;

create policy "self-bootstrap insert membership only"
  on public.organization_members for insert
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and not public.org_has_members(organization_id)
  );
