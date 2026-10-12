-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 013: platform super-admin foundation
--
-- Introduces the first PLATFORM-level (cross-tenant) role this schema has
-- ever had. Everything before this migration is org-scoped: 'owner'/'admin'/
-- 'agent' in organization_members describe a person's standing *inside one
-- organization*, and there has been no way for the SaaS operator to see or
-- act across organizations except by opening the Supabase SQL Editor by hand.
--
-- This migration is deliberately, strictly ADDITIVE. It creates new tables,
-- new columns, new functions and new triggers. It does NOT recreate a single
-- existing policy and does NOT `create or replace` a single existing
-- function. Applying it therefore cannot change what any existing tenant can
-- see or do — the suspension columns it adds are inert until 014 gives them
-- teeth. That split is intentional: 013 is the safe half, 014 is the half
-- that carries RLS-regression risk, and each gets its own review and its own
-- rollback. See 014_suspension_enforcement.sql.
--
-- Depends on: 001 (profiles), 004 (organizations). Deliberately references
-- NOTHING from 010_organization_invites.sql — organization_invites,
-- get_invite_preview() and accept_organization_invite() may not exist on a
-- given database yet (010 is authored but was not applied as of this
-- migration being written), and a mid-script "relation does not exist" in the
-- SQL Editor risks leaving a partial apply. Invite-related suspension work is
-- deferred to a later migration, gated on 010 actually being live.
-- 012 is independent of this file and may be applied before or after it.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SCOPE, stated so it can be argued with rather than inferred from the SQL:
-- a platform admin may VIEW org/user/usage METADATA, and may SUSPEND and
-- UN-SUSPEND an organization or a user. That is all. Deliberately absent:
--   - No delete. Nothing here removes an organization, a user, or their data.
--   - No impersonation. There is no "log in as this customer" path.
--   - No read access to tenant business data. A platform admin CANNOT read a
--     single clients / properties / property_client_matches / inquiries row.
--     This is a containment boundary, not an oversight: read access to every
--     tenant's lead database IS impersonation-grade access whatever it is
--     called, and a compromised operator account should not be able to
--     exfiltrate it. See the read RPCs at the bottom of this file — every one
--     of them enumerates its columns explicitly and never does `select *`.
--
-- WHY RPCs RATHER THAN `or is_platform_admin()` ON THE EXISTING POLICIES:
-- the alternative was to restate the ~16 policies 007 put on the business
-- tables with an extra platform-admin branch. That means 16 opportunities to
-- fumble a using/with-check pair on tables holding live tenant PII, in
-- service of a capability that is explicitly out of scope (above). A narrow
-- set of security-definer read functions gets the panel everything it needs
-- and leaves every existing tenant policy byte-for-byte untouched.
--
-- ─────────────────────────────────────────────────────────────────────────
-- MFA IS ENFORCED HERE, IN THE DATABASE — not only in the application.
-- is_platform_admin() requires the caller's JWT to carry aal = 'aal2', i.e.
-- the session has completed a second factor. Supabase encodes the
-- authenticator assurance level in the `aal` claim, and a JWT with no `aal`
-- claim is aal1 (https://supabase.com/docs/guides/auth/auth-mfa). Putting
-- the check here rather than only in the Next.js layer means a direct
-- PostgREST call with a valid but single-factor token is refused by the
-- database itself. The app-layer checks (src/lib/admin/require-platform-admin.ts)
-- exist for UX and clean error messages; this is the actual boundary — the
-- same posture src/lib/org/current-org.ts already documents for the
-- current-org cookie.
--
-- ─────────────────────────────────────────────────────────────────────────
-- BOOTSTRAP / OPERATIONAL RUNBOOK — read before applying.
--
-- 1. This migration seeds exactly one platform admin, by email (see the DO
--    block below). If that account does not exist in auth.users yet, the
--    seed prints a NOTICE and inserts nothing. In that case, AFTER the
--    account has signed up, run:
--
--      insert into public.platform_admins (user_id, note)
--      select id, 'bootstrap platform admin, manual follow-up to 013'
--      from auth.users where lower(email) = lower('shimonrosgdlyin@gmail.com')
--      on conflict (user_id) do nothing;
--
--      -- verify (must return exactly 1):
--      select count(*) from public.platform_admins;
--
-- 2. TOTP must be enabled for the project (Supabase Dashboard → Auth → MFA)
--    or no session can ever reach aal2 and the panel is unreachable by
--    construction.
--
-- 3. ENROLL TWO TOTP FACTORS ON TWO SEPARATE DEVICES for the first admin.
--    Supabase TOTP has no backup codes. With one factor and one platform
--    admin, a lost phone locks the panel until someone deletes the row from
--    auth.mfa_factors via the SQL Editor. That recovery path is the reason
--    this is a runbook note and not a catastrophe, but two factors is
--    cheaper than needing it.
--
-- 4. There is NO application path to grant or revoke platform-admin — see
--    platform_admins' policy section below. Doing so is always a deliberate
--    SQL operation.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK: if this migration is applied and needs to be undone, run (in
-- this order — the triggers depend on guard_suspension_columns(), and every
-- function below depends on is_platform_admin()):
--
--   -- restore the blanket grants this migration narrowed to a column
--   -- allowlist -- without this step, rollback leaves the app unable to
--   -- create an organization or update a profile at all.
--   grant insert, update on public.organizations to authenticated;
--   grant insert, update on public.profiles      to authenticated;
--   drop trigger if exists organizations_guard_suspension on public.organizations;
--   drop trigger if exists profiles_guard_suspension      on public.profiles;
--   drop function if exists public.guard_suspension_columns();
--   drop function if exists public.admin_set_organization_suspended(uuid, boolean, text);
--   drop function if exists public.admin_set_user_suspended(uuid, boolean, text);
--   drop function if exists public.admin_platform_stats();
--   drop function if exists public.admin_list_organizations(text, integer, integer);
--   drop function if exists public.admin_get_organization(uuid);
--   drop function if exists public.admin_list_users(text, integer, integer);
--   drop function if exists public.admin_list_platform_admins();
--   drop table if exists public.admin_audit_log;
--   drop function if exists public.is_platform_admin();
--   drop table if exists public.platform_admins;
--   alter table public.organizations
--     drop column if exists suspended_at,
--     drop column if exists suspended_by,
--     drop column if exists suspension_reason;
--   alter table public.profiles
--     drop column if exists suspended_at,
--     drop column if exists suspended_by,
--     drop column if exists suspension_reason;
--
-- Nothing that existed before 013 references any of these objects, so this
-- is a clean, fully reversible drop — PROVIDED 014 has not been applied on
-- top (014's amended is_org_member/is_org_admin read organizations.suspended_at,
-- and its restrictive policies call functions defined there). If 014 is
-- live, roll 014 back first, in its own documented order.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── PLATFORM ADMINS (the roster) ────────────────────────────────────────
-- The FK targets auth.users, NOT public.profiles — a deliberate divergence
-- from organization_members.user_id, which references profiles(id).
-- 012_org_rpc_profile_backfill.sql exists precisely because a profiles row
-- can go missing while the auth.users row survives (the delete cascade only
-- runs auth.users → profiles, never the reverse). If platform-admin standing
-- hung off profiles, that same manual deletion would silently revoke it.
-- auth.users is the real identity root, so that is what this hangs off.
create table public.platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  note        text check (char_length(note) <= 500)
);

