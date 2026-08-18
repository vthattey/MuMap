# Test plan — Flowchart shapes (v1)

Author: qa-engineer (author mode). Derived from `plan.md` (approved 2026-08-18) and
`mock/v1.html` (approved). Not executed yet — `ui-dev`/`backend-dev` are building in
parallel with this pass.

**Test runner note:** this repo has no test runner configured (`package.json` has only
`vite`/`vite build`/`vite preview` scripts; no `vitest`/`jest`/`@testing-library/*` in
`devDependencies`, and no existing `*.test.*` files anywhere under `src/`). Per my
instructions, runnable skeletons are not required in that situation — the cases below
are written as concrete manual/browser-automation steps instead. If `ui-dev` or
`backend-dev` introduces a test runner as part of this feature, flag that to me and I'll
port the pure-logic cases (Section 2 particularly — `SHAPES`, `makeTile`, template
`materialize`) into real test files; they need no DOM/React rendering and are the
cheapest ones to automate.

Baseline facts confirmed by reading the current (pre-feature) code, so the cases below
test against real mechanisms rather than assumptions:
- `SHAPES` lives in `src/lib/boardModel.js` as a plain `{ key: {label, w, h} }` map;
  `makeTile(type, shape, x, y, overrides)` looks up dims from it and defaults to
  `SHAPES.rectangle` if the key is missing.
- Shape-specific rendering is currently a binary `isCircle = t.shape === "circle"` in
  `TileNode.jsx` — the plan calls for this to become shape-driven for the 4 new keys.
- `tileGeometry.js` already centralizes dot-position/resize-handle geometry (`SIDES`,
  `dotPositionStyle`) — the plan says clip-path shapes' ring/dots should extend this,
  not fork it.
- Board mutation (add/move/resize/delete/link) is gated by one flag, `readOnly = !canEdit(permission)`,
  computed once in `MuMap.jsx` from `useMapPermission` and threaded through every handler
  (`addTileAt`, `duplicateSelection`, `deleteSelection`, drag/resize handlers, etc.).
  `canEdit` (in `src/lib/permissions.js`) is `false` for `view` and `comment` tiers, `true`
  for `edit`/`owner`. Since the plan does not introduce a new gate for flowchart shapes,
  this single flag is what permission cases below are testing.
- Templates: `TEMPLATES` array in `src/lib/templates.js`, materialized via
  `materializeTemplate(template, originX, originY)`, which remaps blueprint-local ids to
  real ids via `makeTile`/`makeFrame`/`makeLink` and returns `{tiles, links}` fed into the
  same `LOAD`-compatible board shape used by import/export.
- Undo/redo: `useUndoReducer` wraps the board reducer; actions marked `_silent` (in-progress
  drag/resize, or remote-applied changes) don't enter history — relevant to the "drag doesn't
  create 50 undo steps" case below.
- Duplicate = Ctrl/Cmd+D → `duplicateSelection()`; also a toolbar button.

---

## 1. Golden path

### 1.1 Place each of the 4 shapes from the sidebar
**Setup:** Open a board with edit permission, empty canvas.
**Action:** For each of Terminator, Process, Decision, Input/Output: click its sidebar icon
(or drag, per whatever interaction `ui-dev` lands on — the mock only shows click-to-add
via existing shape-row convention), then click/drop on empty canvas.
**Expected:** A new tile appears at the default size the mock specifies (Terminator
170×56, Process 200×72, Decision 190×130, Input/Output 200×76), with the shape's default
fill color (one of the 4 `SWATCHES` colors — green/blue/amber/purple per decision #2 in
the mock), correct silhouette (stadium / rounded-rect / diamond / parallelogram), and no
badge/status pill/tags row/vote widget — just a centered placeholder or empty label as
add-then-edit convention dictates.

### 1.2 Edit label on each shape
**Setup:** One of each of the 4 shapes placed on the board.
**Action:** Double-click (or whatever the existing sticky-tile edit trigger is) each shape,
type a short label (e.g. "Start" for Terminator, "Do the thing" for Process, "OK?" for
Decision, "Record" for Input/Output), commit (blur/Enter).
**Expected:** Label renders centered inside the shape, single label only (no title/body
split — reusing the Tier-2 lean "text tile" editing precedent per the plan). Label
persists in local state immediately.

