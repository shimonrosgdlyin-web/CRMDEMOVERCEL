-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 004: organizations + organization_members
--
-- Stage 1 ("tenant data-model foundation") of the multi-tenant SaaS
-- conversion roadmap. Introduces the tenant-root entity (`organizations`)
-- and its membership join table (`organization_members`) only.
--
-- Explicitly OUT of scope for this migration:
--   - `organization_id` columns on properties/clients/property_client_matches/
--     inquiries — see 005_organization_id_columns.sql.
--   - Rewriting RLS on those 4 existing tables to be tenant-aware (Stage 2 —
--     depends on an open product question: do co-members of an org see each
--     other's private leads by default?).
--   - Any signup/invite flow that populates these tables (Stage 3).
--   - Billing (Stage 4).
--
-- ROLLBACK: if this migration is applied and needs to be undone, run:
--   drop table if exists public.organization_members;
--   drop table if exists public.organizations;
--   drop function if exists public.is_org_member(uuid);
--   drop function if exists public.is_org_admin(uuid);
--   drop function if exists public.org_has_members(uuid);
-- Nothing else references these objects yet, so this is a clean, fully
-- reversible drop as of this migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── ORGANIZATIONS (tenant root) ─────────────────────────────────────────────
-- The real tenant entity. Will eventually replace profiles.agency_name (free
-- text) — that replacement is a later-stage concern, not this migration.
create table public.organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null check (char_length(name) between 1 and 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.organizations enable row level security;

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute procedure public.set_updated_at();

-- ─── ORGANIZATION_MEMBERS (join table: user ↔ organization) ─────────────────
create table public.organization_members (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  role             text not null default 'agent'
                   check (role in ('owner','admin','agent')),
  created_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

alter table public.organization_members enable row level security;

create index on public.organization_members (organization_id);
create index on public.organization_members (user_id);

-- At most one 'owner' per org. This is a real product invariant (not just a
-- convenience index): it closes a small bootstrap race in the INSERT policy
-- below (two concurrent self-bootstrap inserts for the same brand-new org
-- both racing to claim 'owner') and hard-enforces "exactly one owner" at the
-- DB level rather than relying on application code to maintain it.
create unique index organization_members_one_owner_per_org
  on public.organization_members (organization_id)
  where role = 'owner';

-- ─── MEMBERSHIP HELPER FUNCTIONS (security definer — avoids RLS recursion) ──
-- A policy on organization_members that subqueries organization_members
-- itself (e.g. "show me this row if I'm a member of the same org as it")
-- triggers Postgres's "infinite recursion detected in policy for relation
-- organization_members" error, because evaluating the policy for one row
-- would require re-evaluating the same table's row security to resolve the
-- subquery, which requires evaluating the policy again, and so on.
--
-- Fix: move the self-referencing membership check into a `security definer`
-- function. Such a function executes with the privileges of its owner
-- (the role that applies this migration, e.g. the Supabase SQL Editor's
-- `postgres` role), which bypasses RLS for the function's own internal query
-- against organization_members — so calling it from a policy no longer
-- re-triggers that table's row security, breaking the cycle. This is the
-- standard Supabase-recommended pattern for self-referencing membership /
-- join tables. (Note: this session's `mcp__supabase__search_docs` call to
-- confirm this against current docs was queued by the crm-team approval gate
-- and not run — see the task summary. This is nonetheless a long-standing,
-- canonical Postgres/Supabase RLS pattern, not a novel guess.)
--
-- `set search_path = ''` + fully-qualified names (public.organization_members,
-- auth.uid()) on every function below is a deliberate hardening choice: it
-- prevents search_path hijacking, a known SECURITY DEFINER vulnerability
-- class where an unqualified reference could resolve to an
-- attacker-controlled object earlier in the caller's search_path.

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
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
    from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role in ('owner','admin')
  );
$$;

create or replace function public.org_has_members(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_org_id
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.org_has_members(uuid) to authenticated;

-- ─── RLS: organizations ──────────────────────────────────────────────────────
-- SELECT: only existing members can see an organization's row.
create policy "members see own organization"
  on public.organizations for select
  using (public.is_org_member(id));

-- INSERT: any authenticated user may create a new organization row. There is
-- deliberately no membership check here — creating the tenant necessarily
-- precedes any membership row for it (bootstrap case), so there is nothing
-- to check membership against yet. The application flow that creates the org
-- and then inserts the creator as 'owner' is Stage 3's job; this policy only
-- guards against anonymous/unauthenticated inserts.
create policy "authenticated users create organizations"
  on public.organizations for insert
  with check (auth.uid() is not null);

-- UPDATE: only an owner/admin member can update organization details.
create policy "org admins update organization"
  on public.organizations for update
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- No DELETE policy yet (deliberate, default-deny). Org deletion semantics
-- (cascade to members/business data vs. soft-delete) are undecided and out
-- of scope for this schema-foundation migration.

-- ─── RLS: organization_members ───────────────────────────────────────────────
-- SELECT: a member can see every membership row for organizations they
-- belong to — i.e. co-members are visible to each other (needed for any
-- future "team members" list view).
create policy "members see own organization memberships"
  on public.organization_members for select
  using (public.is_org_member(organization_id));

-- INSERT: either (a) an existing owner/admin of the org is adding a member
-- (the invite-flow case, built in Stage 3), or (b) this is a self-bootstrap
-- insert — a user claiming ownership of a brand-new org that currently has
-- zero members. The bootstrap branch is intentionally narrow: it only ever
-- lets a user add *themselves* (user_id = auth.uid()) as 'owner', and only
-- while the org has no members at all yet, so it can't be used to
-- self-promote into an org that already has an owner. The
-- organization_members_one_owner_per_org index above backstops this against
-- a race between two concurrent bootstrap inserts.
create policy "org admins or self-bootstrap insert membership"
  on public.organization_members for insert
  with check (
    public.is_org_admin(organization_id)
    or (
      user_id = auth.uid()
      and role = 'owner'
      and not public.org_has_members(organization_id)
    )
  );

-- UPDATE: only an owner/admin can change a member's role (the only mutable
-- field on this table). Members cannot self-promote.
--
-- OPEN QUESTION (not resolved by this migration, flagging for
-- security-reviewer / a future stage): this currently lets *any* admin
-- change *any* member's role, including demoting the org's owner or
-- promoting another admin to owner, with no "last owner" or
-- owner-can't-be-touched-by-a-mere-admin protection. That is a product
-- decision (how is ownership transferred/protected?) that wasn't specified
-- for this task and shouldn't be guessed at here.
create policy "org admins update member roles"
  on public.organization_members for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- No DELETE policy yet (deliberate, default-deny). "Leave organization" /
-- "remove member" semantics are out of scope for this schema-foundation
-- migration.
