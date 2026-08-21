-- MuMap — migration 008: fix reflection_session_id being wiped on every
-- post-reveal tile edit. Run this once in the Supabase SQL editor against a
-- project that already has migration_007_reflection_sessions.sql applied.
--
-- Bug (found in feature review of retro-reflection-reveal, see
-- .claude/features/retro-reflection-reveal/review.md finding #1):
-- set_tile_creation_fields() is a `before insert` trigger, but Postgres
-- fires BEFORE INSERT row triggers — and applies their modifications to
-- NEW — before ON CONFLICT detection happens. boardSyncUtil.js's upsert()
-- is the single write path for every tile edit (drag/retitle/resize), not
-- just creation, and tileToRow() round-trips reflection_session_id on
-- every write. So the trigger's "is the referenced session still active"
-- re-validation was re-running on every ordinary edit of an already-
-- created tile, not just at genuine creation time. The first edit to any
-- tile after its reflection session is revealed (reveal sets
-- active = false) would silently null reflection_session_id on that row —
-- defeating the column's purpose of recording which reflection round a
-- card came from, once a later feature wants to group by it. No visible
-- symptom (a null reflection_session_id is still always-visible), which is
-- why this wasn't caught by QA's pass-level checks.
--
-- Fix: gate the session-active re-validation on "no tiles row with this id
-- exists yet" so it only ever runs at true INSERT time, never on an
-- upsert's ON-CONFLICT-turned-UPDATE path. author_id's stamp is unaffected
-- by this bug (and needs no fix) since tileToRow() never re-sends that
-- column at all, so it was never part of any upsert's DO UPDATE SET
-- clause regardless of what the trigger set on NEW.

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
