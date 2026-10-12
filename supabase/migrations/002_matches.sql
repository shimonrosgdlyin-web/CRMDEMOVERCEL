-- ─── PROPERTY ↔ CLIENT MATCHES ──────────────────────────────────────────────
create table public.property_client_matches (
  id           uuid primary key default uuid_generate_v4(),
  agent_id     uuid not null references public.profiles(id) on delete cascade,
  property_id  uuid not null references public.properties(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  score        integer not null default 0 check (score between 0 and 100),
  status       text not null default 'suggested'
               check (status in ('suggested','sent','interested','rejected')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (property_id, client_id)
);

alter table public.property_client_matches enable row level security;

create policy "agents see own matches"
  on public.property_client_matches for all
  using (auth.uid() = agent_id);

create trigger matches_updated_at
  before update on public.property_client_matches
  for each row execute procedure public.set_updated_at();

create index on public.property_client_matches (agent_id, client_id);
create index on public.property_client_matches (agent_id, property_id);
create index on public.property_client_matches (agent_id, score desc);
