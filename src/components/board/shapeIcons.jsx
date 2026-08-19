import { Square, Circle, RectangleHorizontal } from "lucide-react";

// Simple inline SVGs approximating the flowchart shapes themselves (a
// stadium, a plain rectangle, a diamond, a parallelogram) rather than
// reaching for an unrelated lucide glyph — keeps the icon legible as "this
// is what you'll get" at 18px, per the approved mock. Same call signature
// as the lucide icons below ({ size, strokeWidth, color }) so every
// SHAPES-keyed icon lookup (mini toolbar, quick-create menu, the tool
// pill's Shapes grid) can use SHAPE_ICONS interchangeably.
function TerminatorIcon({ size = 18, strokeWidth = 1.75, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
      <rect x="2" y="7" width="20" height="10" rx="5" />
    </svg>
  );
}
function ProcessIcon({ size = 18, strokeWidth = 1.75, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
    </svg>
  );
}
function DecisionIcon({ size = 18, strokeWidth = 1.75, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
      <path d="M12 2 22 12 12 22 2 12Z" />
    </svg>
  );
}
function ParallelogramIcon({ size = 18, strokeWidth = 1.75, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
      <path d="M8 5h13l-4 14H3Z" />
    </svg>
  );
}

// Keyed by SHAPES (boardModel.js) — the single lookup table shared by every
// place in the app that renders "the icon for this shape."
export const SHAPE_ICONS = {
  square: Square, rectangle: RectangleHorizontal, circle: Circle,
  terminator: TerminatorIcon, process: ProcessIcon, decision: DecisionIcon, parallelogram: ParallelogramIcon,
};
