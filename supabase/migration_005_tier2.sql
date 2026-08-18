-- MuMap — migration 005: Tier 2 (templates, rich text, comment-only
-- permission, image tiles, freehand drawing). Run this once in the
-- Supabase SQL editor against a project that already has migrations
-- 001–004 applied.
--
-- Templates and rich text are pure client-side changes — nothing here for
-- either. This file grows as the remaining Tier-2 schema work lands.

-- ═══════════════════════════════════════════════════════════════════════
-- COMMENT-ONLY PERMISSION TIER — widen map_shares.permission to
-- 'view'|'comment'|'edit' and make has_map_access() compare levels instead
-- of the old binary "need=view or permission=edit" check.
-- ═══════════════════════════════════════════════════════════════════════
alter table map_shares drop constraint if exists map_shares_permission_check;
alter table map_shares add constraint map_shares_permission_check
  check (permission in ('view', 'comment', 'edit'));

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

drop policy if exists "comments are insertable with edit access" on comments;
drop policy if exists "comments are insertable with comment access" on comments;
create policy "comments are insertable with comment access"
  on comments for insert
  with check (has_map_access(map_id, 'comment') and author_id = auth.uid());

-- Also closes a gap from migration 003/004: the votes-insert policy never
-- checked map access at all, only the per-person budget — meaning a
-- crafted request against a real session_id/tile_id from *any*
-- authenticated user (not just people with access to that map) would have
-- been accepted as long as they were under budget.
drop policy if exists "votes are insertable within the session budget" on votes;
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

-- ═══════════════════════════════════════════════════════════════════════
-- IMAGE TILES — a public-read storage bucket for uploaded tile images/GIFs.
-- Uploads write under a per-user folder (enforced by the insert policy
-- below); storage cleanup on tile delete is intentionally out of scope.
-- ═══════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('tile-images', 'tile-images', true)
on conflict (id) do nothing;

drop policy if exists "tile images are publicly readable" on storage.objects;
create policy "tile images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'tile-images');

drop policy if exists "authenticated users can upload tile images" on storage.objects;
create policy "authenticated users can upload tile images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'tile-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users can delete their own uploaded tile images" on storage.objects;
create policy "users can delete their own uploaded tile images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'tile-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ═══════════════════════════════════════════════════════════════════════
-- STROKES — freehand drawing. Written once per completed stroke, not per
-- point, so drawing doesn't flood the realtime channel.
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

drop policy if exists "strokes are selectable with view access" on strokes;
create policy "strokes are selectable with view access"
  on strokes for select
  using (has_map_access(map_id, 'view'));

drop policy if exists "strokes are insertable with comment access" on strokes;
create policy "strokes are insertable with comment access"
  on strokes for insert
  with check (has_map_access(map_id, 'comment') and author_id = auth.uid());

drop policy if exists "strokes are deletable by their author" on strokes;
create policy "strokes are deletable by their author"
  on strokes for delete
  using (author_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'strokes'
  ) then
    alter publication supabase_realtime add table strokes;
  end if;
end $$;
