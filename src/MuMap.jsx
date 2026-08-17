import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download, Upload, X, Trash2, ArrowLeft, Share2, Eye,
  ZoomIn, ZoomOut, Maximize, Undo2, Redo2, Copy, Move,
  Square, Circle, RectangleHorizontal,
} from "lucide-react";
import { useBoardSync } from "./hooks/useBoardSync.js";
import { useMapPermission } from "./hooks/useMapPermission.js";
import { TILE_TYPES, SHAPES, SWATCHES, makeTile, makeLink } from "./lib/boardModel.js";
import ShareMapPanel from "./components/ShareMapPanel.jsx";

const SHAPE_ICONS = { square: Square, rectangle: RectangleHorizontal, circle: Circle };

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS — full light theme
// ═══════════════════════════════════════════════════════════════════════════
const FONT = "'Inter', system-ui, sans-serif";
const PAGE_BG = "#ffffff";
const BOARD_BG = "#ffffff";
const BORDER = "#e5e7eb";
const INK = "#1f2937";
const INK_SOFT = "rgba(31,41,55,0.62)";
const INK_FAINT = "rgba(31,41,55,0.45)";
const ACCENT = "#4f46e5";
const ACCENT_SOFT = "rgba(79,70,229,0.1)";
const LINK_COLOR = "#94a3b8";
const LINK_SELECTED = "#f59e0b";
const LINK_PREVIEW = "#4f46e5";
const DANGER = "#dc2626";
const PANEL_BG = "#ffffff";
const SUBTLE_BG = "#f3f4f6";

const BOARD_W = 4000;
const BOARD_H = 3000;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.15;
const MIN_TILE_W = 100;
const MIN_TILE_H = 80;
const RESIZE_HANDLE = 14;
const SIDES = ["top", "right", "bottom", "left"];

// ═══════════════════════════════════════════════════════════════════════════
// COORDINATE HELPERS — convert between screen ↔ board space
// ═══════════════════════════════════════════════════════════════════════════
function screenToBoard(clientX, clientY, boardEl, zoom, panX, panY) {
  const rect = boardEl.getBoundingClientRect();
  return {
    x: (clientX - rect.left - panX) / zoom,
    y: (clientY - rect.top - panY) / zoom,
  };
}

function anchorPoint(t, side) {
  switch (side) {
    case "top": return { x: t.x + t.w / 2, y: t.y };
    case "bottom": return { x: t.x + t.w / 2, y: t.y + t.h };
    case "left": return { x: t.x, y: t.y + t.h / 2 };
    case "right": return { x: t.x + t.w, y: t.y + t.h / 2 };
    default: return { x: t.x + t.w / 2, y: t.y + t.h / 2 };
  }
}

