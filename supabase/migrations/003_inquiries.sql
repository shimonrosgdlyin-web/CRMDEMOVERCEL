-- ─── INQUIRIES / ACTIVITY LOG ────────────────────────────────────────────────
create table public.inquiries (
  id          uuid primary key default uuid_generate_v4(),
  agent_id    uuid not null references public.profiles(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  type        text not null check (type in ('whatsapp','email','call','note')),
  message     text check (char_length(message) <= 5000),
  sent_at     timestamptz not null default now()
);

alter table public.inquiries enable row level security;

create policy "agents see own inquiries"
  on public.inquiries for all
  using (auth.uid() = agent_id);

create index on public.inquiries (agent_id, client_id);
create index on public.inquiries (agent_id, sent_at desc);
create index on public.inquiries (agent_id, property_id);