comment on table public.platform_admins is
  'Platform-level (cross-tenant) operators. Bootstrapped by migration 013. There is no application path to write this table -- grants and revocations are deliberate SQL operations, see that migration''s header.';

alter table public.platform_admins enable row level security;

-- The ONLY policy on this table, and it is deliberately the simplest
-- expression possible.
--
-- DO NOT rewrite this as `using (public.is_platform_admin())`, and DO NOT
-- inline it as `using (exists (select 1 from public.platform_admins where
-- user_id = auth.uid()))`. Either change re-creates the exact failure
-- 004_organizations.sql:68-92 documents for organization_members: a policy
-- on a table whose evaluation requires querying that same table, which
-- Postgres rejects with "infinite recursion detected in policy for relation
-- platform_admins". The form below compares a column to a session function
-- and touches no table at all, so recursion is impossible by construction
-- rather than by convention. Every other consumer reads this table from
-- inside a security-definer function (is_platform_admin(), below), which
-- bypasses this policy entirely -- the identical mechanism 004's
-- is_org_member/is_org_admin use.
--
-- This policy is ALSO the MFA bootstrap path, and that is not a coincidence.
-- A freshly-granted admin who has not yet enrolled a TOTP factor is at aal1,
-- so is_platform_admin() is false for them -- if reading their own grant
-- required that function, they could never reach the enrollment page and the
-- panel would be unreachable for its very first user. Reading one's own row
-- needs no function and no assurance level. One decision, two problems.
create policy "users see only their own platform-admin grant"
  on public.platform_admins for select
  using (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy, deliberately -- the same default-deny
-- convention 004 uses for DELETE on organizations/organization_members.
-- Combined with the revoke below there is no PostgREST path, under any role
-- the application can reach, that writes this table. Granting platform-admin
-- is out-of-band by design; since managing the admin roster was never in
-- scope (view + suspend/restore only), this costs nothing and closes the
-- single most valuable privilege-escalation target outright.
--
-- The revoke is defense in depth beyond RLS: Supabase grants DML on new
-- public tables to anon/authenticated by default. Those grants are already
-- inert with no policy behind them, but revoking them means an accidentally
-- added policy in some future migration is not instantly a live write path.
revoke insert, update, delete on public.platform_admins from anon, authenticated;


-- ─── SUSPENSION STATE ────────────────────────────────────────────────────
-- Nullable, no default: null means "not suspended", which is the state of
-- every row that already exists. Restore sets all three back to null, so
-- every action taken through the panel is fully reversible.
--
-- These columns are INERT until 014. Nothing reads suspended_at for access
-- control yet; 013 only establishes the state and protects it from being
-- forged. That ordering is deliberate -- it means this migration can be
-- applied, reviewed and lived with before anything about tenant access
-- changes.
--
-- Placed BEFORE is_platform_admin() deliberately -- is_platform_admin() is
-- `language sql`, and Postgres validates a SQL-language function's body
-- against the schema at CREATE time (unlike plpgsql, which only validates at
-- call time). Its body references profiles.suspended_at, so that column
-- must already exist when this function is created, or CREATE FUNCTION
-- itself fails with "column p.suspended_at does not exist" -- a real failure
-- mode hit when this migration was first applied with the two sections in
-- the opposite order. Moving the ALTER TABLE ahead of every LANGUAGE SQL
-- function that depends on it closes this for good.
alter table public.organizations
  add column suspended_at      timestamptz,
  add column suspended_by      uuid references auth.users(id) on delete set null,
  add column suspension_reason text check (char_length(suspension_reason) <= 500);

alter table public.profiles
  add column suspended_at      timestamptz,
  add column suspended_by      uuid references auth.users(id) on delete set null,
  add column suspension_reason text check (char_length(suspension_reason) <= 500);

-- Partial indexes: the panel's only query against these is "show me what is
-- suspended", and in steady state that matches almost no rows.
create index on public.organizations (suspended_at) where suspended_at is not null;
create index on public.profiles      (suspended_at) where suspended_at is not null;


-- ─── is_platform_admin() ─────────────────────────────────────────────────
-- ONE function, deliberately strict. It answers "is the CURRENT SESSION a
-- valid platform-admin session", not the weaker "is this person on the
-- roster". All three conditions are load-bearing; dropping any one of them
-- is a privilege escalation:
--
--   1. holds a platform_admins grant
--   2. the session is aal2, i.e. MFA-verified (see the header)
--   3. is not itself a suspended user -- otherwise "suspend" would be a lie:
--      a suspended operator would keep full platform access
--
-- Do NOT add a lenient sibling ("is_platform_admin_no_mfa()" or similar). A
-- second, weaker function is a footgun that will eventually be called from
-- the wrong place. The one legitimate pre-MFA read -- an admin loading the
-- enrollment page -- goes through platform_admins' own SELECT policy above.
--
-- `not exists (... and suspended_at is not null)` rather than a join with
-- profiles: a MISSING profiles row (the 012 orphan case) must mean "not
-- suspended", not "locked out".
--
-- FAIL DIRECTION, worth stating explicitly: if the aal claim were ever
-- absent or renamed, this returns false for everyone -- the admin panel dies
-- and NO tenant is affected, because no tenant-facing policy calls this
-- function. Fail-closed with a blast radius of exactly one feature. That
-- property is itself a reason to put the MFA check here rather than inside
-- the tenant helpers.
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    exists (
      select 1 from public.platform_admins pa
      where pa.user_id = auth.uid()
    )
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.suspended_at is not null
    );
