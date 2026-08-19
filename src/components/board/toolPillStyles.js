// Visual styling for the floating tool pill — split out of MuMap.jsx's
// styles object alongside the ToolPill extraction (Concept B, sidebar-
// redesign). Pulls color tokens from the shared theme file rather than
// MuMap.jsx's local copies of the same values, same convention tileStyles.js
// established, so this doesn't create an import cycle back into MuMap.jsx.
import { FONT, INK, INK_SOFT, INK_FAINT, ACCENT_SOFT, BORDER, PANEL_BG } from "../../lib/theme.js";

export const toolPillStyles = {
  // The pill itself: floating, vertically centered on the left edge of the
  // board area — a position:absolute overlay, not a mainRow flex participant.
  pill: {
    position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
    background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 26,
    padding: "10px 8px", display: "flex", flexDirection: "column",
    alignItems: "center", gap: 4, boxShadow: "0 10px 26px rgba(31,41,55,0.16)",
    zIndex: 10, fontFamily: FONT,
  },
  modeRow: { display: "flex", flexDirection: "column", gap: 4 },
  divider: { width: 28, height: 1, background: BORDER, margin: "4px 0" },
  iconBtn: { width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", borderRadius: 8, cursor: "pointer" },
  iconBtnActive: { background: ACCENT_SOFT },
  // Wraps a trigger + its popover so the popover can carry a `ref` for
  // usePopoverPosition to measure — position:fixed popovers don't need this
  // wrapper to itself be positioned, but it keeps trigger+popover as one
  // DOM unit for onPointerDown stopPropagation etc.
  wrap: { position: "relative" },

  // Shared popover chrome — combined with a size/layout style below per
  // popover kind (gridPopover / colorPopover / templatesPopover).
  popover: { background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: "0 8px 20px rgba(31,41,55,0.16)" },

  // Shapes grid popover — all 7 SHAPES in one 2D grid behind a single
  // "Shapes" trigger, per the approved mock.
  gridPopover: { display: "flex", flexDirection: "column", width: 196, padding: 10 },
  gridTitle: { fontSize: 10.5, fontWeight: 700, color: INK_FAINT, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, padding: "0 2px" },
  shapeGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 },
  gridCell: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "9px 4px", borderRadius: 8, cursor: "pointer", border: "none", background: "transparent", color: INK_SOFT, fontFamily: FONT },
  gridCellLabel: { fontSize: 9, fontWeight: 700, textAlign: "center", lineHeight: 1.15 },

  // Pen color popover — unchanged content/behavior, now positioned via the
  // shared helper instead of bare left:100%/top:0.
  colorPopover: { display: "flex", flexWrap: "wrap", gap: 6, width: 68, padding: 9 },
  colorSwatch: { width: 18, height: 18, borderRadius: "50%", border: "none", cursor: "pointer" },

  // Templates popover — unchanged content/behavior, same repositioning.
  templatesPopover: { display: "flex", flexDirection: "column", gap: 2, width: 210, padding: 6 },
  templateItem: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, textAlign: "left", border: "none", background: "transparent", borderRadius: 8, padding: "8px 8px", cursor: "pointer", fontFamily: FONT },
  templateName: { fontSize: 12.5, fontWeight: 700, color: INK },
  templateDesc: { fontSize: 11, color: INK_FAINT, lineHeight: 1.35 },
};
