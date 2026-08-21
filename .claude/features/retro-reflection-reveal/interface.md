# Interface contract — retro-reflection-reveal

Owned by `backend-dev`. This is the exact wire shape `ui-dev` should build
against. Refined once (see "Resolved: the column-scoping gap" below) after
an architectural tension was flagged mid-build — that section is the part
most worth reading carefully before wiring up the locked-placeholder UI.

## Schema summary

### `reflection_sessions` (new table, mirrors `vote_sessions` exactly)

```
id          uuid primary key default gen_random_uuid()
map_id      uuid not null references maps(id) on delete cascade
active      boolean not null default true
revealed    boolean not null default false
created_by  uuid not null references profiles(id) on delete cascade
created_at  timestamptz not null default now()
ended_at    timestamptz
```

- Only one `active` session per map (partial unique index), same as vote sessions.
- RLS: selectable by anyone with map view access; insert/update/delete
  (start/end) restricted to the map owner only — identical policy shape to
  `vote_sessions`.
- Added to the realtime publication with `replica identity full` (see
  migration_006's rationale — any table whose realtime listener filters on
  a non-PK column, here `map_id`, needs this or DELETE/filtered events can
  silently drop).
- `startReflectionSession()` inserts a row (`active` defaults true). `endReflectionSession()`
  updates `{ active: false, revealed: true, ended_at: now() }` — ending and
  revealing are the same action, there is no "ended but not yet revealed"
  state, matching vote sessions and the plan's "owner is blind too" decision.

### `tiles` — two new nullable columns

```
author_id             uuid references profiles(id)                          -- trigger-stamped, NOT client-writable
reflection_session_id uuid references reflection_sessions(id) on delete set null  -- client-set at creation only
```

- **`author_id`**: stamped by a `before insert` trigger (`set_tile_creation_fields`)
  that unconditionally sets `new.author_id := auth.uid()`, ignoring whatever
  the client sends. This was the "your call" item in the plan — a trigger
  was chosen over "client sends it, RLS enforces it" because tile creation
  has multiple call sites (plain tiles, frames, image tiles, text tiles,
  duplicate/paste) all funneling through the same generic upsert path in
  `boardSyncUtil.js`; a trigger guarantees correctness with zero chance of
  a call site forgetting to set it, and can't be forged by a malicious
  client either. It is populated for **every** new tile going forward (not
  just reflection tiles), per the addendum. No backfill — existing rows
  stay `author_id = null` forever.
  Because `boardSyncUtil.js`'s `tileToRow()` never includes `author_id` in
  its upsert payload, and Postgres upsert's `ON CONFLICT DO UPDATE` only
  touches columns present in the payload, `author_id` is naturally
  immutable after creation — no separate enforcement needed for that part.
