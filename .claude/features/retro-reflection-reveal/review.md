# Review -- retro-reflection-reveal

## Verdict: NEEDS REWORK

The core security guarantee -- that hidden-tile content never reaches a
non-author before reveal -- holds. I traced it independently through the
actual RLS policy, the reflection_tile_visible()/reflection_progress()/
reflection_placeholders() function bodies, the tiles UPDATE/INSERT
trigger, useBoardSync.js's realtime handlers, and LockedPlaceholderTile.jsx
and the reveal-flip overlay in MuMap.jsx, not just the reports' prose, and
it is sound: reflection_placeholders()'s return shape has no content
columns to leak "by construction," the base tiles SELECT policy is a
genuine whole-row gate, and the reveal-flip overlay only ever renders the
lock face (never a hidden "back" face with real content, unlike the mock)
-- the real tile shows through from underneath only once it has
legitimately arrived via refetchRevealedTiles post-reveal. QA's execute
pass independently verified the highest-risk item (realtime INSERT/UPDATE
delivery) live against two genuinely concurrent Node clients on the
deployed project, which is exactly the right level of rigor for this
feature. I have no residual doubt about the read-side content-hiding
guarantee specifically.

What blocks COMPLETE is one real, code-provable data-integrity bug found by
tracing the trigger's interaction with Postgres upsert semantics -- not
caught by any dev agent or by QA, and not a hypothetical.

---

## Findings (most severe first)

### 1. [backend-dev] tiles.reflection_session_id is silently wiped the first time a revealed tile is edited

File: supabase/schema.sql / supabase/migration_007_reflection_sessions.sql,
function set_tile_creation_fields().

The trigger is "before insert" and runs on every attempted insert,
including an upsert(...)'s ON-CONFLICT-turned-UPDATE (Postgres fires
BEFORE INSERT row triggers before conflict detection, and their
modifications to NEW are what "excluded" reflects in the DO UPDATE SET
clause). Its validation is:

    if new.reflection_session_id is not null and not exists (
      select 1 from reflection_sessions s
      where s.id = new.reflection_session_id and s.map_id = new.map_id and s.active
    ) then
      new.reflection_session_id := null;
    end if;

boardSyncUtil.js's tileToRow() round-trips reflection_session_id on
EVERY upsert, unconditionally (unlike author_id, which is correctly
omitted and therefore immune to this). endReflectionSession() sets
active: false on reveal (reveal and end are the same action -- confirmed
in interface.md). So: the moment any tile that belonged to a
now-revealed session is edited -- dragged, resized, retitled, by anyone,
including its own author, this being completely normal post-reveal usage
per the plan's own "tiles behave exactly like any normal tile" rule -- the
trigger re-validates against the session, finds active = false, and
permanently nulls reflection_session_id on that row.

This doesn't break the current feature's own visibility rule (a null
reflection_session_id is still always-visible via reflection_tile_visible's
first branch), so it produces no visible symptom, and QA's GP-8 case (which
did exercise exactly this action -- Jordan editing Priya's revealed tile)
correctly reported PASS because it only checked that content stayed
visible/persisted, not that the session-lineage column survived. But it
directly undercuts the plan's own stated reason for keeping
reflection_session_id on the row at all: "After reveal, tiles behave
exactly like any normal tile... deliberate: it's what makes a later
'grouping' feature... possible to build on top." A grouping feature that
wants to cluster "all cards from Session X" would find the FK already gone
for almost every card, likely within seconds of a real retro's reveal
(dragging cards to discuss them is the norm, not the exception).

Fix direction: gate the re-validation so it only fires for a
genuinely-new row, e.g. "and not exists (select 1 from tiles t2 where
t2.id = new.id)" added to the outer condition, so an ON-CONFLICT-turned-
UPDATE never re-derives reflection_session_id at all (relying on
tileToRow's round-trip only to keep it stable, not to re-validate it
every write). Route to backend-dev.

### 2. [qa-engineer] No test case attempts a blind write to a hidden tile

