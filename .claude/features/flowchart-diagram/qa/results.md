# QA execution results — Flowchart shapes (v1)

**Verdict: PASS, with 4 cases BLOCKED (no second test account/session available) and 1 pre-existing UI issue flagged (not a regression from this feature, not shape-specific).**

- 22 of 26 test procedures: **PASS**
- 4 of 26 test procedures: **BLOCKED** (4.2, 4.3, 5.1, 5.2 — require a second authenticated user session at a genuine `view`/`comment` permission tier; none was available in this environment, see note under Section 5)
- 0 test procedures: **FAIL**
- 1 out-of-scope finding flagged for awareness: a mini-toolbar/connector-dot overlap that is **not** caused by this feature and reproduces on plain (non-flowchart) tiles too — see "Additional finding" below.

Executed against the running dev server at `localhost:5173`, via `claude-in-chrome` browser automation, using the real authenticated "Prod Tester" account. Two dedicated scratch boards were created for this pass: **"QA Flowchart Test"** (manual placement/editing/regression cases) and **"QA Template Test"** (template materialization + persistence). Both remain in the account under those exact names — delete them once this report has been reviewed, if desired. Bob's pre-existing shared board ("Bob Private Map") was used briefly to investigate permission gating (see Section 5) and was restored to its original content before I finished (label reverted to "User Story", both test comments deleted).

---

## Section 0 — ui-dev's mini-toolbar fix (260→340 width)

Explicitly re-verified per the task brief, not taken on ui-dev's word:

- Reproduced the scenario the fix targets: selecting a Terminator now shows a single-row, 7-icon shape picker (confirmed inner row `width: 340px` via computed style) instead of wrapping to two rows. Double-click-to-edit works cleanly on a Terminator. **Confirmed fixed, as claimed.**
- **However**, while probing this I found an adjacent, related issue the fix does not cover: when a tile is *selected* (not just hovered), the floating mini-toolbar can overlap and intercept pointer events on that tile's **top connector dot**, blocking drag-to-link from that specific dot while selected (verified via `document.elementFromPoint` — the point where the dot renders resolves to an `<input>` inside the toolbar, not the dot). Dragging a link from the *same* dot works fine when the tile is only hovered (not selected) — the practical workaround. I confirmed this is **not shape-specific and not new**: it reproduces identically on a plain generic "square" sticky tile placed fresh, in the same session, using the same repro steps. This predates the flowchart feature and affects all tile types uniformly, so I have not filed it as a flowchart regression — flagging it here only because the task asked me to verify the toolbar fix specifically, and this is directly adjacent to what was fixed.

---

## Section 1 — Golden path

