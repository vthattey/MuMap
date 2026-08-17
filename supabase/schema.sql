-- MuMap — Supabase schema for multi-user, multi-map, real-time collaboration.
-- Run this once in the Supabase SQL editor for a fresh project.

-- ═══════════════════════════════════════════════════════════════════════
-- PROFILES — public-facing user info (display name, cursor color).
-- Populated automatically when someone signs up via a trigger below.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Anonymous',
  color text not null default '#4f46e5',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are readable by any authenticated user"
  on profiles for select
  using (auth.uid() is not null);

create policy "users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- Fixed palette so each new user gets a distinct, readable cursor color.
create or replace function pick_profile_color()
returns text
language sql
as $$
  select (array[
    '#4f46e5', '#0891b2', '#c2410c', '#15803d',
    '#a21caf', '#b45309', '#be123c', '#0369a1'
  ])[floor(random() * 8 + 1)];
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    pick_profile_color()
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════
-- MAPS — shared workspace: any authenticated user can see/create/edit/delete.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists maps (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled map',
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table maps enable row level security;

create policy "maps are fully accessible to authenticated users"
  on maps for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ═══════════════════════════════════════════════════════════════════════
-- TILES — id is client-generated (crypto.randomUUID) so optimistic local
-- writes and Supabase rows share the same id from creation.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists tiles (
  id uuid primary key,
  map_id uuid not null references maps (id) on delete cascade,
  type text not null default 'user-story',
  shape text not null default 'rectangle',
  title text not null default '',
  content text not null default '',
  color text not null default '#f5d76e',
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null default 190,
  h double precision not null default 150,
  tags jsonb not null default '[]',
  status text not null default 'none',
  points double precision,
  updated_at timestamptz not null default now()
);

create index if not exists tiles_map_id_idx on tiles (map_id);

alter table tiles enable row level security;

create policy "tiles are fully accessible to authenticated users"
  on tiles for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ═══════════════════════════════════════════════════════════════════════
-- LINKS
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists links (
  id uuid primary key,
  map_id uuid not null references maps (id) on delete cascade,
  from_tile uuid not null references tiles (id) on delete cascade,
  to_tile uuid not null references tiles (id) on delete cascade,
  label text not null default '',
  directed boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists links_map_id_idx on links (map_id);

alter table links enable row level security;

create policy "links are fully accessible to authenticated users"
  on links for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ═══════════════════════════════════════════════════════════════════════
-- REALTIME — stream row changes for live sync (Presence/Broadcast need no
-- publication setup, only Postgres Changes does).
-- ═══════════════════════════════════════════════════════════════════════
alter publication supabase_realtime add table tiles;
alter publication supabase_realtime add table links;
