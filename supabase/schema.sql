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
-- MAPS — private by default: visible/editable only to the owner, plus
-- anyone the owner has explicitly granted access to via map_shares below.
-- A map with created_by = NULL is treated as globally accessible; this
-- only happens for rows inserted before ownership existed (see
-- has_map_access) and should never occur for new inserts, since the
-- column defaults to the creating user.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists maps (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled map',
  created_by uuid not null default auth.uid() references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table maps enable row level security;

-- ═══════════════════════════════════════════════════════════════════════
-- MAP_SHARES — explicit per-user grants, set by a map's owner. Created
-- before the maps policies below since has_map_access() depends on it.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists map_shares (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references maps (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  permission text not null check (permission in ('view', 'edit')),
  created_at timestamptz not null default now(),
  unique (map_id, user_id)
);

create index if not exists map_shares_map_id_idx on map_shares (map_id);
create index if not exists map_shares_user_id_idx on map_shares (user_id);

alter table map_shares enable row level security;

create policy "shares visible to the sharee or the map owner"
  on map_shares for select
  using (
    user_id = auth.uid()
    or exists (select 1 from maps m where m.id = map_id and m.created_by = auth.uid())
  );

create policy "only the map owner manages shares"
  on map_shares for all
  using (exists (select 1 from maps m where m.id = map_id and m.created_by = auth.uid()))
  with check (exists (select 1 from maps m where m.id = map_id and m.created_by = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════
-- has_map_access — single source of truth for the RLS policies below.
-- A map with created_by = NULL is grandfathered as globally accessible;
-- this can only happen on rows migrated from before ownership existed.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function has_map_access(target_map_id uuid, need text default 'view')
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from maps m
    where m.id = target_map_id
      and (m.created_by = auth.uid() or m.created_by is null)
  ) or exists (
    select 1 from map_shares s
    where s.map_id = target_map_id
      and s.user_id = auth.uid()
      and (need = 'view' or s.permission = 'edit')
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- find_user_id_by_email — lets the client resolve "share with this email"
-- without being able to query auth.users directly.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function find_user_id_by_email(lookup_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from auth.users where email = lookup_email limit 1;
$$;

grant execute on function has_map_access(uuid, text) to authenticated;
grant execute on function find_user_id_by_email(text) to authenticated;

create policy "maps are selectable with view access"
  on maps for select
  using (has_map_access(id, 'view'));

create policy "maps are insertable by their creator"
  on maps for insert
  with check (created_by = auth.uid());

create policy "maps are updatable by their owner"
  on maps for update
  using (created_by = auth.uid() or created_by is null);

create policy "maps are deletable by their owner"
  on maps for delete
  using (created_by = auth.uid() or created_by is null);

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

create policy "tiles are selectable with view access"
  on tiles for select
  using (has_map_access(map_id, 'view'));

create policy "tiles are writable with edit access"
  on tiles for insert
  with check (has_map_access(map_id, 'edit'));

create policy "tiles are updatable with edit access"
  on tiles for update
  using (has_map_access(map_id, 'edit'));

create policy "tiles are deletable with edit access"
  on tiles for delete
  using (has_map_access(map_id, 'edit'));

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

create policy "links are selectable with view access"
  on links for select
  using (has_map_access(map_id, 'view'));

create policy "links are writable with edit access"
  on links for insert
  with check (has_map_access(map_id, 'edit'));

create policy "links are updatable with edit access"
  on links for update
  using (has_map_access(map_id, 'edit'));

create policy "links are deletable with edit access"
  on links for delete
  using (has_map_access(map_id, 'edit'));

-- ═══════════════════════════════════════════════════════════════════════
-- REALTIME — stream row changes for live sync (Presence/Broadcast need no
-- publication setup, only Postgres Changes does).
-- ═══════════════════════════════════════════════════════════════════════
alter publication supabase_realtime add table tiles;
alter publication supabase_realtime add table links;
alter publication supabase_realtime add table map_shares;