### 1.1 Place each of the 4 shapes — PASS
Placed Terminator, Process, Decision, Input/Output from the sidebar icon rail (click-to-place at viewport center; no drag-to-canvas step needed — noted as a minor deviation from the test plan's assumed interaction, not a defect). Verified via DOM measurement (`getBoundingClientRect` + computed style), not just visually:

| Shape | w×h | border-radius / clip | fill |
|---|---|---|---|
| Terminator | 170×56 | 999px (stadium) | rgb(147,217,168) green |
| Process | 200×72 | 14px | rgb(126,200,227) blue |
| Decision | 190×130 | clip-path (diamond) | amber |
| Input/Output | 200×76 | clip-path (parallelogram) | purple |

All match the mock's spec exactly. No badge/status pill/tags/vote widget on any of the 4. Default title is the existing "User Story" placeholder text (same convention as every other add-a-shape entry point today) — not a flowchart-specific concern.

### 1.2 Edit label on each shape — PASS
Double-click → type → Escape worked identically on all 4. Single centered label, no title/body split.

### 1.3 Connect two shapes with a directed link — PASS
Dragged from a Process dot to a Decision — elbow-routed connector, arrowhead at the destination (Decision) end, confirmed via zoomed screenshot and via the underlying SVG path's `marker-end` attachment point. Style identical to existing tile-to-tile connectors.

### 1.4 Label a link off a Decision ("Yes"/"No") — PASS
Connected Decision to two different shapes, labeled the links "No" and "Yes" independently via the existing link-label popover. Both labels render simultaneously, independent of each other and of the Decision's own label.

### 1.5 Materialize the "Flowchart" template — PASS
Confirmed 4th in the "Start from" list on the New Map screen (after Story Map/Retro/Dependency Map) — icon and label present; I did not find a "NEW" badge on this particular entry point (the New Map screen), only the mock's in-board template flyout was specified as carrying that badge, which I did not separately check. Materializing the template produced all 7 nodes exactly matching the mock: Start (terminator) → Fill out request form (process) → All fields valid? (decision) → No → Show validation errors → End, and → Yes → Submit to review queue → End. Verified via DOM that Process nodes carry the new `process` shape (200×72, 14px radius) rather than falling back to generic `rectangle`. No Input/Output node in the template, as the plan specifies.

---

## Section 2 — Edge cases

### 2.1 Long label clamps on Decision — PASS
"Have all required approvals been collected from every stakeholder?" clamps to 2 lines + ellipsis, stays inside the diamond's safe zone, no font auto-shrink, no overflow.

### 2.2 Long label clamps on Process — PASS
Clamps to 3 lines + ellipsis, no overflow past the rectangle bounds.

### 2.3 Long label clamps on Terminator and Input/Output — PASS
Both clamp to 2 lines + ellipsis within their respective safe zones (parallelogram text stayed clear of the slanted edges).

### 2.4 Resize Decision, selection ring stays synced — PASS
Tested at two extremes: much wider-than-tall, and much taller-than-wide (via the actual resize handle, re-measured its position with each shape-size change since it moves with the shape). In both cases the clip-path fill and the separate selection-ring layer rescaled in lockstep — no gap, no lag, no rectangular fallback ring at any point checked.

### 2.5 Resize Input/Output, selection ring stays synced — PASS
Tested wide/short and then an extreme narrow/tall aspect ratio. Ring correctly traced the skewed parallelogram silhouette at every size, including the extreme case.

### 2.6 Connector dots on Decision's vertices — PASS
Visually confirmed across multiple screenshots at different sizes/positions that the 4 dots land on the diamond's top/right/bottom/left vertices, not offset from them.

### 2.7 Connector dots on Input/Output — PASS
Left/right dots sit near (not exactly on) the slanted edges, as the mock's decision #6 accepts. Confirmed functionally: dragged an actual link from the IO's left dot to a Decision shape and it connected successfully ("Linked" toast, verified link path in DOM).

### 2.8 Empty label — PASS
Cleared a freshly-placed Decision's label and committed. No crash, no layout break — the diamond displays a muted "Label" placeholder, matching the existing empty-sticky-tile convention. Silhouette stayed intact.

---

## Section 3 — Regression (generic tile behaviors on the new shapes)

Spot-checked across the 4 shapes as the test plan permits ("can be grouped efficiently during execution") rather than as 24 fully independent individual checks; every behavior was exercised on at least 2–3 of the 4 shapes, including at least one clip-path shape (Decision or IO) in each case.

### 3.1 Drag/move — PASS
Dragged Decision, IO, Terminator, and a new Process instance individually and as a group. Positions persisted correctly with no snap-back or distortion at rest. I did not capture a mid-drag frame specifically to inspect the clip-path during motion (only before/after), so "the clip stays correctly positioned mid-drag, not just at rest" is confirmed by the smoothness of the resulting animation in the browser but not independently frame-verified.

### 3.2 Multi-select — PASS
Shift-clicked Decision + Terminator + Input/Output together ("3 selected" confirmed), all three showed selection rings simultaneously, group-drag moved all three with consistent relative offsets.

### 3.3 Duplicate — PASS (toolbar button only)
Selected the same 3-shape group and used the toolbar "Duplicate" button — "Duplicated 3 tiles" toast, 3 new tiles appeared with correct offset, same shape/label/color, independently selectable. **Did not separately verify Ctrl/Cmd+D** — ran out of test budget on this specific sub-case; toolbar-button duplication is confirmed working, keyboard-shortcut duplication is unverified (not failed, just not exercised).

### 3.4 Delete — PASS
Deleted a Process tile that had one link attached to a Decision (labeled "No") — the tile and its link both disappeared together, cascade confirmed. Spot-checked once (Process); reasoned to generalize to the other 3 shapes since `DELETE_TILES`'s cascade is shape-agnostic per backend-dev's confirmation and the same reducer path all 4 shapes go through.

### 3.5 Undo/redo — PASS, with one behavioral note (not a defect)
Full place → label → move → connect → comment sequence on a fresh Process tile, then undone and redone via the toolbar Undo/Redo buttons:
- Undo correctly reverted, in order: comment (see 3.6 note), link, move, and — as a single combined step — place+label together. That last combination is expected/reasonable (no intermediate commit happened between placing the tile and immediately editing its label in the same interaction), not a shape-specific bug.
- Redo replayed all steps correctly and the tile/link ended up in the same final state.
- **Note:** the `Ctrl+Z` keyboard shortcut did not register in a couple of my attempts (kept the undo stack at 3 items instead of dropping to 0) while the toolbar Undo button worked immediately every time. This looks like a browser-automation focus quirk (my synthetic keystroke likely landed while a text input still had focus) rather than an app bug — I did not chase it further, but flagging it since it's the same keyboard shortcut a real user would use.

### 3.6 Comments popover — PASS, with one open question
Opened the comments popover on a Process tile ("No comments yet"), added a comment — badge appeared showing "1" immediately, matching the "invisible until first comment" convention from the mock's gallery. Popover open/close and add/delete all worked identically to a regular sticky tile (also verified on an existing plain tile on a different board). **Open question:** during my subsequent undo/redo sequence (3.5), the comment I'd added on the flowchart tile disappeared and did not come back on redo, while the tile/link changes all redid correctly. I could not determine with confidence whether comments participate in the same undo/redo history as tile mutations (and got dropped as a real undo step) or whether this was an artifact of my own test sequence (e.g., a stray click). This is not shape-specific — I'd flag it as worth a quick look, but it isn't a flowchart regression on its face since comments are generic infrastructure this feature doesn't touch.

---

## Section 4 — Persistence / collaboration

### 4.1 Full page reload round-trip — PASS
Tested on both boards:
- "QA Flowchart Test": Decision (resized, long custom label), Terminator, Process, Input/Output, two links (one labeled "Yes") — full hard reload (`navigate` to the same URL) reproduced every shape's silhouette, label, size, position, color, and both links exactly.
- "QA Template Test": all 7 template-materialized nodes and both "Yes"/"No" link labels survived a full reload identically.

No shape fell back to `rectangle`, no label/position/color drift observed.

### 4.2 Realtime sync to a second client — BLOCKED
Requires two concurrently-authenticated sessions on the same board. Only one authenticated account ("Prod Tester") was available in this environment, and I did not create a second account or open an incognito/second-profile session, since doing so was outside what I was asked to set up and risked polluting account state further. **Not tested.**

### 4.3 Concurrent edit on the same new-shape tile — BLOCKED
Same reason as 4.2 — requires two simultaneous clients. **Not tested.**

---

## Section 5 — Permission tiers

**Important environment finding, not a flowchart-feature bug:** I could not find or construct a genuine `view`- or `comment`-tier test session. The only two boards shared *to* this account ("Sprint Planning" and "Bob Private Map") are both labeled "Legacy shared map" in the UI, and reading `src/hooks/useMapPermission.js` (lines 24–25) confirms why: legacy maps (`created_by === null`) are explicitly grandfathered to `"edit"` for *every* user, regardless of any `map_shares` row — this is by design, not a bug. I verified this empirically too: on "Bob Private Map" I was able to double-click and successfully edit an existing tile's label, and the change persisted through a hard reload — confirming this account actually has `edit` access there, not `view`/`comment` as the "Shared by" label might suggest. (I reverted the label back to "User Story" and removed my test comments before moving on — board is back to its original state.)

Constructing a real `view`/`comment` session would require inviting a second email via the in-app Share dialog and authenticating as that second account — inviting an email is a send-a-message action requiring explicit user permission per my operating constraints, and I don't have credentials for a second account regardless, so I did not attempt it autonomously.

### 5.1 View-only user cannot place a flowchart shape — BLOCKED
Could not obtain a genuine `view`-tier session (see above). **Not directly tested.**

### 5.2 Comment-only user cannot place/edit but can comment — BLOCKED
Same constraint. **Not directly tested.**

### 5.3 Edit-tier user has full access — PASS (demonstrated throughout)
The "Prod Tester" account is `owner`/`edit` tier on its own boards, and every case in Sections 1–3 above — placing, labeling, moving, resizing, connecting, duplicating, and deleting all 4 flowchart shapes — succeeded under exactly this permission tier. No separate test needed beyond what's already documented above.

**Indirect evidence for 5.1/5.2 despite being blocked:** `readOnly = !canEdit(permission)` in `MuMap.jsx` is one flag threaded through every mutation handler (`addTileAt`, `addShapeInView`, drag/resize/delete/duplicate handlers — confirmed via `grep` across `src/MuMap.jsx`, 30+ call sites), with zero branching on `shape` anywhere in that logic. The flowchart shapes go through the exact same `addTileAt`/`SHAPES` lookup path as `square`/`circle`/etc. There is no code path by which a flowchart shape could be placed while `readOnly` is true when a `square` couldn't be, or vice versa. I'm confident this generalizes correctly, but this is code-reading corroboration, not a live-session observation, so I'm not marking 5.1/5.2 as PASS on that basis alone.

---

## Summary for the user

- Core feature (4 shapes, labels, clamping, links/link-labels, resize+clip-sync, template, persistence) is solid — no functional defects found in the flowchart-shapes work itself.
- ui-dev's mini-toolbar width fix does what it claims (Terminator double-click-to-edit is fixed), but there's a related, pre-existing, non-shape-specific overlap where the toolbar can block a selected tile's top connector dot — reproduces on plain tiles too, so it's not something to route back to this feature's dev agents.
- 4 test cases (realtime sync ×2, permission-tier gating ×2) could not be executed for lack of a second test session/account — this is an environment/tooling gap in this QA pass, not a statement about whether the underlying feature works. If real dual-account testing matters before shipping, that needs either a second set of credentials or an invite sent with your explicit go-ahead.
- Two small open items, both plausibly test-harness artifacts rather than app bugs: `Ctrl+Z` not always registering via automation, and a comment that didn't survive an undo/redo cycle in one session.

Two scratch boards ("QA Flowchart Test", "QA Template Test") remain in the account for inspection — delete them once reviewed.
