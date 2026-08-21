# QA Test Plan — Reflection Session (retro-reflection-reveal)

Authored in `author` mode, before implementation exists. Derived from `plan.md` (approved
2026-08-18, including the author_id Addendum) and `mock/v1.html`. No test runner is configured
in this repo (confirmed on prior features), so every case below is a precise manual procedure —
exact setup, exact action, exact expected result — rather than a script. Where a case requires
inspecting network/DOM/websocket internals, the procedure says exactly what tool and what to
look at, so a "pass" can't be claimed from reading code or from the normal UI looking right.

**Test environment needed:** one map, three real accounts — Jordan (map owner), Priya (edit-tier
collaborator), Sam (edit-tier collaborator) — mirroring the mock's cast, run in three separate
browser profiles/windows so each has its own authenticated session and devtools. Two more
accounts for the permission-tier cases: Casey (comment-tier), Riley (view-tier). Multi-account
realtime scenarios (GP, most of SEC, OWN, EDGE) need at least two windows open simultaneously.

Case ID prefixes: **GP** golden path, **SEC** security property, **OWN** owner-blind rule,
**EDGE** edge cases, **REG** regression, **PERM** permission tiers.

---

## GP — Golden path

### GP-1 — Owner starts a session; state broadcasts live to everyone
- **Setup:** Jordan and Priya both have the same map open, no session active (baseline: no
  badge, no ghost panel, "Start reflection session" control visible to Jordan only per plan's
  owner-only rule — see PERM-1 for the absence check itself).
- **Action:** Jordan clicks "Start reflection session", confirms in the popover (per mock:
  Cancel/Start session buttons).
- **Expected:** Jordan's header immediately shows the active-session badge/state. Within a
  couple seconds (no manual reload) Priya's header shows the same active-session badge too —
  confirms `reflection_sessions` start event reaches other clients live, not just the initiator.

### GP-2 — Author sees their own session tile fully
- **Setup:** Session active (from GP-1).
- **Action:** Priya creates a new tile ("+ Add a card" in a frame, or normal tile-create flow)
  with a distinctive title/content.
- **Expected:** In Priya's own window, the tile renders as a completely normal, fully editable
  card immediately — full title/content visible, no lock chrome, editable in place.

