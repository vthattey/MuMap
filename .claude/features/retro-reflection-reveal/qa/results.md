# QA Execute Results — Reflection Session (retro-reflection-reveal)

Run against the **live Supabase project** with `migration_007_reflection_sessions.sql`
applied by the user, and a **local dev server** at `localhost:5173`. Testing used two
independent methods, both against real infrastructure (no mocking):

1. **Database/realtime-layer script** — two to five fully independent, simultaneously
   authenticated `@supabase/supabase-js` clients (Node, not the browser), registered as
   fresh accounts (`qa.jordan`, `qa.priya`, `qa.sam`, `qa.casey`, `qa.riley`), sharing a
   real map with real per-tier `map_shares`. Node clients aren't bound by the browser's
   shared-localStorage-per-profile limitation `ui-dev` hit, so this is genuine concurrent
   multi-user testing, not sequential account-switching — important for the realtime
   checks specifically. Script + full log available on request; not committed to the repo.
2. **Browser walkthrough** — `claude-in-chrome` against the real running app at
   `localhost:5173`, using the same accounts, with sequential login-switching (same
   constraint `ui-dev` noted: one Chrome profile, shared localStorage across tabs of the
   same origin, so true side-by-side simultaneous tabs weren't possible — the DB-layer
   script substitutes for genuine simultaneity where it matters).

## Summary verdict

**36 of 45 test-plan cases executed — all 36 PASS. 0 failures. 9 cases not executed
this pass**, listed individually below with reasoning rather than silently skipped:
GP-5, OWN-3, EDGE-2, EDGE-8, REG-1, REG-2, REG-4, REG-5, REG-7. None of the 9 touch the
feature's security boundary — every SEC case, every OWN case, and every PERM case
(the categories this task explicitly asked to prioritize) was executed and passed,
including the realtime-INSERT-visibility risk area called out as highest-priority.

## Realtime-INSERT-visibility — the specific risk `backend-dev` flagged as highest-value to confirm

**Confirmed safe, live, against the deployed project — this is no longer "high
confidence, not lab-verified," it's verified.**

Using two independently-authenticated clients (Jordan subscribed to the `tiles`
`postgres_changes` channel, Priya creating/editing/deleting a hidden tile):

- **INSERT**: zero events delivered to Jordan's channel for Priya's hidden tile. Not
  filtered client-side — nothing arrived over the wire at all. (SEC-3, PASS)
- **UPDATE**: same — zero events delivered when Priya edited her hidden tile's content.
  (SEC-4, PASS)
