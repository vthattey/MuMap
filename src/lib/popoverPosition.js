import { useLayoutEffect, useRef, useState } from "react";

// Shared viewport-edge-aware popover positioning — used by every popover the
// tool pill opens (the Shapes grid, Pen's color picker, Templates). This
// replaces the old `sidebarFlyout` style's bare `left:100%; top:0`, which
// had no awareness of the viewport edge at all: a trigger near the bottom
// (or, for a wide popover, near the right edge) of a short/narrow window
// could push its popover partially or fully off-screen with no way to
// reach it. See the sidebar-redesign plan's "second bug."
//
// Usage:
//   const triggerRef = useRef(null);
//   const { popoverRef, style } = usePopoverPosition(triggerRef, open);
//   <button ref={triggerRef} onClick={...}>...</button>
//   {open && <div ref={popoverRef} style={style}>...</div>}
//
// The popover's own size isn't known until it's actually rendered (its
// content — a shape grid, a color row, a template list — varies), so this
// measures it via `popoverRef` *after* mount in a `useLayoutEffect`, then
// sets its final `position:fixed` coordinates before the browser paints —
// no flash at the wrong spot. Clamped against `window.innerWidth` /
// `window.innerHeight`, not against any particular ancestor, so it works
// regardless of where the trigger sits (sidebar-in-a-pill today, wherever
// tool chrome lives tomorrow).
const MARGIN = 10; // never render closer than this to a viewport edge
const GAP = 8;      // space between the trigger and the popover, matches the old flyout's 8px margin-left

export function usePopoverPosition(triggerRef, open) {
  const popoverRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    const triggerRect = trigger.getBoundingClientRect();
    const pw = popover.offsetWidth;
    const ph = popover.offsetHeight;

    // Prefer opening to the right of the trigger, top-aligned with it — the
    // same default spot the old flyout used — but flip to the trigger's
    // left if that would run past the right edge, then clamp both axes.
    let left = triggerRect.right + GAP;
    if (left + pw + MARGIN > window.innerWidth) {
      left = triggerRect.left - GAP - pw;
    }
    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, window.innerWidth - pw - MARGIN));

    let top = triggerRect.top;
    top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, window.innerHeight - ph - MARGIN));

    setPos({ left, top });
  }, [open, triggerRef]);

  // Until the first measurement lands, park the popover off-screen (rather
  // than letting it render unpositioned in normal document flow, which
  // would briefly show it in the wrong place inside the pill's own layout).
  const style = pos
    ? { position: "fixed", left: pos.left, top: pos.top, zIndex: 50 }
    : { position: "fixed", left: -9999, top: -9999, visibility: "hidden", zIndex: 50 };

  return { popoverRef, style };
}
