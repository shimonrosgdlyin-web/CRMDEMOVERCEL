-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ─── PROFILES (extends auth.users) ───────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null check (char_length(full_name) <= 100),
  phone        text check (char_length(phone) <= 20),
  agency_name  text check (char_length(agency_name) <= 100),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "agents see own profile"
  on public.profiles for all
  using (auth.uid() = id);

-- Auto-create profile on sign up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── SHARED TRIGGER: updated_at ─────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── PROPERTIES ──────────────────────────────────────────────────────────────
create table public.properties (
  id          uuid primary key default uuid_generate_v4(),
  agent_id    uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  type        text not null check (type in ('apartment','house','penthouse','land','office')),
  price       numeric(12,2) not null check (price > 0),
  address     text not null check (char_length(address) between 1 and 300),
  city        text not null check (char_length(city) between 1 and 100),
  rooms       numeric(4,1) check (rooms >= 0 and rooms <= 50),
  size_sqm    numeric(8,2) check (size_sqm > 0),
  floor       integer check (floor between -5 and 200),
  parking     boolean not null default false,
  elevator    boolean not null default false,
  description text check (char_length(description) <= 2000),
  status      text not null default 'available'
              check (status in ('available','pending','rented','sold')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.properties enable row level security;

create policy "agents see own properties"
  on public.properties for all
  using (auth.uid() = agent_id);

create trigger properties_updated_at
  before update on public.properties
  for each row execute procedure public.set_updated_at();

create index on public.properties (agent_id, status);
create index on public.properties (agent_id, city);
create index on public.properties (agent_id, type);

-- ─── CLIENTS / LEADS ─────────────────────────────────────────────────────────
create table public.clients (
  id                uuid primary key default uuid_generate_v4(),
  agent_id          uuid not null references public.profiles(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 100),
  phone             text check (char_length(phone) <= 20),
  email             text check (char_length(email) <= 200),
  budget_min        numeric(12,2) check (budget_min > 0),
  budget_max        numeric(12,2) check (budget_max > 0),
  property_types    text[] not null default '{}',
  preferred_cities  text[] not null default '{}',
  rooms_min         numeric(4,1) check (rooms_min >= 0),
  rooms_max         numeric(4,1) check (rooms_max >= 0),
  notes             text check (char_length(notes) <= 2000),
  status            text not null default 'new'
                    check (status in ('new','contacted','meeting','offer','signed','closed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint budget_order check (
    budget_min is null or budget_max is null or budget_min <= budget_max
  ),
  constraint rooms_order check (
    rooms_min is null or rooms_max is null or rooms_min <= rooms_max
  )
);

alter table public.clients enable row level security;

create policy "agents see own clients"
  on public.clients for all
  using (auth.uid() = agent_id);

create trigger clients_updated_at
  before update on public.clients
  for each row execute procedure public.set_updated_at();

create index on public.clients (agent_id, status);
