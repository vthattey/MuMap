import React from "react";
import { Lock } from "lucide-react";
import { FONT, INK_SOFT, INK_FAINT } from "../../lib/theme.js";

// Renders a locked reflection-session card: dashed border, a solid left-edge
// stripe in the author's avatar color, centered lock icon + author name +
// "writing…" caption — same position/size as the real tile underneath.
//
// Deliberately NOT a branch inside TileNode — per interface.md, the data
// this renders from (`reflectionPlaceholders`, a synthetic RPC result: only
// {id, author_id, x, y, w, h}) never has a `kind`/`shape`/`type` to key
// normal tile chrome off of, and a locked tile's real row is never even
// delivered to a non-author client (RLS blocks it at the row level, not
// just the column level) — so there is no real tile object to special-case
// in TileNode's render branches in the first place. This is also reused,
// unmodified, as the front face of the reveal-flip animation in MuMap.jsx.
export default function LockedPlaceholderTile({ x, y, w, h, authorName, authorColor }) {
  const color = authorColor || "#94a3b8";
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, width: w, height: h,
        boxSizing: "border-box", borderRadius: 14,
        background: "#f9fafb",
        border: "1.5px dashed rgba(31,41,55,0.28)",
        borderLeft: `4px solid ${color}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
        padding: 8, textAlign: "center", fontFamily: FONT, userSelect: "none", pointerEvents: "none",
      }}
    >
      <Lock size={16} color={color} strokeWidth={2} />
      <span style={{ fontSize: 11, fontWeight: 700, color: INK_SOFT, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {authorName || "Someone"}
      </span>
      <span style={{ fontSize: 9.5, color: INK_FAINT, fontStyle: "italic" }}>writing…</span>
    </div>
  );
}
