# Test plan — Sidebar redesign (Concept B: Floating Pill + Grid)

Spec sources: `.claude/features/sidebar-redesign/plan.md` (approved) and the Concept B section
of `.claude/features/sidebar-redesign/mock/v1.html` (lines ~386-473). This is a pure
layout/presentation change — no tile/data behavior is expected to differ from today.

No test runner is configured in this repo. All cases below are manual browser procedures
against the dev server, run with an edit-permission map open unless a case says otherwise.
Where the mock doesn't specify exact pixel thresholds, "fully on-screen" means: no part of the
popover is clipped by the viewport, no scrollbar appears on the popover or the pill as a result
of it, and every item inside the popover is clickable without scrolling.

Reference pill contents (from the mock, `#b-pill`): Select, Pan, [divider], Shapes (grid
trigger), Text, Frame, Image, [divider], Pen (color flyout), Templates (list flyout) = 8
top-level icons, 7 shapes inside the Shapes grid.

---

## Category 1 — Original bugs, explicitly (regression-critical)

### 1.1 All 8 pill icons reachable at short viewport, zero clipping, no scrollbar
- **Setup:** Open a map with edit permission. Resize the browser window to 1400×660 (inside
  the 650-700px band called out in the plan as the original repro height).
- **Action:** Visually inspect the floating pill from top to bottom: Select, Pan, divider,
  Shapes, Text, Frame, Image, divider, Pen, Templates.
- **Expected:** All 8 top-level icons are fully visible and clickable. No icon renders below
  the fold. No scrollbar appears anywhere on the pill or its container. This directly
  contradicts the old bug ("Pen + Templates render entirely below the fold").

### 1.2 Reachability holds at the exact original repro size
- **Setup:** Resize window to 1400×700 (the size explicitly cited in the plan as already
  reproducing the bug on the old sidebar).
- **Action:** Click Pen, then click Templates.
- **Expected:** Both icons are reachable and clickable; both open their respective popovers
  without any part of the click target being cut off.

### 1.3 Shapes grid popover fully on-screen when trigger is near the bottom of a short viewport
- **Setup:** Resize window to ~1400×650 (shortest realistic viewport). Because the pill is
  vertically centered, also test with the browser zoomed/resized such that the pill (and thus
  the Shapes trigger) sits as low as it can get on screen.
- **Action:** Click the Shapes icon.
- **Expected:** The 3×3 shape grid popover renders entirely within the viewport — no part
  clipped below `window.innerHeight`. Popover flips to open upward (or otherwise repositions)
  if its default placement would overflow the bottom.

### 1.4 Popover fully on-screen when trigger is near the top of a short viewport
- **Setup:** Same short viewport (~650-700px tall). Consider the Select/Pan icons at the top
  of the pill as the "near top" trigger case (or resize so the pill's top edge is close to
  y=0).
- **Action:** Click a popover-bearing icon positioned near the top (in this pill, Shapes is
  the topmost popover trigger — verify it, plus mentally confirm the mechanism would hold if a
  future icon were added above it).
- **Expected:** Popover renders fully within the viewport; does not clip above `y=0`.

### 1.5 Pen color-picker flyout fully on-screen at short viewport
- **Setup:** ~1400×650 viewport.
- **Action:** Click Pen.
- **Expected:** Color swatch flyout renders fully on-screen, all 5 swatches clickable, no
  clipping top or bottom.

### 1.6 Templates flyout fully on-screen at short viewport
- **Setup:** ~1400×650 viewport.
- **Action:** Click Templates.
- **Expected:** All 4 template entries (Story Map, Retro, Dependency Map, Flowchart) render
  fully on-screen and are clickable without scrolling or clipping.

---

## Category 2 — Golden path

### 2.1 Open Shapes grid
- **Setup:** Edit permission, normal viewport (e.g. 1400×900).
- **Action:** Click the Shapes icon in the pill.
- **Expected:** A single grid popover opens showing all 7 shapes (Square, Rectangle, Circle,
  Terminator, Process, Decision, Input/Output) — one grid, not two separate basic/flowchart
  grids (explicit plan decision).

### 2.2 Place each of the 7 shapes
- **Setup:** Edit permission, board with room to place tiles.
- **Action:** For each shape in turn: open Shapes grid, click the shape cell, then place it on
  the board (per whatever the existing add-shape interaction is — e.g. click board or
  drag-drop, matching current `addShapeInView` behavior).
- **Expected:** Each of the 7 shapes (Square, Rectangle, Circle, Terminator, Process, Decision,
  Input/Output) is placed on the board with the correct shape/geometry, matching what the old
  per-shape sidebar buttons produced. Repeat for all 7 — no shape is missing or mislabeled from
  the grid.