### GP-3 — Non-author sees a locked placeholder for someone else's session tile
- **Setup:** Continues from GP-2.
- **Action:** Observe Jordan's and Sam's windows (neither authored Priya's new tile).
- **Expected:** A tile-shaped element appears at the correct board position/size in both other
  windows, rendered as the locked placeholder: lock icon, Priya's name, Priya's avatar color —
  and **no title or content text anywhere on the card**, not even truncated/blurred.

### GP-4 — Ghost-count panel updates live across multiple authors
- **Setup:** Session active; ghost-count panel visible in all three windows (Jordan, Priya, Sam).
- **Action:** Priya adds a 2nd card, then Sam adds a 1st and 2nd card, each in a different frame,
  without anyone reloading.
- **Expected:** Every window's ghost panel updates live to show the correct running per-author
  count (e.g. "Priya — 2 cards", "Sam — 2 cards") within a couple seconds of each add, and a
  viewer never sees their *own* name/count listed in their own ghost panel (mock shows only
  the *other* two people, matching "own tiles render fully, not as a ghost row").

### GP-5 — "+ Add a card" affordance is scoped correctly per frame
- **Setup:** Session active, board has Start/Stop/Continue frames (per mock).
- **Action:** Sam clicks "+ Add a card" inside the "Stop" frame specifically and writes a card.
- **Expected:** The new tile is created positioned inside the Stop frame's bounds, authored by
  Sam, and gated by the active session exactly like any other session tile (confirmed via GP-2/
  GP-3 pattern from Sam's and another viewer's perspective).

### GP-6 — Ending the session shows a transient "revealing" state to everyone
- **Setup:** Session active with several hidden tiles across the three authors.
- **Action:** Jordan clicks "End reflection session".
- **Expected:** Jordan's control becomes disabled/shows a revealing/spinner state immediately.
  Priya's and Sam's badges also transition to a revealing indicator at roughly the same time
  (not only after Jordan's finishes) — confirms the reveal is broadcast, not something each
  client discovers independently on next poll.

### GP-7 — Reveal makes all session tiles visible to everyone at once
- **Setup:** Continues from GP-6, wait for the reveal transition to finish.
- **Action:** None — observe.
- **Expected:** In Jordan's, Priya's, and Sam's windows alike, every tile created during the
  session (by any of the three) now shows its real title/content. Compare timestamps/observation
  across windows — the reveal should land within the same short window on all three, not
  staggered by whoever happens to refresh. Card count in the final "Revealed" state readout
  matches the actual number of session tiles created (mock shows "Revealed — 8 cards now
  visible" as the pattern).

### GP-8 — Revealed tiles behave as fully normal tiles afterward
- **Setup:** Continues from GP-7.
- **Action:** As Jordan (non-author of Priya's revealed tile), try to edit Priya's revealed
  tile's text, drag it to a new position, and resize it.
- **Expected:** All of these succeed exactly as they would on a tile that was never part of a
  session (assuming Jordan otherwise has edit access to the map) — no residual lock chrome, no
  special-cased behavior, no author-only edit restriction introduced by this feature.

### GP-9 — Post-reveal UI reverts to idle session chrome
- **Setup:** Continues from GP-7/GP-8.
- **Action:** Observe the header/board chrome in all three windows.
- **Expected:** Ghost-count panel is gone. The "+ Add a card" per-frame affordance behaves as
  the normal add-tile mechanism again (not scoped to a nonexistent session). Jordan's control
  reads "Start reflection session" again (idle), ready to start a new one; Priya/Sam still have
  no start/end control (see PERM-1).

---

## SEC — The security property (content must not leak before reveal)

This is the category that matters most for this feature. "Locked in the normal UI" is not
sufficient evidence for any case below — each one specifies the actual artifact to inspect.

### SEC-1 — No hidden-but-present content in the DOM/component tree
- **Setup:** Session active; Priya has a hidden tile as seen from Jordan's window (per GP-3).
- **Action:** In Jordan's browser devtools, open the Elements panel and inspect the locked
  placeholder element and its full subtree (not just what's visually rendered — expand every
  node). If React DevTools is available, also inspect the component's props/state for that tile.
- **Expected:** Priya's real title/content string is not present anywhere in the DOM subtree or
  in the component's props/state — not as text content, not as a `data-*` attribute, not inside
  an inline style, not in an off-screen/`display:none`/`visibility:hidden`/`opacity:0`/
  `transform`-hidden sibling element. (Flag explicitly: the mock's flip-card animation renders
  *both* faces — including real content on `.face-back` — in the DOM simultaneously and uses a
  CSS `rotateY` transform to hide the back face. That's acceptable for a static demo mock but
  is **not** an acceptable implementation pattern here — if `ui-dev` reproduces that literal
  technique with real fetched content, this case fails even though it "looks locked.")

### SEC-2 — Initial page-load network payload excludes hidden content
- **Setup:** Session active with Priya's hidden tile as in SEC-1. Jordan has not yet loaded the
  board this session (hard refresh Jordan's tab to force a fresh initial fetch).
- **Action:** In Jordan's devtools Network tab, find the request that fetches tiles for the map
  (Supabase REST/PostgREST call, likely `GET .../rest/v1/tiles?...`) and inspect the raw response
  body.
- **Expected:** Whatever row (if any) represents Priya's hidden tile in that response body has no
  populated `title`/`content` field with Priya's real text — either the row is absent entirely,
  or those specific fields are null/omitted. **Also check the converse**: if the row is absent
  entirely, note whether position (`x`/`y`/`w`/`h`) and `author_id` are then unavailable too —
  the mock's placeholder requires exact board position and author identity to render, so verify
  what the actual response contains and reconcile against how the placeholder is getting that
  data. This is the load-bearing check for a real design tension in the plan (see report).

### SEC-3 — Realtime INSERT event excludes hidden content
- **Setup:** Session active. Jordan's tab open and idle, devtools Network tab on the WS
  (websocket) filter, watching the Supabase realtime connection frames.
- **Action:** Sam creates a new tile with distinctive content while Jordan's tab is watching.
- **Expected:** The `postgres_changes` INSERT frame Jordan's client receives over the websocket
  does not contain Sam's real `title`/`content` values anywhere in the frame payload — this is
  `backend-dev`'s own flagged risk area (plan: "confirm this holds for INSERT events
  specifically, not just initial load"). Inspecting only the rendered UI is not sufficient here —
  a client that receives the full row over the wire and merely chooses not to render the content
  still fails this case.

### SEC-4 — Realtime UPDATE event excludes hidden content
- **Setup:** Session active. Priya has an existing hidden-to-others tile; Jordan's tab watching
  the WS frames as in SEC-3.
- **Action:** Priya edits her own tile's content (types additional text, causing an UPDATE).
- **Expected:** The UPDATE frame delivered to Jordan's client does not contain Priya's updated
  (or original) real content. Note this repo's `tiles` table has `REPLICA IDENTITY FULL`
  (migration_006) specifically so UPDATE/DELETE events carry the full old row image for
  same-map-scoped filtering to work — verify that full-row replication does not become a bigger
  leak than the SELECT-policy analysis in the plan accounted for.

### SEC-5 — Realtime DELETE event excludes hidden content
- **Setup:** Session active. Sam has a hidden-to-others tile; Jordan's tab watching WS frames.
- **Action:** Sam deletes their own in-session tile before reveal.
- **Expected:** The DELETE frame Jordan receives (which, per `REPLICA IDENTITY FULL`, carries the
  entire old row) does not expose Sam's real title/content in the `old` record delivered to
  Jordan's client. This is the sharpest version of the REPLICA IDENTITY FULL risk: that
  migration was written to fix a *different* bug (silently-dropped DELETE events) without this
  feature in mind, and full-row replication is exactly the mechanism that could defeat
  column-level content hiding on a DELETE if RLS-per-subscriber isn't actually filtering it out
  for non-authors.

### SEC-6 — Direct query bypass (list) cannot retrieve hidden content
- **Setup:** Session active, Priya has a hidden-to-Jordan tile.
- **Action:** In Jordan's browser console (same authenticated tab, so the app's existing
  Supabase client/session is available), run a raw query equivalent to
  `supabase.from('tiles').select('*').eq('map_id', '<map-id>')` and inspect the returned rows in
  the console.
- **Expected:** Same result as SEC-2 — no real title/content for Priya's hidden tile, regardless
  of querying `select('*')` directly rather than going through whatever narrower query the app's
  own code uses. This proves the protection is enforced at the RLS/database layer, not just by
  the app choosing not to ask for those columns.

### SEC-7 — Direct query bypass (single row by id) cannot retrieve hidden content
- **Setup:** Session active. Get Priya's hidden tile's `id` (from the INSERT payload/DOM
  `data-*` attribute if exposed, or by having Priya read her own tile's id).
- **Action:** In Jordan's console, run `supabase.from('tiles').select('*').eq('id', '<tile-id>')`
  targeting that specific tile directly (not a filtered list).
- **Expected:** No real content returned, same as SEC-6 — confirms the RLS policy isn't only
  effective for broad/listing queries but holds for a direct, deliberate, targeted lookup too.

### SEC-8 — `reflection_progress()` returns counts only, never content
- **Setup:** Session active with multiple authors' cards.
- **Action:** In any non-owner's console, call the ghost-count function directly (e.g.
  `supabase.rpc('reflection_progress', { p_session_id: '<session-id>' })`) rather than via
  whatever UI wraps it.
- **Expected:** The returned rows contain only `author_id`/`card_count`-shaped data (per the
  plan's proposed signature) — no `title`, `content`, or any other tile column ever appears in
  the function's return shape, and the counts match the actual number of cards each author has
  created so far.

### SEC-9 — Hard reload never flashes real content before session-state loads
- **Setup:** Session active, Jordan has tiles hidden from them (Priya's, Sam's).
- **Action:** Jordan hard-refreshes their tab several times in a row, watching closely (and
  ideally recording/screen-capturing) the moment tiles first paint after reload.
- **Expected:** At no point — not even a single frame before session/RLS state resolves — does a
  hidden tile render with real content that then gets replaced by the locked placeholder. If the
  client fetches tiles before it knows the session is active, the *data itself* must already be
  scrubbed (per SEC-2), so there's nothing to flash regardless of render-order timing. A visible
  "pop" from real content to locked placeholder is a fail even if it's just one frame.

### SEC-10 — A tab open since before the session doesn't get ahead of the official reveal
- **Setup:** Jordan's tab has been open and idle since before Sam authored a hidden tile (i.e.
  Jordan never reloaded during the session — relying purely on the realtime subscription/local
  cache).
- **Action:** Right as Jordan's tab has been sitting on the locked placeholder for a while, check
  whether any local caching layer (React Query cache, component state, `localStorage`,
  `sessionStorage`) already holds Sam's real content ahead of the reveal broadcast — inspect via
  devtools Application tab (storage) and via a console dump of any in-memory cache the app
  exposes.
- **Expected:** No real content is resident anywhere in Jordan's client-side state/storage before
  the reveal actually happens — consistent with SEC-2/SEC-3 establishing the server never sent it
  in the first place, so there's nothing cached to leak later.

### SEC-11 — A non-author cannot blind-write (UPDATE/DELETE) a hidden tile whose id they legitimately hold
- **Added post-execute**, per `feature-reviewer`'s review.md finding #2: `reflection_placeholders()` deliberately
  returns a hidden tile's `id` (along with `author_id`/`x`/`y`/`w`/`h`) to every non-author with map access, so
  the locked-placeholder UI can render at the correct board position — meaning the id itself is not secret, only
  the content is. SEC-1 through SEC-10 above only test the *read* side of the hiding guarantee. `tiles`' UPDATE
  and DELETE policies (`using (has_map_access(map_id, 'edit'))`) have no `reflection_tile_visible` clause of their
  own — unlike the SELECT policy — so this case tests whether standard Postgres RLS semantics (that UPDATE/DELETE
  target-row identification is additionally gated by the table's SELECT policy) actually holds here, rather than
  assuming it does.
- **Setup:** Session active, map shared to a non-author collaborator at **edit tier** specifically (so
  `has_map_access(map_id, 'edit')` is true for them — isolating this case to the reflection-visibility gate, not
  just "this user has no write access to the map at all"). The author has created a hidden-to-others tile with
  real content.
- **Action:** In the non-author's own authenticated console/client (not the app's UI — a raw
  `supabase.from('tiles')` call), obtain the hidden tile's `id` via `reflection_placeholders()` exactly as the
  real locked-placeholder UI would, then attempt, directly against that `id`:
  1. `supabase.from('tiles').update({ title: '<attacker-supplied text>' }).eq('id', '<hidden-tile-id>')`
  2. `supabase.from('tiles').delete().eq('id', '<hidden-tile-id>')`

  As a control in the same session, also have the non-author perform an ordinary UPDATE against a *non-hidden*
  tile on the same map (no `reflection_session_id`), to prove their edit-tier access is genuinely functional and
  isn't itself the reason any block above occurs.
- **Expected:** Both the UPDATE and the DELETE against the hidden tile are rejected — per standard Postgres RLS
  behavior this should manifest as the call reporting zero rows affected (no error, `data: []`), not a thrown
  error — and the tile's real title/content are unchanged when re-checked (from the author's own client, which
  can always see its own tile regardless of session state). The control UPDATE against the ordinary tile
  succeeds, confirming the non-author's edit-tier access is real and the hidden-tile blocks are specifically the
  reflection-visibility gate, not a general permissions failure. This must hold regardless of what the app's own
  UI would ever attempt — the guarantee needs to be enforced at the RLS/database layer, not merely by the app
  choosing not to expose an edit affordance on a locked placeholder.

---

## OWN — The owner-is-blind-too rule

### OWN-1 — Owner's locked-placeholder view is identical in fidelity to a collaborator's
- **Setup:** Session active, both Priya and Sam have hidden-to-others tiles.
- **Action:** Compare Jordan's (owner) rendering of Priya's/Sam's locked tiles against Priya's
  rendering of Sam's locked tile (from GP-3) — same lock icon, same author name/color, same
  absence of any preview affordance (no hover tooltip, no "preview" button, no expand-on-click).
- **Expected:** Pixel/behavior parity — nothing in the owner's placeholder rendering hints at
  content a regular collaborator's placeholder doesn't also hint at.

### OWN-2 — Owner's direct query bypass also cannot retrieve others' content pre-reveal
- **Setup:** Session active, Priya has a hidden tile.
- **Action:** Repeat SEC-6/SEC-7's raw-query procedure, but run it from **Jordan's** (the owner's)
  console instead of a non-owner's.
- **Expected:** Same negative result as SEC-6/SEC-7 — the RLS rule must be strictly
  `author_id = auth.uid() OR revealed = true`, with **no** additional owner/facilitator carve-out
  such as `OR created_by_map_owner = true`. This is the single most important case in this
  category: it directly tests for the backdoor the plan explicitly says must not exist.

### OWN-3 — Owner's ghost panel has no extra affordance over a collaborator's
- **Setup:** Session active.
- **Action:** In Jordan's window, try hovering/clicking each ghost-count row (e.g. "Sam — 3
  cards") looking for any preview, snippet, or expand behavior not present in Priya's/Sam's
  panels.
- **Expected:** None exists — the owner's ghost panel is functionally identical to everyone
  else's; aggregate counts only.

### OWN-4 — Owner's own authored tiles remain fully visible to the owner (sanity check)
- **Setup:** Session active, Jordan has authored at least one tile during the session.
- **Action:** Jordan views their own tile.
- **Expected:** Fully visible/editable, same as GP-2 — confirms the owner-blind rule applies only
  to *other people's* content, not the owner's own writing.

---

## EDGE — Edge cases

### EDGE-1 — A tile created before the session started is unaffected throughout
- **Setup:** Board has at least one pre-existing tile (created with no session active,
  `reflection_session_id` null) authored by Sam.
- **Action:** Jordan starts a session (GP-1), several tiles get created and hidden, then Jordan
  ends the session and it reveals (GP-6/GP-7).
- **Expected:** Sam's pre-existing tile is visible with full content to Priya and Jordan
  *throughout the entire lifecycle* — at session start, mid-session, and after reveal — never
  shows a lock icon, and never contributes to the ghost-count panel's numbers at any point.

### EDGE-2 — Reveal happens while a tile's author is mid-edit
- **Setup:** Session active. Priya opens her own tile and begins typing new content but doesn't
  blur/save yet (still mid-keystroke or has an unsaved local edit pending).
- **Action:** Jordan ends the session while Priya is still actively editing.
- **Expected:** No data corruption or loss: Priya's in-progress edit either saves before/during
  the reveal transition or is preserved locally and saves normally afterward. Once settled, all
  other users see Priya's *final* saved content (not a stale/partial mid-edit snapshot, and not
  an error). Explicitly check Priya doesn't lose keystrokes and the tile doesn't end up duplicated
  or corrupted by a race between the UPDATE and the reveal's RLS state flip.

### EDGE-3 — Two sessions in sequence don't cross-contaminate
- **Setup:** Run a full session (Session A): Jordan starts it, Priya/Sam add cards, Jordan ends
  it, reveal completes, all Session A tiles now permanently visible to everyone.
- **Action:** Jordan starts a second session (Session B) on the same map. Priya adds a new card
  during Session B.
- **Expected:** Session A's already-revealed tiles remain visible the whole time (not re-hidden
  by Session B starting). Session B's ghost-count panel shows only Session B's new activity —
  Priya's brand-new Session B card counts toward Session B's total, not folded into or confused
  with Session A's (now-irrelevant, already-revealed) numbers. Priya's Session B card is hidden
  from Jordan/Sam exactly like a fresh session's tile should be, independent of Session A ever
  having existed.

### EDGE-4 — A user who opens the board mid-session sees correct state on load, not just live updates
- **Setup:** Session active for a while — Priya and Sam have each already added 2 cards before
  this case begins (i.e. those adds already happened and their live-update moment has passed).
- **Action:** A fourth user (or an already-invited collaborator who simply hadn't opened the
  board yet) opens the board for the first time *after* those cards already exist.
- **Expected:** On initial load (no live update needed, no reload-to-fix-it) the new viewer's
  ghost-count panel already shows the correct accumulated totals (e.g. "Priya — 2, Sam — 2"), and
  the board already shows correctly-positioned locked placeholders for all of Priya's and Sam's
  existing session tiles — not just tiles created after this viewer joined.

### EDGE-5 — A second session cannot start while one is already active
- **Setup:** Session active (started by Jordan).
- **Action:** With the session still active, check whether Jordan's control still offers any way
  to start a second concurrent session (e.g. inspect whether the "Start" control is genuinely
  replaced by "End", not just visually, or attempt the underlying start action twice in a row via
  console/rapid double-click).
- **Expected:** Only one active reflection session per map at a time is possible — mirroring the
  plan's explicit "at most one active session per map at a time, same as vote sessions today" and
  the `vote_sessions_one_active`-style unique-partial-index pattern. A double-start attempt is
  rejected/no-ops rather than creating two concurrently-active sessions.

### EDGE-6 — Ending a session with zero cards created works cleanly
- **Setup:** Jordan starts a session and nobody creates any tiles.
- **Action:** Jordan ends the session immediately.
- **Expected:** Reveal transition completes without error for a session with zero session tiles;
  ghost panel showed an empty/zero state the whole time rather than erroring; final state reads
  something sensible (e.g. "Revealed — 0 cards") rather than a broken or stuck UI.

### EDGE-7 — Author deletes their own hidden tile before reveal
- **Setup:** Session active, Sam has created a hidden-to-others tile.
- **Action:** Sam deletes that tile before the session ends.
- **Expected:** The ghost-count panel decrements live for everyone watching (Jordan/Priya's "Sam"
  row count drops by one, or disappears if it was Sam's only card). When the session later ends
  and reveals, the deleted tile does not reappear/resurrect for anyone — it's simply gone, same
  as deleting any tile normally.

### EDGE-8 — Card creation failure during a session surfaces an error, not silent data loss
- **Setup:** Session active. Simulate a save failure for a new card (e.g. devtools network
  throttling set to "Offline" right as Priya submits a new card, or block the relevant Supabase
  request via devtools request-blocking).
- **Action:** Priya attempts to create a card while the network/save path is failing.
- **Expected:** Priya gets a visible indication the card failed to save (not a card that silently
  vanishes or one that appears to succeed locally but never syncs) — consistent with how the
  existing (pre-session) tile-creation failure path behaves, since this feature shouldn't
  introduce a worse failure mode than normal tile creation already has. If normal tile creation
  today has no explicit failure UI either, note that as a pre-existing gap rather than a
  regression introduced by this feature.

### EDGE-9 — Concurrent card creation by two authors in the same frame doesn't collide
- **Setup:** Session active, one frame (e.g. "Stop") empty of session tiles so far.
- **Action:** Priya and Sam both click "+ Add a card" in the same frame at effectively the same
  moment and both submit distinct content within a second of each other.
- **Expected:** Both cards are created independently with correct, distinct authorship
  (`author_id` correctly attributed to each), no overwrite of one by the other, both positioned
  sensibly within the frame (no exact-overlap collision), and each remains hidden from the other
  author per the normal locking rule.

---

## REG — Regression (no-session board behavior unchanged)

### REG-1 — Tile creation with no session active behaves exactly as today
- **Setup:** No reflection session has ever run on this map, or one ran and fully reverted to
  idle (post-reveal idle state).
- **Action:** Any user with edit access creates a new tile.
- **Expected:** Immediately fully visible to everyone with view access, no lock icon, no ghost
  panel, no badge — identical to pre-feature behavior. `author_id` gets populated on the new row
  (per the Addendum) but this has no visible effect on a no-session board.

### REG-2 — Normal tile drag/resize/move unaffected
- **Setup:** No session active, an existing pre-feature-style tile on the board (including one
  with `author_id = null`, simulating unmigrated legacy content).
- **Action:** Drag it to a new position, resize it.
- **Expected:** Works exactly as before; the new nullable `author_id`/`reflection_session_id`
  columns being null causes no errors, no rendering glitches, no console errors.

### REG-3 — Comments still work on ordinary tiles
- **Setup:** No session active (or a revealed, now-ordinary tile).
- **Action:** Add and view a comment on a normal tile.
- **Expected:** Unaffected by this feature's existence.

### REG-4 — Connector/link creation unaffected
- **Setup:** No session active, two ordinary tiles.
- **Action:** Draw a connector between them.
- **Expected:** Works exactly as before.

### REG-5 — Frame creation/labeling unaffected
- **Setup:** No session active.
- **Action:** Create a new frame, rename it.
- **Expected:** Works exactly as before; frames (`kind = 'frame'` tiles) are not treated as
  session-gated content themselves (a frame isn't "someone's private card").

### REG-6 — Starting a session doesn't retroactively hide pre-existing content at the instant of starting
- **Setup:** Board has several pre-existing tiles, all currently visible to everyone.
- **Action:** Jordan clicks Start and confirms.
- **Expected:** At the exact moment the session becomes active (watch closely, no delay), none of
  the pre-existing tiles switch to a locked-placeholder rendering — only tiles created from this
  moment forward are eligible for hiding. (Directly restates plan's explicit design intent, but
  needs an actual observed check, not an inference from the schema.)

### REG-7 — Vote Session feature is unaffected by this feature's addition
- **Setup:** No reflection session active.
- **Action:** Jordan starts a Vote Session (existing, separate feature) as normal.
- **Expected:** Works exactly as it did before this feature existed. Additionally, check what
  happens if a reflection session and a vote session are both started on the same map (plan
  doesn't say these are mutually exclusive) — if both can be active simultaneously, confirm
  neither one's UI/state corrupts the other's (e.g. two badges coexist sensibly rather than one
  clobbering the other's header slot).

---

## PERM — Permission tiers

The plan states session control is owner-only explicitly ("matching Vote Session's existing
rule"). It does **not** explicitly say how comment-tier and view-tier collaborators experience an
active session. The cases below reason from two things that *are* explicit: (1) `tiles` INSERT
already requires `edit`-tier access today (pre-existing, unrelated to this feature), so
comment/view-tier users have never been able to author tiles at all; and (2) the plan's own
wording that `reflection_progress()` should be "callable by anyone with map access regardless of
the content-hiding RLS rule" — not "callable by edit-tier users" — implying ghost counts are a
view-access-level feature, same as seeing the board at all. **This inference is flagged in my
report as a judgment call, not something the plan states outright** — if `ui-dev`/`backend-dev`
built it differently (e.g. restricted ghost counts to edit-tier), that's a spec ambiguity to
resolve at review, not automatically a bug.

### PERM-1 — Only the owner sees start/end controls
- **Setup:** No session active. Jordan (owner), Priya (edit-tier, non-owner) both viewing.
- **Action:** Compare headers.
- **Expected:** Jordan sees "Start reflection session". Priya does not see any start/end control
  at all (not merely disabled/grayed — matching how the mock shows zero control on Screen 2 for
  the non-owner collaborator).

### PERM-2 — A non-owner can't start/end a session by bypassing the UI
- **Setup:** No session active.
- **Action:** In Priya's (non-owner, edit-tier) console, attempt
  `supabase.from('reflection_sessions').insert({ map_id: '<map-id>', created_by: '<priya-id>', active: true })`
  directly.
- **Expected:** Rejected by RLS (mirrors "only the map owner manages vote sessions" policy
  pattern) — insert fails, no session is created. Also attempt ending an active session as
  non-owner (`update ... set active=false, revealed=true`) and confirm that's rejected too.

### PERM-3 — Comment-tier user sees the ghost-count panel *(inferred — flagged)*
- **Setup:** Session active. Casey has comment-tier access to the map.
- **Action:** Casey views the board during the active session.
- **Expected (per inference above):** Casey sees the ghost-count panel with correct live counts,
  same as an edit-tier collaborator. If this fails, treat it as a spec-ambiguity finding to raise
  at review rather than an unambiguous defect, since the plan doesn't pin this down explicitly.

### PERM-4 — Comment-tier and view-tier users see correctly locked placeholders *(inferred — flagged)*
- **Setup:** Session active. Casey (comment-tier) and Riley (view-tier) both have map access.
- **Action:** Both view the board.
- **Expected (per inference above):** Both see locked placeholders for others' session tiles at
  the correct position with author name/color, same as edit-tier users — since the tiles SELECT
  policy in the plan is gated by `has_map_access(map_id, 'view')` as its base condition, not by
  edit-tier, the hiding/showing behavior should be identical across all three tiers. Same
  spec-ambiguity caveat as PERM-3 if this doesn't hold.

### PERM-5 — Comment-tier and view-tier users still can't author tiles during a session (pre-existing rule, not a regression)
- **Setup:** Session active. Casey (comment-tier), Riley (view-tier).
- **Action:** Both look for a way to create a tile (e.g. the "+ Add a card" affordance).
- **Expected:** Neither can create a tile — same restriction that already exists today outside
  any session (tiles INSERT requires edit-tier access, unrelated to this feature). The "+ Add a
  card" affordance should be absent/disabled for them exactly as the normal tile-creation
  mechanism already is, not newly broken or newly permissive because of this feature.

### PERM-6 — View-tier user has read-only parity during a session
- **Setup:** Session active. Riley (view-tier).
- **Action:** Riley views the board, ghost panel, and locked placeholders.
- **Expected:** Riley can observe session state (badge, ghost counts, locked placeholders per
  PERM-3/PERM-4's inference) but has no interactive affordances at all — no add-card, no
  start/end, no ability to comment (comment requires comment-tier or above) — consistent with
  view-tier being strictly read-only both inside and outside a session.

---

## Case count by category

- GP (golden path): 9
- SEC (security property): 11
- OWN (owner-blind rule): 4
- EDGE (edge cases): 9
- REG (regression): 7
- PERM (permission tiers): 6

**Total: 46 cases.** (SEC-11 added post-execute, per `feature-reviewer`'s review.md finding #2 — see dated
addendum in `qa/results.md`.)
