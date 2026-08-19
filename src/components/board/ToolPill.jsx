import React, { useRef } from "react";
import { createPortal } from "react-dom";
import {
  MousePointer2, Hand, Square, Type as TypeIcon, Frame as FrameIcon,
  Image as ImageIcon, PenLine, LayoutTemplate,
} from "lucide-react";
import { SHAPES } from "../../lib/boardModel.js";
import { TEMPLATES } from "../../lib/templates.js";
import { ACCENT, INK_SOFT, BORDER } from "../../lib/theme.js";
import { usePopoverPosition } from "../../lib/popoverPosition.js";
import { SHAPE_ICONS } from "./shapeIcons.jsx";
import { toolPillStyles as styles } from "./toolPillStyles.js";

// Floating, vertically-centered tool pill — Concept B from the
// sidebar-redesign mock. Extracted out of MuMap.jsx's inline JSX per this
// project's "extract on touch" convention (see TileNode.jsx). Pure/
// presentational plus its own popover-open state: every actual board
// mutation (adding a shape, inserting a template, etc.) is still a callback
// prop into MuMap.jsx, same division of responsibility TileNode uses.
//
// 8 top-level icons, fixed regardless of tool count: Select, Pan, Shapes
// (grid popover), Text, Frame, Image, Pen (color popover), Templates
// (list popover). Read-only viewers see only Select/Pan, matching the old
// sidebar's rule.
export default function ToolPill({
  readOnly,
  mode,
  setMode,
  onAddShape,
  onAddText,
  onAddFrame,
  onAddImageClick,
  drawColor,
  setDrawColor,
  drawColors,
  shapesOpen,
  setShapesOpen,
  templatesOpen,
  setTemplatesOpen,
  onInsertTemplate,
}) {
  const shapesTriggerRef = useRef(null);
  const penTriggerRef = useRef(null);
  const templatesTriggerRef = useRef(null);

  const penOpen = mode === "draw";
  const shapesPop = usePopoverPosition(shapesTriggerRef, shapesOpen);
  const penPop = usePopoverPosition(penTriggerRef, penOpen);
  const templatesPop = usePopoverPosition(templatesTriggerRef, templatesOpen);

  // Closes every popover this pill can have open — the Shapes grid, the
  // Pen color picker (which piggybacks on `mode === "draw"` rather than its
  // own boolean), and Templates. Called at the top of every pill action so
  // that triggering one action (e.g. Add Text) always clears whatever
  // popover another trigger left open, instead of the two coexisting.
  // Fixes sidebar-redesign QA case 4.3. Deliberately does NOT touch
  // click-outside/blur behavior — that's case 4.7, left as-is per QA.
  const closePopovers = () => {
    setShapesOpen(false);
    setTemplatesOpen(false);
    if (mode === "draw") setMode("select");
  };

  return (
    <div style={styles.pill}>
      <div style={styles.modeRow}>
        <button className="toolicon-btn" style={{ ...styles.iconBtn, ...(mode === "select" ? styles.iconBtnActive : null) }}
          onClick={() => { closePopovers(); setMode("select"); }} title="Select">
          <MousePointer2 size={18} strokeWidth={1.75} color={mode === "select" ? ACCENT : INK_SOFT} />
        </button>
        <button className="toolicon-btn" style={{ ...styles.iconBtn, ...(mode === "pan" ? styles.iconBtnActive : null) }}
          onClick={() => { closePopovers(); setMode("pan"); }} title="Pan (Space)">
          <Hand size={18} strokeWidth={1.75} color={mode === "pan" ? ACCENT : INK_SOFT} />
        </button>
      </div>

      {!readOnly && (
        <>
          <div style={styles.divider} />

          {/* Shapes — single generic trigger (doesn't adopt the last-picked
              shape, per the approved mock) opening a 2D grid of all 7
              SHAPES from boardModel.js, unchanged. */}
          <div style={styles.wrap}>
            <button ref={shapesTriggerRef} className="toolicon-btn"
              style={{ ...styles.iconBtn, ...(shapesOpen ? styles.iconBtnActive : null) }}
              onClick={() => { const willOpen = !shapesOpen; closePopovers(); if (willOpen) setShapesOpen(true); }} title="Shapes">
              <Square size={18} strokeWidth={1.75} color={shapesOpen ? ACCENT : INK_SOFT} />
            </button>
            {shapesOpen && createPortal(
              <div ref={shapesPop.popoverRef} style={{ ...styles.popover, ...styles.gridPopover, ...shapesPop.style }}
                onPointerDown={(e) => e.stopPropagation()}>
                <div style={styles.gridTitle}>Shapes</div>
                <div style={styles.shapeGrid}>
                  {Object.entries(SHAPES).map(([key, s]) => {
                    const Icon = SHAPE_ICONS[key];
                    return (
                      <button key={key} className="shape-grid-cell" style={styles.gridCell}
                        onClick={() => { onAddShape(key); setShapesOpen(false); }} title={`Add ${s.label}`}>
                        <Icon size={18} strokeWidth={1.75} color="currentColor" />
                        <span style={styles.gridCellLabel}>{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>,
              document.body
            )}
          </div>

          <button className="toolicon-btn" style={styles.iconBtn} onClick={() => { closePopovers(); onAddText(); }} title="Add text">
            <TypeIcon size={18} strokeWidth={1.75} color={INK_SOFT} />
          </button>

          <button className="toolicon-btn" style={styles.iconBtn} onClick={() => { closePopovers(); onAddFrame(); }} title="Add a frame">
            <FrameIcon size={18} strokeWidth={1.75} color={INK_SOFT} />
          </button>

          <button className="toolicon-btn" style={styles.iconBtn} onClick={() => { closePopovers(); onAddImageClick(); }} title="Add an image or GIF">
            <ImageIcon size={18} strokeWidth={1.75} color={INK_SOFT} />
          </button>

          <div style={styles.divider} />

          <div style={styles.wrap}>
            <button ref={penTriggerRef} className="toolicon-btn"
              style={{ ...styles.iconBtn, ...(penOpen ? styles.iconBtnActive : null) }}
              onClick={() => { const willOpen = !penOpen; closePopovers(); if (willOpen) setMode("draw"); }} title="Freehand pen">
              <PenLine size={18} strokeWidth={1.75} color={penOpen ? ACCENT : INK_SOFT} />
            </button>
            {penOpen && createPortal(
              <div ref={penPop.popoverRef} style={{ ...styles.popover, ...styles.colorPopover, ...penPop.style }}
                onPointerDown={(e) => e.stopPropagation()}>
                {drawColors.map((c) => (
                  <button key={c} onClick={() => setDrawColor(c)}
                    style={{ ...styles.colorSwatch, background: c, outline: drawColor === c ? `2px solid ${ACCENT}` : `1px solid ${BORDER}` }}
                    title={c} />
                ))}
              </div>,
              document.body
            )}
          </div>

          <div style={styles.wrap}>
            <button ref={templatesTriggerRef} className="toolicon-btn"
              style={{ ...styles.iconBtn, ...(templatesOpen ? styles.iconBtnActive : null) }}
              onClick={() => { const willOpen = !templatesOpen; closePopovers(); if (willOpen) setTemplatesOpen(true); }} title="Insert a template">
              <LayoutTemplate size={18} strokeWidth={1.75} color={templatesOpen ? ACCENT : INK_SOFT} />
            </button>
            {templatesOpen && createPortal(
              <div ref={templatesPop.popoverRef} style={{ ...styles.popover, ...styles.templatesPopover, ...templatesPop.style }}
                onPointerDown={(e) => e.stopPropagation()}>
                {TEMPLATES.map((tpl) => (
                  <button key={tpl.id} className="template-flyout-item" style={styles.templateItem}
                    onClick={() => { onInsertTemplate(tpl); setTemplatesOpen(false); }}>
                    <span style={styles.templateName}>{tpl.name}</span>
                    <span style={styles.templateDesc}>{tpl.description}</span>
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>
        </>
      )}
    </div>
  );
}
