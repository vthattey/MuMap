# UI dev report — sidebar-redesign (Concept B: Floating Pill + Grid)

## What was built

Replaced the full-height vertical `styles.sidebar` icon column in `src/MuMap.jsx`
with a floating, vertically-centered tool pill (Concept B from the approved
mock), and made every popover it opens viewport-edge-aware.

**Files touched / added:**

- `src/components/board/ToolPill.jsx` (new) — the extracted pill component.
  8 top-level icons: Select, Pan, Shapes (grid popover, new), Text, Frame,
  Image, Pen (color popover), Templates (list popover). Read-only viewers
  see only Select/Pan (`{!readOnly && (...)}` wraps everything else,
  unchanged rule, just relocated).
- `src/components/board/toolPillStyles.js` (new) — pill/popover styling,
  split out the same way `tileStyles.js` was split from `MuMap.jsx`.
- `src/components/board/shapeIcons.jsx` (new) — `SHAPE_ICONS` (the 7
  per-shape icon lookup, including the 4 custom flowchart-shape SVGs) moved
  here out of `MuMap.jsx`'s top, since it's now needed by three call sites
  (mini toolbar, quick-create menu, `ToolPill`'s Shapes grid) and importing
  it back from `ToolPill.jsx` into `MuMap.jsx` would have created an import
  cycle.
- `src/lib/popoverPosition.js` (new) — `usePopoverPosition(triggerRef, open)`,
  the shared viewport-edge-aware positioning hook used by all three
  popovers (Shapes grid, Pen colors, Templates).
- `src/lib/theme.js` — added `ACCENT_SOFT` and `PANEL_BG` (previously only
  local consts inside `MuMap.jsx`) so `toolPillStyles.js` could pull them
  the same way `tileStyles.js` already pulls other tokens from this file.
- `src/MuMap.jsx` — removed the inline sidebar JSX and its now-dead styles
  (`sidebar`, `sidebarModeRow`, `sidebarDivider`, `toolIconBtn*`,
  `sidebarFlyout`, `drawColorRow/Swatch`, `templatesFlyout`,
  `templateFlyout*`); `mainRow` now wraps only `boardArea`; `<ToolPill>` is
  rendered inside `boardArea` (`position: relative` already present) as a
  `position: absolute` overlay, not a flex participant. Added `shapesOpen`
  state (new — the Shapes grid didn't exist before) alongside the existing
  `templatesOpen`, and added it to the existing Escape-key handler so it
  closes the same way Templates already does.

Full write-up of the component boundary and the positioning-helper contract
is in `.claude/features/sidebar-redesign/interface.md`.

## A real bug found and fixed mid-build

The pill uses `transform: translateY(-50%)` for vertical centering. Per the
CSS spec, an ancestor with a `transform` becomes the **containing block**
for any `position: fixed` descendant — so popovers nested directly inside
the pill were positioning relative to the pill's own box, not the viewport,
completely defeating the `window.innerWidth`/`innerHeight` clamp math (I
caught this via browser testing, not code review — see below). Fixed by
rendering all three popovers through `ReactDOM.createPortal(..., document.body)`
in `ToolPill.jsx`, which escapes the transformed ancestor entirely. Verified
fixed via `getBoundingClientRect()` matching the computed `top`/`left`
exactly after the fix (see Verification).

## Interface contract

No backend surface (pure client-side layout, per the plan). Documented the
positioning-helper contract and component boundary in
`.claude/features/sidebar-redesign/interface.md` anyway, since it's a real
structural decision, per the task brief.

## Stubs

None. Every action the pill triggers (add shape/text/frame/image, pen mode +
color, template insert) is the same existing callback from `MuMap.jsx`,
unchanged — this is layout-only, no new data flow.

## Deviations from the mock

- The mock's `shape-grid` includes two decorative "Future" ghost cells
  (dashed, non-interactive) demonstrating headroom for growth. Not
  implemented — the plan explicitly scopes "no new tools are being added in
  this feature," and the ghost cells are inert filler with no functional
  role, so adding them would be speculative UI beyond what the plan
  describes. The real 7-shape grid uses the same 3-column layout/visual
  language.
- The mock's `positionFlyout` only clamps the vertical axis (`top`),
  relying on fixed `left: 100%` CSS for horizontal placement. The plan says
  "clamped against `window.innerHeight`/`innerWidth`" (both axes), so
  `usePopoverPosition` also flips a popover to the trigger's left if it
  would overflow the right edge, then clamps horizontally too. This is an
  intentional superset of the mock's demo behavior, not a gap.
- Everything else (pill shape/radius/shadow, icon set and order, grid
  layout, popover chrome, colors) matches the mock's Concept B section.

## How this was verified

1. **Build:** `npm run build` — clean, no errors, both before and after the
   portal fix.
2. **Browser (claude-in-chrome, real dev server, real authenticated
   session):**
   - Loaded the actual "Tier1 Test" map at the exact window size the plan
     cites as the original bug repro (**1400×700**) — pill renders fully,
     all 8 icons visible, no clipping, no scrollbar.
   - Opened all three popovers (Shapes grid, Pen colors, Templates) at that
     window size — all fully visible, correctly positioned next to their
     trigger.
   - This is where the transform/containing-block bug surfaced: the Pen
     color popover rendered at the bottom-left corner of the screen,
     detached from its trigger and partially clipped by the real viewport
     edge — inspected via `getBoundingClientRect()` vs. computed style to
     confirm the mismatch, root-caused it to the pill's `transform`, fixed
     with a portal, and re-verified the same way (rect now matches computed
     style exactly).
   - `resize_window` didn't actually shrink the automated browser's
     viewport in this environment (`window.innerHeight` stayed ~703
     regardless of the requested size), so I additionally verified the
     clamping math directly by monkey-patching `window.innerHeight` to 420
     via `javascript_tool` and re-opening the Templates popover (whose
     trigger sits at the bottom of the pill, the worst case for the
     original bug): it correctly flipped to render *above* the trigger
     instead of running off the bottom, with `rect.bottom` (409.75) safely
     inside the simulated 420px boundary minus the 10px margin.
   - Exercised every preserved behavior: placed all 7 shapes (Square,
     Rectangle, Circle, Terminator, Process, Decision, Input/Output) via
     the new Shapes grid; added Text and a Frame; opened the Pen color
     popover, picked a color, and drew a freehand stroke (confirmed
     on-canvas); inserted the "Retro" template (confirmed via the
     "Added 'Retro' template" toast and the resulting Start/Stop/Continue
     frames). Also confirmed the mini-toolbar's shape-swap row and the
     quick-create menu still render correctly post-refactor (both consume
     `SHAPE_ICONS` from its new location).
   - Confirmed the Image button still wires to the hidden file input by
     monkey-patching `HTMLInputElement.prototype.click` rather than
     actually triggering the native OS file picker (which would have
     hung browser automation).
   - Checked console messages throughout (including a fresh page load) —
     zero errors.
   - The read-only-viewer rule (`{!readOnly && (...)}`) is unchanged code,
     just relocated — not independently re-verified against a second
     account/session, since none was available in this environment (same
     limitation the flowchart-diagram feature's QA pass hit and documented).

## A caveat on the test board's state

While drawing/undo-testing on the shared "Tier1 Test" map, I over-corrected
while cleaning up my own additions and briefly deleted (then immediately
undid, confirmed restored) a pre-existing frame. After that scare I
deliberately stopped further cleanup rather than keep guessing at exactly
which of several closely-overlapping shapes near the board's center were
mine — a couple of small extra shape tiles from my testing (roughly
matching a Decision and an Input/Output shape) are very likely still
sitting there, stacked behind the pre-existing content in that area.
Nothing was left in a broken state and no data was lost, but this board's
content should be given a quick visual check (or the small cluster of
overlapping shapes near the "User Story"/orange tile cleaned up) before
relying on it for anything else.

## Files

- `C:\Users\srika\Documents\Project\MuMap\src\components\board\ToolPill.jsx`
- `C:\Users\srika\Documents\Project\MuMap\src\components\board\toolPillStyles.js`
- `C:\Users\srika\Documents\Project\MuMap\src\components\board\shapeIcons.jsx`
- `C:\Users\srika\Documents\Project\MuMap\src\lib\popoverPosition.js`
- `C:\Users\srika\Documents\Project\MuMap\src\lib\theme.js`
- `C:\Users\srika\Documents\Project\MuMap\src\MuMap.jsx`
- `C:\Users\srika\Documents\Project\MuMap\.claude\features\sidebar-redesign\interface.md`

---

## Fix pass: QA case 4.3 (stale popover left open by an unrelated pill action)

**Bug (QA case 4.3):** with a popover open (e.g. Templates), clicking a
different pill action that wasn't itself a popover trigger (e.g. Add Text)
added the text tile but left the open popover showing — both visible at
once.

**Root cause:** each popover's open state (`shapesOpen`, `templatesOpen`,
and `mode === "draw"` for the Pen color picker) was only ever set to
`false` by its own trigger (toggle-off) or the existing Escape handler in
`MuMap.jsx`. No other action button cleared it.

**Fix — `src/components/board/ToolPill.jsx` only** (no other files
touched): added one `closePopovers()` helper inside the component that
clears all three popover-open states — `setShapesOpen(false)`,
`setTemplatesOpen(false)`, and `setMode("select")` when `mode === "draw"`
— and call it at the top of every pill action's `onClick`: Select, Pan,
Add Text, Add Frame, Add Image, and the Shapes/Pen/Templates triggers
themselves (each trigger closes the other two before applying its own
open/close toggle, so at most one popover can ever be open at a time).
Left the shape-grid-cell, color-swatch, and template-item `onClick`
handlers inside the popovers untouched — with the above in place only one
popover can be open when those fire anyway.

Deliberately did **not** touch case 4.7 (click-outside doesn't close the
popover) — QA flagged that as matching this app's existing pre-redesign
pattern elsewhere (e.g. the vote-session popover) and routed it to the
reviewer as a judgment call, not a bug to fix here. No Escape/blur/outside-
click logic was changed.

**Verified:**
- `npm run build` — clean, no errors.
- Live in the browser (claude-in-chrome, real dev server on the
  already-authenticated "Tier1 Test" map): opened Templates, clicked Add
  Text — Templates closed and a new text tile appeared in edit mode.
  Repeated with the Shapes grid open (closed correctly, text tile added)
  and with the Pen color picker open (closed correctly, `mode` reverted
  from `draw` back to `select` — Select icon re-highlighted — and a third
  text tile was added). All three popovers close via the same shared
  mechanism. Deleted the three test text tiles afterward to leave the
  board as found.