### 1.3 Connect two shapes with a directed link
**Setup:** A Process and a Decision shape placed on canvas, some distance apart.
**Action:** Drag from one of the Process shape's 4 connector dots to the Decision shape.
**Expected:** An elbow-routed, directed connector is drawn between them (existing Tier-1
connector behavior, unchanged) — arrowhead at the destination end, same visual style as
connectors between two ordinary sticky tiles.

### 1.4 Label a link off a Decision ("Yes"/"No")
**Setup:** A Decision shape connected to two other shapes (e.g. two Process shapes, or
Process + Terminator) via two separate outgoing links.
**Action:** Label one link "Yes" and the other "No" (via whatever the existing link-label
edit affordance is — click the link / a label field on select).
**Expected:** Both labels render on their respective connectors, positioned along the
link path (per mock's example, roughly centered on the horizontal run), independent of
each other and of the Decision node's own label ("All fields valid?" in the mock).

### 1.5 Materialize the "Flowchart" template end-to-end
**Setup:** Empty board (template insertion typically requires `tiles.length === 0` per
existing gating seen in `MuMap.jsx`, same as other templates — confirm this rule applies
identically to Flowchart, no special-casing).
**Action:** Open the templates flyout (sidebar "Insert a template" icon), select
"Flowchart" (should appear 4th in the list, after Story Map/Retro/Dependency Map, marked
"NEW" per mock).
**Expected:** Board populates with, at minimum, a Start terminator → Process → Decision →
two labeled branches ("Yes"/"No") → two End terminators, matching the mock's example
layout (section (c)) in shape/label/connector structure (exact pixel coordinates aren't
the contract — the shape sequence, link directions, and Yes/No labels are). All tiles use
`shape` values from the new `SHAPES` keys, not generic `rectangle`/`square`/`circle`
except where a plain rectangle Process legitimately uses the new `process` shape key (per
plan's "Decided: Process gets its own shape key" section — confirm Process nodes carry
`shape: "process"`, not `shape: "rectangle"`, in the materialized board).

---

## 2. Edge cases

### 2.1 Long label clamps on Decision (2 lines + ellipsis, no overflow)
**Setup:** A Decision shape at default size (190×130).
**Action:** Set its label to the mock's example long string: "Have all required approvals
been collected from every stakeholder?"
**Expected:** Label clamps to 2 lines with a trailing ellipsis, stays inside a centered
safe zone clear of the diamond's sloped edges (mock uses ~62% width), text never
overflows outside the diamond's silhouette, font size does not auto-shrink.

### 2.2 Long label clamps on Process (3 lines + ellipsis)
**Setup:** A Process shape at default size (200×72).
**Action:** Set its label to the mock's example: "Notify the billing team and finance
lead once the invoice has been fully reconciled".
**Expected:** Clamps to 3 lines + ellipsis, no overflow past the rectangle's bounds, no
font auto-shrink.

### 2.3 Long label clamps on Terminator and Input/Output
**Setup:** One Terminator, one Input/Output shape at default size.
**Action:** Set each label to a string clearly long enough to overflow at default font
size (e.g. "Initialize the entire system and all downstream services" on Terminator;
"Aggregated customer and billing record from the warehouse" on Input/Output).
**Expected:** Terminator clamps at 2 lines + ellipsis (mock's `.terminator-label` class,
smaller font); Input/Output clamps at 2 lines + ellipsis inside its own safe zone clear
of the slanted edges (mock's `.io-label`, ~74% width). Neither overflows the shape
silhouette.

### 2.4 Resize a Decision shape, selection ring still traces the diamond
**Setup:** A Decision shape placed and selected.
**Action:** Drag its resize handle to make it substantially wider-than-tall, then
separately substantially taller-than-wide (test both directions, not just one).
**Expected:** The diamond silhouette (fill) rescales correctly to the new bounding box in
both cases, AND the selection ring (mock's second clip-path layer behind the fill, per
decision #5) rescales in lockstep — no visible gap, no ring lagging one frame behind, no
ring rendering as a rectangle around the new bounding box. This is flagged in the plan/mock
as a real implementation risk (two separately-clipped layers must stay in sync on resize),
not a cosmetic nice-to-have — test it deliberately at multiple aspect ratios, not just the
default proportions.

### 2.5 Resize an Input/Output (parallelogram) shape, selection ring still traces correctly
**Setup:** An Input/Output shape placed and selected.
**Action:** Resize it larger and smaller, and to an extreme aspect ratio (very wide and
short; very narrow and tall).
**Expected:** Same as 2.4 — clip-path fill and ring stay in sync at all sizes tested, ring
follows the parallelogram's skewed silhouette, not a bounding rectangle.

### 2.6 Connector dots and resize handle on Decision's slanted... vertices
**Setup:** A Decision shape, hover to reveal connector dots.
**Action:** Visually inspect dot positions relative to the diamond's 4 vertices.
**Expected:** Per the mock (decision #6), the existing 4-bounding-box-side dot positions
happen to land exactly on the diamond's top/right/bottom/left vertices — confirm this is
still true after `ui-dev`'s implementation (i.e., dots aren't visibly offset from the
vertices).

### 2.7 Connector dots on Input/Output (parallelogram) — approximation, not exactness
**Setup:** An Input/Output shape, hover to reveal connector dots.
**Action:** Visually inspect the left/right dot positions relative to the slanted edges,
and try actually dragging a link from the left and right dots.
**Expected:** Per the mock (decision #6), left/right dots sit near — not exactly on — the
slanted edge, the same approximation already accepted for circular tiles today. This is
NOT a bug to file as long as the dot is close enough to the shape to read as "belonging"
to it and is still practically grabbable/draggable to start a connector. Do verify the
dot is still clickable/functional (drag-to-connect actually starts a link), since that's
the real bar per the task brief — not pixel-exact placement.

### 2.8 Empty label
**Setup:** Any of the 4 new shapes placed fresh.
**Action:** Leave label empty (don't type anything), commit/blur immediately.
**Expected:** No crash, no layout break (e.g., diamond doesn't collapse or show a stray
ellipsis-only artifact); shape displays with empty/placeholder label same as an empty
sticky tile today.

### 2.9 Sidebar icons render and are distinguishable at small size
**Setup:** Sidebar visible.
**Action:** Visually inspect the 4 new shape icons in the shape row (after Circle, before
Text per mock's ordering).
**Expected:** Each icon is a distinct, recognizable glyph (stadium/rect/diamond/parallelogram
per mock's decision on icon choice) — not blank, not visually identical to an existing icon,
not overlapping/clipped at 18px.

---

## 3. Regression — existing generic tile behaviors on the 4 new shapes

For each of 3.1–3.6, run once per shape (Terminator, Process, Decision, Input/Output) —
4 shapes × 6 behaviors = 24 concrete checks, though they can be grouped efficiently during
execution (e.g. one multi-select test covering all 4 at once for 3.2).

### 3.1 Drag/move
**Action:** Drag the shape to a new canvas position.
**Expected:** Moves smoothly, position persists, no jump/snap-back, no distortion of the
shape's silhouette while dragging (clip-path shapes especially — confirm the clip stays
correctly positioned mid-drag, not just at rest).

### 3.2 Multi-select
**Action:** Shift-click or lasso-select the shape together with an existing sticky tile
and another new shape.
**Expected:** All selected show selection affordance simultaneously; group drag moves all
together; selection count/behavior matches existing multi-select semantics.

### 3.3 Duplicate (Ctrl/Cmd+D and toolbar button)
**Action:** Select the shape, duplicate via keyboard shortcut and separately via the
toolbar "Duplicate" button.
**Expected:** A copy appears (offset per existing duplicate convention), same `shape`
value, same label, same color, independently selectable/movable from the original. If
duplicating a Decision/Input-Output that's connected to a link, confirm duplicate-link
behavior matches existing tiles (mock/plan doesn't call for connected links to be
duplicated automatically — verify actual behavior matches what already happens for
regular tiles, i.e. no scope drift either direction).

### 3.4 Delete
**Action:** Select the shape (and a link attached to it, if any), delete via keyboard
(Delete/Backspace) and toolbar.
**Expected:** Tile removed from board; any links referencing it are also removed
(`DELETE_TILES` reducer case already cascades this) — confirm cascade still fires
correctly for the new shape kinds.

### 3.5 Undo/redo
**Action:** Place a new shape, edit its label, move it, connect it to another shape —
then undo each step in sequence, then redo each step.
**Expected:** Each undo reverts exactly one logical action (place → undo removes it;
label edit → undo reverts label; move → undo reverts position; connect → undo removes
link), redo replays them in order, no shape-specific corruption of the undo stack (e.g.
clip-path shapes don't leave the ring/fill out of sync after an undo).

### 3.6 Comments popover
**Action:** Open the comments popover on the shape (comment icon/badge), add a comment.
**Expected:** Comment badge appears with count once ≥1 comment exists (matches mock's
"badge is invisible until first comment" behavior — see gallery Terminator with no badge
text vs. Process showing "2"); popover opens/closes identically to a regular sticky tile's;
comment persists.

---

## 4. Persistence / collaboration

### 4.1 Full page reload round-trip
**Setup:** Place one of each of the 4 new shapes on a board, with distinct labels, at
least one connected by a link with a label.
**Action:** Reload the page (F5 / hard refresh).
**Expected:** All 4 shapes reappear with correct `shape` value (rendering the right
silhouette, not falling back to `rectangle`), correct label, correct position/size,
correct color; the link and its label also survive.

### 4.2 Realtime sync to a second client
**Setup:** Same board open in two separate browser sessions/tabs (or two authenticated
users) with edit permission.
**Action:** In client A, place a Decision shape, label it, connect it to a Process shape
with a "Yes" labeled link. Observe client B.
**Expected:** Client B receives the new tiles/link via realtime sync without a manual
reload, rendering the same shape/label/link-label as client A — this is the QA-side
verification of whatever `backend-dev` confirms about `shape` passing through as opaque
text with no schema constraint (plan's "Data model impact" section). If sync lags or
drops the `shape` field (e.g. arrives as `undefined` and falls back to a default), that's
a fail worth flagging precisely, since the plan explicitly calls this out as the one
thing `backend-dev` must confirm rather than assume.

### 4.3 Concurrent edit on the same new-shape tile
**Setup:** Same board, two clients, both viewing a shared Decision tile.
**Action:** Client A edits the label while client B simultaneously moves the tile.
**Expected:** Consistent with however MuMap already resolves concurrent tile edits for
existing shapes today (last-write-wins or field-level merge, whatever the current
behavior is) — the new shapes shouldn't behave differently or corrupt state (e.g. shape
value shouldn't get dropped/reset by a concurrent unrelated-field update). Note: if the
project's realtime model doesn't actually do field-level merging (worth confirming from
`useBoardSync`/`boardSyncUtil.js` rather than assuming), the case is really "no regression
vs. today's behavior for any other tile," not a demand for merge semantics that don't
otherwise exist.

---

## 5. Permission tiers

### 5.1 View-only user cannot place a flowchart shape
**Setup:** Board shared with a user at `view` permission (per `mapShares`/`useMapPermission`).
**Action:** As that user, attempt to click/drag a flowchart shape sidebar icon onto canvas.
**Expected:** No tile is added — `readOnly` (derived from `canEdit(permission)` being
`false` at `view`) blocks `addTileAt` exactly as it already blocks placing a Square/Circle
today. No special-case exception exists for flowchart shapes to be placeable at `view`.

### 5.2 Comment-only user cannot place or edit a flowchart shape, but can still comment
**Setup:** Board shared with a user at `comment` permission.
**Action:** Attempt to place a flowchart shape; separately, attempt to edit the label of
an existing flowchart shape placed by another user; separately, add a comment to an
existing flowchart shape.
**Expected:** Placement and label-edit are both blocked (`canEdit` is `false` at
`comment`, same gate as 5.1). Commenting succeeds (`canComment` is `true` at `comment` —
this tier exists specifically to allow commenting without editing), and this holds
identically for the new lean shapes as for regular sticky tiles — commenting was
deliberately kept available per the plan's "why" ("generically useful as annotation on
any tile").

### 5.3 Edit-tier user has full access
**Setup:** Board shared with a user at `edit` permission (not `owner`).
**Action:** Place, label, move, resize, connect, delete a flowchart shape.
**Expected:** All succeed — `edit` clears the `canEdit` gate. (Sanity check that the
permission cases above are testing the intended boundary, not something orthogonal to
edit/view.)

---

## Case count by category

- Golden path: 5
- Edge cases: 9
- Regression: 6 behaviors × 4 shapes (grouped as 6 test procedures, 24 shape/behavior checks)
- Persistence/collaboration: 3
- Permission tiers: 3

**Total distinct test procedures: 26** (6 of which — Section 3 — are each run once per
each of the 4 new shapes, i.e. 24 individual pass/fail checks when executed).
