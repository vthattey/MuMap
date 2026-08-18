# Review — flowchart-diagram

## Verdict: COMPLETE

The shipped feature fulfills `plan.md`, the ui-dev/backend-dev contract in `interface.md` holds
in the actual code (not just in the two dev reports), QA's 22/26-pass result is well-founded
against the real diff, and no loose ends were left silently unresolved.

---

## What was checked

**Plan fidelity.** All four shapes (`terminator` 170×56, `process` 200×72, `decision` 190×130,
`parallelogram` 200×76) exist in `SHAPES` (`src/lib/boardModel.js`) with the mock's exact
dimensions and default colors (`FLOWCHART_DEFAULT_COLORS`). Lean chrome (`isFlowchartShape`) is
implemented as a single early-return branch in `TileNode.jsx`, gated purely on `shape` per the
plan's "Decided: Process gets its own shape key" section — `process` is its own `SHAPES` key, not
a `rectangle` alias. The "Flowchart" template in `src/lib/templates.js` matches the mock's
example (Start → Fill out request form → All fields valid? → Yes/No → two End terminators) with
no Input/Output node, exactly as the plan specifies. Sidebar icon order (after Circle, before
Text) matches `Object.entries(SHAPES)` insertion order. No unrequested scope crept in — no new
connector styles, no grid-snap/alignment guides, no multi-page support, nothing UML-specific.

**Contract integrity (`interface.md`).** Verified against the actual diff, not the reports'
claims:
- The four new `shape` strings round-trip untouched through `boardSyncUtil.js`
  (`rowToTile`/`tileToRow`, plain passthrough) and `useBoardSync.js` (no branching on `shape`
  anywhere) — backend-dev's read-only confirmation matches the code.
- `isFlowchartShape()`/`FLOWCHART_SHAPES` in `boardModel.js` is the single source of truth ui-dev
  claimed it would be — `TileNode.jsx` is the only consumer, and every add/duplicate/switch-shape
  entry point (`addTileAt`, `addShapeInView`, `createLinkedTile`, the mini-toolbar shape picker,
  `duplicateSelection`, `materializeTemplate`) goes through the same generic `shape`-as-opaque-
  string path with no shape-specific special-casing outside the one `isFlowchartShape` check.
- `type` stays `"user-story"` at both flowchart add sites with an explicit `color` override via
  `FLOWCHART_DEFAULT_COLORS`, exactly as documented; `kind` stays `"tile"`.
- Both dev agents' claims that this needs zero schema/migration work check out against
  `supabase/schema.sql` (`shape text not null default 'rectangle'`, no `check` constraint) and
  the RLS policies (gated only on `has_map_access`, no `shape`/`type`/`kind` reference).

**QA coverage vs. the actual diff.** QA's 22 passes are well-supported by what the code does.
The 4 blocked cases (4.2/4.3 realtime/concurrent-edit, 5.1/5.2 view/comment permission gating) are
correctly attributed to an environment gap, not a code gap — confirmed by reading
`useMapPermission.js`: legacy maps (`created_by === null`) are grandfathered to `edit` for every
user by design (line 25), which is exactly why QA couldn't construct a real view/comment session,
and this permission logic is untouched by this feature. The single `readOnly = !canEdit(...)`
flag gates every flowchart add/edit entry point identically to every pre-existing shape
(`addTileAt`, `addShapeInView` are both independently `readOnly`-gated; the mini-toolbar and its
shape-picker are rendered only when `!readOnly`) — QA's code-reading corroboration for 5.1/5.2 is
accurate. I did not find a path through the plan's requirements that the test plan missed.

**Code quality.** `TileNode.jsx`'s flowchart branch correctly follows the `text`-tile precedent
the plan asked for (early-return before chrome, `_silent` UPDATE_TILE on every keystroke +
non-silent commit on blur, matching `TileContentEditor.jsx`'s existing title-edit pattern
exactly). `tileGeometry.js`/`tileStyles.js` additions are consistent with the existing
`SIDES`/`dotPositionStyle` geometry-helper pattern, not inlined ad hoc. `duplicateSelection`
and `materializeTemplate` are shape-agnostic and correctly preserve `shape`/`color`/dims.
`npm run build` succeeds clean.

**The `miniToolbarRow.maxWidth: 260 → 340` fix, specifically checked against the diff (not just
the claim):** real and correctly scoped. The mini-toolbar's shape-picker row
(`src/MuMap.jsx`, `Object.entries(SHAPES)` inside the mini-toolbar) grew from 3 to 7 icons; at the
old 260px cap this pushed the row onto a 3rd wrapped line, growing the floating toolbar tall
enough to cover a selected Terminator (56px tall, shorter than any pre-existing shape) and block
double-click-to-edit — QA independently reproduced and re-verified this fix themselves (computed
style, not just trusting the report). The change is isolated to one style constant, doesn't touch
the toolbar's positioning logic, and doesn't alter any other shape's behavior.

One adjacent, non-blocking observation on this fix: the mini-toolbar has never clamped its
position to the viewport edges (it's centered via `translateX(-50%)` over the tile with no
bounds-checking), so a tile selected near the left/right edge of the canvas could already have
its toolbar partially overflow off-screen before this change. Widening the row's cap by 80px
marginally increases how far that overflow can extend — it doesn't introduce a new *class* of
bug, just slightly enlarges a pre-existing, unrelated gap in the toolbar's positioning that this
feature didn't create and isn't the right place to fix. Not blocking.

**Loose ends.** No stubs or TODOs in any changed file. backend-dev correctly did no work (none
was needed) and left no pending migration. QA's two flagged "open questions" (the
toolbar/connector-dot overlap, and a comment that didn't survive an undo/redo cycle in one QA
session) were checked against the code and both correctly ruled non-blocking for this feature:
- The toolbar/dot overlap reproduces identically on a plain pre-existing tile (QA verified this
  directly) and traces to the same un-clamped floating-toolbar positioning noted above — genuinely
  pre-existing, not shape-specific.
- Comments are persisted directly to Supabase (`useBoardSync.js`) entirely outside the
  `useUndoReducer`/board-reducer history that governs tile/link undo — there is no code path by
  which a tile-history undo/redo could affect a comment row, which corroborates QA's own
  suspicion that this was a test-session artifact rather than a real interaction bug.

## Findings

None that rise above minor. No regressions, no contract drift, no missing plan scope, no
unrequested scope, no unresolved stub or TODO.
