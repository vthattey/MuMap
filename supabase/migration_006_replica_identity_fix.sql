-- MuMap — migration 006: fix silently-dropped realtime DELETE events.
--
-- Every postgres_changes listener in useBoardSync.js filters on a
-- non-primary-key column (map_id, user_id) so it can scope events to one
-- map/user. With Postgres's default REPLICA IDENTITY, a DELETE's "old"
-- record only carries the primary key — the filter column is missing, the
-- server-side filter can't be evaluated, and the event is silently dropped
-- for every subscriber. This affected deletes on tiles, links, map_shares,
-- comments, vote_sessions, votes, and strokes: a delete would apply fine
-- for whoever performed it (their own optimistic local state already
-- dropped the row, or — for comments/votes/strokes, which have no local
-- optimistic path — it would *never* visually go away without a manual
-- reload) and would never propagate live to any other collaborator at all.
--
-- REPLICA IDENTITY FULL puts the entire old row image on every
-- UPDATE/DELETE so those filters actually work. Safe, idempotent, no data
-- change — just changes what Postgres includes in the replication stream.
alter table tiles replica identity full;
alter table links replica identity full;
alter table map_shares replica identity full;
alter table comments replica identity full;
alter table vote_sessions replica identity full;
alter table votes replica identity full;
alter table strokes replica identity full;
