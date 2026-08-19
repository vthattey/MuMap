# Review: sidebar-redesign (Concept B: Floating Pill + Grid)

## Verdict: COMPLETE

Plan fulfilled, contract held between the (single) ui-dev pass and the intentionally-skipped
backend-dev pass, and no unresolved finding rises above minor. Shipping as-is.

---

## What was checked

### 1. Plan fidelity
- All 8 pill icons (Select, Pan, Shapes, Text, Frame, Image, Pen, Templates) present, matching
  plan.md's "Decided" section and the mock's Concept B checklist.
- Shapes grid is a single 7-cell grid (not split basic/flowchart), matching the plan's explicit
  user-confirmed decision.
- All three popovers (Shapes, Pen colors, Templates) are viewport-edge-aware via one shared
  mechanism (usePopoverPosition), not three separate implementations, matching the plan's
  explicit instruction not to invent a second popover pattern.
- Read-only/comment-permission gating is preserved unchanged, just relocated into ToolPill.jsx.
- No new tools added (out-of-scope per plan): exactly 7 shape cells, no "Future" ghost cells
  from the mock were built (a deliberate, documented, in-scope deviation, since the ghost
  cells are decorative-only and the plan explicitly scopes out new tools).
- No board/canvas behavior changed, confirmed by reading addShapeInView / addTextInView /
  addFrameInView / insertTemplateInView call sites in MuMap.jsx: same callbacks, same
  signatures, just invoked from ToolPill.jsx instead of inline JSX.

### 2. Backend-skip claim (explicitly asked to verify)
`git diff --name-only` / `git status --porcelain` show only `src/MuMap.jsx`, `src/lib/theme.js`,
and `.claude/features/INDEX.md` modified, plus four new files under `src/components/board/` and
`src/lib/popoverPosition.js`. Nothing under `supabase/`, no sync hook touched (`useBoardSync.js`
untouched), no tile/link shape touched (`boardModel.js` untouched). The `backend-dev` skip
was correct.

### 3. Contract integrity (`interface.md` vs. actual code)
Read `ToolPill.jsx`, `popoverPosition.js`, `toolPillStyles.js`, `shapeIcons.jsx`, and the
`MuMap.jsx` diff directly, not just the reports:
- Component boundary matches exactly: `ToolPill` owns popover-open UI wiring and shape-icon
  rendering; `MuMap.jsx` still owns `mode`/`drawColor`/`templatesOpen`/`shapesOpen` state and
  all board-mutation callbacks, passed down as documented props.
- `shapesOpen` lives in `MuMap.jsx` and is wired into the existing Escape handler
  (`MuMap.jsx:717`) alongside `templatesOpen`, as documented.
- `SHAPE_ICONS` moved to `shapeIcons.jsx` and is correctly imported by all three claimed call
  sites (`MuMap.jsx` mini-toolbar/quick-create menu at lines 1246/1349, and `ToolPill.jsx`
  line 96) - keys (`square`, `rectangle`, `circle`, `terminator`, `process`, `decision`,
  `parallelogram`) match `SHAPES` in `boardModel.js` exactly; no stale/renamed key that would
  render `undefined` as an icon.
- `usePopoverPosition`'s clamping, portal-parking-off-screen-until-measured, and
  right-then-left-flip logic in `popoverPosition.js` match the written contract line for line.
- `ACCENT_SOFT`/`PANEL_BG` were genuinely added to `theme.js` (confirmed via `git diff`), not
  just claimed.
- The transform/containing-block bug fix is real, not just asserted: `toolPillStyles.js`
  confirms the pill uses `transform: translateY(-50%)` (the exact condition that makes a
  transformed ancestor the containing block for `position: fixed` descendants), and
  `ToolPill.jsx` renders all three popovers through `createPortal(..., document.body)`,
  correctly escaping that ancestor. This matches both the dev report's description and QA's
  independent DOM re-verification (`popover.parentElement === document.body`).
- No dead references to the old `sidebar`/`sidebarFlyout`/`toolIconBtn*`/`templatesFlyout*`
  styles remain anywhere in `MuMap.jsx` (confirmed via grep), a clean removal.
- `npm run build` is clean, confirming the old lucide shape imports and the four inline
  shape-icon functions were fully removed from `MuMap.jsx`, not left dangling.

No contract drift found between what `interface.md` promises and what the code (there being
only one dev agent on this feature) actually does.

### 4. QA coverage vs. actual code
QA's 27/34-pass tally (6 blocked on sandbox automation limits, 1 explicit fail routed to
this review) is accurate against what the code does. No additional gap in the plan's
requirements was found that the test plan missed.

### 5. The case 4.7 judgment call (click-outside doesn't close popover)

**Ruling: acceptable to ship, does not block.**

Verified independently, not taken on QA/ui-dev's word: read the vote-session-start popover in
`MuMap.jsx` (`voteStartOpen`, lines 862-880) - it opens via `setVoteStartOpen((o) => !o)` and
has no click-outside or blur handler anywhere; the only way to close it is the button
itself or picking a value and starting the vote. A repo-wide search of `MuMap.jsx` for any
`mousedown`/document-level click listener returns zero matches - there is no outside-click-
closes mechanism anywhere in the app today, for any popover. The "matches an existing
pre-redesign pattern" claim in `interface.md` and QA's results is therefore true, not just
asserted. Given that:
- This is not a new regression introduced by the redesign - it's an existing, app-wide gap
  the redesign extends to one more popover (Shapes) that didn't exist before.