qa/test-plan.md's SEC category (SEC-1 through SEC-10) is thorough on
reads -- SELECT, realtime INSERT/UPDATE/DELETE, and both RPCs -- but
nothing attempts supabase.from('tiles').update(...).eq('id', <hidden-id>)
from a non-author. This id is not secret -- reflection_placeholders()
deliberately returns it to every non-author so the placeholder can be drawn
at the right position -- so a non-author genuinely has the id needed to
target such a write. tiles' UPDATE policy (using (has_map_access(map_id,
'edit'))) has no reflection_tile_visible clause of its own, unlike the
SELECT policy.

I believe (moderate-to-high confidence, based on standard, well-documented
PostgreSQL RLS behavior: UPDATE/DELETE target-row identification is gated
by the table's SELECT-policy visibility in addition to the command's own
policy) that this blind write would silently affect zero rows -- but this
is inference from general Postgres semantics, not something verified
against this schema, and I'd rather flag it than assume it toward
COMPLETE given the stakes here. Recommend qa-engineer add one case (a
non-author attempting update/blind-write against a hidden tile's known
id, both directly and via a race right after obtaining the id from
reflection_placeholders()) to close this out with actual evidence rather
than inference. Non-blocking on its own, but pair it with finding #1's fix
so both land in the same pass.

---

## Everything else checked and found sound

- Plan fidelity: scope matches plan.md including the Addendum
  (author_id, per-frame "+ Add a card", floating ghost panel) -- no
  missing scope, no unrequested scope beyond what the addendum/mock
  approved.
- Contract integrity: ui-dev and backend-dev genuinely converged.
  ui-dev's report is explicit that its first draft interface.md
  (written before backend-dev's landed) was discarded and the real
  contract's materially different design (RPC-sourced placeholders, polling,
  camelCase fields, trigger-stamped author_id) was rebuilt against -- I
  confirmed this in the actual code (boardSyncUtil.js's rowToTile/
  tileToRow, useBoardSync.js's field names, MuMap.jsx's consumption)
  and it matches interface.md field-for-field. No stub left wired to the
  old draft.
- The column-scoping fix: verified directly -- reflection_placeholders()'s
  returns table shape has no content columns by construction, the base
  tiles SELECT policy is unconditionally whole-row (no owner carve-out --
  confirmed by reading the SQL, matching QA's OWN-2 live-verified result),
  and LockedPlaceholderTile.jsx only ever receives {x,y,w,h,authorName,
  authorColor} -- never a real tile object.
  - Nuance for the record (matches qa/results.md's finding, and I traced
    it independently in useBoardSync.js): DELETE events are delivered
    to non-authors, but every DELETE handler in this file, for every table,
    reads only .id from the payload (confirmed by reading all six DELETE
    branches in the realtime channel setup), so the {id}-only DELETE
    stub is genuinely inert. interface.md's blanket "never delivered at
    all" phrasing is technically imprecise for DELETE but the actual
    security property (zero content/position/author exposure) holds, and
    QA already flagged this as a doc nit, not a defect -- I agree with that
    call.
- Polling design: confirmed deliberate (both interface.md and
  backend-dev-report.md explain why "refresh on tiles-channel-firing"
  doesn't work -- a hidden INSERT never fires for non-authors, so there's
  no event to hook), not an oversight.
- The pre-existing template-materialization bug: confirmed unrelated --
  git diff touches only useBoardSync.js, boardSyncUtil.js, MuMap.jsx,
  the new LockedPlaceholderTile.jsx, and additive-only schema/migration
  changes; nothing in the diff touches materializeTemplate or the LOAD
  dispatch path. Both ui-dev and qa-engineer independently confirmed
  session-created tiles persist correctly, which is the actually-in-scope
  question. Correctly not routed back on this feature.
- The 9 unexecuted QA cases (GP-5, OWN-3, EDGE-2, EDGE-8, REG-1, REG-2,
  REG-4, REG-5, REG-7): reviewed each -- none touch the security boundary,
  and the diff's small footprint makes REG-1/2/4/5/7 (connectors, frames,
  legacy-tile drag, Vote Session coexistence) low-risk by inspection (none
  of those code paths appear in the diff at all). EDGE-2 (mid-edit-during-
  reveal race) and EDGE-8 (save-failure UX) are the two I'd most want
  covered in a follow-up pass, but neither is a shipping blocker on its
  own -- EDGE-2's worst case is subsumed by finding #1 above (a stale
  reflection_session_id getting nulled on the next save), not a new
  failure mode, and EDGE-8 explicitly inherits whatever the pre-existing
  (unrelated) tile-creation failure UX already is.
