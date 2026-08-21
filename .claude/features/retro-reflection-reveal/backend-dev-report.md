# backend-dev report — retro-reflection-reveal

## What was built

**Schema** (`supabase/schema.sql`, full desired state):
- New `reflection_sessions` table (mirrors `vote_sessions` exactly: `id,
  map_id, active, revealed, created_by, created_at, ended_at`; one active
  session per map via partial unique index; RLS = view-access select,
  owner-only for everything else). Placed *before* the `TILES` section
  (rather than grouped with `vote_sessions` further down) since
  `tiles.reflection_session_id` needs it to already exist for the FK.
- `tiles.author_id` (nullable `uuid references profiles(id)`) and
  `tiles.reflection_session_id` (nullable `uuid references
  reflection_sessions(id) on delete set null`) added to the `tiles`
  table definition, plus an index on the latter.
- `set_tile_creation_fields()` — a `before insert` trigger on `tiles`
  that unconditionally stamps `author_id := auth.uid()` (never
  client-trusted) and validates/nulls `reflection_session_id` if it
  doesn't reference an active session on the tile's own `map_id`.
- `reflection_tile_visible(target_session_id, tile_author_id)` —
  `security definer` helper (mirrors `votes_used_in_session()`'s
  recursion-safety rationale) backing the updated `tiles` SELECT policy:
  `has_map_access(map_id, 'view') and reflection_tile_visible(...)`.
- `reflection_progress(p_session_id)` — `security definer`, returns
  `(author_id, card_count)` aggregated, never selects content columns.
- `reflection_placeholders(p_session_id)` — `security definer`, returns
  `(id, author_id, x, y, w, h)` for tiles in that session the caller
  can't yet see content of. **This function is not in the plan's literal
  list** — see "Deviation" below, it's the resolution to a real gap the
  coordinator flagged mid-build.
- `reflection_sessions` added to the realtime publication with
  `replica identity full` (same fix as migration_006, applied from day
  one here rather than needing a follow-up migration).

**Migration**: `supabase/migration_007_reflection_sessions.sql` — the
incremental version of all of the above, idempotent (`create table if
not exists`, `drop policy/trigger if exists` + recreate, publication-add
guarded by an `information_schema` check like migration_005's strokes
addition). **I did not run this against the live/deployed Supabase
project** — per this project's established convention, that's the user's
step (Supabase SQL editor). `schema.sql` is the fresh-install reference;
`migration_007` is what an already-deployed project needs run once.

**Client** (`src/lib/boardSyncUtil.js`, `src/hooks/useBoardSync.js`):
- `rowToTile`/`tileToRow` gained `authorId` (read-only, `tileToRow` never
  sends it back — the trigger is the sole writer, and Postgres upsert's
  `ON CONFLICT DO UPDATE` only touches columns present in the payload, so
  omitting it there also keeps it immutable across edits) and
  `reflectionSessionId` (client-set at creation, round-tripped on every
  write like any other tile field).
