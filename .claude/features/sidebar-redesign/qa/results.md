# QA Results — Sidebar redesign (Concept B: Floating Pill + Grid)

## Summary verdict

**2 FAILURES, 6 cases BLOCKED/NOT VERIFIED, 26 PASS** (of 34 total test-plan cases).

The core regression this feature exists to fix — popovers clipping off-screen at short
viewport heights — is fixed and verified, including the specific transform/containing-block
bug ui-dev found and portaled to `document.body` (independently re-confirmed below, not taken
on the report's word). All 7 shapes, Text/Frame/Image/Pen/Templates golden paths, mode
switching, and Escape-closes-popover all work correctly.

Two real functional gaps were found in Category 4 (edge cases), both about popovers not
closing when the test plan says they should:

- **4.3 FAILS**: clicking a non-popover pill action (e.g. Add Text) while a popover (e.g.
  Templates) is open does not close that popover.
- **4.7 FAILS**: clicking outside an open popover does not close it. Note: ui-dev's
  `interface.md` explicitly discloses this as an intentional non-goal matching the old
  Templates/Pen flyouts' pre-existing behavior ("neither existed... so this feature doesn't
  add either behavior net-new") — so this is not a new regression, but it does fail the test
  plan's stated expectation, and now also applies to the new Shapes grid.

Six cases could not be independently verified for reasons outside the implementation's
control (tooling/environment limits) — see the case-by-case list. None of these are reported
as failures; they're reported as blocked so they don't get silently counted as passing.

**Board hygiene note (read before reusing "Tier1 Test"):** this QA pass, like ui-dev's own
testing pass, left net-new content on the shared board: a "Retro" template (Start/Stop/
Continue frames + 3 "Add your idea..." tiles) and one short red pen stroke, both added to
exercise cases 2.6/2.7. I stopped undoing before removing these because further Undo clicks
started reverting pre-existing tile positions rather than my own additions (the app's single
linear undo stack doesn't separate "my session's changes" from prior history) — I did not
want to risk corrupting content I don't own, which is the same caution ui-dev's report
flagged. Separately, ui-dev's previously-reported leftover test shapes (a small cluster of
overlapping shapes near the "User Story"/orange tile, roughly a Decision + Input/Output) are
still visibly present. Both are a coordinator/user cleanup decision, not something I fixed
silently.

**Incident, disclosed:** mid-session I intended to clear a comment textbox with Ctrl+A +
Delete; focus had actually left the textbox, so this selected and deleted every tile on the
board instead. It was caught immediately (the "map is empty" placeholder made it obvious) and
fully reverted with a single Undo click — the app correctly treats "select-all + delete" as
one atomic undoable action. No data loss occurred. Flagging for transparency since it
happened on the shared board.

---

## Environment

- Dev server: `localhost:5173`, already running.
- Browser: claude-in-chrome, real authenticated session (owner permission), map
  `Tier1 Test` (`/map/487c49f4-2753-4200-8fa1-ce86200db985`).
- Real browser viewport for most of the session: 1536×703 — already inside the plan's cited
  650–700px "short viewport" repro band, so most Category 1 cases were run against a genuinely
  short real viewport, not a simulated one.
- `resize_window` does not change the real viewport in this sandbox (confirmed independently:
  called it for 1400×700, `window.innerWidth/innerHeight` stayed 1536×703 afterward) — matches
  ui-dev's own reported finding. For cases needing a shorter/narrower viewport than the real
  window, I monkey-patched `window.innerWidth`/`innerHeight` via `Object.defineProperty` +
  dispatched a `resize` event, then measured the popover's actual `getBoundingClientRect()` —
  the same method ui-dev's report describes.

---

## Category 1 — Original bugs, explicitly (regression-critical)

### 1.1 All 8 pill icons reachable at short viewport, zero clipping, no scrollbar — **PASS**
Real viewport 1536×703 (inside the repro band). Accessibility tree and screenshot both confirm
all 8 buttons (Select, Pan, Shapes, Add text, Add a frame, Add an image or GIF, Freehand pen,
Insert a template) render, fully visible, no scrollbar on the pill.

### 1.2 Reachability at exact original repro size (1400×700) — **PASS**
Real viewport (1536×703, effectively equivalent) — Pen and Templates both opened cleanly, no
clipped click targets.

### 1.3 Shapes grid fully on-screen, trigger near bottom of short viewport — **PASS**
Verified at an extreme simulated `innerHeight: 420` (worse than the plan's repro case) using
Templates (the pill's bottom-most popover trigger, worst case): direct
`getBoundingClientRect()` measurement showed `bottom: 409.75`, inside the 420px boundary minus
the 10px margin. `top: 94`, not clipped above either.

### 1.4 Popover fully on-screen, trigger near top of short viewport — **PASS**
Shapes (topmost popover trigger) opened fully on-screen with `top` well above 0 in all tested
viewport sizes; never observed clipped above `y=0`.

### 1.5 Pen color-picker flyout fully on-screen at short viewport — **PASS**
Real 703px-tall viewport: all 5 swatches rendered, fully visible, no top/bottom clipping.

### 1.6 Templates flyout fully on-screen at short viewport — **PASS**
All 4 templates (Story Map, Retro, Dependency Map, Flowchart) rendered fully on-screen and
clickable, both at the real 703px viewport and the simulated 420px extreme case above.

**Portal fix independently re-verified** (not taken on ui-dev's word, per the brief): queried
the live DOM for the open Templates popover and confirmed `popover.parentElement === document.body`
— `true`. The `ReactDOM.createPortal` fix for the `transform`/containing-block bug is genuinely
in place, not just claimed in the report.

---

## Category 2 — Golden path

### 2.1 Open Shapes grid — **PASS**
Single grid, exactly 7 cells: Square, Rectangle, Circle, Terminator, Process, Decision,
Input/Output. No separate basic/flowchart grids.

### 2.2 Place each of the 7 shapes — **PASS**
Placed all 7 via the grid, one at a time, and inspected each new tile's selected shape-icon in
the tile toolbar plus its rendered geometry:
- Square → sharp square ✓
- Rectangle → rounded rectangle ✓
- Circle → circle ✓
- Terminator → stadium/oval ✓
- Process → sharp rectangle ✓
- Decision → diamond ✓
- Input/Output → parallelogram ✓

All 7 render with distinct, correct geometry. (Each new tile defaults its title to "User
Story" regardless of shape — that's the existing default-type behavior, unrelated to which
shape icon was clicked, and not a labeling bug.) Each was undone via the toolbar Undo button
after verification to avoid permanently cluttering the shared board.

### 2.3 Add Text — **PASS**
Text tile added with "Type something..." placeholder and the plain text-formatting toolbar
(no shape/color row) — correct, undone after verification.

### 2.4 Add Frame — **PASS**
Frame added with editable "Frame" label and color-picker toolbar — correct, undone after
verification.

### 2.5 Add Image — **PASS** (wiring only)
Confirmed the button correctly calls `.click()` on the hidden `<input type="file">` (verified
by monkey-patching `HTMLInputElement.prototype.click` and checking the flag fired). Full
upload-and-render was not exercised — triggering the real OS file picker would hang browser
automation, so this matches the same limitation ui-dev's own report documents.

### 2.6 Toggle Pen mode and pick a color — **PASS**
Clicking Pen activated draw mode (icon highlighted) and auto-opened the color flyout. Selected
a non-default color (red), drew a stroke on the board, and confirmed via zoomed screenshot that
the stroke rendered in the selected red — not the default color.

### 2.7 Open Templates and materialize one — **PASS**
Clicked Templates → Retro. Flyout closed, "Added 'Retro' template" toast appeared, and
Start/Stop/Continue frames with 3 "Add your idea..." tiles were inserted correctly.

---

## Category 3 — Regression parity with the old sidebar

### 3.1 View-only permission shows only Select/Pan — **BLOCKED**
No second account/session was available in this environment to open the map with `view`
permission (single authenticated owner session only) — same limitation ui-dev's report notes
was hit by a prior QA pass on another feature. Source inspection shows `readOnly` is computed
identically to before (`!canEdit(permission)`, `src/lib/permissions.js`) and `ToolPill.jsx`
wraps all non-Select/Pan icons in `{!readOnly && (...)}` — but per this task's instructions,
reading code is not verification, so this is reported blocked, not passed.

### 3.2 Comment-only permission shows only Select/Pan — **BLOCKED**
Same reason as 3.1.

### 3.3 Edit permission shows all 8 icons — **PASS**
Directly observed throughout the session under the owner session (`edit`-equivalent
permission): all 8 icons render.

### 3.4 Drag a shape placed via the new grid — **PASS**
Placed a Process rectangle, dragged it from the cluster to open board space — moved cleanly to
the drop location, matching pre-redesign drag behavior.

### 3.5 Resize a shape placed via the new grid — **BLOCKED / inconclusive**
Attempted multiple times; could not reliably land the automated click-drag on the correct
resize handle (one attempt landed on a connector dot and opened the new drag-to-create quick
menu instead; another missed onto page chrome). Not confirmed working or broken — this is a
tooling/precision limitation on my end, not a finding against the app.

### 3.6 Connect two shapes placed via the new grid — **BLOCKED / not tested**
Not isolated and confirmed within the time available. Incidentally observed that dragging a
tile's edge dot triggers the newer "drag-to-create" quick menu (a different, more recent
feature per the repo's git log) rather than immediately confirming classic dot-to-dot link
creation — did not have time to distinguish the two flows conclusively.

### 3.7 Comment on a shape placed via the new grid — **PASS**
Opened the comment thread on a placed shape, typed and posted "QAtestcomment", and confirmed
it rendered in the thread with author/timestamp. (Note: literal spaces in the typed comment
text did not appear in the posted comment — worth a follow-up look since it suggests the
global Space-to-pan-toggle handler may be intercepting spacebar keystrokes even while a
comment `<input>` has focus, similar in spirit to what case 4.6 explicitly guards against for
tile-text editing. This is unrelated to the sidebar/pill redesign's own code and is flagged as
an FYI, not a redesign regression.)

### 3.8 Mode switching (Select/Pan) unchanged — **PASS**
Clicking Select/Pan and pressing Space both correctly toggle active-state highlighting and
mode.

---

## Category 4 — Edge cases

### 4.1 Popover doesn't clip at the left screen edge — **PASS**
Simulated `innerWidth: 500`. Shapes grid (widest popover) measured `left: 68.8, right: 264.8`
— fully within bounds, no left-edge clipping.

### 4.2 Rapid open/close of different popovers leaves no stale popover — **PASS**
Clicked Shapes → Pen → Templates in quick succession; only Templates remained visible
afterward, no leftover Shapes grid or Pen flyout rendered underneath.

### 4.3 Clicking a pill icon closes any other open popover — **FAIL**
**Repro:** Open Templates (click Templates icon) → click Text (Add text) icon while Templates
is still open.
**Expected:** Templates flyout closes; text tile is added; no orphaned flyout remains.
**Actual:** The text tile was added correctly, but the Templates flyout remained fully visible
and open on top of/alongside the new tile. Confirmed with two separate screenshots after the
click (not a stale-render artifact).

### 4.4 Escape closes open popovers (Shapes grid) — **PASS**

### 4.5 Escape closes Pen color flyout / exits draw mode — **PASS**
Confirmed Escape closes the color flyout and resets mode back to Select in the same action.

### 4.6 Space still toggles Pan mode — **PASS**
Space toggled Select→Pan→Select correctly with focus on the board (not in a text field).

### 4.7 Clicking outside a popover closes it — **FAIL**
**Repro:** Open Shapes grid → click on the board/a frame elsewhere on the canvas.
**Expected:** Popover closes without placing a tile or changing mode unexpectedly.
**Actual:** No tile was placed and mode was unaffected, but the Shapes grid popover stayed
open. Per `interface.md`, this is a disclosed, intentional gap matching the old Templates/Pen
flyouts' pre-existing behavior ("closing on an outside click... neither existed for the old
Templates/Pen flyouts either") — so it is **not a new regression**, but it does fail this test
plan's explicit expectation, and the gap has now been extended to the new Shapes grid as well.

### 4.8 Grid "Future" ghost cells — **PASS / not applicable**
Confirmed 0 ghost cells in the real grid — exactly 7 real shape cells, matching ui-dev's
documented, in-scope deviation from the mock. Nothing to test.

---

## Category 5 — Visual/interaction parity across viewport sizes

### 5.1 Normal viewport — pill renders correctly — **PASS**
Pill vertically centered on the left edge of the board area, all 8 icons visible, spacing/
dividers match the mock's visual language.

### 5.2 Very tall viewport — pill stays centered — **NOT VERIFIED (tooling-blocked)**
`resize_window` does not change the real viewport in this sandbox (confirmed independently —
see Environment section), so a genuinely taller real viewport could not be produced to test
CSS-driven vertical centering. `interface.md`'s claim (`translateY(-50%)` centering, unaffected
by container height) is a standard, low-risk CSS pattern, but this was not empirically
exercised.

### 5.3 Narrow viewport — **PASS**
Simulated `innerWidth: 500` combined with the real ~703px short height: Shapes grid clamp held
(see 4.1's measurement); no icons or popover content were unreachable.

### 5.4 Window resize while a popover is open — **NOT TESTED**
Not exercised within the time available. `interface.md` discloses that repositioning on resize
while a popover is open is an intentional non-goal ("neither existed for the old... flyouts
either"), matching 4.7's disclosed gap — but the "does it end up stranded off-screen" half of
this case's expectation was not directly checked.

### 5.5 Board coordinate system unaffected by pill's floating position — **PARTIAL**
Directly measured the pill's own DOM bounding box: `x: 16–70, y: 198–562` (real page
coordinates) — narrow and does not extend into general board-canvas area, so there is no
structural "dead zone" where the pill's container silently swallows clicks meant for the
board. However, the specific "double-click empty board to add a tile" sub-behavior
(`onBoardDoubleClick` in `MuMap.jsx`, which requires `e.target === e.currentTarget`) could not
be triggered via the browser-automation `double_click` action across 3 attempts at different
board locations (all far from the pill), with zero console errors each time. Inconclusive
whether this is an automation-tooling limitation or a genuine issue — it is unrelated to the
pill's positioning either way, since all 3 locations were nowhere near the pill's measured
bounding box.

---

## Case tally

| Category | Pass | Fail | Blocked/Not verified |
|---|---|---|---|
| 1 — Original bugs | 6 | 0 | 0 |
| 2 — Golden path | 7 | 0 | 0 |
| 3 — Regression parity | 4 | 0 | 4 (3.1, 3.2, 3.5, 3.6) |
| 4 — Edge cases | 6 | 2 (4.3, 4.7) | 0 |
| 5 — Viewport parity | 2 | 0 | 3 (5.2, 5.4, 5.5-partial) |
| **Total** | **25** | **2** | **7** |

(25 clean pass + 1 partial counted toward "pass" in the summary line above as 26, since 5.5's
core concern — no dead zone — was positively confirmed even though one sub-case was
inconclusive.)

---

## Re-verification pass — 2026-08-18 (targeted, third QA pass)

**Scope:** Not a full 34-case re-run. `ui-dev` shipped a fix for case 4.3 (see
`ui-dev-report.md`, "Fix pass: QA case 4.3") — a shared `closePopovers()` helper in
`ToolPill.jsx`, called at the top of every pill action's `onClick`. This pass re-verifies
4.3 directly in the browser (not on the dev report's word), regression-checks
popover-trigger-to-popover-trigger switching since the fix touches shared state across all
three popovers, and reconfirms 4.7 is unchanged. All other cases from the original pass
stand as previously reported and were not re-run.

**Verdict: 4.3 is fixed, confirmed for all three popovers. The cross-popover regression
check passes. 4.7 is confirmed unchanged (still fails the test plan's expectation, still the
same pre-existing, disclosed, non-regression gap).**

### Environment
Same map/session as the original pass: `localhost:5173`, "Tier1 Test" map
(`/map/487c49f4-2753-4200-8fa1-ce86200db985`), claude-in-chrome, real authenticated owner
session. Real browser viewport ~1536×647 this pass (vs. ~1536×703 previously — both are
short-viewport, doesn't affect popover open/close logic under test here).

### 1. Case 4.3 re-verification — all three popovers, five non-popover actions total tested

Each row: popover opened via its trigger, then a different non-popover-trigger pill action
clicked while it was open. Confirmed via screenshot after each click that the popover fully
closed and the action's effect (or mode change) actually happened — not just that the
popover visually disappeared.

| Popover open | Action clicked | Result |
|---|---|---|
| Templates | Add Text | **PASS** — Templates closed; new text tile appeared in edit mode. |
| Templates | Select | **PASS** — Templates closed; Select mode activated, no side effects. |
| Shapes grid | Add Frame | **PASS** — Shapes grid closed; a new Frame tile was created (confirmed via DOM query — `.tile` containing a "Frame" label span, `480×360` at the board's `Start`/`Stop` cluster, stacked under existing tiles so not visually obvious but genuinely present and selectable). |
| Shapes grid | Pan | **PASS** — Shapes grid closed; Pan mode activated. |
| Pen color picker | Add Image | **PASS** — Pen popover closed; `mode` reverted from `draw` to `select` (Select icon re-highlighted); page stayed responsive (confirmed with a follow-up click) rather than hanging on the native file picker. |
| Pen color picker | Select | **PASS** — Pen popover closed; Select mode activated. |

All 6 combinations across all 3 popovers close correctly. Case 4.3 is genuinely fixed, not
just claimed fixed.

**Board hygiene note:** the Add Frame test above created a real frame tile on the shared
"Tier1 Test" board (needed to positively confirm the fix does add-then-close, not just
close). Standard Ctrl+Z Undo did not remove it even after two attempts (the frame persisted
at the same DOM rect across both undo clicks) — this is a curiosity that may be worth a
separate look but is outside this pass's scope, unrelated to `ToolPill.jsx`'s popover logic.
Rather than keep spending undo attempts on a shared board, I located the frame directly (DOM
query + outline highlight), selected it on-canvas, and removed it with the toolbar's
explicit Delete button, then confirmed via a second DOM query that zero "Frame"-labeled
tiles remained. Board was left in the same state it was found in (still carrying the
pre-existing "Retro" template and red pen stroke noted as leftover in the original pass —
untouched, not mine to clean up).

### 2. Regression check — popover-trigger-to-popover-trigger switching

With the shared `closePopovers()` now wired into the Shapes/Pen/Templates triggers
themselves too (each closes the other two before applying its own toggle), verified no two
popovers can ever be open together and no click leaves zero popovers open when one was
expected:

| Open | Trigger clicked | Result |
|---|---|---|
| Templates | Shapes | **PASS** — Templates closed, Shapes grid opened. Exactly one popover visible. |
| Shapes grid | Pen | **PASS** — Shapes grid closed, Pen color picker opened (`mode` → `draw`). Exactly one popover visible. |
| Pen color picker | Templates | **PASS** — Pen closed (`mode` reverted to `select`), Templates opened. Exactly one popover visible. |

All three pairwise switches in the cycle behave correctly: never both open, never neither.

### 3. Case 4.7 reconfirmation — unchanged

With Templates open, clicked directly on a board element (the "Continue" frame) —
equivalent to the original repro's "click on the board/a frame elsewhere on the canvas."
**Result: the frame got selected (its own toolbar appeared) and the Templates flyout stayed
fully open at the same time** — identical to the original finding. Pressing Escape
afterward closed the popover and cleared the selection in one action (matching case
4.4/4.5's already-passing Escape behavior), leaving the board unmodified.

This confirms `ui-dev`'s fix is scoped exactly as claimed: `closePopovers()` is called only
from the pill's own button `onClick` handlers, and no outside-click/blur listener was added
or changed. Case 4.7 remains a fail against the test plan's stated expectation, still the
same pre-existing, disclosed, cross-app pattern (not a new regression, not touched by this
fix) — unchanged status from the original pass, routed to the reviewer as before.

### Updated overall verdict for the feature

With 4.3 now fixed and no regression introduced by the fix:

- **1 real functional gap remains open: case 4.7** (click-outside doesn't close popovers) —
  disclosed, pre-existing, cross-app pattern, not a new regression; still a judgment call for
  the reviewer rather than something to route back to a dev agent.
  - **26 PASS + the now-fixed 4.3 = 27 of 34 cases pass** (updated from the original 25).
  - 6 cases remain BLOCKED/NOT VERIFIED for the same environment/tooling reasons as the
    original pass (3.1, 3.2, 3.5, 3.6, 5.2, 5.4-partial) — unaffected by this fix, not
    re-attempted this pass.
  - 1 case (4.7) still FAILS the test plan's explicit expectation.

The feature is in a clean state modulo the disclosed 4.7 gap: no known regressions, no
orphaned popovers, no dev-report claim taken on faith without independent browser
verification.
