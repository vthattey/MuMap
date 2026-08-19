# Interface — sidebar-redesign (Concept B: Floating Pill + Grid)

No backend surface (per plan's "Data model impact: None"). This document
records the client-side structural contract instead — the positioning
helper and component boundary other code (or a future feature) might need
to build against.

## Component boundary

`src/components/board/ToolPill.jsx` — the floating tool pill, extracted out
of `MuMap.jsx`'s inline JSX (was `styles.sidebar`), per the project's
"extract on touch" convention (`TileNode.jsx` precedent).

- **Owns:** its own popover-open UI wiring (refs, `usePopoverPosition`
  calls) and the two new custom shape-icon SVGs' rendering.
- **Does not own:** `mode`, `drawColor`, `templatesOpen`, `shapesOpen` state,
  or any board-mutation logic (`addShapeInView`, `insertTemplateInView`,
  etc.) — those all still live in `MuMap.jsx` and are passed down as
  props/callbacks, same division TileNode uses (MuMap owns state + board
  logic; the extracted component is presentational plus its own local
  DOM-measurement concerns).

Props (see `ToolPill.jsx` for the full list): `readOnly`, `mode`/`setMode`,
`onAddShape`/`onAddText`/`onAddFrame`/`onAddImageClick`,
`drawColor`/`setDrawColor`/`drawColors`, `shapesOpen`/`setShapesOpen`,
`templatesOpen`/`setTemplatesOpen`, `onInsertTemplate`.

`shapesOpen` is new state (the Shapes grid popover didn't exist before);
it's owned by `MuMap.jsx` alongside `templatesOpen` rather than inside
`ToolPill` itself, specifically so the existing global Escape-key handler
(`MuMap.jsx`'s keydown effect) can close it the same way it already closes
`templatesOpen` — consistent with the one existing precedent rather than
inventing a second closing mechanism local to the child component.

`SHAPE_ICONS` (the per-shape icon lookup, including the four custom
flowchart-shape SVGs previously inlined at the top of `MuMap.jsx`) moved to
`src/components/board/shapeIcons.jsx` since it's needed by three call sites
now: the mini toolbar's shape-swap row, the quick-create menu, and
`ToolPill`'s Shapes grid — importing it *from* `ToolPill.jsx` back into
`MuMap.jsx` would have created an import cycle, so it lives in its own leaf
module both import from.

## Positioning helper: `usePopoverPosition`

`src/lib/popoverPosition.js` — a hook, not a plain utility function, because
a popover's own size isn't known statically (the Shapes grid, the color
row, and the Templates list are all different sizes) and can only be
measured once the popover itself has actually rendered into the DOM.

```js
const triggerRef = useRef(null);
const { popoverRef, style } = usePopoverPosition(triggerRef, open);

<button ref={triggerRef} onClick={...}>...</button>
{open && <div ref={popoverRef} style={style}>...popover content...</div>}
```

- **Mechanism:** on the transition to `open`, a `useLayoutEffect` reads the
  trigger's `getBoundingClientRect()` and the popover's own
  `offsetWidth`/`offsetHeight` (now that it exists in the DOM), computes a
  clamped `{ left, top }`, and pushes it into state *before the browser
  paints* — no visible flash at an initial wrong position. Until that first
  measurement lands, `style` parks the popover off-screen
  (`left:-9999, visibility:hidden`) rather than letting it render inline in
  the pill's own flex layout.
- **Clamping:** against `window.innerWidth` / `window.innerHeight` directly
  (a fixed 10px `MARGIN` from each edge) — not against any ancestor
  element's bounding box. This is the direct fix for the plan's "second
  bug": the old `sidebarFlyout` style was `position:absolute; left:100%;
  top:0` relative to its trigger with zero viewport awareness, so a trigger
  near the bottom of a short window pushed its flyout off-screen with no
  way to reach it.
- **Positioning strategy:** every popover uses `position: fixed`, preferring
  to open 8px to the right of its trigger, top-aligned with it (the same
  default spot the old flyout used) — flips to the trigger's *left* if that
  would overflow the right edge, and independently clamps the vertical axis
  against both the top and bottom edges regardless of which horizontal side
  it lands on.
- **Reused unmodified across three popovers:** the Shapes grid (new),
  Pen's color picker (existing, previously `sidebarFlyout` +
  `drawColorRow`), and Templates (existing, previously `sidebarFlyout` +
  `templatesFlyout`) — one mechanism, not three, per the plan's explicit
  instruction not to invent a second popover pattern.
- **Not handled (matches today's scope, not a regression):** repositioning
  on `window resize` while a popover is already open, and closing on an
  outside click — neither existed for the old Templates/Pen flyouts either
  (they close only via Escape or an explicit UI action), so this feature
  doesn't add either behavior net-new.

## Layout structural change

The pill is `position: absolute` inside `styles.boardArea` (which already
had `position: relative`), not a `mainRow` flex child the way the old
full-height `styles.sidebar` column was. `mainRow` now wraps only
`boardArea`. This means:

- `boardArea`/`board`'s `getBoundingClientRect()` — which every board
  coordinate conversion (`screenToBoard`, `addShapeInView`, `fitToScreen`,
  etc.) already reads from `boardRef`, not from any sidebar-width
  assumption — is now simply wider by the ~52px the old sidebar column used
  to reserve. No board-coordinate math needed to change; nothing in
  `MuMap.jsx` hard-coded the old sidebar's width anywhere outside its own
  style declaration (confirmed by search before starting this feature).
- Any future chrome that still wants a reserved, non-floating flex column
  (unlikely, given the plan's direction) would need to be added back as a
  sibling of `boardArea` inside `mainRow` — the pill itself is not that.

## Shared design tokens

`ACCENT_SOFT` and `PANEL_BG` were added to `src/lib/theme.js` (previously
only defined as local consts inside `MuMap.jsx`) so `toolPillStyles.js`
could pull them the same way `tileStyles.js` already pulls `FONT`/`INK`/
`ACCENT`/`BORDER` from that file — avoids an import cycle back into
`MuMap.jsx` and keeps one source of truth for tokens now used outside it.