### 2.3 Add Text
- **Action:** Click Text icon in the pill.
- **Expected:** A text tile is added in view, identical to today's "Add text" behavior.

### 2.4 Add Frame
- **Action:** Click Frame icon in the pill.
- **Expected:** A frame is added in view, identical to today's "Add a frame" behavior.

### 2.5 Add Image
- **Action:** Click Image icon in the pill, choose an image file from the file picker.
- **Expected:** Image tile is added, identical to today's "Add an image or GIF" behavior.

### 2.6 Toggle Pen mode and pick a color
- **Action:** Click Pen icon. Confirm mode switches to draw (icon shows active state). Confirm
  color flyout opens automatically (matching current mode-driven behavior, not click-to-toggle
  behavior, unless ui-dev's `interface.md` documents a deliberate change — flag if so). Pick a
  non-default color swatch, then draw a stroke on the board.
- **Expected:** Pen mode is active, chosen color is applied to the drawn stroke, matching
  current draw behavior exactly.

### 2.7 Open Templates and materialize one
- **Action:** Click Templates icon. Click "Retro" (or any listed template).
- **Expected:** Templates flyout closes and the template's tiles/links are inserted into the
  board in view, identical to today's `insertTemplateInView` behavior.

---

## Category 3 — Regression parity with the old sidebar

### 3.1 View-only permission shows only Select/Pan
- **Setup:** Open a map as a user with `view` permission (no edit, no comment).
- **Action:** Inspect the pill.
- **Expected:** Only Select and Pan icons are visible. No Shapes/Text/Frame/Image/Pen/Templates
  icons render at all (same rule as today's `!readOnly` gate — read-only viewers see just
  Select/Pan, no tool icons).

### 3.2 Comment-only permission shows only Select/Pan
- **Setup:** Open a map as a user with `comment` permission.
- **Action:** Inspect the pill.
- **Expected:** Same as 3.1 — only Select/Pan, no tool icons, even though this user can leave
  comments elsewhere in the UI. `canEdit` is false for `comment`, so the tool icons stay
  hidden per the existing permission rule.

### 3.3 Edit permission shows all 8 icons
- **Setup:** Open a map as a user with `edit` or `owner` permission.
- **Action:** Inspect the pill.
- **Expected:** All 8 icons render (Select, Pan, Shapes, Text, Frame, Image, Pen, Templates).

### 3.4 Placed shape behaves identically post-placement — drag
- **Setup:** Place a Rectangle via the new Shapes grid.
- **Action:** Drag the tile to a new position.
- **Expected:** Drag works exactly as it does for shapes placed via the old sidebar — no
  behavior difference, since the redesign only touches tool selection, not tile behavior.

### 3.5 Placed shape behaves identically post-placement — resize
- **Setup:** Place a Circle via the new Shapes grid.
- **Action:** Select it and resize via its handles.
- **Expected:** Resize behaves identically to pre-redesign shapes.

### 3.6 Placed shape behaves identically post-placement — connect
- **Setup:** Place two shapes (e.g. Process and Decision) via the new Shapes grid.
- **Action:** Drag from one tile's connector dot to the other to create a link.
- **Expected:** Link/connector creation behaves identically to pre-redesign.

### 3.7 Placed shape behaves identically post-placement — comment
- **Setup:** Place a shape via the new Shapes grid (or any tile).
- **Action:** Open the tile's comment thread and add a comment (as a user who `canComment`).
- **Expected:** Commenting behaves identically to pre-redesign; unaffected by the toolbar
  change.

### 3.8 Mode switching (Select/Pan) unchanged
- **Action:** Click Select, then Pan, then Select again in the pill.
- **Expected:** Active-state highlighting and mode behavior (drag-to-pan vs. click-to-select)
  match pre-redesign exactly.

---

## Category 4 — Edge cases

### 4.1 Popover doesn't clip at the left screen edge
- **Setup:** If the pill's horizontal position can end up near the left edge of the viewport
  (e.g. narrow window, or if ui-dev's implementation places the pill closer to the edge than
  the mock's board-inset position), narrow the browser window width until the pill sits close
  to `x=0`.
- **Action:** Open the Shapes grid (widest popover — 3-column grid).
- **Expected:** The grid popover does not render partially off the left edge of the viewport;
  it clamps/repositions (e.g. opens to the right of the trigger, or shifts to stay on-screen)
  rather than being cut off. Since the pill is normally left-anchored with popovers opening
  rightward, this specifically checks the clamp logic doesn't only handle top/bottom.

### 4.2 Rapid open/close of different popovers leaves no stale popover
- **Action:** Click Shapes to open the grid, then immediately click Pen (without closing
  Shapes first), then immediately click Templates.
- **Expected:** At each step, only the most recently clicked popover is visible — no leftover
  Shapes grid or Pen flyout still rendered underneath/alongside Templates. Only one popover
  open at a time.

### 4.3 Clicking a pill icon closes any other open popover
- **Action:** Open Templates, then click Text (an action button, not a popover trigger).
- **Expected:** Templates flyout closes; text tile is added; no orphaned flyout remains open.

### 4.4 Escape closes open popovers
- **Setup:** Open the Shapes grid popover.
- **Action:** Press Escape.
- **Expected:** Popover closes (matching today's Escape handler, which already resets mode to
  select, clears `templatesOpen`, etc. — the new Shapes-grid open state must be included in
  that same reset so Escape closes it too).

### 4.5 Escape closes Pen color flyout / exits draw mode
- **Setup:** Click Pen (draw mode active, color flyout open).
- **Action:** Press Escape.
- **Expected:** Mode resets to select, color flyout closes — matching today's behavior where
  Escape sets mode to "select" and the Pen flyout is mode-driven.

### 4.6 Space still toggles Pan mode
- **Setup:** Mode is "select", focus is on the board (not inside a text-editing field).
- **Action:** Press Space.
- **Expected:** Mode toggles to "pan" (icon highlights). Press Space again: toggles back to
  "select". Matches today's exact toggle behavior (not hold-to-pan).
- **Note:** Confirm Space is still suppressed while `editingId` is set (i.e. while inline-
  editing a tile's text), same as today — typing a literal space in a tile shouldn't toggle
  pan mode.

### 4.7 Clicking outside a popover closes it
- **Setup:** Open the Shapes grid.
- **Action:** Click empty board canvas (not the pill, not the popover).
- **Expected:** Popover closes without placing any tile or changing mode unexpectedly.

### 4.8 Grid "Future" ghost cells (if implemented) are inert
- **Setup:** Open the Shapes grid.
- **Action:** Note the mock includes 2 disabled "Future" ghost cells padding the grid to a
  3×3 layout (`grid-cell ghost`, no `onclick`). If ui-dev's implementation includes visual
  placeholders like this, click them.
- **Expected:** No action occurs; not a QA-blocking case if ui-dev's grid is exactly 7 cells
  with no ghost placeholders — flag as scope-drift only if ghost cells are present but behave
  unexpectedly (e.g. throw errors, appear clickable/hoverable as if active).

---

## Category 5 — Visual/interaction parity across viewport sizes

### 5.1 Normal viewport (1400×900) — pill renders correctly
- **Action:** Load the board at a typical desktop size.
- **Expected:** Pill is vertically centered on the left edge of the board area, all 8 icons
  visible, spacing/dividers match the mock's visual language. No regression from the short-
  viewport fix — i.e., the pill isn't stretched, compressed, or mispositioned at normal height.

### 5.2 Very tall viewport (1400×1400 or maximized on a tall monitor)
- **Action:** Resize window taller.
- **Expected:** Pill stays vertically centered (does not drift to top or stick to a fixed
  offset that looks off-center on a tall screen); stays a fixed-height floating element, not
  stretched to fill available height.

### 5.3 Narrow viewport (e.g. 900×700)
- **Action:** Resize window narrower while keeping height in the "short" band.
- **Expected:** Pill remains usable, all icons reachable, popovers still fully on-screen
  (revisits 4.1's left-edge clamp concern combined with the original short-viewport bug).

### 5.4 Window resize while a popover is open
- **Action:** Open the Shapes grid, then resize the browser window smaller (both narrower and
  shorter) while the popover is open.
- **Expected:** Either the popover repositions/re-clamps to stay fully on-screen, or it closes
  cleanly — it must not end up stranded off-screen or unreachable after the resize.

### 5.5 Board coordinate system unaffected by pill's floating position
- **Setup:** Note the plan flags that switching from a layout-participant sidebar to a
  `position: absolute` floating pill could affect board coordinate math if any code assumed a
  fixed-width sidebar column.
- **Action:** With the pill visible, double-click the board canvas to add a tile (existing
  `onBoardDoubleClick` behavior) directly underneath where the pill used to occupy space (near
  the left edge of the board area). Also test panning and zooming near that region.
- **Expected:** Tile placement coordinates, panning, and zooming are correct and unaffected by
  the pill no longer reserving a layout column — no tiles placed with an offset error, no dead
  zone where clicks are silently swallowed by the pill's (now floating/absolutely-positioned)
  container bounds.

---

## Case count by category

- Category 1 (original bugs, explicit): 6 cases
- Category 2 (golden path): 7 cases
- Category 3 (regression parity): 8 cases
- Category 4 (edge cases): 8 cases
- Category 5 (visual/interaction parity across viewport sizes): 5 cases

**Total: 34 cases.**
