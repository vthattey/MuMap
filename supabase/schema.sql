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
  permission text not null check (permission in ('view', 'comment', 'edit')),
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
-- `need` and a share's `permission` are both one of 'view'|'comment'|'edit',
-- compared as levels (0/1/2) so a share only needs to meet or exceed what's
-- required — this is the same tiering as PERMISSION_LEVELS in
-- src/lib/permissions.js, just re-expressed in SQL since RLS can't call
-- into client code.
-- A map with created_by = NULL is grandfathered as globally accessible;
-- this can only happen on rows migrated from before ownership existed.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function permission_level(p text)
returns integer
language sql
immutable
as $$
  select case p when 'edit' then 2 when 'comment' then 1 else 0 end;
$$;

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
      and permission_level(s.permission) >= permission_level(need)
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
-- REFLECTION_SESSIONS — Retro's private-write/synchronized-reveal mode.
-- Mirrors VOTE_SESSIONS below exactly: an owner-started round with an
-- active/revealed lifecycle. Defined here (before TILES) since tiles.
-- reflection_session_id below references this table. While a session is
-- active and unrevealed, tiles created under it are hidden from everyone
-- but their author — see the TILES section for the content-hiding RLS
-- rule and reflection_progress()/reflection_placeholders() for what
-- non-authors get instead (aggregate counts + position-only shells,
-- never content).
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

-- Only one active session per map at a time, same as vote sessions.
create unique index if not exists reflection_sessions_one_active
  on reflection_sessions (map_id) where active;

alter table reflection_sessions enable row level security;

create policy "reflection sessions are selectable with view access"
  on reflection_sessions for select
  using (has_map_access(map_id, 'view'));

