# ui-dev report — flowchart-diagram

## What I built

Added the 4 flowchart shapes (Terminator, Process, Decision, Input/Output) to MuMap's
existing tile/link system, per `plan.md` and `mock/v1.html`.

**`src/lib/boardModel.js`**
- Added `terminator` (170×56), `process` (200×72), `decision` (190×130),
  `parallelogram` (200×76) to `SHAPES`, matching the mock's exact dimensions.
- Added `FLOWCHART_SHAPES` (the 4 keys) and `isFlowchartShape(shape)` — the single rule
  that decides lean vs. full chrome everywhere it matters.
- Added `FLOWCHART_DEFAULT_COLORS` (green/blue/amber/purple, reusing existing `SWATCHES`
  values) for the two "add a shape" entry points, since both always add tiles with
  `type: "user-story"` and would otherwise all default to yellow.

**`src/components/board/tileGeometry.js`**
- Added `CLIP_PATHS` (`decision`, `parallelogram` polygon clip-paths), `isClipShape()`,
  and `clipRingInset(isSelected, isConnectTarget)` alongside the existing
  `SIDES`/`dotPositionStyle` geometry helpers.

**`src/components/board/tileStyles.js`**
- Added `flowchartTile`, `clipWrap`, `clipRing`, `clipFill`, and the 4 label-clamp styles
  (`flowchartLabel` 3-line, `terminatorLabel`/`diamondLabel`/`ioLabel` 2-line, with the
  diamond/parallelogram ones width-constrained to 62%/74% per the mock's "safe zone").

**`src/components/board/TileNode.jsx`**
- Added a new early-return branch — `if (t.kind === "tile" && isFlowchartShape(t.shape))`
  — placed after the existing `text`-kind branch and before the generic tile return,
  following the same "skip all chrome before it renders" pattern the text-tile branch
  established. Inside it, two sub-cases:
  - Terminator/Process: a plain box using native `outline` for selection (same as every
    other rectangular tile), `borderRadius: 999` (terminator) or `14` (process, unchanged
    corner radius from sticky tiles per the mock's decision #3).
  - Decision/Parallelogram: a `clip-wrap` div containing a `clip-ring` layer (the
    selection/connect-target ring, inset -1/-4/-3px per `clipRingInset`) behind a
    `clip-fill` layer (the actual colored, clipped shape), since native `outline` can't
    trace a `clip-path` silhouette.
  - Both sub-cases render one centered label bound to `tile.title` (clamped 2–3 lines,
    no separate `content`/body split), keep the comment badge, resize handle, and the 4
    connector dots at the same bounding-box side positions every other shape uses.

**`src/MuMap.jsx`**
- Added 4 small inline SVG icon components (`TerminatorIcon`/`ProcessIcon`/
  `DecisionIcon`/`ParallelogramIcon`) matching the mock's icon choice (shape-approximating
  glyphs, not unrelated lucide icons), registered in `SHAPE_ICONS`. Because the sidebar
  rail, mini-toolbar shape picker, and quick-create shape row all already map over
  `Object.entries(SHAPES)`, adding the 4 entries to `SHAPES` + `SHAPE_ICONS` was enough to
  surface them in all three places with no separate wiring.
- `addTileAt` now takes an optional `overrides` param (threaded to `makeTile`);
  `addShapeInView` and the quick-create shape row both look up `FLOWCHART_DEFAULT_COLORS`
  and pass it as a color override for the 4 new shapes.
- **Fix, not just addition:** widened `miniToolbarRow.maxWidth` from 260 to 340. With 7
  shape-picker icons instead of 3, the row wrapped onto an extra line, growing the
  floating mini-toolbar tall enough to fully overlap a selected Terminator (56px tall —
  shorter than any existing shape), making it un-double-clickable to edit. Verified in a
  real browser that this was a real, reproducible blocker before the fix and is resolved
  after (see Verification below).

**`src/lib/templates.js`**
- Added a 4th `TEMPLATES` entry, `"flowchart"`: Start (terminator) → Fill out request
  form (process) → All fields valid? (decision) → two branches labeled "Yes"/"No" → two
  separate End terminators, using the existing `links[].label` field for the branch
  labels. Coordinates mirror the mock's example layout exactly. No Input/Output node in
  the template, per the plan.

## Interface contract

Wrote `.claude/features/flowchart-diagram/interface.md` (didn't exist yet — backend-dev's
report confirmed it ran before I did and found nothing to contract). It documents the 4
new `tiles.shape` string values and the lean-chrome rule as the only thing that changed,
for backend-dev/QA/anyone auditing `shape`'s valid values later. No stubs — everything is
real, wired-up client code; there is no backend piece to stub against since `shape` is
already opaque unconstrained text (confirmed by backend-dev, cross-referenced against
`boardSyncUtil.js`/`useBoardSync.js` myself before relying on that).

## Deviations from the mock

None in the shapes/chrome/labels themselves — dimensions, colors, clamp behavior, ring
technique, and dot/resize-handle positions all match the mock as specified. The one
change beyond the mock's explicit content is the `miniToolbarRow.maxWidth` fix above,
which is app chrome the mock doesn't depict at all (it's MuMap's own floating "type/
color/shape/status" quick-edit toolbar, not part of TileNode) — I fixed it because it was
a direct, reproducible regression caused by adding 4 SHAPES entries, not a pre-existing
issue I went looking for.

## Verification

Build: `npm run build` succeeds with no errors or new warnings (before and after the
toolbar fix).

Browser (via claude-in-chrome against the real dev server at `localhost:5173`, an
existing authenticated session on a real board):
- Placed all 4 shapes individually from the sidebar icon rail; confirmed correct
  silhouette, size, and default color for each (terminator stadium/green, process
  rounded-rect/blue, decision diamond/amber, parallelogram skewed/purple).
- Edited each shape's label; confirmed long-label clamping exactly as specified: Decision
  clamps to 2 lines + ellipsis inside its safe zone, Process clamps to 3 lines + ellipsis,
  Parallelogram clamps to 2 lines + ellipsis — no font auto-shrink, no overflow past the
  shape's silhouette in any case.
- Reproduced the mini-toolbar/Terminator overlap bug pre-fix (double-click landed on the
  toolbar's "Pt" field instead of entering label edit), applied the `maxWidth` fix,
  reloaded, and confirmed double-click-to-edit now works cleanly on a Terminator.
- Dragged a connector from a Decision's connector dot (sitting exactly on its diamond
  vertex) to a Process tile; link created with an elbow route and arrowhead, identical to
  linking two regular tiles. Labeled the link "Yes" via the existing link-label edit
  affordance; label rendered on the connector.
- Resized a Decision shape substantially wider; the clip-path fill and the second
  clip-path ring layer stayed in sync at the new size (no lag, no rectangular fallback
  ring).
- Opened the comments popover on a Decision tile (comment badge, generic across all tile
  kinds), added a comment; badge updated to show a count of 1, popover listed the comment
  with author/timestamp — identical behavior to a regular sticky tile.
- Inserted the "Flowchart" template from the sidebar's template flyout (confirmed it's
  4th in the list, after Story Map/Retro/Dependency Map). Verified via the DOM that all 7
  nodes materialized with the correct shapes/labels/colors and that both link labels
  ("Yes" and "No") render on the decision's two outgoing connectors, matching the mock's
  example exactly.
- Cleaned up all test tiles/links/comments I added during verification; confirmed via DOM
  query that the board returned to its original pre-test state.

Not independently re-verified: cross-client realtime sync and full-reload persistence
round-trip for the new `shape` values — backend-dev already confirmed the sync/RLS path
treats `shape` as opaque passthrough with no whitelist, and QA's test plan (section 4)
covers this explicitly; re-doing it here would just be repeating backend-dev's read-only
check without adding information.

## Files touched

- `src/lib/boardModel.js`
- `src/components/board/tileGeometry.js`
- `src/components/board/tileStyles.js`
- `src/components/board/TileNode.jsx`
- `src/MuMap.jsx`
- `src/lib/templates.js`
- `.claude/features/flowchart-diagram/interface.md` (new)