- `useBoardSync.js` gained a `reflectionSession` section: `reflectionSession`
  / `reflectionProgress` / `reflectionPlaceholders` state, loaded on mount,
  kept live via a `reflection_sessions` realtime subscription,
  `startReflectionSession()` / `endReflectionSession()` actions. Ghost
  counts and placeholder shells are fetched via the two RPCs above and
  **polled on a 4s interval** while a session is active and unrevealed
  (not "refreshed when the tiles channel fires" — see the RLS-on-realtime
  finding below for why that mechanism doesn't work here). On
  `revealed: true`, an explicit `tiles` re-fetch (filtered by
  `reflection_session_id`) upserts the newly-visible rows into every
  connected client's local board state, closing a redelivery gap
  (logical replication doesn't replay a missed INSERT once RLS starts
  allowing it).

Full contract detail (including the two design decisions below) is in
`.claude/features/retro-reflection-reveal/interface.md`.

## Interface contract

Written to `.claude/features/retro-reflection-reveal/interface.md`. Key
points ui-dev/qa should know:
- `reflection_progress(p_session_id)` → `[{author_id, card_count}]`.
- `reflection_placeholders(p_session_id)` → `[{id, author_id, x, y, w, h}]`
  — never `title`/`content`, by construction of the return shape, not by
  filtering.
- Local tile fields: `tile.authorId` (read-only), `tile.reflectionSessionId`
  (settable at creation via `makeTile(..., { reflectionSessionId })`).
- `useBoardSync` returns `reflectionSession`, `reflectionProgress`,
  `reflectionPlaceholders`, `startReflectionSession()`,
  `endReflectionSession()`.

## Two deviations from the plan's literal text (both flagged live, both resolved)

**1. Column-scoping gap (raised by the coordinator mid-build, and
independently reached the same conclusion myself while tracing the RLS
design).** The plan's proposed `tiles` SELECT policy (`author_id =
auth.uid() OR revealed`) is whole-row: a non-author gets either the full
row or nothing. But the approved mock needs a locked placeholder at the
tile's *real board position* with the author's name/color — which
requires position+author to be visible while content stays hidden. RLS
cannot do partial-row visibility; that's a column-scoping problem, not a
row-scoping one, and it's fundamental (not a workaround-able limitation):
Postgres logical replication (what powers Supabase Realtime) streams
whole rows from base tables to all authorized subscribers identically —
there's no mechanism to redact specific columns per-subscriber for the
same physical row/event. Fix: keep the base `tiles` policy strictly
whole-row-hide (so content genuinely never reaches a non-author's
browser, including over realtime — no lesser design was acceptable given
the plan's explicit "even the owner is blind" anti-anchoring intent), and
add `reflection_placeholders()` as a second, separate, security-definer
function whose *return shape itself* has no content columns to leak.
`ui-dev`'s `reflectionPlaceholders` consumption and the new
`LockedPlaceholderTile.jsx` component are built against exactly this —
confirmed by reading the final code, not just the interface doc.

**2. "Refresh ghost counts on the tiles realtime channel firing" (the
plan's suggested mechanism) doesn't work.** A hidden tile's INSERT is, by
design, never delivered to a non-author's `tiles` channel at all (that's
the whole point of the RLS rule) — so there is no event on that channel
for a non-author to react to when someone *else* adds a card. Only the
card's own author would ever see their own INSERT fire. I replaced this
with fixed-interval polling of both RPCs (4s) while a session is active
and unrevealed, which is correct for every viewer regardless of
authorship.

## Verification

No local Supabase/Postgres instance is available in this environment (no
`supabase` CLI, no Docker), and per the project's convention and this
task's explicit instruction, I did not apply `migration_007` to the live
deployed project to test against it directly. Verification was therefore:

1. **`npm run build`** — passes cleanly with the full stack (schema
   files aren't build-checked, but both hook/util files and all of
   ui-dev's consuming code in `MuMap.jsx`/`LockedPlaceholderTile.jsx`
   compile and the app bundles with no errors).
2. **Manual trace of the RLS design against concrete scenarios:**
   - Tile with `reflection_session_id = null` (pre-existing content, or
     any tile created outside a session): `reflection_tile_visible`
     short-circuits true on `target_session_id is null` — behaves exactly
     like today, unaffected. ✓.
   - Author viewing their own in-session tile: `tile_author_id =
     auth.uid()` true → visible. ✓ (and the trigger guarantees
     `author_id` really is the creator, not client-spoofable).
   - Non-author viewing another's in-session tile, session not revealed:
     all three OR branches false → row excluded from SELECT. ✓.
   - Same tile, after `revealed = true`: third branch
     (`exists (... s.revealed)`) true → visible to everyone. ✓.
   - A crafted insert trying to claim someone else's `author_id`: trigger
     overwrites it unconditionally before the INSERT policy's `WITH
     CHECK` even evaluates (Postgres runs `BEFORE INSERT` triggers before
     RLS check evaluation on the final row) — not spoofable. ✓.
   - A crafted insert setting `reflection_session_id` to a foreign map's
     session, or an already-ended one: trigger's `exists(...)` check
     requires `s.map_id = new.map_id and s.active`, nulls it out
     otherwise — degrades to "not private" rather than granting any
     cross-map data access (the tile's own `map_id` still independently
     gates via `has_map_access` regardless of which session it
     references). ✓.
3. **The realtime-INSERT-delivery point specifically** (the part flagged
   as most likely to have a subtle gap): I could not run a live two-client
   test. My confidence this holds is **high but not lab-verified**, based
   on: (a) Supabase's documented behavior that `postgres_changes`
   authorizes every change event — INSERT included — against the same
   RLS SELECT policy, evaluated against the row's `NEW` values for
   INSERT/UPDATE and `OLD` values for DELETE; (b) this exact mechanism is
   *already relied upon and shipped* in this codebase today for `votes`'
   "own or revealed" policy (dot-voting's hidden-until-reveal behavior),
   which is the direct precedent this feature's RLS design mirrors
   line-for-line; (c) `tiles` already has `replica identity full` (set in
   the original schema and reconfirmed by migration_006), so DELETE/UPDATE
   old-row filtering isn't a confound here — INSERT always carries the
   full `NEW` row regardless of replica identity, so that fix is
   orthogonal to this concern. Residual risk: if this Supabase project's
   Realtime is somehow configured to skip RLS authorization on
   `postgres_changes` (a non-default, unusual configuration), the
   guarantee would weaken to "hidden from initial SELECT/page load, but
   not from a live INSERT tap" — I'd flag this as the single highest-value
   thing for `qa-engineer`'s execute pass to confirm with two real
   browser sessions once the migration is applied, since it's the crux of
   the feature's actual privacy guarantee.
4. Read through `ui-dev`'s final consuming code (`MuMap.jsx`'s
   `reflectionStamp` tile-creation wiring,
   `LockedPlaceholderTile.jsx`) to confirm it's built against the
   contract as documented (camelCase field names, `reflectionPlaceholders`
   treated as a separate synthetic list rather than a variant of normal
   tile rendering, owner-only gating via the existing `isOwner` pattern)
   — confirmed consistent.

## Files touched

- `supabase/schema.sql` — reflection_sessions table, tiles columns/trigger/
  policy changes, `reflection_tile_visible`/`reflection_progress`/
  `reflection_placeholders` functions, realtime publication + replica
  identity.
- `supabase/migration_007_reflection_sessions.sql` — new, incremental
  version of the above for the deployed project. **Not yet run against
  the live database — needs the user to run it in the Supabase SQL
  editor.**
- `src/lib/boardSyncUtil.js` — `rowToTile`/`tileToRow` gained
  `authorId`/`reflectionSessionId`.
- `src/hooks/useBoardSync.js` — `reflectionSession` state/actions/polling/
  reveal-refetch, mirroring `voteSession`'s shape per the plan.
- `.claude/features/retro-reflection-reveal/interface.md` — the contract,
  including the column-scoping resolution.

(`src/MuMap.jsx` and `src/components/board/LockedPlaceholderTile.jsx` are
ui-dev's files — noted above only for context on what they built against
this contract, not touched by me.)

---

## 2026-08-19 — Fix: reflection_session_id silently nulled on post-reveal edits

`feature-reviewer`'s review (`.claude/features/retro-reflection-reveal/review.md`,
finding #1) found a real bug in `set_tile_creation_fields()`: it's a
`before insert` trigger, but Postgres fires BEFORE INSERT row triggers —
and applies their modifications to `NEW` — before ON CONFLICT detection.
`boardSyncUtil.js`'s `upsert()` is the single write path for every tile
edit (drag/retitle/resize), not just creation, and `tileToRow()`
round-trips `reflection_session_id` on every write (unlike `author_id`,
which the same file omits entirely, so it was never at risk). So the
trigger's "is the referenced session still active" re-validation was
re-running on every ordinary edit of an already-created tile, not just at
genuine creation time. The first edit to any tile after its reflection
session was revealed (reveal sets `active: false`) silently nulled
`reflection_session_id` on that row — no visible symptom (a null
`reflection_session_id` is still always-visible per
`reflection_tile_visible`'s first branch), which is why it wasn't caught
by QA's GP-8 case or by my own original verification pass, both of which
checked content visibility/persistence, not session-lineage survival.
This defeated the column's whole stated purpose (recording which
reflection round a card came from, for a future grouping feature).

**Fix**: gate the session-active re-validation on `not exists (select 1
from tiles t2 where t2.id = new.id)`, so it only runs at genuine INSERT
time (id not yet in the table) and never on an upsert's
ON-CONFLICT-turned-UPDATE path (id already present). Once a tile's
`reflection_session_id` is validated and set at creation, it is now truly
"set once, never touched again by this trigger" — matching what
`interface.md` already claimed the behavior was. `author_id` needed no
change: it's immune to this bug entirely, since `tileToRow()` never
includes that key in the upsert payload at all, so it's never part of any
upsert's `DO UPDATE SET` clause regardless of what the trigger sets on
`NEW`.

Files touched:
- `supabase/schema.sql` — `set_tile_creation_fields()` updated in place
  (same function, added guard clause + explanatory comment).
- `supabase/migration_008_fix_tile_creation_trigger.sql` — new,
  incremental `create or replace function` delta for the already-deployed
  project (matches migration_004's precedent for a pure bug-fix
  migration: no `alter table`, just the corrected function body). **Not
  run against the live database** — per this project's convention and
  this task's explicit instruction, that's the user's step in the
  Supabase SQL editor. Run it after migration_007 (which must already be
  applied for `reflection_sessions`/`tiles.reflection_session_id` to
  exist).

Verification: no local Postgres/Supabase instance is available in this
environment (confirmed again: no `psql`, `supabase` CLI, or `docker` on
PATH), so this was verified by hand-trace against concrete Postgres
upsert/trigger semantics rather than a live run:

1. **Create tile during active session S**: upsert with a brand-new id,
   `reflection_session_id = S.id`. Trigger fires as a genuine INSERT (no
   existing row with that id) → `not exists (select ... tiles t2 ...)` is
   true → validation proceeds → S is active → validation passes →
   `reflection_session_id` stays `S.id`. Row inserted correctly. ✓
2. **End/reveal session S**: `reflection_sessions` row updated to
   `active: false, revealed: true` directly — doesn't touch `tiles` at
   all, no trigger recursion. Tile's `reflection_session_id` still `S.id`
   at this point. ✓
3. **Edit the tile's title or position** (by its author or any editor):
   client re-sends the full row via `upsert()`, `reflection_session_id`
   still `S.id` in the payload (local tile state carries it forward
   unchanged). Postgres attempts the INSERT, BEFORE INSERT trigger fires:
   this time a row with that id **already exists** (committed from step
   1), so `not exists (select ... tiles t2 ...)` is **false** → the
   `and`-chain short-circuits → the session-active re-validation branch
   never runs → `new.reflection_session_id` is left untouched at `S.id`.
   Since `reflection_session_id` is present in the upsert payload,
   `excluded.reflection_session_id` reflects this unchanged value, so
   `ON CONFLICT DO UPDATE` writes `S.id` back (a no-op change) instead of
   `null`. **Bug scenario confirmed fixed by trace.** ✓
4. Confirmed `author_id` stamping (still unconditional on every trigger
   fire) remains harmless post-fix for the same reason it always was:
   `tileToRow()` omits that key from the payload entirely, so it's never
   part of the generated `DO UPDATE SET` clause regardless of what the
   trigger sets on `NEW` for that column.
5. `npm run build` — passes cleanly (schema files aren't build-checked;
   this just confirms no client-side file was touched/broken by this
   change — the fix is schema-only).

I was not able to verify this against a real Postgres instance (same
environment limitation as the original build) — flagging this explicitly
per the task's request to verify for real where possible.
