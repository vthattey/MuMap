# Interface contract — flowchart-diagram

Client-side only feature. There is no new API surface, sync payload shape,
or schema change — the contract is entirely about which string values now
flow through the existing `tiles.shape` column, and the one rule that
depends on them.

## 1. New `shape` values

Four new string values are now valid for `tiles.shape`, alongside the
existing `square` | `rectangle` | `circle`:

- `terminator`
- `process`
- `decision`
- `parallelogram`

These are opaque, unconstrained text, exactly like every existing `shape`
value today — no new columns, no new tile `kind`, no schema/migration
change. They round-trip through `boardSyncUtil.js` (`rowToTile`/`tileToRow`)
and `useBoardSync.js` untouched, the same passthrough path `square` etc.
already use (confirmed by backend-dev against the current schema/RLS — see
`backend-dev-report.md`).

## 2. Lean-chrome rule

A tile whose `shape` is one of the four values above renders **lean**:

- No type badge, no status pill, no tags row, no vote widget.
- One centered label (`tile.title` — no separate `content`/body), clamped
  to 2–3 lines with an ellipsis (no auto-shrinking font, no overflow past
  the shape's silhouette).
- Comments remain available, same as every other tile (annotation is
  generic, not chrome).

This is decided purely by `shape` (see `isFlowchartShape()` /
`FLOWCHART_SHAPES` in `src/lib/boardModel.js`), not by `kind` or `type` — so
switching an existing tile's shape to/from one of the four values via the
mini-toolbar's shape picker toggles lean chrome live, with no other field
to keep in sync.

## 3. Nothing else changes

- `tiles.kind` stays `"tile"` for these nodes (not a new kind).
- `tiles.type` is unconstrained as before; flowchart nodes added from the
  sidebar/quick-create use `"user-story"` with an explicit `color`
  override (see `FLOWCHART_DEFAULT_COLORS`) — `type` has no visual effect
  on a lean tile beyond that fallback color if none is set.
- Links/labels are unchanged — Yes/No branches use the existing
  `links.label` field, no new connector/line style.

## What this means for backend-dev

Nothing to implement. This file exists so the four new string values above
are written down explicitly, in case anything downstream (an analytics
query, an export/import validator, a future `CHECK` constraint) ever
enumerates `tiles.shape`'s valid values — those four now belong on that
list alongside `square`/`rectangle`/`circle`.