- Fixing it here would mean inventing a new interaction pattern (outside-click-to-close) that
  doesn't exist anywhere else in the app, which is bigger than this feature's scope - this
  feature's job was to fix viewport clipping, not rearchitect popover dismissal app-wide.
- It's disclosed clearly in three places (`interface.md`, `ui-dev-report.md`, `qa/results.md`)
  rather than silently shipped - the next person touching popover behavior has what they need
  to know this is a known, consistent gap, not a surprise.

If the team wants outside-click-to-close as a real product behavior, that's a follow-up
feature that should touch every popover in the app consistently (including the vote-start
popover), not a one-off fix bolted only onto the Shapes grid as part of this layout-only
change.

### 6. The Ctrl+Z / undo-frame QA curiosity

**Ruling: real, pre-existing app behavior - not caused by this feature, not an automation
artifact, and out of scope to fix here.**

Traced it: `addFrameInView` (`MuMap.jsx:282-289`) calls `setEditingId(f.id)` immediately after
creating a frame, putting its label into inline-edit mode. The global keyboard-shortcut
handler's very first line is `if (editingId) return;` (`MuMap.jsx:704`), which disables
Ctrl+Z (and every other shortcut) while any tile - including a just-created frame - is still
in its auto-entered edit state. `git diff` confirms neither `addFrameInView` nor the
`editingId` guard in the keydown handler is touched by this feature's diff - this is
pre-existing behavior, reproducible outside browser automation too (add a frame, don't click
away, press Ctrl+Z - nothing happens because the app's `editingId` state still gates the
handler, independent of literal DOM focus). It's a legitimate latent UX rough edge (newly-
created tiles briefly block undo) but it isn't part of this feature's diff and isn't
something ui-dev/qa-engineer on this feature should be asked to fix. Worth a note for
whoever next touches undo/tile-creation, not a blocker here.

### 7. Loose ends
- The transform/portal bug found mid-build is resolved and verified above.
- The QA-routed case 4.3 bug (stale popover) is resolved via a shared `closePopovers()`
  helper in `ToolPill.jsx`, independently re-verified by QA across all three popovers and all
  pairwise trigger-to-trigger switches. No regression introduced.
- Case 4.7 is ruled on above, acceptable to ship.
- Board-hygiene notes from both `ui-dev-report.md` and `qa/results.md` (leftover test shapes,
  a Retro template, a pen stroke on the shared "Tier1 Test" map) are content cleanup on a
  shared test board, not a code defect, and were explicitly disclosed rather than silently
  left. Someone should clean up the "Tier1 Test" map's test clutter, but that is a
  housekeeping action, not a rework item.
- No stubs, no TODOs, no manual-migration items; this feature had none to begin with (pure
  client-side layout, no data model impact, confirmed above).

---

## Minor, non-blocking observations (informational only, not routed back)

- Category 3 (3.1, 3.2, 3.5, 3.6) and Category 5 (5.2, 5.4) blocked cases are all genuine
  sandbox/automation tooling limits (no second permission-level session available, window
  resize not functioning in the sandbox, imprecise automated drag hit-testing), not code
  gaps. Source inspection for 3.1/3.2 shows the permission gate is unchanged logic from
  before, so risk is very low, but it remains unverified by an actual browser session,
  consistent with how QA reported it as blocked rather than passed.
- QA's 3.7 FYI about spaces not appearing in a comment textbox is explicitly unrelated to
  this feature's code (comment textbox handling is not part of any file this feature
  touched), so it is correctly not routed back to ui-dev here.

## Files reviewed
- C:\Users\srika\Documents\Project\MuMap\.claude\features\sidebar-redesign\plan.md
- C:\Users\srika\Documents\Project\MuMap\.claude\features\sidebar-redesign\mock\v1.html (Concept B section)
- C:\Users\srika\Documents\Project\MuMap\.claude\features\sidebar-redesign\interface.md
- C:\Users\srika\Documents\Project\MuMap\.claude\features\sidebar-redesign\ui-dev-report.md
- C:\Users\srika\Documents\Project\MuMap\.claude\features\sidebar-redesign\qa\test-plan.md
- C:\Users\srika\Documents\Project\MuMap\.claude\features\sidebar-redesign\qa\results.md
- C:\Users\srika\Documents\Project\MuMap\src\components\board\ToolPill.jsx
- C:\Users\srika\Documents\Project\MuMap\src\components\board\toolPillStyles.js
- C:\Users\srika\Documents\Project\MuMap\src\components\board\shapeIcons.jsx
- C:\Users\srika\Documents\Project\MuMap\src\lib\popoverPosition.js
- C:\Users\srika\Documents\Project\MuMap\src\lib\theme.js
- C:\Users\srika\Documents\Project\MuMap\src\MuMap.jsx
- C:\Users\srika\Documents\Project\MuMap\src\lib\boardModel.js
