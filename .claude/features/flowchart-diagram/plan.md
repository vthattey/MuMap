# Flowchart shapes — v1 of the Architecture Diagrams suite

## Why / context

MuMap currently offers Story Map, Retro, and Dependency Map as starter templates on top of one generic sticky-note board. The user wants an "architecture diagrams suite" (flowchart, UML, sequence, etc.), inspired by draw.io/app.diagrams.net. This plan scopes **only the first diagram type — flowchart** — as one shippable feature; UML class diagrams and sequence diagrams are explicitly out of scope here and would be separate future features through this same pipeline.

Reference points from draw.io (used to calibrate scope, not to copy 1:1): a categorized shape sidebar you drag from, a right-hand format panel for the selected shape's style, and — specifically for flowcharts — a small, standard shape vocabulary (terminator, process, decision, input/output) connected by routed arrows, often with labels on the branches out of a decision ("Yes"/"No").

## Decisions already made (with the user, before this plan)

- **Diagram type for v1: Flowchart.** Simplest shape vocabulary, purely freeform placement — no ordering/lifeline logic needed, unlike a sequence diagram.
- **Integration model: extend the existing board**, not a separate diagramming surface. New shapes ride on the tile/link system MuMap already has (drag, resize, connectors, realtime sync, undo all come for free).
- **Connectors: no new line/arrow styles in v1.** Reuse the existing single directed, elbow-routed connector with labels (already shipped in Tier 1) — a decision node's "Yes"/"No" branches use link labels, which already exist. Multiple arrowhead/line styles (needed for accurate UML notation later) are deferred to whichever future feature adds UML.

## Scope

**In for v1:**
- Four new node shapes: **Terminator** (start/end, stadium/pill shape), **Process** (plain rectangle step), **Decision** (diamond), **Input/Output** (parallelogram).
- These render *lean* — no status pill, points badge, tags row, or vote widget (none of that is meaningful on a flowchart node). Comments stay available (generically useful as annotation on any tile). Just a single centered label, not the title+body split regular sticky tiles have.
- A new "Flowchart" starter template (same mechanism as Story Map/Retro today) demonstrating a simple start → process → decision → (yes/no) → end chart, so the feature is discoverable and self-explanatory on first use.
- The 4 shapes are also available individually from the sidebar's shape row, for building a flowchart from scratch without the template.

**Out for v1 (explicitly deferred, not forgotten):**
- UML class/sequence diagrams and any UML-specific notation (compartments, relationship arrow types).
- New connector/line styles (dashed, multiple arrowheads).
- Alignment/distribution guides, grid-snap, or auto-layout — the existing freeform drag behavior is unchanged.
- Multi-page diagrams.

## Data model impact

Expected to be **client-side only, no schema/migration needed**: `tiles.shape` is already a free-text column with no `CHECK` constraint (confirmed against the current schema — `text`/`type`/`kind`/`shape` are all unconstrained strings), the same reason adding the `text` and `image` tile kinds in Tier 2 needed no migration. The four new shape keys (`terminator`, `decision`, `parallelogram`, plus reusing existing `process`→`rectangle`) are just new entries in the client's `SHAPES` constant and new rendering branches — nothing server-side changes shape.

`backend-dev`'s job on this feature is expected to be small: confirm the above holds (no constraint blocks the new shape values, realtime sync round-trips them unchanged since `shape` already passes through as opaque text today), and flag it immediately if that assumption is wrong rather than inventing backend work to fill the role.

## Proposed technical approach (for `ui-dev` to confirm/refine into `interface.md`)

- Add `terminator`, `decision`, `parallelogram` to `SHAPES` in `src/lib/boardModel.js` (dimensions sized to look right for each shape, matching how `square`/`rectangle`/`circle` are already defined there).
- Rendering: extend `TileNode.jsx`'s shape handling (currently a binary `isCircle` check) to a shape-driven branch. Decision → CSS `clip-path` diamond or a rotated-square technique; Parallelogram → CSS `clip-path` skew; Terminator → rectangle with `border-radius: height/2` (stadium). Whichever technique, keep it in `tileStyles.js`/`tileGeometry.js` alongside the existing shape geometry helpers, not inlined ad hoc.
- Lean chrome: a tile whose `shape` is one of the three new ones (or `rectangle` when used as a flowchart "Process" — see open question below) skips the badge/status/tags/vote-widget block in `TileNode.jsx` and shows one centered, auto-sizing label instead of the title/content split — reuse the `text` tile's precedent (Tier-2) for "how to render a chrome-less shape," don't invent a second pattern.
- Sidebar: add the 3 new shape buttons to the icon rail's existing shape row (`src/MuMap.jsx`, where `SHAPES` is already mapped to buttons) plus new icons (lucide-react has suitable primitives, or a small inline SVG per shape if not).
- New template: `src/lib/templates.js`, a 4th entry alongside Story Map/Retro/Dependency Map, using the new shapes + existing link labels for the Yes/No branches.

## Decided: Process gets its own shape key

Process is a 5th new `SHAPES` entry (`process`), visually a plain rectangle, even though it looks like today's sticky "Rectangle." This keeps "lean vs. full chrome" decided by one rule — is `tile.shape` one of the five flowchart shapes (`terminator`, `process`, `decision`, `parallelogram`) — rather than splitting that decision across `shape` and `type`. So the full v1 shape set is: **Terminator, Process, Decision, Input/Output** (4 shapes, `process` added alongside the 3 named earlier).

---
**Plan approved by the user 2026-08-18.** Proceeding to stage 2 (mock).
