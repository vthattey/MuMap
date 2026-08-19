# Sidebar redesign — Floating Pill + Grid (Concept B)

## Why / context

The left tool rail is a single vertical column of 36px icon buttons — 14 today (Select, Pan, Square, Rectangle, Circle, Terminator, Process, Decision, Input/Output, Text, Frame, Image, Pen, Templates). Confirmed live at a normal 1400×700 window: the rail is already 505px tall, and Pen + Templates render entirely below the fold — structurally unreachable, not just visually cramped, because `mainRow`'s `overflow: hidden` has no scroll region ever set on the sidebar. No scrollbar is wanted as the fix, and more tool categories are coming (this was a 3-shape rail two feature rounds ago), so the rail's height can no longer scale linearly with tool count.

A second, related bug: flyout popovers (e.g. Templates) position at `left: 100%; top: 0` relative to their trigger with no viewport-edge awareness, so a trigger near the bottom of a short viewport pops its flyout off-screen too.

Three redesign concepts were mocked and shown to the user (`.claude/features/sidebar-redesign/mock/v1.html`, https://claude.ai/code/artifact/a632d5e0-b977-478b-8211-3aa1bcd2a925): a Figma-style grouped rail, a Miro/FigJam-style floating pill + grid, and a VS Code-style fixed rail + overflow menu. **The user chose Concept B — Floating Pill + Grid.**

## Decided

- **Toolbar becomes a floating pill**, vertically centered on the left edge of the board area (not pinned top-to-bottom spanning the full sidebar height) — matches the mock.
- **8 top-level icons, height fixed regardless of tool count**: Select, Pan, a single **Shapes** grid-trigger icon, Text, Frame, Image, Pen, Templates.
- **Shapes grid popover** combines all 7 current shape tools — Square, Rectangle, Circle, Terminator, Process, Decision, Input/Output — into **one** 2D grid popover (not two separate basic/flowchart grids) — user confirmed this over keeping them split, to keep the pill itself at 8 icons rather than 9.
- **Flyout/popover positioning is viewport-edge-aware** for every popover this feature touches (the Shapes grid, and the existing Pen color picker + Templates flyout, since they're the same popover mechanism) — clamp so a popover never renders partially or fully off-screen, regardless of where its trigger sits vertically. This directly fixes the second bug above.
- This is the mechanism that makes future growth safe: new tools added later go into the Shapes grid (if they're a shape/node type) or get their own pill icon only if they're a fundamentally new *category* — the grid is what absorbs growth, not the pill.

## Scope

**In for this feature:**
- Replace the current full-height vertical icon column with the floating, vertically-centered pill (8 icons).
- Build the Shapes grid popover (7 shape tools, 2D grid layout, same visual language as the mock).
- Generalize the existing single-column flyout (`sidebarFlyout` style, currently used by Pen's color picker and Templates) to be viewport-edge-aware, and reuse that same mechanism for the new Shapes grid rather than inventing a second popover pattern.
- Preserve every existing behavior exactly: Select/Pan mode switching, all 7 shape-add actions, Text/Frame/Image add actions, Pen mode + color picker, Templates insert flow — this is a pure presentation/layout change, not a behavior change. Read-only viewers still see just Select/Pan (no tool icons), matching today's rule.

**Out of scope:**
- No new tools are being added in this feature — that's for whatever feature needs the next one.
- No change to board/canvas behavior, only the tool-selection chrome around it.

## Data model impact

**None.** This is pure client-side layout (`src/MuMap.jsx` + its styles) — no tile/link fields, no schema, no sync path involved at all. Given that, **this feature skips a `backend-dev` pass** — there is no backend surface for it to check (unlike the flowchart-shapes feature, which added a new `tiles.shape` value that actually flowed through sync/RLS). Spawning an agent to confirm "nothing backend-related changed" when the coordinator can already see that plainly would just burn a run for no signal.

## Proposed technical approach (for `ui-dev` to confirm/refine into `interface.md`)

- New `src/components/board/ToolPill.jsx` (or similar) extracted from the current inline sidebar JSX in `MuMap.jsx` — the pill is a big enough structural change from today's `styles.sidebar` block that it's worth its own file, per this project's established "extract on touch" convention (see how `TileNode` was extracted in Tier 2).
- A shared, viewport-edge-aware popover positioning helper (used by the Shapes grid, Pen colors, and Templates) — likely a small hook or utility function computing `top`/`bottom`/`left` clamped against `window.innerHeight`/`innerWidth`, given a trigger element's bounding rect. Keep this generic so it isn't shape/tool-specific.
- Shapes grid: reuse `SHAPES` from `boardModel.js` exactly as today (no new data), just a different visual arrangement (grid instead of column) and a new trigger icon.
- The pill's vertical centering + fixed height needs to coexist with the existing `mainRow`/`boardArea` flex layout — `ui-dev` should decide the cleanest positioning approach (likely `position: absolute` within `boardArea` rather than a `mainRow` flex child, since a floating pill is no longer a layout participant the way the current full-height sidebar is) and document it in `interface.md` since it's a real structural change other code (e.g. anything that assumes a fixed-width sidebar column affecting board coordinates) might need to account for.

---
**Plan approved by the user 2026-08-18** (mock concept chosen + the shapes-grid grouping question answered). Proceeding to stage 3 (build + QA authoring), backend-dev skipped per the Data model impact section above.
