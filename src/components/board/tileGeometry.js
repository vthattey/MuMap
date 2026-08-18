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
