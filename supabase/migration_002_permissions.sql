-- MuMap — migration 002: per-map permissions (owner + invited view/edit access).
-- Run this once in the Supabase SQL editor against an EXISTING project that
-- already has migration 001 (the original schema.sql) applied.
--
-- Existing maps all have created_by = NULL (ownership was never tracked
-- before this migration). Those rows are intentionally grandfathered as
-- globally viewable/editable — see has_map_access() below — so nobody's
-- existing data becomes inaccessible. Only maps created from now on get a
-- real owner and therefore real access control.

-- ═══════════════════════════════════════════════════════════════════════
-- New maps get an owner automatically.
-- ═══════════════════════════════════════════════════════════════════════
alter table maps alter column created_by set default auth.uid();

-- ═══════════════════════════════════════════════════════════════════════
-- MAP_SHARES — explicit per-user grants, set by a map's owner.
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

drop policy if exists "shares visible to the sharee or the map owner" on map_shares;
create policy "shares visible to the sharee or the map owner"
  on map_shares for select
  using (
    user_id = auth.uid()
    or exists (select 1 from maps m where m.id = map_id and m.created_by = auth.uid())
  );

drop policy if exists "only the map owner manages shares" on map_shares;
create policy "only the map owner manages shares"
  on map_shares for all
  using (exists (select 1 from maps m where m.id = map_id and m.created_by = auth.uid()))
  with check (exists (select 1 from maps m where m.id = map_id and m.created_by = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════
-- has_map_access — single source of truth for the RLS policies below.
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

-- ═══════════════════════════════════════════════════════════════════════
-- Replace the old "any authenticated user" blanket policies. Old ones are
-- dropped first — Postgres combines multiple permissive policies with OR,
-- so leaving the old one in place would defeat the new restrictions.
-- ═══════════════════════════════════════════════════════════════════════
drop policy if exists "maps are fully accessible to authenticated users" on maps;
drop policy if exists "maps are selectable with view access" on maps;
drop policy if exists "maps are insertable by their creator" on maps;
drop policy if exists "maps are updatable by their owner" on maps;
drop policy if exists "maps are deletable by their owner" on maps;

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

drop policy if exists "tiles are fully accessible to authenticated users" on tiles;
drop policy if exists "tiles are selectable with view access" on tiles;
drop policy if exists "tiles are writable with edit access" on tiles;
drop policy if exists "tiles are updatable with edit access" on tiles;
drop policy if exists "tiles are deletable with edit access" on tiles;

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

drop policy if exists "links are fully accessible to authenticated users" on links;
drop policy if exists "links are selectable with view access" on links;
drop policy if exists "links are writable with edit access" on links;
drop policy if exists "links are updatable with edit access" on links;
drop policy if exists "links are deletable with edit access" on links;

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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'map_shares'
  ) then
    alter publication supabase_realtime add table map_shares;
  end if;
end $$;