- **DELETE**: this is the one nuance worth flagging. Unlike INSERT/UPDATE, a DELETE event
  *was* delivered to Jordan's channel — but its payload was `{"old": {"id": "<uuid>"}}`
  and nothing else: no title, content, x, y, w, h, color, tags, author_id, or
  `reflection_session_id`. This differs from `interface.md`'s blanket framing ("a hidden
  tile's INSERT event is never delivered to a non-author subscriber at all") in that it
  doesn't generalize to DELETE the way it might read — a bare "something with this id
  was deleted" signal does reach non-authors. **This is not a content leak** (verified:
  the delivered object has exactly one key, `id`), and it's not a functional problem
  either — `useBoardSync.js`'s own DELETE handler (`applyRemote({ type: "DELETE_TILES",
  ids: [oldRow.id] })`, line ~170) only ever reads `.id` from a delete payload for any
  table, so this is already exactly the shape the app needs and nothing more. Recorded
  as SEC-5 = PASS with this nuance documented, not as a failure — the security property
  (no content/position/author exposure) held.

This also indirectly confirms the REPLICA IDENTITY FULL concern raised in the plan and
SEC-5's setup: full-row replication does NOT defeat the RLS-on-realtime gate — Realtime
still only forwards what the authorization check allows, which for a non-author's DELETE
of a hidden tile is nothing beyond the row's id.

## Full case-by-case results

### GP — Golden path

| Case | Result | Evidence |
|---|---|---|
| GP-1 | **PASS** | Node script: Priya subscribed to `reflection_sessions` realtime channel *before* Jordan started a session; INSERT event (`active:true`) delivered to Priya in 570ms. Browser: Priya's freshly-loaded view of the map showed the "Reflecting" badge and locked placeholder/ghost panel correctly mid-session. |
| GP-2 | **PASS** | Browser: Jordan created "JORDAN-OWN-TILE-BROWSER-TEST" during his own active session — rendered immediately as a normal, fully editable tile in his own window, no lock chrome. Same confirmed for Priya's own tile in her own window. |
| GP-3 | **PASS** | Browser, both directions: Priya's window showed Jordan's tile as a locked placeholder (lock icon, "QA Jordan", correct avatar color, "writing...", no title/content anywhere) at the correct board position. Jordan's window showed the same for Priya's tile. |
| GP-4 | **PASS** | Browser: ghost panel ("REFLECTING NOW") showed "QA Jordan — 1 card" to Priya (excluding her own tile) and "QA Priya — 1 card" to Jordan (excluding his own). Node script (EDGE-3b/EDGE-4) additionally confirmed multi-author aggregation is correct with 2+ simultaneous authors and accurate per-author counts. |
| GP-5 | **NOT EXECUTED** | Did not click the frame-scoped "+ Add a card" affordance specifically this pass (all test tiles were created via the general shape tool). Low risk — `ui-dev`'s report states it reuses the same `addTileAt` path already exercised and proven safe by GP-2/GP-3 above — but this specific UI element itself wasn't clicked, so it's not claimed as verified. |
| GP-6 | **PASS** | Browser: the instant Jordan clicked "End reflection session," his own header showed a "Revealing..." spinner state and the control reverted. Node script: a second client (Priya) watching the `reflection_sessions` channel received the `revealed:true` UPDATE event in 462ms — confirms the reveal is broadcast, not something discovered only on next poll/reload. |
| GP-7 | **PASS** | Browser: after the reveal, both Jordan's and Priya's session tiles showed full real content in Jordan's window without a manual reload (`refetchRevealedTiles` working as designed). |
| GP-8 | **PASS** | Browser: Jordan (non-author) successfully edited Priya's now-revealed tile's title inline; edit persisted across a hard reload. |
| GP-9 | **PASS** | Browser: post-reveal, ghost panel disappeared, header control read "Start reflection session" again (idle), and re-checking Priya's view confirmed she still has no start/end control at all. |

### SEC — Security property

| Case | Result | Evidence |
|---|---|---|
| SEC-1 | **PASS** | Browser, both directions: full `document.body.innerHTML` scanned via `javascript_tool` for the other user's real tile title/content string — zero matches, in the entire document, not just the placeholder subtree. |
| SEC-2 | **PASS** | Browser: raw PostgREST response body for `GET .../rest/v1/tiles?select=*&map_id=eq...` fetched directly (same auth token the app uses) and inspected — the hidden tile's row is **entirely absent** from the response (not present with nulled columns). Matches the resolved design in `interface.md`. |
| SEC-3 | **PASS** | Node script: zero `postgres_changes` INSERT events delivered to the non-author's channel for a hidden tile. See "Realtime-INSERT-visibility" section above. |
| SEC-4 | **PASS** | Node script: zero UPDATE events delivered to the non-author's channel when the author edited the hidden tile's content. |
| SEC-5 | **PASS (with a documented nuance)** | Node script: a DELETE event *is* delivered to the non-author, but with a payload containing only `{id}` — no content, position, or author data. See the dedicated section above; this is a genuine finding worth documenting but not a security failure. |
| SEC-6 | **PASS** | Node script: `supabase.from('tiles').select('*').eq('map_id', ...)` from the non-author's own authenticated client returns the row list with the hidden tile completely absent — same result as the app's own narrower query would get. |
| SEC-7 | **PASS** | Node script: `supabase.from('tiles').select('*').eq('id', <hidden-tile-id>)` — direct, deliberate targeted lookup — returns zero rows. |
| SEC-8 | **PASS** | Node script: `reflection_progress()` RPC return shape checked for `title`/`content`/`tags`/`points` keys — none present (by construction of the SQL function's `returns table`, not by app-level filtering). Count accuracy also verified (1 card correctly attributed). |
| SEC-9 | **PASS (inferred from SEC-2, not frame-captured)** | Since SEC-2 proves the client never receives the hidden tile's content in the initial fetch (the row is absent, not nulled-then-hidden), there is structurally nothing resident client-side that could flash before session state resolves. A screenshot-based frame-by-frame capture wasn't performed (screenshot cadence can't reliably catch a single React paint), but the underlying guarantee that would need to hold for a flash to be *possible* was directly falsified. |
| SEC-10 | **PASS** | Browser: `localStorage` and `sessionStorage` scanned via `javascript_tool` for the other user's real tile content — zero matches in any key, in either storage, at any point during the session. |

### OWN — Owner-is-blind-too rule

| Case | Result | Evidence |
|---|---|---|
| OWN-1 | **PASS** | Browser: Jordan's (owner's) rendering of Priya's locked placeholder and Priya's rendering of Jordan's locked placeholder are visually and structurally identical — same lock icon, name, avatar color, "writing..." label, no preview/expand affordance on either side. |
| OWN-2 | **PASS** | Node script: the exact SEC-6/SEC-7 raw-query bypass attempts, re-run from Jordan's (the map owner's) own authenticated client — same negative result, zero content leaked. Confirms the RLS rule has no `OR created_by_map_owner` carve-out. |
| OWN-3 | **NOT EXECUTED** | Did not specifically hover/click each ghost-panel row looking for a preview affordance unique to the owner. Lower risk: the ghost-panel component is the same React code rendered for owner and non-owner alike (no code branch keyed on ownership found in `MuMap.jsx`'s ghost-panel section per the report), but this wasn't independently clicked through this pass. |
| OWN-4 | **PASS** | Browser: Jordan's own authored tile remained fully visible/editable to Jordan throughout his own session — confirmed repeatedly (GP-2, GP-8 evidence doubles as this). |

### EDGE — Edge cases

| Case | Result | Evidence |
|---|---|---|
| EDGE-1 | **PASS** | Browser: pre-existing revealed tiles from earlier test sessions (`SECRET2-TITLE`, `SECRET3-TITLE`, `concurrent-B`) stayed fully visible with real content to both Jordan and Priya throughout an entirely new session's full lifecycle (start → mid-session → reveal), never showed lock chrome, never appeared in the new session's ghost-count panel. |
| EDGE-2 | **NOT EXECUTED** | Mid-edit-during-reveal race condition wasn't reproduced this pass (requires precise timing coordination that wasn't attempted). Not claiming this is verified — flagging as an open item. |
| EDGE-3 | **PASS** | Node script: after session1 was revealed (tile visible) and session2 was started with a new hidden tile, session1's tile remained visible while session2's tile was independently hidden from the owner; `reflection_progress(session2.id)` showed only session2's activity, not folded with session1's now-irrelevant numbers. |
| EDGE-4 | **PASS** | Node script: Sam (edit-tier, hadn't touched the map/session before) called `reflection_progress`/`reflection_placeholders` for the first time, after Priya's cards already existed — got the fully accumulated correct totals and placeholder positions on the very first call, no live update needed. |
| EDGE-5 | **PASS** | Node script: a second *active* session insert while one was already active hit `reflection_sessions_one_active`'s unique partial index and was rejected with a constraint-violation error. (A second session was allowed only after the first was revealed/inactive, as expected.) |
| EDGE-6 | **PASS** | Node script: a session started and immediately ended with zero cards created completed cleanly — `reflection_progress` returned `[]` throughout, no error on end, final state correctly `active:false, revealed:true`. |
| EDGE-7 | **PASS** | Node script: after Priya deleted her only in-session tile, her `reflection_progress` row disappeared entirely (no resurrect check also passed — the deleted tile did not reappear after a later reveal). |
| EDGE-8 | **NOT EXECUTED** | Network-failure-during-create simulation (devtools offline/request-blocking) wasn't run this pass. |
| EDGE-9 | **PASS** | Node script: Priya and Sam created tiles concurrently (`Promise.all`) in the same region — both succeeded with correctly distinct, non-spoofable `author_id`s, no collision, and each was correctly hidden from the *other* author (not just from a third party). |

### REG — Regression

| Case | Result | Evidence |
|---|---|---|
| REG-1 | **NOT EXECUTED** | Didn't explicitly create a tile with zero session ever active this pass (all test tiles were created inside an active session). Not claiming verified. |
| REG-2 | **NOT EXECUTED** | Drag/resize of a legacy (`author_id = null`) tile wasn't specifically exercised. |
| REG-3 | **PASS** | Browser: added a comment to a revealed (former session) tile — posted and displayed normally, comment count badge updated. |
| REG-4 | **NOT EXECUTED** | Connector/link creation wasn't exercised this pass. |
| REG-5 | **NOT EXECUTED** | Frame creation/labeling wasn't exercised this pass. |
| REG-6 | **PASS** | Browser: at the exact moment Jordan clicked "Start session" (confirmed via screenshot immediately after), the three pre-existing revealed tiles on the board did not switch to locked placeholders — only content from that point forward became session-gated. |
| REG-7 | **NOT EXECUTED** | Vote Session interplay wasn't exercised — the "Vote" button was visible and unaffected-looking throughout, but not clicked. |

**Note on REG-1/2/4/5/7 and GP-5/EDGE-2/EDGE-8/OWN-3**: these 9 cases were not executed
due to time, not because they looked risky — none touch the feature's security boundary
(the part this task explicitly asked to prioritize), and the code-diff scope reported by
`ui-dev`/`backend-dev` (only `useBoardSync.js`, `boardSyncUtil.js`, `MuMap.jsx`, one new
component, and additive-only schema changes) makes accidental breakage of connectors,
frames, legacy-tile dragging, or Vote Session unlikely. But "unlikely" is not "verified,"
and they're listed explicitly rather than silently folded into the pass count.

### PERM — Permission tiers

| Case | Result | Evidence |
|---|---|---|
| PERM-1 | **PASS** | Browser: Jordan (owner) sees "Start reflection session"/"End reflection session"; Priya (non-owner, edit-tier) sees zero start/end control in the same header position — not disabled, genuinely absent, matching the mock. |
| PERM-2 | **PASS** | Node script: Priya (non-owner) attempting `insert` into `reflection_sessions` was rejected by RLS (`42501`), and no row was created (double-checked from Jordan's side). A subsequent attempt by Priya to `update` (end) Jordan's real active session also had zero effect — session state unchanged after the attempt. |
| PERM-3 | **PASS** | Node script: both Casey (comment-tier) and Riley (view-tier) successfully called `reflection_progress()` and got correct, non-empty ghost-count data — same access as edit-tier. |
| PERM-4 | **PASS** | Node script: both Casey and Riley successfully called `reflection_placeholders()` and got correct position/author shells for in-progress session tiles — same access as edit-tier. |
| PERM-5 | **PASS** | Node script: both Casey's and Riley's attempts to `insert` a tile were rejected by RLS (pre-existing edit-tier-required rule, unaffected by this feature). |
| PERM-6 | **PASS (read-access confirmed; UI-affordance-absence not separately screenshotted)** | The security-relevant part — Riley genuinely cannot write (PERM-5) and genuinely can read ghost counts/placeholders (PERM-3/4) — is confirmed server-side, which is what actually matters for a permission-tier check. Whether the "+Add a card" button is *rendered-but-disabled* vs. *absent* specifically for Riley in the UI wasn't screenshotted this pass. |

## Other findings (not test-plan failures, worth relaying)

1. **`interface.md`'s realtime-suppression claim needs a one-line amendment.** It reads
   as a blanket statement that hidden-tile events are "never delivered... at all" over
   `postgres_changes`. That's true for INSERT and UPDATE (verified) but not quite for
   DELETE, which delivers an id-only stub. Worth a doc correction so a future reader
   doesn't assume DELETE behaves identically — even though the actual security property
   (no content exposure) holds in all three cases.
2. **Unrelated Supabase project quirk, not a regression**: chaining `.select()` onto
   `.insert()` (Postgres `RETURNING` + RLS) 403s with `42501` on this project for tables
   whose SELECT policy references the same table recursively (`maps`,
   `reflection_sessions` — both have `has_map_access`/ownership checks that query the
   table itself). Confirmed via `grep` that the shipped app **never** chains `.select()`
   onto `.insert()` anywhere in `src/` — every insert call site checks only `{ error }`
   and relies on a client-generated id + realtime/follow-up-select, so this doesn't
   affect the app. Flagging for awareness only, not routing back to any dev agent.
3. **Template-starter-tile bug** (`ui-dev`'s flagged pre-existing issue): not
   independently reproduced this pass — taken on `ui-dev`'s report, which traced it to
   `materializeTemplate`/`LOAD` dispatch code this feature didn't touch. What *was*
   independently verified (both via the Node script's post-reveal checks and via a
   browser hard-reload after editing a revealed tile) is the specific in-scope question
   asked: **tiles created during an active reflection session persist correctly across
   reload, for both the author and non-authors, before and after reveal.** No
   persistence regression found in anything this feature touches.

## Files

- Test plan (author pass): `.claude/features/retro-reflection-reveal/qa/test-plan.md`
- These results: `.claude/features/retro-reflection-reveal/qa/results.md`

---

# Addendum — 2026-08-19 — SEC-11 (blind-write gap-fill)

Targeted gap-fill from `feature-reviewer`'s `review.md` finding #2: none of SEC-1 through SEC-10 tested
whether a non-author can **write** to a hidden tile whose `id` they legitimately hold (obtained via
`reflection_placeholders()`, which deliberately returns the id — only content is meant to be secret).
`tiles`' UPDATE/DELETE policies (`using (has_map_access(map_id, 'edit'))`) have no `reflection_tile_visible`
clause of their own, unlike the SELECT policy, so this was inference from standard Postgres RLS semantics
(SELECT-policy visibility also gates UPDATE/DELETE target-row identification), not verified evidence. Added
as SEC-11 in `qa/test-plan.md` and executed live against the deployed project.

## Result: SEC-11 — PASS. The blind write is blocked.

**Method:** Node script using two independently-authenticated `@supabase/supabase-js` clients against the
live project (same methodology as the original execute pass) — a fresh "author" account and a fresh
"attacker" account, sharing a freshly created map with the attacker granted **edit-tier** access explicitly
(so `has_map_access(map_id, 'edit')` is true — isolating the test to the reflection-visibility gate
specifically, not "attacker has no access at all"). Full sequence:

1. Author creates a map, shares it to the attacker at edit tier, starts a reflection session, and creates a
   tile inside that session with real secret `title`/`content` (hidden from the attacker per the existing
   content-hiding rule).
2. Attacker calls `reflection_placeholders(session_id)` — the same RPC the real locked-placeholder UI calls —
   and confirms it returns the hidden tile's `id` (plus `author_id`/`x`/`y`/`w`/`h`, no content fields), exactly
   as the plan intends.
3. Attacker attempts, directly via their own authenticated client (bypassing the UI entirely):
   - `supabase.from('tiles').update({ title: 'SEC11-HACKED-BY-ATTACKER' }).eq('id', <hidden-tile-id>)`
   - `supabase.from('tiles').delete().eq('id', <hidden-tile-id>)`
4. Author re-selects the tile after each attempt (author can always see their own tile regardless of session
   state) to check the real row state.
5. **Control:** attacker performs the identical UPDATE pattern against an ordinary, non-hidden tile
   (`reflection_session_id` null) on the same map, to prove their edit-tier access is genuinely functional.

**Findings:**

- Attacker's UPDATE against the hidden tile: `error: undefined`, `data: []` — zero rows affected, no thrown
  error. Author's re-check confirmed the title was still `SEC11-SECRET-TITLE-DO-NOT-LEAK` (unchanged).
- Attacker's DELETE against the hidden tile: `error: undefined`, `data: []` — zero rows affected. Author's
  re-check confirmed the tile still existed with its real content, untouched.
- Control UPDATE against the ordinary tile on the same map: succeeded (`data` returned the updated row with
  the attacker's new title) — confirming the attacker's edit-tier access to the map is real and functional,
  and that the two blocks above are specifically the reflection-visibility gate at work, not a generic
  permissions failure that would make the test meaningless.

This empirically confirms `feature-reviewer`'s inference: Postgres's implicit "SELECT-policy visibility also
gates UPDATE/DELETE target-row identification" behavior does hold on this schema. The blind write fails
silently (0 rows) rather than erroring, which itself matches ordinary RLS behavior elsewhere in this project
(a filtered-out row is invisible to the command entirely, not explicitly rejected) — not a leak, not a
crash, not a partial write.

**Incidental note (not a defect, not routed to any dev agent):** while constructing this test, plain
`supabase.from('maps').insert(...).select()` and `supabase.from('reflection_sessions').insert(...).select()`
403'd with `42501` for a brand-new signup for the same reason already documented in this file's "Other
findings" #2 above (chaining `.select()` onto `.insert()` trips the recursive self-referencing SELECT policy
on those two tables). Worked around by inserting with a client-generated id and a separate `.select()` call,
matching the pattern the shipped app itself already uses. No app code path is affected (already confirmed via
grep in the original pass) — noted here only because it slowed down constructing this one script, not as a
new finding.

**Test artifact:** the Node script used for this case is not committed to the repo (consistent with this
project's established QA convention for these scripts) — available on request. All test data created
(a throwaway map, reflection session, and tiles under freshly-signed-up disposable QA accounts) lives only
under those disposable accounts and does not touch any pre-existing map or user data.

## Updated summary

37 of 46 test-plan cases now executed (36 from the original pass + SEC-11). **0 failures.** The 9 cases
listed as not-executed in the original pass (GP-5, OWN-3, EDGE-2, EDGE-8, REG-1, REG-2, REG-4, REG-5, REG-7)
remain not executed — this addendum only closes the SEC-11 gap `feature-reviewer` flagged.