- Migration/schema consistency: migration_007_reflection_sessions.sql
  and the corresponding schema.sql sections are logically identical
  (diffed by hand), both idempotent, and the migration is correctly flagged
  as not-yet-run -- consistent with this project's established convention
  and explicitly left for the user, not silently forgotten.

## Routing summary

1. backend-dev -- fix the reflection_session_id-nulling trigger bug
   (finding #1). This is the only change required before this can ship.
2. qa-engineer -- add a blind-write-to-hidden-tile test case (finding
   #2) and, time permitting, EDGE-2/EDGE-8. Not blocking on its own, but
   worth bundling with the backend-dev fix's next QA pass.

---

## Re-review -- 2026-08-19 -- Verdict: COMPLETE

Re-verifying both items from the NEEDS REWORK pass above, against the current
code directly, not the reports prose.

### Finding #1 (trigger bug) -- confirmed fixed

Read the live set_tile_creation_fields() in supabase/schema.sql (lines
~276-295) and the standalone supabase/migration_008_fix_tile_creation_trigger.sql.
Both bodies are identical and both now carry the guard:

    if new.reflection_session_id is not null
      and not exists (select 1 from tiles t2 where t2.id = new.id)
      and not exists (
        select 1 from reflection_sessions s
        where s.id = new.reflection_session_id and s.map_id = new.map_id and s.active
      ) then
      new.reflection_session_id := null;
    end if;

Hand-traced the exact scenario independently rather than trusting the
backend-dev report trace as-is:
1. Create tile in active session S (upsert with a brand-new
   client-generated id, reflection_session_id = S.id in the payload).
   Trigger fires as a genuine "before insert": "not exists (select 1 from
   tiles t2 where t2.id = new.id)" is TRUE -- no row with this id exists
   yet -- so validation proceeds, S is active, validation passes, and
   reflection_session_id stays S.id.
2. Reveal session S -- useBoardSync.js function endReflectionSession
   issues a single .update({ active: false, revealed: true, ended_at:
   ... }).eq("id", ...) call, confirmed at src/hooks/useBoardSync.js
   lines 385-388. This is one atomic single-row UPDATE, so there is no
   intermediate state where active is already false but revealed is
   still false, or the reverse -- closing a possible ordering gap worth
   ruling out before trusting the interface.md framing that reveal and
   end are the same action.
3. Edit the tile (drag/retitle/resize, by anyone). boardSyncUtil.js
   function tileToRow still round-trips reflection_session_id = S.id
   unconditionally, confirmed at src/lib/boardSyncUtil.js line 53, and
   the upsert resends the same id, so this hits Postgres ON-CONFLICT-
   turned-UPDATE path. The "before insert" trigger still fires on this
   path -- this is documented Postgres behavior: BEFORE INSERT row
   triggers, including their writes to NEW, run before ON CONFLICT
   detection, which is why the bug existed in the first place. This time
   "not exists (select 1 from tiles t2 where t2.id = new.id)" is FALSE,
   because the row committed in step 1 still exists, so the outer
   and-chain short-circuits before ever re-checking s.active, and
   reflection_session_id is left untouched at S.id.

reflection_session_id survives. The guard is correctly placed -- it gates
the whole validation branch, not just the final null-out -- and it closes
the exact gap originally described in the first pass of this review: a
stale/inactive session no longer gets re-checked against a row that
already exists, which is precisely the distinction genuine-INSERT vs.
upsert-turned-UPDATE needed.

On the limits of this verification, per the task instruction: this is a
hand-trace against documented Postgres BEFORE INSERT / ON CONFLICT firing
order, not an execution against a real Postgres instance -- no local
Postgres is available in this environment, the same constraint the whole
feature has had throughout. This conclusion was derived independently,
working from the raw SQL and the documented trigger-firing semantics,
rather than accepting the backend-dev report at face value. There is no
plausible alternate firing-order interpretation that produces a different
result here -- the rule that BEFORE INSERT fires before ON CONFLICT, and
that its writes to NEW become what "excluded" reflects in a DO UPDATE SET
clause, is unambiguous, well-documented Postgres semantics, not a
version-dependent edge case -- but flagging the boundary of what
"verified" means here rather than overclaiming certainty.

One adjacent thing checked and found NOT to be a problem: the trigger
validates the active flag on the session row, while
reflection_tile_visible(), the actual read-side visibility gate, checks
revealed instead. These are different columns, but since
endReflectionSession always flips both in the same atomic UPDATE, there
is no window where a tile reflection_session_id could be nulled by a
stale active check while revealed is still false -- which would have been
a worse bug: visibility gate still hiding content, but lineage already
lost. Not an issue in practice, but worth recording that it was checked
rather than assumed away.

### Finding #2 (missing write-path security test) -- confirmed closed with real evidence

Read the dated addendum in qa/results.md, "Addendum -- 2026-08-19 --
SEC-11 (blind-write gap-fill)", and the corresponding SEC-11 entry added
to qa/test-plan.md. Confirmed this is genuine evidence, not a self-test
mistake:

- Two independently-authenticated supabase-js clients against the live
  deployed project -- a fresh "author" signup and a fresh "attacker"
  signup, not a re-run under the QA author own session. The attacker was
  explicitly granted edit-tier access to a freshly created map, not the
  map owner, which is the correct identity to test against: a non-author
  with genuine write permission on the map generally, but no legitimate
  visibility into this one hidden tile.
- The attacker obtained the hidden tile id legitimately via
  reflection_placeholders(), the same RPC the real locked-placeholder UI
  calls, matching the actual attack surface described in this review
  original finding -- not a fabricated or guessed id.
- Direct supabase.from("tiles").update(...) and .delete(...) against that
  id, from the attacker own client, bypassing the UI entirely: both
  returned data: [] with no thrown error -- zero rows affected. The
  author re-select after each attempt confirmed the row was genuinely
  untouched, title and content unchanged, row still present.
- Control case: the same attacker performed the identical UPDATE pattern
  against an ordinary, non-hidden, tile on the same map, and it
  succeeded. This is the detail that makes the test load-bearing rather
  than ambiguous -- it proves the attacker edit-tier access was genuinely
  functional, so the two blocked attempts above are specifically
  attributable to the reflection_tile_visible() gate on the SELECT
  policy, which Postgres RLS also uses to gate UPDATE/DELETE target-row
  identification, not a coincidental blanket permissions failure that
  would have blocked everything regardless of the reflection feature.

This is exactly the right test and it was executed with the right rigor:
real second identity, real edit-tier grant, real id obtained through the
legitimate code path, plus a control to rule out the trivial false-
positive explanation. There is no residual doubt about the write-side of
the hiding guarantee now either.

### Migration ordering -- checked, stated clearly

The header of migration_008_fix_tile_creation_trigger.sql states outright:
"Run this once in the Supabase SQL editor against a project that already
has migration_007_reflection_sessions.sql applied." The 2026-08-19
addendum in backend-dev-report.md repeats this: "Run it after
migration_007 (which must already be applied for reflection_sessions and
tiles.reflection_session_id to exist)." This is unambiguous --
migration_008 is a pure "create or replace function" delta with no
"create table" or "alter table" of its own, so running it before
migration_007 would fail outright, since the function body references
reflection_sessions which would not yet exist, rather than silently
misbehaving -- itself a reasonable safety property even if a user did get
the order wrong. Both migration_007 and migration_008 remain correctly
un-run against the live project, consistent with this project
established convention of leaving schema changes for the user to apply --
not silently forgotten, just correctly still pending.

### Verdict

Both items from the original NEEDS REWORK are resolved, verified
independently against the current code rather than taken on the reports
word alone. No new issues found in this pass. COMPLETE.