- **`reflection_session_id`**: set by the client at creation time (local
  tile field `reflectionSessionId`, see below) only while a session is
  active. The same trigger validates it server-side: if the id doesn't
  reference a session that is both `active = true` and has the tile's own
  `map_id`, the trigger silently nulls it out rather than erroring (a
  stale/mismatched id degrades to "not private" instead of failing the
  write). Because `tileToRow()` *does* round-trip this field on every
  upsert (unlike `author_id`), it stays stable across edits to an
  already-hidden tile (drag/retitle while hidden doesn't un-hide it).

## RLS visibility rule on `tiles`

```sql
create policy "tiles are selectable with view access"
  on tiles for select
  using (has_map_access(map_id, 'view') and reflection_tile_visible(reflection_session_id, author_id));
```

`reflection_tile_visible(target_session_id, tile_author_id)` is a
`security definer` function (mirrors `votes_used_in_session()`'s pattern,
since it queries `reflection_sessions` — itself RLS-protected — from
inside another table's policy): returns true if `target_session_id is
null` (not a reflection tile at all), or `tile_author_id = auth.uid()`, or
the session is `revealed`. This is a **whole-row** gate — Postgres RLS
cannot show some columns of a row while hiding others on the same row.
That's the deliberate, plan-acknowledged limitation that created the gap
below.

**This governs realtime `postgres_changes` too, not just `select`.**
Supabase Realtime authorizes every change event (INSERT/UPDATE/DELETE)
against this same SELECT policy, evaluated against the row's `NEW` values
for INSERT/UPDATE and `OLD` values for DELETE — confirmed against this
codebase's own precedent (`votes`' "own or revealed" policy already relies
on exactly this mechanism today for dot-voting). Concretely: when a
non-author's tiles channel receives a `postgres_changes` INSERT event for
a tile someone else created during an active session, the row is
evaluated against `reflection_tile_visible` and the event is never
delivered to that subscriber at all — not filtered client-side, never sent
over the wire. High confidence, not lab-verified (no local Supabase
instance in this environment and the plan directs not to run migrations
against the live project; see the backend-dev report for the full
reasoning and residual risk).

## Resolved: the column-scoping gap (read this before building the placeholder UI)

The plan's row-level policy above means a non-author's client receives
**nothing at all** for a hidden tile — no row, no id, no position. But the
approved mock needs a locked placeholder rendered at the tile's *real
board position* with the author's name/avatar color. RLS genuinely cannot
produce "position + author visible, title/content hidden" as a single
row-level policy — that's a column-scoping problem, not a row-scoping one.

Fix: a second `security definer` function, alongside `reflection_progress()`,
that returns only the non-sensitive shell columns for tiles the caller
can't yet see the content of. **Never fetch this from the base `tiles`
table row for a hidden tile — the base table never exposes one.** This
function is the only channel through which position/author data for a
hidden tile reaches a non-author.

```sql
reflection_placeholders(p_session_id uuid)
  returns table (id uuid, author_id uuid, x double precision, y double precision, w double precision, h double precision)
```

- Callable by anyone with view access to the session's map.
- Returns one row per tile in that session that is **not yet visible to
  the caller** (`author_id is distinct from auth.uid()` and the session is
  not revealed). Once revealed, rows disappear from this function's output
  entirely (they're just normal tiles now, fetched the normal way).
- Never returns `title`, `content`, `tags`, `points`, or any other content
  column — by construction (the `returns table` shape doesn't have those
  columns), not by app-level filtering. There's nothing for a network
  inspector to catch here.
- Does **not** include the caller's own in-session tiles — those already
  arrive as full, editable rows via the normal `tiles` table/RLS path, no
  need to duplicate them here.

This is an addition beyond the plan's literal function list (which only
specified `reflection_progress`) — flagged explicitly since it's the
resolution to the gap the coordinator raised. Ghost-count aggregates and
placeholder shells are deliberately two separate functions (not one
combined shape) because `reflection_progress`'s signature was specified
precisely in the plan and other consumers may want counts without paying
for a full placeholder fetch.

## `reflection_progress()` — ghost counts

```sql
reflection_progress(p_session_id uuid) returns table(author_id uuid, card_count bigint)
```

`security definer`, callable by anyone with view access to the session's
map (checked internally via `has_map_access`). Counts rows grouped by
author; never selects/returns `title`/`content`/anything else. One row per
author who has added at least one card in that session.

## Why polling, not "refresh on the tiles realtime channel firing"

The plan's proposed refresh mechanism ("polled or refreshed on the
realtime tiles channel firing") doesn't actually work for ghost
counts/placeholders: a hidden tile's INSERT event is, by design, **never
delivered** to non-authors (see the RLS-on-realtime section above) — so a
non-author's tiles channel never fires at all for someone else's new
card, giving no signal to refresh on. `useBoardSync.js` therefore polls
`reflection_progress()` and `reflection_placeholders()` together on a
fixed interval (4s) whenever `reflectionSession?.active &&
!reflectionSession?.revealed`, plus once immediately on session load/start.
This is a deliberate deviation from the plan's suggested mechanism, not an
oversight — flagged here and in the backend-dev report.

## `useBoardSync.js` — `reflectionSession` section (shaped like `voteSession`)

State:
- `reflectionSession` — the latest `reflection_sessions` row for this map
  (or `null`), loaded on mount and kept live via the realtime channel,
  exactly like `voteSession`.
- `reflectionProgress` — `[{ author_id, card_count }, ...]`, polled per
  above.
- `reflectionPlaceholders` — `[{ id, author_id, x, y, w, h }, ...]`, polled
  per above; render these as locked placeholder tiles at their real board
  position (look up name/color via the existing `authorProfiles` map — see
  below).

Actions:
- `startReflectionSession()` — owner-only (enforced by RLS; UI should also
  gate the control to the owner, matching the vote-session pattern).
- `endReflectionSession()` — sets `active: false, revealed: true, ended_at`.
  Immediately after, `useBoardSync` proactively re-fetches
  `tiles` filtered by `reflection_session_id = <that session>` and
  `UPSERT_TILE`s each into local board state for **every** connected
  client. This closes a real gap: once a tile was blocked from realtime
  delivery while hidden, revealing the session does not retroactively
  redeliver that original INSERT event (Postgres logical replication
  doesn't replay missed events), so without this explicit re-fetch,
  already-connected non-author clients would see nothing appear until a
  manual page reload. (This same gap likely also affects `votes` on
  reveal today — out of scope to fix here, flagged for awareness only.)

`authorProfiles` (already existing state, previously populated only from
comment authors) is now also populated lazily for any `author_id` seen in
`reflectionProgress` or `reflectionPlaceholders`, reusing the exact
fetch-once-if-missing pattern already used for comments — so `ui-dev` gets
name/color for ghost counts and placeholders for free from the existing
map, no new prop plumbing needed.

## Local tile model additions (`boardModel.js` tile shape, `rowToTile`/`tileToRow`)

- `tile.authorId` — read-only from the client's perspective (`uuid | null`
  | `undefined` for a freshly-constructed local tile before its first
  sync). Populated by `rowToTile` from `row.author_id`. Never sent back to
  the server (`tileToRow` omits it) — the trigger is the only writer.
- `tile.reflectionSessionId` — settable by `ui-dev` at tile-creation call
  sites (`makeTile`/`makeFrame`/etc. already spread `overrides`, so pass
  `{ reflectionSessionId: reflectionSession.id }` when
  `reflectionSession?.active && !reflectionSession?.revealed`, otherwise
  omit it / leave `undefined` → stored as `null`). Round-tripped verbatim
  by `rowToTile`/`tileToRow` on every read/write after that, same as any
  other tile field (`color`, `x`, `y`, ...).

## Rendering guidance (for `ui-dev`, non-binding on exact chrome — plan's call)

A tile present in local `tiles` state with `reflectionSessionId` set and
`authorId !== currentUserId` and the session not revealed should not
normally occur (base RLS never delivers such a row) — if you ever see one
locally, something upstream is wrong; don't build UI branches for it. The
locked-placeholder rendering instead consumes `reflectionPlaceholders`
(a parallel, synthetic list, not real tile objects) — treat those as a
distinct render path from normal tiles, not a variant of `TileNode`'s
existing hidden/lean state, since a placeholder has no `kind`/`shape`/
`type` to key chrome off of (deliberately — it's not a real tile row).
