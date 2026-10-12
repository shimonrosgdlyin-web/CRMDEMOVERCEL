-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 005: organization_id columns on existing business tables
--
-- Stage 1 ("tenant data-model foundation") of the multi-tenant SaaS
-- conversion roadmap. Adds a nullable `organization_id` link from each of
-- the 4 existing agent-owned tables to organizations (see
-- 004_organizations.sql), so the column exists ahead of the app code that
-- will eventually populate it.
--
-- Deliberately NULLABLE, not NOT NULL: the signup/invite flow that would
-- populate this column on insert doesn't exist until Stage 3, and this
-- schema needs to coexist with the current, still-functioning single-tenant
-- app in the meantime — every row inserted by the current app code will
-- have organization_id = null until Stage 3 ships.
--
-- Deliberately NO RLS changes here: the 4 tables' existing
-- `using (auth.uid() = agent_id)` policies (from 001/002/003) are untouched
-- by this migration. Making them tenant-aware is Stage 2's job, and depends
-- on an open product question (do co-members of an org see each other's
-- private leads by default?) that hasn't been resolved yet.
--
-- `on delete set null` (rather than `cascade` or the implicit `no action`)
-- mirrors the one existing precedent for an optional FK in this schema —
-- inquiries.property_id references public.properties(id) on delete set null
-- (003_inquiries.sql) — so that deleting an organization later never
-- silently cascades into deleting a broker's properties/clients/matches/
-- inquiries; it only unlinks them. Revisit if a later stage decides
-- otherwise.
--
-- ROLLBACK: if this migration is applied and needs to be undone, run:
--   alter table public.properties              drop column if exists organization_id;
--   alter table public.clients                 drop column if exists organization_id;
--   alter table public.property_client_matches drop column if exists organization_id;
--   alter table public.inquiries               drop column if exists organization_id;
-- Each column is nullable and unused by any existing query, so dropping it
-- has no knock-on effect; the indexes below are dropped automatically along
-- with their columns.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.properties
  add column organization_id uuid references public.organizations(id) on delete set null;

create index on public.properties (organization_id);

alter table public.clients
  add column organization_id uuid references public.organizations(id) on delete set null;

create index on public.clients (organization_id);

alter table public.property_client_matches
  add column organization_id uuid references public.organizations(id) on delete set null;

create index on public.property_client_matches (organization_id);

alter table public.inquiries
  add column organization_id uuid references public.organizations(id) on delete set null;

create index on public.inquiries (organization_id);
