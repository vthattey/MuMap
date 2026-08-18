-- MuMap — migration 004: fix infinite-recursion error on vote casting.
-- Run this once in the Supabase SQL editor against a project that already
-- has migration_003_frames_comments_voting.sql applied.
--
-- The original "votes are insertable within the session budget" policy on
-- `votes` counted the caller's existing votes with a subquery directly on
-- `votes` — but a WITH CHECK clause that queries its own table triggers
-- Postgres error 42P17 ("infinite recursion detected in policy for
-- relation votes"), since evaluating that subquery would itself need to
-- re-run this table's row-level security. This replaces the raw subquery
-- with a security-definer helper function (the same pattern has_map_access()
-- already uses for maps/map_shares), which bypasses RLS internally and
-- avoids the self-reference entirely.

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

drop policy if exists "votes are insertable within the session budget" on votes;
create policy "votes are insertable within the session budget"
  on votes for insert
  with check (
    user_id = auth.uid()
    and votes_used_in_session(session_id) < (
      select votes_per_person from vote_sessions s
      where s.id = votes.session_id and s.active
    )
  );
