// Visual styling for a regular (non-frame) tile — split out of MuMap.jsx's
// styles object alongside the TileNode extraction. Pulls color tokens from
// the shared theme file rather than MuMap.jsx's local copies of the same
// values, so this doesn't create an import cycle back into MuMap.jsx.
import { FONT, INK, INK_SOFT, ACCENT } from "../../lib/theme.js";
import { RESIZE_HANDLE } from "./tileGeometry.js";

export const tileStyles = {
  tile: { position: "absolute", borderRadius: 14, padding: "14px 14px 12px", boxSizing: "border-box", fontFamily: FONT, userSelect: "none", touchAction: "none" },
  tileBadge: { fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, color: "rgba(31,41,55,0.45)" },
  tileHeaderRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 3 },
  statusPill: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700, color: "rgba(31,41,55,0.6)", background: "rgba(31,41,55,0.06)", padding: "2px 6px", borderRadius: 999 },
  statusDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
  cornerBadges: { position: "absolute", top: 8, right: 8, display: "flex", alignItems: "center", gap: 4, zIndex: 2 },
  pointsBadge: { minWidth: 20, height: 20, padding: "0 5px", borderRadius: 999, background: "rgba(31,41,55,0.75)", color: "#fff", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" },
  commentBadge: { display: "flex", alignItems: "center", gap: 3, height: 20, padding: "0 5px", borderRadius: 999, border: "none", background: "rgba(31,41,55,0.12)", color: "rgba(31,41,55,0.65)", fontSize: 10, fontWeight: 700, cursor: "pointer" },
  tagsRow: { display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 5 },
  tagPill: { fontSize: 9.5, fontWeight: 600, color: INK_SOFT, background: "rgba(31,41,55,0.08)", padding: "2px 7px", borderRadius: 999 },
  tileTitle: { fontFamily: FONT, fontWeight: 700, fontSize: 14, color: INK, lineHeight: 1.25, wordBreak: "break-word" },
  tileContent: { fontSize: 11.5, color: INK_SOFT, marginTop: 5, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 80, overflow: "hidden" },
  tileTitleInput: { display: "block", width: "100%", fontFamily: FONT, fontWeight: 700, fontSize: 14, color: INK, lineHeight: 1.25, border: "none", background: "transparent", padding: 0, outline: "none" },
  tileContentInput: { display: "block", width: "100%", fontFamily: FONT, fontSize: 11.5, color: INK_SOFT, marginTop: 5, border: "none", background: "transparent", padding: 0, outline: "none", resize: "none", minHeight: 60, maxHeight: 160 },
  resizeHandle: { position: "absolute", bottom: 0, right: 0, width: RESIZE_HANDLE, height: RESIZE_HANDLE, cursor: "nwse-resize", opacity: 0, background: "linear-gradient(135deg, transparent 40%, rgba(31,41,55,0.3) 40%, rgba(31,41,55,0.3) 50%, transparent 50%, transparent 70%, rgba(31,41,55,0.3) 70%)", borderRadius: "0 0 4px 0", transition: "opacity 0.15s" },
  connectorDot: { position: "absolute", width: 16, height: 16, borderRadius: "50%", background: "#ffffff", border: `2px solid ${ACCENT}`, cursor: "crosshair", zIndex: 8, boxShadow: "0 1px 3px rgba(31,41,55,0.3)", transition: "transform 0.1s" },
  voteWidget: { position: "absolute", bottom: 8, left: 8, display: "flex", alignItems: "center", gap: 4, background: "rgba(31,41,55,0.75)", borderRadius: 999, padding: "2px 4px" },
  voteBtn: { width: 16, height: 16, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  voteCount: { display: "flex", alignItems: "center", gap: 3, minWidth: 12, textAlign: "center", color: "#fff", fontSize: 10.5, fontWeight: 700 },
  imageBody: { display: "flex", flexDirection: "column", width: "100%" },
  imageBodyImg: { width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 8, display: "block" },
  richTextToolbar: { display: "flex", gap: 2, marginTop: 4 },
  richTextBtn: { width: 20, height: 18, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 4, background: "rgba(31,41,55,0.08)", color: INK_SOFT, cursor: "pointer", padding: 0 },
};
