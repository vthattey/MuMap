// Shared layout constants/helpers for anything that renders a tile-shaped
// box (currently TileNode; frames in MuMap.jsx have their own, simpler
// layout and don't need these). Kept separate from styling so a future tile
// kind can reuse the geometry without pulling in visual concerns.
export const RESIZE_HANDLE = 14;
export const SIDES = ["top", "right", "bottom", "left"];

export function dotPositionStyle(side) {
  switch (side) {
    case "top": return { top: 0, left: "50%", transform: "translate(-50%,-50%)" };
    case "bottom": return { top: "100%", left: "50%", transform: "translate(-50%,-50%)" };
    case "left": return { top: "50%", left: 0, transform: "translate(-50%,-50%)" };
    case "right": return { top: "50%", left: "100%", transform: "translate(-50%,-50%)" };
    default: return {};
  }
}

// CSS clip-path silhouettes for the two flowchart shapes whose fill isn't a
// plain (rounded) rectangle. Kept here alongside the rest of the shape
// geometry rather than inlined in TileNode, per the plan. A native CSS
// `outline` can't trace a clip-path silhouette, so these two shapes render
// their selection/connect-target ring as a second clipped layer *behind*
// the fill (see CLIP_RING_INSET) instead of using `outline` the way every
// other shape does.
export const CLIP_PATHS = {
  decision: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  parallelogram: "polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)",
};

export function isClipShape(shape) {
  return shape === "decision" || shape === "parallelogram";
}

// Inset (px) of the clip-ring layer at each affordance state, matching the
// mock exactly: 1px "border" at rest, grows to -4px accent at selected
// (mirrors the 2px outline + 2px offset regular tiles get), -3px accent
// with no gap while a connector is being dropped on it (mirrors the 3px
// no-offset outline regular tiles get).
export function clipRingInset(isSelected, isConnectTarget) {
  if (isConnectTarget) return -3;
  if (isSelected) return -4;
  return -1;
}