$$;

-- Mandatory grant discipline, per 006_organization_members_hardening.sql:
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and a later
-- `grant ... to authenticated` is ADDITIVE, never restrictive. Revoke first,
-- then grant. This applies to every function in this file without exception.
revoke execute on function public.is_platform_admin() from public;
grant  execute on function public.is_platform_admin() to authenticated;


-- ─── SEED THE FIRST PLATFORM ADMIN ───────────────────────────────────────
-- Idempotent on both axes: a no-op NOTICE if the account does not exist yet,
-- `on conflict do nothing` if it does. Safe to re-run.
--
-- On the hardcoded email: it is the repo owner's own address and already
-- appears in the author metadata of every commit in this repository, so it
-- leaks nothing new. It is not a credential -- knowing it grants nothing,
-- since the account still requires password/OAuth *and* a TOTP factor. The
-- alternative (an undocumented manual insert) is strictly worse for
-- auditability: it would leave no record of who was granted platform-admin
-- or when. Parameterising via an environment variable is not an option --
-- migrations run in the SQL Editor with no application environment.
-- Accepted cost: this publicly labels one address as the operator account,
-- a modest phishing-targeting hint above the baseline of it being in git
-- history -- security review flagged that this is a materially stronger
-- signal than passive commit authorship (it says "this is the cross-tenant
-- super-admin", not just "this person made a commit"), which is fair, and is
-- why this paragraph is more explicit than the original draft. Mandatory,
-- database-enforced MFA is the mitigation. If this repository's visibility
-- ever changes to public, treat this address as a disclosed high-value
-- phishing target and weigh removing the literal at that time.
do $$
declare
  seed_email   constant text := 'shimonrosgdlyin@gmail.com';
  seed_user_id uuid;
begin
  select id into seed_user_id
  from auth.users
  where lower(email) = lower(seed_email)
  limit 1;

  if seed_user_id is null then
    raise notice
      'MIGRATION 013: no auth.users row for %. platform_admins is EMPTY and the admin panel is unreachable. This is expected if that account has not signed up yet -- run the manual follow-up in this migration''s header once it has.',
      seed_email;
  else
    insert into public.platform_admins (user_id, note)
    values (seed_user_id, 'bootstrap platform admin, seeded by migration 013')
    on conflict (user_id) do nothing;

    raise notice 'MIGRATION 013: platform admin seeded for % (%).', seed_email, seed_user_id;
  end if;
end $$;


-- ─── GUARD: suspension columns are platform-admin-only ───────────────────
-- WITHOUT THIS TRIGGER, "SUSPENSION" IS SELF-SERVICE REVERSIBLE. Both tables
-- that now carry suspension state are already writable by exactly the people
-- being suspended:
--
--   organizations -- 004_organizations.sql's "org admins update organization"
--     is `for update using (is_org_admin(id)) with check (is_org_admin(id))`,
--     which does not pin which columns may change. A suspended org's own
--     admin could run: update organizations set suspended_at = null.
--
--   profiles -- 001_initial_schema.sql's "agents see own profile" is
--     `for all using (auth.uid() = id)` with NO with-check clause, and
--     Postgres defaults a missing WITH CHECK to the USING expression. Every
--     user can freely UPDATE their own row, including these new columns.
--
-- RLS alone structurally cannot fix this: both policies are correct for what
-- they were written to do, and neither can express "except these three
-- columns". A BEFORE UPDATE trigger can -- the same tool this schema already
-- reaches for three times (006's prevent_organization_member_identity_change,
-- 008's guard_organization_id_change, 010's guard_invite_update).
--
-- `is distinct from`, not `<>` -- these columns are nullable and null → value
-- is precisely the transition being guarded. Plain `<>` yields null (not
-- true) when either side is null, so the guard would silently not fire on
-- the most important case. Same reasoning 008 gives for the same choice.
--
-- Deliberately NOT security definer: it only compares OLD/NEW on a row the
-- statement already reached, and it calls is_platform_admin() (which IS
-- definer), so the check is against the real human even when the write
-- arrives from inside a definer RPC.
--
-- Deliberately NO `or auth.uid() is null` escape hatch. That predicate is
-- also true for an anon PostgREST caller, and relying on RLS to stop them
-- first is the wrong instinct in a guard whose entire job is to be the last
-- line. A future migration that legitimately needs to touch these columns
-- wraps itself in `alter table ... disable trigger ...` / `... enable trigger
-- ...` -- explicit and auditable.
--
-- Covers INSERT as well as UPDATE. An earlier draft of this migration guarded
-- UPDATE only, which left a real hole that security review caught: neither
-- table restricts which COLUMNS an insert may set. `organizations`' INSERT
-- policy is `with check (auth.uid() is not null)` (004:155-157) — so any
-- authenticated user POSTing straight to /rest/v1/organizations, instead of
-- going through create_organization_with_owner(), could create a row with
-- suspended_at/suspended_by/suspension_reason already populated to whatever
-- they liked. `profiles` had a narrower version of the same hole via the
-- orphan-row re-insert case 012 documents.
--
-- On INSERT there is no OLD record — referencing old.* in an insert trigger is
-- an error in PL/pgSQL — so the two branches are written separately rather
-- than sharing one comparison. The INSERT branch only objects to a NON-NULL
-- suspension column, so every legitimate insert in this schema passes
-- untouched: 001's handle_new_user() (id, full_name), 012's
-- create_organization_with_owner() (id, name) and (id, full_name), and this
-- migration's own admin_set_user_suspended() upsert (id, '') all leave the
-- three columns NULL.
create or replace function public.guard_suspension_columns()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if (new.suspended_at is not null
        or new.suspended_by is not null
        or new.suspension_reason is not null)
       and not public.is_platform_admin()
    then
      raise exception
        'suspension columns on % may only be set by a platform admin (use admin_set_organization_suspended / admin_set_user_suspended)',
        tg_table_name
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end if;

  if (old.suspended_at is distinct from new.suspended_at)
     or (old.suspended_by is distinct from new.suspended_by)
     or (old.suspension_reason is distinct from new.suspension_reason)
  then
    if not public.is_platform_admin() then
      raise exception
        'suspension columns on % may only be changed by a platform admin (use admin_set_organization_suspended / admin_set_user_suspended)',
        tg_table_name
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

create trigger organizations_guard_suspension
  before insert or update on public.organizations
  for each row execute procedure public.guard_suspension_columns();

create trigger profiles_guard_suspension
  before insert or update on public.profiles
  for each row execute procedure public.guard_suspension_columns();


-- ─── COLUMN PRIVILEGES: the RPCs are the ONLY write path ─────────────────
-- The trigger above authorizes on WHO is writing, not on HOW. That still
-- leaves a valid, MFA'd platform admin able to PATCH organizations/profiles
-- directly and skip their own RPC's business rules — the required reason, the
-- no-self-suspend and no-suspend-another-admin refusals, and above all the
-- atomic admin_audit_log insert. Identity checks cannot close that; privileges
-- can.
--
-- Postgres semantics that make this work, and the reason it is written as
-- revoke-then-regrant rather than a column-level revoke: "if a role has been
-- granted privileges on a table, then revoking the same privileges from
-- individual columns will have no effect." A table-level grant covers every
-- column, present and future. So the table-level INSERT/UPDATE has to come off
-- first, and only the columns the application legitimately writes are granted
-- back.
--
-- The grants below are the ACTUAL write surface of this codebase, enumerated
-- from the source rather than guessed:
--   organizations INSERT (id, name)    — create_organization_with_owner(),
--                                        which is SECURITY INVOKER and so runs
--                                        as `authenticated` (011/012:85-86)
--   organizations UPDATE (name)        — no app code updates organizations
--                                        today; granted so the org-rename that
--                                        004's UPDATE policy already intends
--                                        stays possible
--   profiles      INSERT (id, full_name)          — create_organization_with_owner()
--                                                   (012:81-83). handle_new_user()
--                                                   is SECURITY DEFINER and is
--                                                   unaffected either way.
--   profiles      UPDATE (full_name, phone, agency_name)
--                                                 — register/page.tsx:117-121
--
-- created_at/updated_at are deliberately absent: no statement in this codebase
-- names them, and set_updated_at()'s trigger assignment to NEW is not
-- privilege-checked (column privileges are checked against the columns named
-- in the statement, not against what a trigger does to the row afterwards).
--
-- CONSEQUENCE TO KNOW ABOUT: adding a column to either table and writing it
-- from client code now requires adding it to these grants, or the write fails
-- with "permission denied for column". That is the intended trade — an
-- explicit, reviewable allowlist on the two tables that carry suspension state
-- — but it WILL be surprising the first time it bites. Mention it in
-- supabase/CLAUDE.md.
--
-- anon gets nothing back. RLS already blocks it on both tables; this is
-- defense in depth.
revoke insert, update on public.organizations from anon, authenticated;
revoke insert, update on public.profiles      from anon, authenticated;

grant insert (id, name) on public.organizations to authenticated;
grant update (name)     on public.organizations to authenticated;

grant insert (id, full_name)                       on public.profiles to authenticated;
grant update (full_name, phone, agency_name)       on public.profiles to authenticated;


-- ─── ADMIN AUDIT LOG ─────────────────────────────────────────────────────
-- Append-only record of every state-changing action a platform admin takes.
-- Only writes are logged; logging every panel read was considered and
-- dropped as high-volume, low-value, and it would turn the log itself into a
-- PII-adjacent artifact.
--
-- actor_id is `on delete set null` AND actor_email is a denormalised
-- snapshot: the trail survives deletion of the actor's account -- you cannot
-- erase your own history by deleting yourself -- without wedging account
-- deletion the way `on delete restrict` would.
create table public.admin_audit_log (
  id           uuid primary key default uuid_generate_v4(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text not null,
  action       text not null check (action in
                 ('org.suspend', 'org.restore', 'user.suspend', 'user.restore')),
  target_type  text not null check (target_type in ('organization', 'user')),
  target_id    uuid not null,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create index on public.admin_audit_log (created_at desc);
create index on public.admin_audit_log (target_type, target_id);

create policy "platform admins read audit log"
  on public.admin_audit_log for select
  using (public.is_platform_admin());

-- No INSERT/UPDATE/DELETE policy. Writes happen ONLY inside the two
-- security-definer RPCs at the bottom of this file, which bypass RLS.
--
-- WHY NOT AN INSERT POLICY: an `for insert with check (is_platform_admin()
-- and actor_id = auth.uid())` policy, written by the API route, would pin
-- the actor honestly enough -- but the log write could simply be SKIPPED.
-- Anyone calling PostgREST directly would perform a suspension with no audit
-- row and RLS would accept it, because RLS is the boundary and the Next.js
-- route is not. Writing both from one definer function in one transaction,
-- combined with the guard trigger above making that function the only thing
-- that can write suspended_at at all, makes an unlogged suspension
-- structurally impossible rather than merely discouraged.
--
-- KNOWN LIMIT, stated rather than papered over: the database owner can still
-- rewrite this table, and there is no external append-only sink. Genuine
-- tamper-evidence needs off-database log shipping; that is out of scope here.
revoke insert, update, delete on public.admin_audit_log from anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- READ RPCs
--
-- Every function below is security definer (so it can read across tenants
-- and reach auth.users, which the `authenticated` role has no grant on --
-- the same reason 010's accept_organization_invite() had to be definer), and
-- every one opens with an explicit is_platform_admin() check that RAISES.
-- That is two independent gates -- the revoke/grant pair and the in-body
-- check -- neither of which relies on the other.
--
-- Columns are enumerated explicitly everywhere. Never `select *` from a
-- tenant table inside a definer function: a column added by a future
-- migration would silently start flowing to the panel.
--
-- What is deliberately NOT exposed by any of these:
--   clients / properties / property_client_matches / inquiries row data
--     (counts only), and organization_invites entirely -- especially its
--     token column, which 010 already treats as never-listable.
--   profiles.phone -- the broker's personal number. View + suspend does not
--     need it. This is a judgment call and is flagged for security review
--     rather than quietly included.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_platform_stats()
returns table (
  organization_count      bigint,
  suspended_org_count     bigint,
  user_count              bigint,
  suspended_user_count    bigint,
  property_count          bigint,
  client_count            bigint,
  inquiry_count           bigint,
  platform_admin_count    bigint
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    (select count(*) from public.organizations),
    (select count(*) from public.organizations o where o.suspended_at is not null),
    -- auth.users, not profiles: profiles can be missing for an account (the
    -- orphan case 012 was written for), and "how many accounts exist" must
    -- not silently under-report because of it.
    (select count(*) from auth.users),
    (select count(*) from public.profiles p where p.suspended_at is not null),
    (select count(*) from public.properties),
    (select count(*) from public.clients),
    (select count(*) from public.inquiries),
    (select count(*) from public.platform_admins);
end;
$$;

revoke execute on function public.admin_platform_stats() from public;
grant  execute on function public.admin_platform_stats() to authenticated;


-- search_term is matched with ILIKE against the org name only. It is
-- interpolated nowhere -- it is a bound parameter used in a comparison, so
-- there is no injection surface here. `%` and `_` supplied by the caller act
-- as wildcards; that is accepted (this is a search box, and a platform admin
-- is already allowed to list every org with no filter at all).
create or replace function public.admin_list_organizations(
  search_term  text default null,
  limit_count  integer default 50,
  offset_count integer default 0
)
returns table (
  id                uuid,
  name              text,
  created_at        timestamptz,
  suspended_at      timestamptz,
  suspended_by      uuid,
  suspension_reason text,
  member_count      bigint,
  property_count    bigint,
  client_count      bigint,
  inquiry_count     bigint,
  last_activity_at  timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = 'insufficient_privilege';
  end if;

  -- Clamp rather than trust. The API route validates these with Zod too,
  -- but this function is directly reachable over PostgREST by any platform
  -- admin, so the bound belongs here as well.
  limit_count  := least(greatest(coalesce(limit_count, 50), 1), 100);
  offset_count := greatest(coalesce(offset_count, 0), 0);

  return query
  select
    o.id,
    o.name,
    o.created_at,
    o.suspended_at,
    o.suspended_by,
    o.suspension_reason,
    (select count(*) from public.organization_members m where m.organization_id = o.id),
    (select count(*) from public.properties pr where pr.organization_id = o.id),
    (select count(*) from public.clients c where c.organization_id = o.id),
    (select count(*) from public.inquiries i where i.organization_id = o.id),
    greatest(
      (select max(pr.created_at) from public.properties pr where pr.organization_id = o.id),
      (select max(c.created_at)  from public.clients c    where c.organization_id = o.id),
      (select max(i.sent_at)     from public.inquiries i  where i.organization_id = o.id)
    )
  from public.organizations o
  where search_term is null
     or o.name ilike '%' || search_term || '%'
  order by o.created_at desc
  limit limit_count offset offset_count;
end;
$$;

revoke execute on function public.admin_list_organizations(text, integer, integer) from public;
grant  execute on function public.admin_list_organizations(text, integer, integer) to authenticated;


-- Org detail + its member roster. Emails come from auth.users, which is only
-- reachable because this function is definer.
create or replace function public.admin_get_organization(target_org_id uuid)
returns table (
  organization_id   uuid,
  organization_name text,
  created_at        timestamptz,
  suspended_at      timestamptz,
  suspended_by      uuid,
  suspension_reason text,
  member_user_id    uuid,
  member_email      text,
  member_full_name  text,
  member_agency     text,
  member_role       text,
  member_joined_at  timestamptz,
  member_suspended_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    o.id,
    o.name,
    o.created_at,
    o.suspended_at,
    o.suspended_by,
    o.suspension_reason,
    m.user_id,
    u.email::text,
    p.full_name,
    p.agency_name,
    m.role,
    m.created_at,
    p.suspended_at
  from public.organizations o
  left join public.organization_members m on m.organization_id = o.id
  left join auth.users u                  on u.id = m.user_id
  left join public.profiles p             on p.id = m.user_id
  where o.id = target_org_id
  order by m.created_at asc;
end;
$$;

revoke execute on function public.admin_get_organization(uuid) from public;
grant  execute on function public.admin_get_organization(uuid) to authenticated;


-- profiles.phone is deliberately absent -- see the block comment above.
create or replace function public.admin_list_users(
  search_term  text default null,
  limit_count  integer default 50,
  offset_count integer default 0
)
returns table (
  user_id           uuid,
  email             text,
  full_name         text,
  agency_name       text,
  created_at        timestamptz,
  last_sign_in_at   timestamptz,
  email_confirmed_at timestamptz,
  suspended_at      timestamptz,
  suspended_by      uuid,
  suspension_reason text,
  org_count         bigint,
  -- named is_admin, NOT is_platform_admin: an OUT parameter becomes a plpgsql
  -- variable, and naming it after the function would shadow-collide with the
  -- is_platform_admin() call in this function's own guard clause.
  is_admin          boolean
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = 'insufficient_privilege';
  end if;

  limit_count  := least(greatest(coalesce(limit_count, 50), 1), 100);
  offset_count := greatest(coalesce(offset_count, 0), 0);

  return query
  select
    u.id,
    u.email::text,
    p.full_name,
    p.agency_name,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    p.suspended_at,
    p.suspended_by,
    p.suspension_reason,
    (select count(*) from public.organization_members m where m.user_id = u.id),
    exists (select 1 from public.platform_admins pa where pa.user_id = u.id)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where search_term is null
     or u.email ilike '%' || search_term || '%'
     or p.full_name ilike '%' || search_term || '%'
  order by u.created_at desc
  limit limit_count offset offset_count;
end;
$$;

revoke execute on function public.admin_list_users(text, integer, integer) from public;
grant  execute on function public.admin_list_users(text, integer, integer) to authenticated;


-- The roster. Exists as an RPC precisely so platform_admins' own SELECT
-- policy can stay the trivial, recursion-proof `user_id = auth.uid()` shape.
create or replace function public.admin_list_platform_admins()
returns table (
  user_id     uuid,
  email       text,
  full_name   text,
  granted_at  timestamptz,
  granted_by  uuid,
  note        text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    pa.user_id,
    u.email::text,
    p.full_name,
    pa.granted_at,
    pa.granted_by,
    pa.note
  from public.platform_admins pa
  left join auth.users u      on u.id = pa.user_id
  left join public.profiles p on p.id = pa.user_id
  order by pa.granted_at asc;
end;
$$;

revoke execute on function public.admin_list_platform_admins() from public;
grant  execute on function public.admin_list_platform_admins() to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- WRITE RPCs
--
-- The suspension state change and its audit row are written in ONE
-- transaction, by one function, which is the only thing the guard trigger
-- above will let write suspended_at at all. The actor is read from auth.uid()
-- INSIDE the function and is never accepted as a parameter -- the same
-- non-forgeable-identity precedent 010's accept_organization_invite() set
-- when it insisted on reading the caller's email from auth.users itself.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_set_organization_suspended(
  target_org_id uuid,
  suspend       boolean,
  reason        text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id     uuid := auth.uid();
  actor_email  text;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = 'insufficient_privilege';
  end if;

  if suspend and coalesce(btrim(reason), '') = '' then
    raise exception 'a reason is required to suspend an organization';
  end if;

  select u.email::text into actor_email from auth.users u where u.id = actor_id;

  if not exists (select 1 from public.organizations o where o.id = target_org_id) then
    raise exception 'organization % not found', target_org_id;
  end if;

  update public.organizations o
  set suspended_at      = case when suspend then now() else null end,
      suspended_by      = case when suspend then actor_id else null end,
      suspension_reason = case when suspend then btrim(reason) else null end
  where o.id = target_org_id;

  insert into public.admin_audit_log (actor_id, actor_email, action, target_type, target_id, metadata)
  values (
    actor_id,
    coalesce(actor_email, '(unknown)'),
    case when suspend then 'org.suspend' else 'org.restore' end,
    'organization',
    target_org_id,
    jsonb_build_object('reason', btrim(reason))
  );
end;
$$;

revoke execute on function public.admin_set_organization_suspended(uuid, boolean, text) from public;
grant  execute on function public.admin_set_organization_suspended(uuid, boolean, text) to authenticated;


-- Two refusals here that together make platform-admin lockout structurally
-- impossible through the API:
--
--   1. No self-suspension. is_platform_admin() requires suspended_at is null,
--      so suspending yourself would immediately revoke your own ability to
--      undo it.
--   2. No suspending another platform admin. Without this, two admins could
--      suspend each other and neither could recover -- and more simply, one
--      compromised operator account could disable all the others.
--
-- Suspending a platform admin remains possible as a deliberate SQL Editor
-- operation, recoverable by the same route. The API just refuses to be the
-- instrument of it.
create or replace function public.admin_set_user_suspended(
  target_user_id uuid,
  suspend        boolean,
  reason         text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id    uuid := auth.uid();
  actor_email text;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = 'insufficient_privilege';
  end if;

  if target_user_id = actor_id then
    raise exception 'a platform admin cannot suspend their own account';
  end if;

  if exists (select 1 from public.platform_admins pa where pa.user_id = target_user_id) then
    raise exception 'cannot suspend another platform admin through this API';
  end if;

  if suspend and coalesce(btrim(reason), '') = '' then
    raise exception 'a reason is required to suspend a user';
  end if;

  select u.email::text into actor_email from auth.users u where u.id = actor_id;

  -- profiles is the row that carries suspension state for a user. 012's
  -- orphan case (auth.users row with no profiles row) is handled by upserting
  -- exactly the way create_organization_with_owner() does, so a suspension
  -- can never silently no-op against a missing row.
  if not exists (select 1 from auth.users u where u.id = target_user_id) then
    raise exception 'user % not found', target_user_id;
  end if;

  insert into public.profiles (id, full_name)
  values (target_user_id, '')
  on conflict (id) do nothing;

  update public.profiles p
  set suspended_at      = case when suspend then now() else null end,
      suspended_by      = case when suspend then actor_id else null end,
      suspension_reason = case when suspend then btrim(reason) else null end
  where p.id = target_user_id;

  insert into public.admin_audit_log (actor_id, actor_email, action, target_type, target_id, metadata)
  values (
    actor_id,
    coalesce(actor_email, '(unknown)'),
    case when suspend then 'user.suspend' else 'user.restore' end,
    'user',
    target_user_id,
    jsonb_build_object('reason', btrim(reason))
  );
end;
$$;

revoke execute on function public.admin_set_user_suspended(uuid, boolean, text) from public;
grant  execute on function public.admin_set_user_suspended(uuid, boolean, text) to authenticated;
