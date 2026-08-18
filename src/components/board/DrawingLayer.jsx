import React from "react";

// Renders committed strokes plus the in-progress one being drawn right now
// (if any) — its own SVG pass, layered above tiles so annotations sit on
// top, matching where the links SVG sits below them. Board-space
// coordinates throughout, same as tiles/links, so it lives inside the same
// transformed surface.
export default function DrawingLayer({ boardW, boardH, strokes, liveStroke, drawMode, onDeleteStroke }) {
  return (
    <svg style={{ position: "absolute", inset: 0, width: boardW, height: boardH, pointerEvents: "none", overflow: "visible", zIndex: 6 }}>
      {strokes.map((s) => (
        <polyline
          key={s.id}
          points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={s.color}
          strokeWidth={s.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: drawMode ? "stroke" : "none", cursor: drawMode ? "pointer" : undefined }}
          onClick={drawMode ? (e) => { e.stopPropagation(); onDeleteStroke(s.id); } : undefined}
        />
      ))}
      {liveStroke && liveStroke.points.length > 1 && (
        <polyline
          points={liveStroke.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={liveStroke.color}
          strokeWidth={liveStroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      )}
    </svg>
  );
}