// Which pair of bounding-box sides a link should exit/enter from, based on
// the tiles' relative position — always a matching pair (both horizontal or
// both vertical) so the elbow path below only ever needs one bend.
function pickSides(fromTile, toTile) {
  const c1 = { x: fromTile.x + fromTile.w / 2, y: fromTile.y + fromTile.h / 2 };
  const c2 = { x: toTile.x + toTile.w / 2, y: toTile.y + toTile.h / 2 };
  const dx = c2.x - c1.x, dy = c2.y - c1.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ["right", "left"] : ["left", "right"];
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

// Mural-style right-angle connector: a single bend at the midpoint between
// the two anchor points, on whichever axis both sides share.
function elbowPath(p1, p2, axis) {
  if (axis === "h") {
    const midX = (p1.x + p2.x) / 2;
    return `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
  }
  const midY = (p1.y + p2.y) / 2;
  return `M ${p1.x} ${p1.y} L ${p1.x} ${midY} L ${p2.x} ${midY} L ${p2.x} ${p2.y}`;
}

function dotPositionStyle(side) {
  switch (side) {
    case "top": return { top: 0, left: "50%", transform: "translate(-50%,-50%)" };
    case "bottom": return { top: "100%", left: "50%", transform: "translate(-50%,-50%)" };
    case "left": return { top: "50%", left: 0, transform: "translate(-50%,-50%)" };
    case "right": return { top: "50%", left: "100%", transform: "translate(-50%,-50%)" };
    default: return {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function MuMap({ mapId }) {
  const navigate = useNavigate();

  // ---- Access control ----
  const { loading: permLoading, map: mapRow, permission } = useMapPermission(mapId);
  const readOnly = permission === "view";
  const isOwner = permission === "owner";

  // ---- Core state (undoable, synced with Supabase) ----
  const {
    tiles, links, dispatch, canUndo, canRedo, loaded,
    collaborators, remoteCursors, broadcastTileUpdates, broadcastCursor,
  } = useBoardSync(permission ? mapId : null); // don't fetch/subscribe until access is confirmed

  const [shareOpen, setShareOpen] = useState(false);

  // ---- UI-only state (not undoable) ----
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState("select"); // select | pan
  const [selection, setSelection] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [selectedLink, setSelectedLink] = useState(null);
  const [toast, setToast] = useState("");
  const [lasso, setLasso] = useState(null); // {x1,y1,x2,y2} in board coords
  const [hoveredTileId, setHoveredTileId] = useState(null);
  const [connecting, setConnecting] = useState(null); // {fromId, side, x, y} board coords
  const [connectTarget, setConnectTarget] = useState(null);
  const [quickCreate, setQuickCreate] = useState(null); // {x, y, fromId} board coords — drag-to-empty-space create menu

  // ---- Refs ----
  const boardRef = useRef(null);
  const dragRef = useRef(null);     // tile drag
  const panRef = useRef(null);      // pan drag
  const resizeRef = useRef(null);   // tile resize
  const lassoRef = useRef(null);    // lasso select
  const connectingRef = useRef(null); // connector-dot drag
  const fileInputRef = useRef(null);
  const surfaceRef = useRef(null);    // the transformed board surface (empty-canvas hit target)
  const wasSoleSelectedRef = useRef(false); // did this pointerdown land on the one already-selected tile?

  // ═══════════════════════════════════════════════════════════════════════
  // TOAST
  // ═══════════════════════════════════════════════════════════════════════
  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // ZOOM
  // ═══════════════════════════════════════════════════════════════════════
  const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const zoomTo = useCallback((newZoom, focalScreenX, focalScreenY) => {
    setZoom((prevZoom) => {
      const clamped = clampZoom(newZoom);
      if (focalScreenX != null && focalScreenY != null) {
        setPan((p) => {
          const ratio = clamped / prevZoom;
          return {
            x: focalScreenX - ratio * (focalScreenX - p.x),
            y: focalScreenY - ratio * (focalScreenY - p.y),
          };
        });
      }
      return clamped;
    });
  }, []);

  const zoomIn = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    zoomTo(zoom + ZOOM_STEP, r.left + r.width / 2, r.top + r.height / 2);
  }, [zoom, zoomTo]);

  const zoomOut = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    zoomTo(zoom - ZOOM_STEP, r.left + r.width / 2, r.top + r.height / 2);
  }, [zoom, zoomTo]);

  const fitToScreen = useCallback(() => {
    if (tiles.length === 0) { setZoom(1); setPan({ x: 20, y: 20 }); return; }
    const el = boardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    tiles.forEach((t) => {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + t.w);
      maxY = Math.max(maxY, t.y + t.h);
    });
    const pad = 60;
    const cw = maxX - minX + pad * 2;
    const ch = maxY - minY + pad * 2;
    const z = clampZoom(Math.min(r.width / cw, r.height / ch));
    setZoom(z);
    setPan({ x: (r.width - cw * z) / 2 - (minX - pad) * z, y: (r.height - ch * z) / 2 - (minY - pad) * z });
  }, [tiles]);

  // Wheel zoom
  const onWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      zoomTo(zoom + delta, e.clientX, e.clientY);
    }
  }, [zoom, zoomTo]);

  // ═══════════════════════════════════════════════════════════════════════
  // TILE CRUD (through dispatch)
  // ═══════════════════════════════════════════════════════════════════════
  const addTileAt = useCallback((type, bx, by, shape = "rectangle") => {
    if (readOnly) return undefined;
    const t = makeTile(type, shape, bx, by);
    dispatch({ type: "ADD_TILE", tile: t });
    setEditingId(t.id);
    setSelection(new Set([t.id]));
    return t;
  }, [dispatch, readOnly]);

  const addShapeInView = useCallback((shapeKey) => {
    if (readOnly) return;
    const el = boardRef.current;
    if (!el) return;
    const dims = SHAPES[shapeKey] || SHAPES.rectangle;
    const r = el.getBoundingClientRect();
    const cx = (r.width / 2 - pan.x) / zoom - dims.w / 2 + (Math.random() - 0.5) * 60;
    const cy = (r.height / 2 - pan.y) / zoom - dims.h / 2 + (Math.random() - 0.5) * 60;
    addTileAt("user-story", cx, cy, shapeKey);
  }, [addTileAt, pan, zoom, readOnly]);

  const duplicateSelection = useCallback(() => {
    if (readOnly) return;
    const sel = tiles.filter((t) => selection.has(t.id));
    if (sel.length === 0) return;
    const idMap = new Map();
    const dupes = sel.map((t) => {
      const nt = makeTile(t.type, t.shape, t.x + 30, t.y + 30, {
        title: t.title, content: t.content, color: t.color,
        w: t.w, h: t.h, tags: [...t.tags], status: t.status, points: t.points,
      });
      idMap.set(t.id, nt.id);
      return nt;
    });
    dispatch({ type: "ADD_TILES", tiles: dupes });
    // duplicate links between selected tiles
    const selIds = new Set(sel.map((t) => t.id));
    const dupeLinks = links
      .filter((l) => selIds.has(l.from) && selIds.has(l.to))
      .map((l) => makeLink(idMap.get(l.from), idMap.get(l.to), { label: l.label, directed: l.directed }));
    if (dupeLinks.length > 0) dupeLinks.forEach((dl) => dispatch({ type: "ADD_LINK", link: dl }));
    setSelection(new Set(dupes.map((d) => d.id)));
    showToast(`Duplicated ${dupes.length} tile${dupes.length > 1 ? "s" : ""}`);
  }, [tiles, links, selection, dispatch, showToast, readOnly]);

  const deleteSelection = useCallback(() => {
    if (readOnly || selection.size === 0) return;
    dispatch({ type: "DELETE_TILES", ids: [...selection] });
    setSelection(new Set());
    if (editingId && selection.has(editingId)) setEditingId(null);
  }, [selection, dispatch, editingId, readOnly]);

  // ═══════════════════════════════════════════════════════════════════════
  // POINTER EVENTS — unified handler for drag, pan, resize, lasso, connect
  // ═══════════════════════════════════════════════════════════════════════
  const onBoardPointerDown = useCallback((e) => {
    if (quickCreate) setQuickCreate(null);
    if (e.button === 1 || (e.button === 0 && mode === "pan")) {
      // Pan
      panRef.current = { startX: e.clientX, startY: e.clientY, startPan: { ...pan } };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button === 0 && mode === "select" && (e.target === e.currentTarget || e.target === surfaceRef.current)) {
      // Lasso start on empty canvas
      const bp = screenToBoard(e.clientX, e.clientY, boardRef.current, zoom, pan.x, pan.y);
      lassoRef.current = { sx: e.clientX, sy: e.clientY };
      setLasso({ x1: bp.x, y1: bp.y, x2: bp.x, y2: bp.y });
      if (!e.shiftKey) setSelection(new Set());
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }, [mode, pan, zoom, quickCreate]);

  const onBoardPointerMove = useCallback((e) => {
    // Live cursor for collaborators — fires regardless of what else is happening.
    const livePos = screenToBoard(e.clientX, e.clientY, boardRef.current, zoom, pan.x, pan.y);
    broadcastCursor(livePos.x, livePos.y);

    // Connector-dot drag → link preview
    if (connectingRef.current) {
      const bp = screenToBoard(e.clientX, e.clientY, boardRef.current, zoom, pan.x, pan.y);
      setConnecting((c) => (c ? { ...c, x: bp.x, y: bp.y } : c));
      const target = tiles.find((t) =>
        t.id !== connectingRef.current.fromId &&
        bp.x >= t.x && bp.x <= t.x + t.w && bp.y >= t.y && bp.y <= t.y + t.h
      );
      setConnectTarget(target ? target.id : null);
      return;
    }
    // Pan
    if (panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      setPan({ x: panRef.current.startPan.x + dx, y: panRef.current.startPan.y + dy });
      return;
    }
    // Lasso
    if (lassoRef.current) {
      const bp = screenToBoard(e.clientX, e.clientY, boardRef.current, zoom, pan.x, pan.y);
      setLasso((l) => l ? { ...l, x2: bp.x, y2: bp.y } : null);
      return;
    }
    // Tile drag
    if (dragRef.current) {
      const bp = screenToBoard(e.clientX, e.clientY, boardRef.current, zoom, pan.x, pan.y);
      const dx = bp.x - dragRef.current.lastX;
      const dy = bp.y - dragRef.current.lastY;
      dragRef.current.lastX = bp.x;
      dragRef.current.lastY = bp.y;
      dragRef.current.moved = true;
      const updates = [...dragRef.current.ids].map((id) => {
        const t = tiles.find((tt) => tt.id === id);
        return [id, { x: Math.max(0, (t ? t.x : 0) + dx), y: Math.max(0, (t ? t.y : 0) + dy) }];
      });
      dispatch({ type: "UPDATE_TILES", updates, _silent: true });
      broadcastTileUpdates(updates);
      return;
    }
    // Tile resize
    if (resizeRef.current) {
      const bp = screenToBoard(e.clientX, e.clientY, boardRef.current, zoom, pan.x, pan.y);
      const t = tiles.find((tt) => tt.id === resizeRef.current.id);
      if (!t) return;
      const nw = Math.max(MIN_TILE_W, bp.x - t.x);
      const nh = Math.max(MIN_TILE_H, bp.y - t.y);
      dispatch({ type: "UPDATE_TILE", id: t.id, patch: { w: nw, h: nh }, _silent: true });
      broadcastTileUpdates([[t.id, { w: nw, h: nh }]]);
    }
  }, [pan, zoom, tiles, dispatch, broadcastCursor, broadcastTileUpdates]);

  const onBoardPointerUp = useCallback((e) => {
    // Finish connector-dot drag
    if (connectingRef.current) {
      const { fromId, side } = connectingRef.current;
      if (connectTarget && connectTarget !== fromId) {
        const exists = links.some(
          (l) => (l.from === fromId && l.to === connectTarget) || (l.from === connectTarget && l.to === fromId)
        );
        if (!exists) {
          dispatch({ type: "ADD_LINK", link: makeLink(fromId, connectTarget, { directed: true }) });
          showToast("Linked");
        }
      } else if (!readOnly) {
        // Dropped on empty canvas, far enough from the source tile to be a
        // deliberate drag (not just a click) — offer a quick-create menu,
        // Mural-style, instead of silently cancelling.
        const bp = screenToBoard(e.clientX, e.clientY, boardRef.current, zoom, pan.x, pan.y);
        const sourceTile = tiles.find((t) => t.id === fromId);
        const anchor = sourceTile ? anchorPoint(sourceTile, side) : bp;
        if (Math.hypot(bp.x - anchor.x, bp.y - anchor.y) > 30) {
          setQuickCreate({ x: bp.x, y: bp.y, fromId });
        }
      }
      connectingRef.current = null;
      setConnecting(null);
      setConnectTarget(null);
      return;
    }
    // Finish pan
    if (panRef.current) { panRef.current = null; return; }
    // Finish lasso
    if (lassoRef.current) {
      if (lasso) {
        const lx1 = Math.min(lasso.x1, lasso.x2), lx2 = Math.max(lasso.x1, lasso.x2);
        const ly1 = Math.min(lasso.y1, lasso.y2), ly2 = Math.max(lasso.y1, lasso.y2);
        if (Math.abs(lx2 - lx1) > 5 || Math.abs(ly2 - ly1) > 5) {
          const hit = tiles.filter((t) =>
            t.x + t.w > lx1 && t.x < lx2 && t.y + t.h > ly1 && t.y < ly2
          ).map((t) => t.id);
          setSelection((prev) => {
            const next = new Set(e.shiftKey ? prev : []);
            hit.forEach((id) => next.add(id));
            return next;
          });
        }
      }
      setLasso(null);
      lassoRef.current = null;
      return;
    }
    // Finish tile drag — commit to history
    if (dragRef.current) {
      if (dragRef.current.moved) {
        const updates = [...dragRef.current.ids].map((id) => {
          const t = tiles.find((tt) => tt.id === id);
          return [id, { x: t.x, y: t.y }];
        });
        // Positions are already applied silently — re-apply to push history.
        dispatch({ type: "UPDATE_TILES", updates });
      }
      dragRef.current = null;
      return;
    }
    // Finish resize — commit to history
    if (resizeRef.current) {
      const t = tiles.find((tt) => tt.id === resizeRef.current.id);
      if (t) dispatch({ type: "UPDATE_TILE", id: t.id, patch: { w: t.w, h: t.h } });
      resizeRef.current = null;
    }
  }, [lasso, tiles, dispatch, connectTarget, links, showToast, readOnly, pan, zoom]);

  // ---- Tile pointer down (drag or resize) ----
  const onTilePointerDown = useCallback((e, tile) => {
    e.stopPropagation();
    if (quickCreate) setQuickCreate(null);
    if (editingId === tile.id) return; // let clicks/selection happen inside the inline editor

    const bp = screenToBoard(e.clientX, e.clientY, boardRef.current, zoom, pan.x, pan.y);

    // Resizing and dragging are write operations — skipped entirely for
    // read-only viewers, but selection (harmless, local-only) still works.
    if (!readOnly) {
      const nearRight = bp.x > tile.x + tile.w - RESIZE_HANDLE / zoom;
      const nearBottom = bp.y > tile.y + tile.h - RESIZE_HANDLE / zoom;
      if (nearRight && nearBottom) {
        resizeRef.current = { id: tile.id };
        boardRef.current.setPointerCapture(e.pointerId);
        return;
      }
    }

    // A second click on an already (and solely) selected tile enters inline
    // text editing — captured here, before selection changes below.
    wasSoleSelectedRef.current = !readOnly && !e.shiftKey && selection.size === 1 && selection.has(tile.id);

    // Start tile drag
    let dragIds;
    if (e.shiftKey) {
      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(tile.id)) next.delete(tile.id); else next.add(tile.id);
        dragIds = next;
        return next;
      });
    } else {
      if (!selection.has(tile.id)) {
        dragIds = new Set([tile.id]);
        setSelection(dragIds);
      } else {
        dragIds = selection;
      }
    }

    if (readOnly) return;
    dragRef.current = {
      ids: dragIds || selection,
      lastX: bp.x,
      lastY: bp.y,
      moved: false,
    };
    boardRef.current.setPointerCapture(e.pointerId);
  }, [zoom, pan, selection, editingId, readOnly, quickCreate]);

  // ---- Connector dot pointer down → start link drag ----
  const onDotPointerDown = useCallback((e, tile, side) => {
    e.stopPropagation();
    if (readOnly) return;
    const anchor = anchorPoint(tile, side);
    connectingRef.current = { fromId: tile.id, side };
    setConnecting({ fromId: tile.id, side, x: anchor.x, y: anchor.y });
    boardRef.current.setPointerCapture(e.pointerId);
  }, [readOnly]);

  // ---- Tile click: a click on an already-selected tile enters inline edit ----
  const onTileClick = useCallback((e, tile) => {
    e.stopPropagation();
    if (dragRef.current && dragRef.current.moved) return;
    if (wasSoleSelectedRef.current) setEditingId(tile.id);
  }, []);

  const onTileDoubleClick = useCallback((e, tile) => {
    e.stopPropagation();
    if (readOnly) return;
    setSelection(new Set([tile.id]));
    setEditingId(tile.id);
  }, [readOnly]);

  // ═══════════════════════════════════════════════════════════════════════
  // DOUBLE-CLICK BOARD → add tile
  // ═══════════════════════════════════════════════════════════════════════
  const onBoardDoubleClick = useCallback((e) => {
    if (e.target !== e.currentTarget) return;
    if (mode === "pan") return;
    const bp = screenToBoard(e.clientX, e.clientY, boardRef.current, zoom, pan.x, pan.y);
    const dims = SHAPES.rectangle;
    addTileAt("user-story", bp.x - dims.w / 2, bp.y - dims.h / 2, "rectangle");
  }, [mode, zoom, pan, addTileAt]);

  // ═══════════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const handler = (e) => {
      if (editingId) return; // don't hijack when editing
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "z" && !e.shiftKey) { e.preventDefault(); dispatch({ type: "UNDO" }); }
      else if (ctrl && e.key === "z" && e.shiftKey) { e.preventDefault(); dispatch({ type: "REDO" }); }
      else if (ctrl && e.key === "y") { e.preventDefault(); dispatch({ type: "REDO" }); }
      else if (ctrl && e.key === "d") { e.preventDefault(); duplicateSelection(); }
      else if (ctrl && e.key === "a") { e.preventDefault(); setSelection(new Set(tiles.map((t) => t.id))); }
      else if (e.key === "Delete" || e.key === "Backspace") { if (selection.size > 0) { e.preventDefault(); deleteSelection(); } }
      else if (e.key === " " && !ctrl) { e.preventDefault(); setMode((m) => m === "pan" ? "select" : "pan"); }
      else if (e.key === "Escape") {
        setSelection(new Set()); setMode("select");
        connectingRef.current = null; setConnecting(null); setConnectTarget(null);
        setQuickCreate(null);
      }
      else if (e.key === "=" || e.key === "+") { if (ctrl) { e.preventDefault(); zoomIn(); } }
      else if (e.key === "-") { if (ctrl) { e.preventDefault(); zoomOut(); } }
      else if (e.key === "0" && ctrl) { e.preventDefault(); fitToScreen(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editingId, dispatch, duplicateSelection, deleteSelection, tiles, selection, zoomIn, zoomOut, fitToScreen]);

  // ═══════════════════════════════════════════════════════════════════════
  // EXPORT / IMPORT
  // ═══════════════════════════════════════════════════════════════════════
  const exportBoard = useCallback(() => {
    const payload = { format: "mumap", version: 1, exportedAt: new Date().toISOString(), tiles, links };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mumap-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Downloaded — links included");
  }, [tiles, links, showToast]);

  const importBoard = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = JSON.parse(reader.result);
        if (!Array.isArray(p.tiles)) throw new Error("bad");
        dispatch({ type: "LOAD", tiles: p.tiles, links: p.links || [] });
        showToast("Board loaded");
      } catch { showToast("Couldn't read that file"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [dispatch, showToast]);

  const singleSelectedTile = selection.size === 1 ? tiles.find((t) => selection.has(t.id)) : null;

  // ═══════════════════════════════════════════════════════════════════════
  // MINIMAP
  // ═══════════════════════════════════════════════════════════════════════
  const Minimap = useMemo(() => {
    if (tiles.length === 0) return null;
    const mW = 140, mH = 90;
    const scaleX = mW / BOARD_W, scaleY = mH / BOARD_H;
    const s = Math.min(scaleX, scaleY);
    return (
      <div style={styles.minimap}>
        <svg width={mW} height={mH} style={{ display: "block" }}>
          <rect width={mW} height={mH} fill="#f9fafb" rx={4} />
          {tiles.map((t) => (
            <rect key={t.id} x={t.x * s} y={t.y * s} width={t.w * s} height={t.h * s}
              fill={selection.has(t.id) ? ACCENT : t.color} opacity={0.9} rx={1} />
          ))}
          {/* viewport rectangle */}
          {boardRef.current && (() => {
            const r = boardRef.current.getBoundingClientRect();
            const vx = -pan.x / zoom, vy = -pan.y / zoom;
            const vw = r.width / zoom, vh = r.height / zoom;
            return <rect x={vx * s} y={vy * s} width={vw * s} height={vh * s}
              fill="none" stroke={ACCENT} strokeWidth={1.5} rx={2} opacity={0.8} />;
          })()}
        </svg>
      </div>
    );
  }, [tiles, pan, zoom, selection]);

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  const cursorStyle = mode === "pan" ? "grab" : "default";

  if (permLoading) {
    return <div style={styles.accessScreen}>Loading…</div>;
  }
  if (!permission) {
    return (
      <div style={styles.accessScreen}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>You don't have access to this map</div>
        <div style={{ fontSize: 13, color: INK_FAINT, marginBottom: 16 }}>Ask its owner to share it with you, or head back to your maps.</div>
        <button style={styles.btnPrimary} onClick={() => navigate("/")}><ArrowLeft size={14} /> Back to maps</button>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .tile { transition: box-shadow 0.12s ease; }
        .tile:hover .resize-handle { opacity: 1 !important; }
        .lasso-rect { fill: rgba(79,70,229,0.08); stroke: ${ACCENT}; stroke-width: 1.5; stroke-dasharray: 6 3; }
        .connector-dot:hover { transform: translate(-50%,-50%) scale(1.15) !important; }
        .toolbtn:hover { background: #e5e7eb !important; }
        .shape-btn:hover { background: ${SUBTLE_BG}; }
      `}</style>

      {/* ════════ HEADER ════════ */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <button className="toolbtn" style={styles.iconBtn} onClick={() => navigate("/")} title="Back to maps"><ArrowLeft size={16} /></button>
          <div style={{ minWidth: 0 }}>
            <div style={styles.headerTitle}>{mapRow?.name || "MuMap"}</div>
            <div style={styles.headerSub}>
              {readOnly ? "View only — ask the owner for edit access to make changes" : "Pick a shape from the panel · Drag a tile's dots to link · Space to pan"}
            </div>
          </div>
        </div>
        <div style={styles.toolbarRow}>
          {readOnly && <div style={styles.viewOnlyBadge}><Eye size={12} /> View only</div>}

          {collaborators.length > 0 && (
            <div style={styles.avatarStack} title={collaborators.map((c) => c.name).join(", ")}>
              {collaborators.slice(0, 5).map((c) => (
                <div key={c.id} style={{ ...styles.avatar, background: c.color }}>{(c.name || "?").slice(0, 1).toUpperCase()}</div>
              ))}
            </div>
          )}

          {isOwner && (
            <button className="toolbtn" style={styles.btn} onClick={() => setShareOpen(true)}><Share2 size={14} /> Share</button>
          )}

          <button className="toolbtn" style={{ ...styles.btn, background: mode === "pan" ? ACCENT_SOFT : SUBTLE_BG }}
            onClick={() => setMode((m) => m === "pan" ? "select" : "pan")}>
            <Move size={14} /> Pan
          </button>

          <div style={styles.separator} />

          {!readOnly && (
            <>
              {/* Undo / Redo */}
              <button className="toolbtn" style={{ ...styles.iconBtn, opacity: canUndo ? 1 : 0.35 }} onClick={() => dispatch({ type: "UNDO" })} title="Undo (Ctrl+Z)"><Undo2 size={16} /></button>
              <button className="toolbtn" style={{ ...styles.iconBtn, opacity: canRedo ? 1 : 0.35 }} onClick={() => dispatch({ type: "REDO" })} title="Redo (Ctrl+Shift+Z)"><Redo2 size={16} /></button>

              {/* Duplicate */}
              <button className="toolbtn" style={{ ...styles.iconBtn, opacity: selection.size > 0 ? 1 : 0.35 }}
                onClick={duplicateSelection} title="Duplicate (Ctrl+D)"><Copy size={16} /></button>

              <div style={styles.separator} />
            </>
          )}

          {/* Zoom */}
          <button className="toolbtn" style={styles.iconBtn} onClick={zoomOut} title="Zoom out"><ZoomOut size={16} /></button>
          <span style={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
          <button className="toolbtn" style={styles.iconBtn} onClick={zoomIn} title="Zoom in"><ZoomIn size={16} /></button>
          <button className="toolbtn" style={styles.iconBtn} onClick={fitToScreen} title="Fit all (Ctrl+0)"><Maximize size={16} /></button>

          <div style={styles.separator} />

          {/* IO */}
          <button className="toolbtn" style={styles.btn} onClick={exportBoard}><Download size={14} /> Save</button>
          {!readOnly && (
            <>
              <button className="toolbtn" style={styles.btn} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Load</button>
              <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={importBoard} />
            </>
          )}
        </div>
      </div>

      {shareOpen && <ShareMapPanel mapId={mapId} onClose={() => setShareOpen(false)} />}

      {connecting && (
        <div style={styles.hintBar}>Drop on a tile to link — release elsewhere to cancel.</div>
      )}

      {/* ════════ MAIN ROW: side panel + board ════════ */}
      <div style={styles.mainRow}>
        {/* ════════ SIDE PANEL — Mural-style shape picker ════════ */}
        {!readOnly && (
          <div style={styles.sidebar}>
            <div style={styles.sidebarLabel}>Add tile</div>
            {Object.entries(SHAPES).map(([key, s]) => {
              const Icon = SHAPE_ICONS[key];
              return (
                <button key={key} className="shape-btn" style={styles.shapeBtn} onClick={() => addShapeInView(key)} title={`Add ${s.label}`}>
                  <span style={styles.shapePreview}><Icon size={26} strokeWidth={1.75} color={INK_SOFT} /></span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ════════ BOARD AREA (zoom + pan layer) ════════ */}
        <div style={styles.boardArea}>
          <div
            ref={boardRef}
            style={{ ...styles.board, cursor: cursorStyle }}
            onPointerDown={onBoardPointerDown}
            onPointerMove={onBoardPointerMove}
            onPointerUp={onBoardPointerUp}
            onWheel={onWheel}
          >
            <div
              ref={surfaceRef}
              onDoubleClick={onBoardDoubleClick}
              style={{
                width: BOARD_W, height: BOARD_H,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                position: "relative",
                backgroundImage: `radial-gradient(circle, rgba(31,41,55,0.08) 1.2px, transparent 1.2px)`,
                backgroundSize: "24px 24px",
              }}>
              {/* SVG layer: links + lasso + connect preview */}
              <svg style={{ position: "absolute", inset: 0, width: BOARD_W, height: BOARD_H, pointerEvents: "none", overflow: "visible" }}>
                <defs>
                  <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill={LINK_COLOR} />
                  </marker>
                  <marker id="arrow-selected" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill={LINK_SELECTED} />
                  </marker>
                  <marker id="arrow-preview" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill={LINK_PREVIEW} />
                  </marker>
                </defs>

                {links.map((l) => {
                  const from = tiles.find((t) => t.id === l.from);
                  const to = tiles.find((t) => t.id === l.to);
                  if (!from || !to) return null;
                  const [fromSide, toSide] = pickSides(from, to);
                  const axis = (fromSide === "left" || fromSide === "right") ? "h" : "v";
                  const p1 = anchorPoint(from, fromSide);
                  const p2 = anchorPoint(to, toSide);
                  const d = elbowPath(p1, p2, axis);
                  const isSel = selectedLink === l.id;
                  return (
                    <g key={l.id}>
                      {/* fat invisible hit area */}
                      <path d={d} fill="none"
                        stroke="transparent" strokeWidth={16}
                        style={{ pointerEvents: "stroke", cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); setSelectedLink((c) => c === l.id ? null : l.id); }} />
                      <path d={d} fill="none"
                        stroke={isSel ? LINK_SELECTED : LINK_COLOR} strokeWidth={isSel ? 2.75 : 2}
                        strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }}
                        markerEnd={l.directed ? `url(#${isSel ? "arrow-selected" : "arrow-default"})` : undefined} />
                    </g>
                  );
                })}

                {connecting && (() => {
                  const fromTile = tiles.find((t) => t.id === connecting.fromId);
                  if (!fromTile) return null;
                  const start = anchorPoint(fromTile, connecting.side);
                  const axis = (connecting.side === "left" || connecting.side === "right") ? "h" : "v";
                  const d = axis === "h"
                    ? `M ${start.x} ${start.y} L ${connecting.x} ${start.y} L ${connecting.x} ${connecting.y}`
                    : `M ${start.x} ${start.y} L ${start.x} ${connecting.y} L ${connecting.x} ${connecting.y}`;
                  return (
                    <path d={d} fill="none"
                      stroke={LINK_PREVIEW} strokeWidth={2.5} strokeDasharray="6 4"
                      strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#arrow-preview)" />
                  );
                })()}

                {lasso && (
                  <rect className="lasso-rect"
                    x={Math.min(lasso.x1, lasso.x2)} y={Math.min(lasso.y1, lasso.y2)}
                    width={Math.abs(lasso.x2 - lasso.x1)} height={Math.abs(lasso.y2 - lasso.y1)} />
                )}
              </svg>

              {/* Remove-link button */}
              {selectedLink && (() => {
                const l = links.find((x) => x.id === selectedLink);
                if (!l) return null;
                const from = tiles.find((t) => t.id === l.from);
                const to = tiles.find((t) => t.id === l.to);
                if (!from || !to) return null;
                const [fromSide, toSide] = pickSides(from, to);
                const p1 = anchorPoint(from, fromSide);
                const p2 = anchorPoint(to, toSide);
                const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
                return (
                  <button style={{ ...styles.removeLinkBtn, left: cx - 14, top: cy - 14 }}
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: "DELETE_LINK", id: selectedLink }); setSelectedLink(null); }}
                    title="Remove link"><X size={14} /></button>
                );
              })()}

              {/* TILES */}
              {tiles.map((t) => {
                const isSel = selection.has(t.id);
                const isConnectTarget = connecting && connectTarget === t.id;
                const isConnectSource = connecting && connecting.fromId === t.id;
                const isCircle = t.shape === "circle";
                const showDots = !readOnly && mode === "select" && !editingId &&
                  (isConnectSource || (!connecting && (hoveredTileId === t.id || isSel)));
                return (
                  <div key={t.id} className="tile"
                    style={{
                      ...styles.tile,
                      left: t.x, top: t.y, width: t.w, minHeight: t.h,
                      background: t.color,
                      borderRadius: isCircle ? "50%" : 14,
                      display: isCircle ? "flex" : "block",
                      flexDirection: isCircle ? "column" : undefined,
                      alignItems: isCircle ? "center" : undefined,
                      justifyContent: isCircle ? "center" : undefined,
                      textAlign: isCircle ? "center" : "left",
                      outline: isConnectTarget ? `3px solid ${ACCENT}` : isSel ? `2px solid ${ACCENT}` : `1px solid ${BORDER}`,
                      outlineOffset: isSel && !isConnectTarget ? 2 : 0,
                      cursor: "grab",
                      boxShadow: isSel ? "0 6px 18px rgba(31,41,55,0.18)" : "0 2px 6px rgba(31,41,55,0.08)",
                      zIndex: isSel || isConnectSource ? 5 : 1,
                    }}
                    onPointerDown={(e) => onTilePointerDown(e, t)}
                    onPointerEnter={() => setHoveredTileId(t.id)}
                    onPointerLeave={() => setHoveredTileId((id) => (id === t.id ? null : id))}
                    onClick={(e) => onTileClick(e, t)}
                    onDoubleClick={(e) => onTileDoubleClick(e, t)}
                  >
                    <div style={styles.tileBadge}>{TILE_TYPES[t.type]?.short || "•"}</div>
                    {editingId === t.id ? (
                      <div
                        style={{ width: "100%" }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setEditingId(null); }}
                      >
                        <input
                          autoFocus
                          style={{ ...styles.tileTitleInput, textAlign: isCircle ? "center" : "left" }}
                          value={t.title}
                          placeholder="Title"
                          onChange={(e) => dispatch({ type: "UPDATE_TILE", id: t.id, patch: { title: e.target.value }, _silent: true })}
                          onBlur={() => dispatch({ type: "UPDATE_TILE", id: t.id, patch: { title: t.title } })}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
                        />
                        <textarea
                          style={{ ...styles.tileContentInput, textAlign: isCircle ? "center" : "left" }}
                          value={t.content}
                          placeholder="Details, acceptance criteria, notes…"
                          onChange={(e) => dispatch({ type: "UPDATE_TILE", id: t.id, patch: { content: e.target.value }, _silent: true })}
                          onBlur={() => dispatch({ type: "UPDATE_TILE", id: t.id, patch: { content: t.content } })}
                          onKeyDown={(e) => { if (e.key === "Escape") e.currentTarget.blur(); }}
                        />
                      </div>
                    ) : (
                      <>
                        <div style={styles.tileTitle}>{t.title || "Untitled"}</div>
                        {t.content && <div style={styles.tileContent}>{t.content}</div>}
                      </>
                    )}

                    {/* Resize handle */}
                    <div className="resize-handle" style={styles.resizeHandle}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        resizeRef.current = { id: t.id };
                        boardRef.current.setPointerCapture(e.pointerId);
                      }}
                    />

                    {/* Connector dots — Mural-style link handles */}
                    {showDots && SIDES.map((side) => (
                      <div key={side} className="connector-dot"
                        style={{ ...styles.connectorDot, ...dotPositionStyle(side) }}
                        onPointerDown={(e) => onDotPointerDown(e, t, side)}
                      />
                    ))}
                  </div>
                );
              })}

              {/* Remote collaborator cursors */}
              {Object.entries(remoteCursors).map(([userId, c]) => (
                <div key={userId} style={{ position: "absolute", left: c.x, top: c.y, zIndex: 40, pointerEvents: "none" }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: "block", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }}>
                    <path d="M2 1 L16 8 L9 9.5 L7 16 Z" fill={c.color} stroke="#fff" strokeWidth="1" />
                  </svg>
                  <div style={{ ...styles.cursorLabel, background: c.color }}>{c.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ════════ MINIMAP ════════ */}
          {Minimap}

          {/* ════════ ZOOM CONTROLS (bottom left, mobile-friendly) ════════ */}
          <div style={styles.zoomCorner}>
            <button style={styles.cornerBtn} onClick={zoomOut}><ZoomOut size={18} /></button>
            <span style={{ fontSize: 11, color: INK, minWidth: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
            <button style={styles.cornerBtn} onClick={zoomIn}><ZoomIn size={18} /></button>
            <button style={styles.cornerBtn} onClick={fitToScreen}><Maximize size={18} /></button>
          </div>

          {/* ════════ SELECTION TOOLBAR (floating) ════════ */}
          {!readOnly && selection.size > 0 && !editingId && (
            <div style={styles.selToolbar}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>{selection.size} selected</span>
              <button style={styles.selBtn} onClick={duplicateSelection}><Copy size={14} /> Duplicate</button>
              <button style={{ ...styles.selBtn, color: "#f2a3a3" }} onClick={deleteSelection}><Trash2 size={14} /> Delete</button>
            </div>
          )}

          {/* ════════ EMPTY STATE ════════ */}
          {tiles.length === 0 && loaded && (
            <div style={styles.emptyHint}>
              {readOnly ? "This map is empty so far." : "Pick a shape from the left panel, or double-click the board to pin your first tile."}
            </div>
          )}

          {/* ════════ MINI TOOLBAR — floats above the single selected tile ════════ */}
          {!readOnly && singleSelectedTile && mode === "select" && !connecting && (() => {
            const left = singleSelectedTile.x * zoom + pan.x + (singleSelectedTile.w * zoom) / 2;
            const top = singleSelectedTile.y * zoom + pan.y;
            return (
              <div style={{ ...styles.miniToolbar, left, top: top - 46 }} onPointerDown={(e) => e.stopPropagation()}>
                <select value={singleSelectedTile.type} onChange={(e) => {
                  const type = e.target.value;
                  dispatch({ type: "UPDATE_TILE", id: singleSelectedTile.id, patch: { type, color: TILE_TYPES[type].color } });
                }} style={styles.miniSelect} title="Type">
                  {Object.entries(TILE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>

                <div style={styles.miniSep} />

                {SWATCHES.map((c) => (
                  <button key={c} onClick={() => dispatch({ type: "UPDATE_TILE", id: singleSelectedTile.id, patch: { color: c } })}
                    style={{ ...styles.miniSwatch, background: c, outline: singleSelectedTile.color === c ? `2px solid ${ACCENT}` : `1px solid ${BORDER}` }} />
                ))}

                <div style={styles.miniSep} />

                {Object.entries(SHAPES).map(([key, s]) => {
                  const Icon = SHAPE_ICONS[key];
                  const isActive = (singleSelectedTile.shape || "rectangle") === key;
                  return (
                    <button key={key} onClick={() => dispatch({ type: "UPDATE_TILE", id: singleSelectedTile.id, patch: { shape: key } })}
                      style={{ ...styles.miniShapeBtn, outline: isActive ? `2px solid ${ACCENT}` : `1px solid ${BORDER}` }}
                      title={s.label}>
                      <Icon size={13} strokeWidth={1.75} color={INK_SOFT} />
                    </button>
                  );
                })}

                <div style={styles.miniSep} />

                <button style={styles.miniDeleteBtn} title="Delete" onClick={() => {
                  dispatch({ type: "DELETE_TILES", ids: [singleSelectedTile.id] });
                  setEditingId(null); setSelection(new Set());
                }}><Trash2 size={13} /></button>
              </div>
            );
          })()}

          {/* ════════ QUICK-CREATE MENU — dropping a connector on empty canvas ════════ */}
          {quickCreate && (() => {
            const sourceTile = tiles.find((t) => t.id === quickCreate.fromId);
            const left = quickCreate.x * zoom + pan.x;
            const top = quickCreate.y * zoom + pan.y;
            const createLinkedTile = (type, shape, overrides = {}) => {
              const dims = SHAPES[shape] || SHAPES.rectangle;
              const t = makeTile(type, shape, quickCreate.x - dims.w / 2, quickCreate.y - dims.h / 2, overrides);
              dispatch({ type: "ADD_TILE", tile: t });
              dispatch({ type: "ADD_LINK", link: makeLink(quickCreate.fromId, t.id, { directed: true }) });
              setSelection(new Set([t.id]));
              setEditingId(t.id);
              setQuickCreate(null);
            };
            return (
              <div style={{ ...styles.quickCreateMenu, left, top }} onPointerDown={(e) => e.stopPropagation()}>
                {sourceTile && (
                  <button style={styles.quickCreateBtn}
                    onClick={() => createLinkedTile(sourceTile.type, sourceTile.shape, { color: sourceTile.color })}>
                    <Copy size={13} /> Same shape
                  </button>
                )}
                <div style={styles.quickCreateLabel}>Or pick a shape</div>
                <div style={styles.quickCreateShapesRow}>
                  {Object.entries(SHAPES).map(([key, s]) => {
                    const Icon = SHAPE_ICONS[key];
                    return (
                      <button key={key} style={styles.quickCreateShapeBtn} title={s.label}
                        onClick={() => createLinkedTile("user-story", key)}>
                        <Icon size={16} strokeWidth={1.75} color={INK_SOFT} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ════════ TOAST ════════ */}
      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
  page: { fontFamily: FONT, height: "100vh", width: "100%", display: "flex", flexDirection: "column", background: PAGE_BG, overflow: "hidden", position: "relative" },
  accessScreen: { fontFamily: FONT, height: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: PAGE_BG, color: INK, textAlign: "center", padding: 20 },

  // Header
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "10px 16px", background: "#ffffff", borderBottom: `1px solid ${BORDER}` },
  headerTitle: { fontFamily: FONT, fontWeight: 700, fontSize: 20, color: INK, lineHeight: 1.1 },
  headerSub: { fontSize: 11, color: INK_FAINT, marginTop: 1 },
  toolbarRow: { display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" },
  separator: { width: 1, height: 22, background: BORDER, margin: "0 2px" },

  // View-only badge
  viewOnlyBadge: { display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, background: SUBTLE_BG, color: INK_SOFT, fontSize: 11.5, fontWeight: 700 },

  // Collaborator avatars
  avatarStack: { display: "flex", alignItems: "center", marginRight: 4 },
  avatar: { width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, border: "2px solid #fff", marginLeft: -8, boxShadow: "0 1px 2px rgba(0,0,0,0.15)" },

  // Remote cursor label
  cursorLabel: { marginLeft: 16, marginTop: -6, display: "inline-block", whiteSpace: "nowrap", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5, boxShadow: "0 1px 3px rgba(0,0,0,0.25)" },

  // Buttons
  btn: { display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 7, border: "none", background: SUBTLE_BG, color: INK, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  btnPrimary: { display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "none", background: ACCENT, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  iconBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: "none", background: SUBTLE_BG, color: INK, cursor: "pointer" },
  zoomLabel: { fontSize: 11, color: INK, minWidth: 36, textAlign: "center", fontWeight: 600 },

  hintBar: { background: ACCENT, color: "#fff", fontSize: 11, padding: "5px 14px", textAlign: "center" },

  // Layout
  mainRow: { display: "flex", flex: 1, minHeight: 0, overflow: "hidden" },

  // Sidebar (Mural-style shape panel)
  sidebar: { width: 92, flexShrink: 0, background: PANEL_BG, borderRight: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "16px 6px", overflowY: "auto" },
  sidebarLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: INK_FAINT, textTransform: "uppercase", marginBottom: 4 },
  shapeBtn: { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, border: "none", background: "transparent", cursor: "pointer", padding: "8px 4px", borderRadius: 10, color: INK_SOFT, fontSize: 10.5, fontWeight: 600 },
  shapePreview: { width: 44, height: 44, borderRadius: 10, background: SUBTLE_BG, display: "flex", alignItems: "center", justifyContent: "center" },

  // Board area
  boardArea: { position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" },
  board: { flex: 1, overflow: "hidden", background: BOARD_BG, position: "relative", touchAction: "none" },

  // Tiles
  tile: { position: "absolute", borderRadius: 14, padding: "14px 14px 12px", boxSizing: "border-box", fontFamily: FONT, userSelect: "none", touchAction: "none" },
  tileBadge: { fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, color: "rgba(31,41,55,0.45)", marginBottom: 3 },
  tileTitle: { fontFamily: FONT, fontWeight: 700, fontSize: 14, color: INK, lineHeight: 1.25, wordBreak: "break-word" },
  tileContent: { fontSize: 11.5, color: INK_SOFT, marginTop: 5, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 80, overflow: "hidden" },
  tileTitleInput: { display: "block", width: "100%", fontFamily: FONT, fontWeight: 700, fontSize: 14, color: INK, lineHeight: 1.25, border: "none", background: "transparent", padding: 0, outline: "none" },
  tileContentInput: { display: "block", width: "100%", fontFamily: FONT, fontSize: 11.5, color: INK_SOFT, marginTop: 5, border: "none", background: "transparent", padding: 0, outline: "none", resize: "none", minHeight: 60, maxHeight: 160 },
  resizeHandle: { position: "absolute", bottom: 0, right: 0, width: RESIZE_HANDLE, height: RESIZE_HANDLE, cursor: "nwse-resize", opacity: 0, background: "linear-gradient(135deg, transparent 40%, rgba(31,41,55,0.3) 40%, rgba(31,41,55,0.3) 50%, transparent 50%, transparent 70%, rgba(31,41,55,0.3) 70%)", borderRadius: "0 0 4px 0", transition: "opacity 0.15s" },

  // Connector dots (Mural-style link handles)
  connectorDot: { position: "absolute", width: 16, height: 16, borderRadius: "50%", background: "#ffffff", border: `2px solid ${ACCENT}`, cursor: "crosshair", zIndex: 8, boxShadow: "0 1px 3px rgba(31,41,55,0.3)", transition: "transform 0.1s" },

  // Link remove
  removeLinkBtn: { position: "absolute", width: 28, height: 28, borderRadius: "50%", border: "none", background: DANGER, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 3px 8px rgba(0,0,0,0.25)", zIndex: 10 },

  // Minimap
  minimap: { position: "absolute", bottom: 52, right: 10, borderRadius: 6, overflow: "hidden", boxShadow: "0 4px 12px rgba(31,41,55,0.15)", border: `1px solid ${BORDER}`, zIndex: 20 },

  // Zoom corner (mobile)
  zoomCorner: { position: "absolute", bottom: 10, right: 10, display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.92)", padding: "4px 6px", borderRadius: 8, zIndex: 20, border: `1px solid ${BORDER}`, boxShadow: "0 4px 10px rgba(31,41,55,0.1)", backdropFilter: "blur(4px)" },
  cornerBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: "none", background: SUBTLE_BG, color: INK, cursor: "pointer" },

  // Selection toolbar
  selToolbar: { position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, background: "#1f2937", padding: "6px 14px", borderRadius: 10, zIndex: 20, backdropFilter: "blur(6px)" },
  selBtn: { display: "flex", alignItems: "center", gap: 4, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" },

  // Mini toolbar — floats above the single selected tile (screen-space, not scaled by zoom)
  miniToolbar: { position: "absolute", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 6, background: "#1f2937", padding: "6px 8px", borderRadius: 10, zIndex: 30, boxShadow: "0 6px 16px rgba(0,0,0,0.25)", whiteSpace: "nowrap" },
  miniSep: { width: 1, height: 20, background: "rgba(255,255,255,0.15)" },
  miniSelect: { padding: "4px 6px", borderRadius: 6, border: "none", fontSize: 11.5, fontWeight: 600, color: INK, background: "#fff", maxWidth: 130 },
  miniSwatch: { width: 18, height: 18, borderRadius: "50%", border: "none", cursor: "pointer", flexShrink: 0 },
  miniShapeBtn: { width: 22, height: 22, borderRadius: 6, border: "none", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  miniDeleteBtn: { width: 24, height: 24, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.12)", color: "#f2a3a3", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },

  // Quick-create menu — dropping a connector on empty canvas (Mural-style)
  quickCreateMenu: { position: "absolute", transform: "translate(-50%, 12px)", display: "flex", flexDirection: "column", gap: 6, background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 10, boxShadow: "0 12px 28px rgba(31,41,55,0.2)", zIndex: 35, minWidth: 150 },
  quickCreateBtn: { display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: "none", background: SUBTLE_BG, color: INK, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  quickCreateLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: INK_FAINT, textTransform: "uppercase", marginTop: 2 },
  quickCreateShapesRow: { display: "flex", gap: 6 },
  quickCreateShapeBtn: { width: 32, height: 32, borderRadius: 8, border: `1px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },

  // Toast
  toast: { position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#1f2937", color: "#fff", padding: "7px 16px", borderRadius: 20, fontSize: 12, zIndex: 60, boxShadow: "0 6px 16px rgba(0,0,0,0.25)" },

  // Empty hint
  emptyHint: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: INK_FAINT, fontSize: 14, textAlign: "center", maxWidth: 280, pointerEvents: "none", zIndex: 5 },
};
