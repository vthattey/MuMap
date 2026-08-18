-- MuMap — migration 003: frames, comments, and dot-voting sessions.
-- Run this once in the Supabase SQL editor against an EXISTING project that
-- already has migration 001 (schema.sql) and migration 002 (permissions)
-- applied.

-- ═══════════════════════════════════════════════════════════════════════
-- FRAMES — a tile with kind = 'frame' is a labeled organizing region drawn
-- behind regular tiles, rather than a story/task card. No new table: it
-- reuses the existing tiles table (and therefore its RLS, realtime, and
-- undo/sync plumbing) as-is.
-- ═══════════════════════════════════════════════════════════════════════
alter table tiles add column if not exists kind text not null default 'tile';

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

drop policy if exists "comments are selectable with view access" on comments;
create policy "comments are selectable with view access"
  on comments for select
  using (has_map_access(map_id, 'view'));

drop policy if exists "comments are insertable with edit access" on comments;
create policy "comments are insertable with edit access"
  on comments for insert
  with check (has_map_access(map_id, 'edit') and author_id = auth.uid());

drop policy if exists "comments are deletable by their author" on comments;
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

create unique index if not exists vote_sessions_one_active
  on vote_sessions (map_id) where active;

alter table vote_sessions enable row level security;

drop policy if exists "vote sessions are selectable with view access" on vote_sessions;
create policy "vote sessions are selectable with view access"
  on vote_sessions for select
  using (has_map_access(map_id, 'view'));

drop policy if exists "only the map owner manages vote sessions" on vote_sessions;
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

drop policy if exists "votes are selectable when own or revealed" on votes;
create policy "votes are selectable when own or revealed"
  on votes for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from vote_sessions s
      where s.id = session_id and s.revealed and has_map_access(s.map_id, 'view')
    )
  );

drop policy if exists "votes are insertable within the session budget" on votes;
create policy "votes are insertable within the session budget"
  on votes for insert
  with check (
    user_id = auth.uid()
    and (
      select count(*) from votes v
      where v.session_id = votes.session_id and v.user_id = auth.uid()
    ) < (
      select votes_per_person from vote_sessions s
      where s.id = votes.session_id and s.active
    )
  );

drop policy if exists "votes are deletable by their voter" on votes;
create policy "votes are deletable by their voter"
  on votes for delete
  using (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════
-- REALTIME
-- ═══════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table comments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vote_sessions'
  ) then
    alter publication supabase_realtime add table vote_sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'votes'
  ) then
    alter publication supabase_realtime add table votes;
  end if;
end $$;
