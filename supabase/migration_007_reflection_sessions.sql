-- MuMap — migration 007: Retro reflection-reveal (private write phase,
-- synchronized reveal). Run this once in the Supabase SQL editor against a
-- project that already has migrations 001–006 applied.
--
-- Adds:
--   - reflection_sessions (mirrors vote_sessions: owner-started
--     active/revealed round, one active session per map at a time).
--   - tiles.author_id — trigger-stamped from auth.uid() at insert, never
--     client-trusted, populated for every new tile going forward. No
--     backfill: existing tiles stay author_id = null.
--   - tiles.reflection_session_id — set by the client at creation time
--     only while a session is active; validated/nulled server-side by the
--     same trigger if it doesn't reference an active session on the
--     tile's own map.
--   - RLS on tiles.select: a tile inside a reflection session is visible
--     only to its author until the session is revealed (security definer
--     helper, mirrors votes_used_in_session()'s recursion-safety pattern).
--     This also governs realtime postgres_changes delivery, not just a
--     plain select.
--   - reflection_progress() / reflection_placeholders() — security
--     definer functions that expose aggregate ghost counts and
--     position/author-only shells (no content columns in the return shape
--     at all) despite the row-level hiding above, since RLS can only hide
--     whole rows, not columns on a row it otherwise shows.
--   - reflection_sessions added to the realtime publication with
--     replica identity full (same fix as migration_006, needed from day
--     one since this table's realtime listener filters on map_id, a
--     non-PK column).

-- ═══════════════════════════════════════════════════════════════════════
-- REFLECTION_SESSIONS
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists reflection_sessions (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references maps (id) on delete cascade,
  active boolean not null default true,
  revealed boolean not null default false,
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists reflection_sessions_map_id_idx on reflection_sessions (map_id);

create unique index if not exists reflection_sessions_one_active
  on reflection_sessions (map_id) where active;

alter table reflection_sessions enable row level security;

drop policy if exists "reflection sessions are selectable with view access" on reflection_sessions;
create policy "reflection sessions are selectable with view access"
  on reflection_sessions for select
  using (has_map_access(map_id, 'view'));

drop policy if exists "only the map owner manages reflection sessions" on reflection_sessions;
create policy "only the map owner manages reflection sessions"
  on reflection_sessions for all
  using (exists (select 1 from maps m where m.id = map_id and m.created_by = auth.uid()))
  with check (exists (select 1 from maps m where m.id = map_id and m.created_by = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════
-- TILES — new columns
-- ═══════════════════════════════════════════════════════════════════════
alter table tiles add column if not exists author_id uuid references profiles (id);
alter table tiles add column if not exists reflection_session_id uuid references reflection_sessions (id) on delete set null;

create index if not exists tiles_reflection_session_id_idx on tiles (reflection_session_id);

create or replace function set_tile_creation_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.author_id := auth.uid();
  if new.reflection_session_id is not null and not exists (
    select 1 from reflection_sessions s
    where s.id = new.reflection_session_id
      and s.map_id = new.map_id
      and s.active
  ) then
    new.reflection_session_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tiles_set_creation_fields on tiles;
create trigger tiles_set_creation_fields
  before insert on tiles
  for each row execute procedure set_tile_creation_fields();

-- ═══════════════════════════════════════════════════════════════════════
-- TILES — content-hiding SELECT policy
-- ═══════════════════════════════════════════════════════════════════════
create or replace function reflection_tile_visible(target_session_id uuid, tile_author_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select target_session_id is null
    or tile_author_id = auth.uid()
    or exists (
      select 1 from reflection_sessions s
      where s.id = target_session_id and s.revealed
    );
$$;

grant execute on function reflection_tile_visible(uuid, uuid) to authenticated;

drop policy if exists "tiles are selectable with view access" on tiles;
create policy "tiles are selectable with view access"
  on tiles for select
  using (has_map_access(map_id, 'view') and reflection_tile_visible(reflection_session_id, author_id));

-- ═══════════════════════════════════════════════════════════════════════
-- Ghost counts and locked-placeholder shells
-- ═══════════════════════════════════════════════════════════════════════
create or replace function reflection_progress(p_session_id uuid)
returns table (author_id uuid, card_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select t.author_id, count(*)::bigint as card_count
  from tiles t
  join reflection_sessions s on s.id = t.reflection_session_id
  where t.reflection_session_id = p_session_id
    and has_map_access(s.map_id, 'view')
    and t.author_id is not null
  group by t.author_id;
$$;

grant execute on function reflection_progress(uuid) to authenticated;

create or replace function reflection_placeholders(p_session_id uuid)
returns table (id uuid, author_id uuid, x double precision, y double precision, w double precision, h double precision)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.author_id, t.x, t.y, t.w, t.h
  from tiles t
  join reflection_sessions s on s.id = t.reflection_session_id
  where t.reflection_session_id = p_session_id
    and has_map_access(s.map_id, 'view')
    and not s.revealed
    and t.author_id is distinct from auth.uid();
$$;

grant execute on function reflection_placeholders(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- REALTIME
-- ═══════════════════════════════════════════════════════════════════════
alter table reflection_sessions replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reflection_sessions'
  ) then
    alter publication supabase_realtime add table reflection_sessions;
  end if;
end $$;