create policy "only the map owner manages reflection sessions"
  on reflection_sessions for all
  using (exists (select 1 from maps m where m.id = map_id and m.created_by = auth.uid()))
  with check (exists (select 1 from maps m where m.id = map_id and m.created_by = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════
-- TILES — id is client-generated (crypto.randomUUID) so optimistic local
-- writes and Supabase rows share the same id from creation.
--
-- author_id / reflection_session_id support the Retro reflection-reveal
-- feature (private write phase, synchronized reveal). author_id is
-- trigger-stamped (never client-trusted, see set_tile_creation_fields
-- below) and populated for every new tile going forward — existing rows
-- stay null, no backfill. reflection_session_id is set by the client only
-- at creation time while a session is active; the same trigger validates
-- it references an active session on the tile's own map, nulling it out
-- otherwise.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists tiles (
  id uuid primary key,
  map_id uuid not null references maps (id) on delete cascade,
  kind text not null default 'tile',
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
  author_id uuid references profiles (id),
  reflection_session_id uuid references reflection_sessions (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists tiles_map_id_idx on tiles (map_id);
create index if not exists tiles_reflection_session_id_idx on tiles (reflection_session_id);

-- Stamp author_id from the inserting user (never client-trusted, since
-- boardSyncUtil.js's upsert path is the single write path for every kind
-- of tile — plain/frame/image/text — and a trigger guarantees correctness
-- with no call site able to forget it or forge someone else's id) and
-- validate reflection_session_id against the map + session state, both at
-- INSERT time only. tiles are effectively immutable on author_id after
-- creation since tileToRow() never re-sends it on later upserts, so
-- ON CONFLICT DO UPDATE never touches the column again.
--
-- The `not exists (select 1 from tiles t2 where t2.id = new.id)` guard
-- below is load-bearing, not defensive: Postgres fires BEFORE INSERT row
-- triggers, including their modifications to NEW, before ON CONFLICT
-- detection happens — so boardSyncUtil.js's upsert() on every ordinary
-- tile edit (drag/retitle/resize) also re-fires this trigger on the
-- ON-CONFLICT-turned-UPDATE path, with NEW carrying the client's full
-- resend of reflection_session_id (tileToRow() round-trips it every
-- write, unlike author_id). Without this guard, re-validating "is the
-- referenced session still active" on every such edit would silently null
-- reflection_session_id the first time anyone touches a tile after its
-- session is revealed (active flips false on reveal) — defeating the
-- column's whole purpose of recording which reflection round a card came
-- from after reveal. Gating on "does a row with this id already exist"
-- correctly distinguishes a genuine INSERT (id is new, tiles' PK is the
-- client-generated crypto.randomUUID set at creation) from an
-- upsert-turned-UPDATE (id already present), so the session-active
-- re-validation only ever runs once, at true creation time.
create or replace function set_tile_creation_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.author_id := auth.uid();
  if new.reflection_session_id is not null
    and not exists (select 1 from tiles t2 where t2.id = new.id)
    and not exists (
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

alter table tiles enable row level security;

-- reflection_tile_visible — whole-row content gate for tiles created
-- while a reflection session is active: a tile outside any session
-- (reflection_session_id null) is always visible under normal
-- has_map_access rules; a tile inside one is visible only to its own
-- author until the session is revealed. security definer, mirroring
-- votes_used_in_session()'s pattern, since this queries
-- reflection_sessions (itself RLS-protected) from inside another table's
-- policy. This governs realtime postgres_changes delivery too, not just
-- a plain select — Supabase Realtime authorizes each change event
-- against this same policy, evaluated against the row's NEW values for
-- INSERT/UPDATE and OLD values for DELETE, so a hidden tile's INSERT is
-- never delivered to a non-author subscriber in the first place.
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

create policy "tiles are selectable with view access"
  on tiles for select
  using (has_map_access(map_id, 'view') and reflection_tile_visible(reflection_session_id, author_id));

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
-- Ghost counts and locked-placeholder shells — RLS can only hide whole
-- rows, not columns on a row it otherwise shows, so neither of these can
-- be a plain select against tiles. Both are security definer functions
-- that never select title/content/tags/points at all (not filtered out —
-- simply absent from the returned shape), callable by anyone with map
-- view access regardless of the content-hiding rule above.
-- ═══════════════════════════════════════════════════════════════════════

-- reflection_progress — ghost card counts per author for the session's
-- floating progress panel. One row per author with at least one card.
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

-- reflection_placeholders — position + author shell (no content columns
-- exist in this return shape at all) for tiles in the session the caller
-- can't yet see the content of, so the client can render a locked
-- placeholder at the tile's real board position. Rows drop out once the
-- session is revealed (they become normal tiles, fetched the normal way)
-- or once the caller is the tile's own author (already visible normally).
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
-- STROKES — freehand drawing. A stroke is written once, in full, when the
-- pointer is released — not per-point — so drawing doesn't flood the
-- realtime channel with an insert per pixel.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists strokes (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references maps (id) on delete cascade,
  author_id uuid not null references profiles (id) on delete cascade,
  color text not null default '#1f2937',
  width double precision not null default 2.5,
  points jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists strokes_map_id_idx on strokes (map_id);

alter table strokes enable row level security;

create policy "strokes are selectable with view access"
  on strokes for select
  using (has_map_access(map_id, 'view'));

create policy "strokes are insertable with comment access"
  on strokes for insert
  with check (has_map_access(map_id, 'comment') and author_id = auth.uid());

create policy "strokes are deletable by their author"
  on strokes for delete
  using (author_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════
-- COMMENTS — a flat (non-threaded) discussion feed per tile.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references maps (id) on delete cascade,
  tile_id uuid not null references tiles (id) on delete cascade,
  author_id uuid not null references profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_map_id_idx on comments (map_id);
create index if not exists comments_tile_id_idx on comments (tile_id);

alter table comments enable row level security;

create policy "comments are selectable with view access"
  on comments for select
  using (has_map_access(map_id, 'view'));

create policy "comments are insertable with comment access"
  on comments for insert
  with check (has_map_access(map_id, 'comment') and author_id = auth.uid());

create policy "comments are deletable by their author"
  on comments for delete
  using (author_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════
-- VOTE_SESSIONS / VOTES — full Mural-style dot-voting: an owner-started
-- round with a fixed per-person budget, votes hidden from everyone but
-- their own author until the owner ends the round and reveals results.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists vote_sessions (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references maps (id) on delete cascade,
  votes_per_person integer not null default 3,
  active boolean not null default true,
  revealed boolean not null default false,
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists vote_sessions_map_id_idx on vote_sessions (map_id);

-- Only one active session per map at a time.
create unique index if not exists vote_sessions_one_active
  on vote_sessions (map_id) where active;

alter table vote_sessions enable row level security;

create policy "vote sessions are selectable with view access"
  on vote_sessions for select
  using (has_map_access(map_id, 'view'));

create policy "only the map owner manages vote sessions"
  on vote_sessions for all
  using (exists (select 1 from maps m where m.id = map_id and m.created_by = auth.uid()))
  with check (exists (select 1 from maps m where m.id = map_id and m.created_by = auth.uid()));

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references maps (id) on delete cascade,
  session_id uuid not null references vote_sessions (id) on delete cascade,
  tile_id uuid not null references tiles (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists votes_map_id_idx on votes (map_id);
create index if not exists votes_session_id_idx on votes (session_id);
create index if not exists votes_tile_id_idx on votes (tile_id);

alter table votes enable row level security;

-- Hidden-until-reveal: everyone always sees their own votes; everyone sees
-- every vote once the session is revealed; nobody sees anyone else's votes
-- before that.
create policy "votes are selectable when own or revealed"
  on votes for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from vote_sessions s
      where s.id = session_id and s.revealed and has_map_access(s.map_id, 'view')
    )
  );

-- Budget enforcement — a security-definer helper, not a raw subquery on
-- votes directly in the policy: a WITH CHECK clause that self-references
-- its own table triggers Postgres error 42P17 ("infinite recursion
-- detected in policy for relation votes"), since evaluating the subquery
-- would itself need to re-run this table's RLS. Same pattern as
-- has_map_access() bypassing RLS for maps/map_shares above.
create or replace function votes_used_in_session(target_session_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer from votes
  where session_id = target_session_id and user_id = auth.uid();
$$;

grant execute on function votes_used_in_session(uuid) to authenticated;

create policy "votes are insertable within the session budget"
  on votes for insert
  with check (
    user_id = auth.uid()
    and has_map_access(map_id, 'comment')
    and votes_used_in_session(session_id) < (
      select votes_per_person from vote_sessions s
      where s.id = votes.session_id and s.active
    )
  );

create policy "votes are deletable by their voter"
  on votes for delete
  using (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════
-- IMAGE TILES — a public-read storage bucket for uploaded tile images/GIFs.
-- Uploads write under a per-user folder (enforced by the insert policy
-- below) so one user can't overwrite another's files; there's no per-map
-- scoping since an image can outlive being removed from one board and
-- storage cleanup on tile delete is intentionally out of scope for v1.
-- ═══════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('tile-images', 'tile-images', true)
on conflict (id) do nothing;

create policy "tile images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'tile-images');

create policy "authenticated users can upload tile images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'tile-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users can delete their own uploaded tile images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'tile-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ═══════════════════════════════════════════════════════════════════════
-- REALTIME — stream row changes for live sync (Presence/Broadcast need no
-- publication setup, only Postgres Changes does).
--
-- Every postgres_changes listener below filters on a non-primary-key
-- column (map_id, user_id) so it can scope events to one map/user. With
-- Postgres's default REPLICA IDENTITY, a DELETE's "old" record only
-- carries the primary key — the filter column is missing, the filter
-- can't be evaluated, and the event is silently dropped for everyone.
-- REPLICA IDENTITY FULL puts the whole old row on every UPDATE/DELETE so
-- those filters actually work.
-- ═══════════════════════════════════════════════════════════════════════
alter table tiles replica identity full;
alter table links replica identity full;
alter table map_shares replica identity full;
alter table comments replica identity full;
alter table vote_sessions replica identity full;
alter table votes replica identity full;
alter table strokes replica identity full;
alter table reflection_sessions replica identity full;

alter publication supabase_realtime add table tiles;
alter publication supabase_realtime add table links;
alter publication supabase_realtime add table map_shares;
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table vote_sessions;
alter publication supabase_realtime add table votes;
alter publication supabase_realtime add table strokes;
alter publication supabase_realtime add table reflection_sessions;
