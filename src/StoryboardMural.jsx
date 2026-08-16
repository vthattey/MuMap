import React, { useState, useEffect, useRef, useCallback, useReducer, useMemo } from "react";
import {
  Plus, Link2, Download, Upload, X, Trash2, Pin, Unlink,
  ZoomIn, ZoomOut, Maximize, Undo2, Redo2, Copy, Move,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════
const FONT_DISPLAY = "'Kalam', cursive";
const FONT_BODY = "'Inter', system-ui, sans-serif";
const BOARD_BG = "#3f5749";
const BOARD_BG_2 = "#374b3f";
const FRAME = "#7a5433";
const FRAME_DARK = "#5c3f26";
const INK = "#2b2118";

// ═══════════════════════════════════════════════════════════════════════════
// DATA MODEL — extensible for future phases (tags, status, points, etc.)
// ═══════════════════════════════════════════════════════════════════════════
const TILE_TYPES = {
  "user-story": { label: "User Story", color: "#f5d76e", short: "US" },
  "tech-story": { label: "Technical Story", color: "#7ec8e3", short: "TS" },
  question:     { label: "Assumption / Question", color: "#d8b4f0", short: "Q" },
  estimate:     { label: "Estimate", color: "#93d9a8", short: "E" },
};

const SWATCHES = [
  "#f5d76e","#7ec8e3","#d8b4f0","#93d9a8",
  "#f2a3a3","#f3c98b","#a9c9f7","#e6e2d3",
];

const STORAGE_KEY = "storyboard:board:v2";
const BOARD_W = 4000;
const BOARD_H = 3000;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.15;
const HISTORY_LIMIT = 60;
const DEFAULT_TILE_W = 190;
const DEFAULT_TILE_H = 150;
const MIN_TILE_W = 120;
const MIN_TILE_H = 80;
const RESIZE_HANDLE = 14;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE ADAPTER — wraps localStorage behind the same tiny async interface
// used by window.storage in the Claude artifact runtime, so this component
// works unchanged inside Claude and in a standalone deployment.
// ═══════════════════════════════════════════════════════════════════════════
const storage = {
  async get(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? null : { key, value: raw };
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return { key, value };
    } catch {
      return null;
    }
  },
};

function makeTile(type, x, y, overrides = {}) {
  const t = TILE_TYPES[type] || TILE_TYPES["user-story"];
  return {
    id: uid(),
    type,
    title: t.label,
    content: "",
    color: t.color,
    x, y,
    w: DEFAULT_TILE_W,
    h: DEFAULT_TILE_H,
    // Phase 3+ fields — present but unused, so model is stable
    tags: [],
    status: "none",
    points: null,
    ...overrides,
  };
}

function makeLink(fromId, toId, overrides = {}) {
  return {
    id: uid(),
    from: fromId,
    to: toId,
    // Phase 5+ fields
    label: "",
    directed: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BOARD REDUCER — single source of truth for tiles + links.
// Every mutation is an action → clean undo/redo via history stack.
// ═══════════════════════════════════════════════════════════════════════════
const initialBoard = { tiles: [], links: [] };

function boardReducer(state, action) {
  switch (action.type) {
    case "LOAD":
      return { tiles: action.tiles || [], links: action.links || [] };

    case "ADD_TILE":
      return { ...state, tiles: [...state.tiles, action.tile] };

    case "ADD_TILES":
      return { ...state, tiles: [...state.tiles, ...action.tiles] };

    case "DELETE_TILES": {
      const ids = new Set(action.ids);
      return {
        tiles: state.tiles.filter((t) => !ids.has(t.id)),
        links: state.links.filter((l) => !ids.has(l.from) && !ids.has(l.to)),
      };
    }

    case "UPDATE_TILE":
      return {
        ...state,
        tiles: state.tiles.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
      };

    case "UPDATE_TILES": {
      const map = new Map(action.updates); // [[id, patch], ...]
      return {
        ...state,
        tiles: state.tiles.map((t) => (map.has(t.id) ? { ...t, ...map.get(t.id) } : t)),
      };
    }

    case "ADD_LINK":
      return { ...state, links: [...state.links, action.link] };

    case "DELETE_LINK":
      return { ...state, links: state.links.filter((l) => l.id !== action.id) };

    case "DELETE_LINKS": {
      const ids = new Set(action.ids);
      return { ...state, links: state.links.filter((l) => !ids.has(l.id)) };
    }

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UNDO / REDO WRAPPER around the reducer
// ═══════════════════════════════════════════════════════════════════════════
function useUndoReducer(reducer, init) {
  const [history, setHistory] = useState({ past: [], present: init, future: [] });

  const dispatch = useCallback((action) => {
    setHistory((h) => {
      if (action.type === "UNDO") {
        if (h.past.length === 0) return h;
        const prev = h.past[h.past.length - 1];
        return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future].slice(0, HISTORY_LIMIT) };
      }
      if (action.type === "REDO") {
        if (h.future.length === 0) return h;
        const next = h.future[0];
        return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: h.future.slice(1) };
      }
      // "silent" actions (like LOAD, or drag moves) don't push to history
      if (action._silent) {
        return { ...h, present: reducer(h.present, action) };
      }
      const newPresent = reducer(h.present, action);
      return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: newPresent, future: [] };
    });
  }, [reducer]);

  return [history.present, dispatch, history.past.length > 0, history.future.length > 0];
}

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

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function StoryboardMural() {
  // ---- Core state (undoable) ----
  const [board, dispatch, canUndo, canRedo] = useUndoReducer(boardReducer, initialBoard);
  const { tiles, links } = board;

  // ---- UI-only state (not undoable) ----
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState("select"); // select | link | pan
  const [linkFrom, setLinkFrom] = useState(null);
  const [selection, setSelection] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [selectedLink, setSelectedLink] = useState(null);
  const [toast, setToast] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [lasso, setLasso] = useState(null); // {x1,y1,x2,y2} in board coords

  // ---- Refs ----
  const boardRef = useRef(null);
  const dragRef = useRef(null);   // tile drag
  const panRef = useRef(null);    // pan drag
  const resizeRef = useRef(null); // tile resize
  const lassoRef = useRef(null);  // lasso select
  const saveTimer = useRef(null);
  const fileInputRef = useRef(null);

  // ═══════════════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) {
          const p = JSON.parse(res.value);
          dispatch({ type: "LOAD", tiles: p.tiles, links: p.links, _silent: true });
        }
      } catch (e) { /* empty board */ }
      finally { setLoaded(true); }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await storage.set(STORAGE_KEY, JSON.stringify({ tiles, links }));
      } catch (e) { console.error("save failed", e); }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [tiles, links, loaded]);

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
  const addTileAt = useCallback((type, bx, by) => {
    const t = makeTile(type, bx, by);
    dispatch({ type: "ADD_TILE", tile: t });
    setEditingId(t.id);
    setSelection(new Set([t.id]));
    return t;
  }, [dispatch]);

  const addTileInView = useCallback((type) => {
    const el = boardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = (r.width / 2 - pan.x) / zoom + (Math.random() - 0.5) * 80;
    const cy = (r.height / 2 - pan.y) / zoom + (Math.random() - 0.5) * 80;
    addTileAt(type, cx, cy);
    setAddMenuOpen(false);
  }, [addTileAt, pan, zoom]);

  const duplicateSelection = useCallback(() => {
    const sel = tiles.filter((t) => selection.has(t.id));
    if (sel.length === 0) return;
    const idMap = new Map();
    const dupes = sel.map((t) => {
      const nt = makeTile(t.type, t.x + 30, t.y + 30, {
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
  }, [tiles, links, selection, dispatch, showToast]);

  const deleteSelection = useCallback(() => {
    if (selection.size === 0) return;
    dispatch({ type: "DELETE_TILES", ids: [...selection] });
    setSelection(new Set());
    if (editingId && selection.has(editingId)) setEditingId(null);
  }, [selection, dispatch, editingId]);

  // ═══════════════════════════════════════════════════════════════════════
  // POINTER EVENTS — unified handler for drag, pan, resize, lasso
  // ═══════════════════════════════════════════════════════════════════════
  const onBoardPointerDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && mode === "pan")) {
      // Pan
      panRef.current = { startX: e.clientX, startY: e.clientY, startPan: { ...pan } };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button === 0 && mode === "select" && e.target === e.currentTarget) {
      // Lasso start on empty canvas
      const bp = screenToBoard(e.clientX, e.clientY, boardRef.current, zoom, pan.x, pan.y);
      lassoRef.current = { sx: e.clientX, sy: e.clientY };
      setLasso({ x1: bp.x, y1: bp.y, x2: bp.x, y2: bp.y });
      if (!e.shiftKey) setSelection(new Set());
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }, [mode, pan, zoom]);

  const onBoardPointerMove = useCallback((e) => {
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
    }
  }, [pan, zoom, tiles, dispatch]);

  const onBoardPointerUp = useCallback((e) => {
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
        // We need to push a real (non-silent) snapshot. The easiest approach:
        // re-dispatch the positions as a proper action so undo captures it.
        // But the positions are already applied silently. So we do a no-op
        // re-apply to push history.
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
  }, [lasso, tiles, dispatch]);

  // ---- Tile pointer down (drag or resize) ----
  const onTilePointerDown = useCallback((e, tile) => {
    e.stopPropagation();
    if (mode === "link") return; // handled by onClick

    // Check resize handle
    const bp = screenToBoard(e.clientX, e.clientY, boardRef.current, zoom, pan.x, pan.y);
    const nearRight = bp.x > tile.x + tile.w - RESIZE_HANDLE / zoom;
    const nearBottom = bp.y > tile.y + tile.h - RESIZE_HANDLE / zoom;
    if (nearRight && nearBottom) {
      resizeRef.current = { id: tile.id };
      boardRef.current.setPointerCapture(e.pointerId);
      return;
    }

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

    dragRef.current = {
      ids: dragIds || selection,
      lastX: bp.x,
      lastY: bp.y,
      moved: false,
    };
    boardRef.current.setPointerCapture(e.pointerId);
  }, [mode, zoom, pan, selection]);

  // ---- Tile click (open editor or link) ----
  const onTileClick = useCallback((e, tile) => {
    e.stopPropagation();
    if (mode === "link") {
      if (!linkFrom) { setLinkFrom(tile.id); return; }
      if (linkFrom === tile.id) { setLinkFrom(null); return; }
      const exists = links.some(
        (l) => (l.from === linkFrom && l.to === tile.id) || (l.from === tile.id && l.to === linkFrom)
      );
      if (!exists) dispatch({ type: "ADD_LINK", link: makeLink(linkFrom, tile.id) });
      setLinkFrom(null);
      showToast("Linked");
      return;
    }
    // If we just finished a drag, don't open editor
    if (dragRef.current && dragRef.current.moved) return;
  }, [mode, linkFrom, links, dispatch, showToast]);

  const onTileDoubleClick = useCallback((e, tile) => {
    e.stopPropagation();
    if (mode !== "link") setEditingId(tile.id);
  }, [mode]);

  // ═══════════════════════════════════════════════════════════════════════
  // DOUBLE-CLICK BOARD → add tile
  // ═══════════════════════════════════════════════════════════════════════
  const onBoardDoubleClick = useCallback((e) => {
    if (e.target !== e.currentTarget) return;
    if (mode === "link" || mode === "pan") return;
    const bp = screenToBoard(e.clientX, e.clientY, boardRef.current, zoom, pan.x, pan.y);
    addTileAt("user-story", bp.x - DEFAULT_TILE_W / 2, bp.y - DEFAULT_TILE_H / 2);
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
        setSelection(new Set()); setLinkFrom(null); setMode("select"); setAddMenuOpen(false);
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
    const payload = { format: "storyboard-mural", version: 2, exportedAt: new Date().toISOString(), tiles, links };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storyboard-${new Date().toISOString().slice(0, 10)}.json`;
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

  // ═══════════════════════════════════════════════════════════════════════
  // LINK HELPERS
  // ═══════════════════════════════════════════════════════════════════════
  const tileCenter = (t) => ({ x: t.x + t.w / 2, y: t.y + t.h / 2 });
  const editingTile = tiles.find((t) => t.id === editingId);

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
          <rect width={mW} height={mH} fill="rgba(0,0,0,0.35)" rx={4} />
          {tiles.map((t) => (
            <rect key={t.id} x={t.x * s} y={t.y * s} width={t.w * s} height={t.h * s}
              fill={selection.has(t.id) ? "#fff" : t.color} opacity={0.8} rx={1} />
          ))}
          {/* viewport rectangle */}
          {boardRef.current && (() => {
            const r = boardRef.current.getBoundingClientRect();
            const vx = -pan.x / zoom, vy = -pan.y / zoom;
            const vw = r.width / zoom, vh = r.height / zoom;
            return <rect x={vx * s} y={vy * s} width={vw * s} height={vh * s}
              fill="none" stroke="#fff8ec" strokeWidth={1.5} rx={2} opacity={0.7} />;
          })()}
        </svg>
      </div>
    );
  }, [tiles, pan, zoom, selection]);

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  const cursorStyle = mode === "pan" ? "grab" : mode === "link" ? "crosshair" : "default";

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .tile { transition: box-shadow 0.12s ease; }
        .tile:hover .resize-handle { opacity: 1 !important; }
        .lasso-rect { fill: rgba(232,176,75,0.12); stroke: #e8b04b; stroke-width: 1.5; stroke-dasharray: 6 3; }
      `}</style>

      {/* ════════ HEADER ════════ */}
      <div style={styles.header}>
        <div style={{ minWidth: 0 }}>
          <div style={styles.headerTitle}>Storyboard Mural</div>
          <div style={styles.headerSub}>Double-click board to add · Shift-click to multi-select · Space to pan</div>
        </div>
        <div style={styles.toolbarRow}>
          {/* Add */}
          <div style={{ position: "relative" }}>
            <button style={styles.btnPrimary} onClick={() => setAddMenuOpen((v) => !v)}>
              <Plus size={15} /> Add
            </button>
            {addMenuOpen && (
              <div style={styles.addMenu}>
                {Object.entries(TILE_TYPES).map(([key, t]) => (
                  <button key={key} style={{ ...styles.addMenuItem, background: t.color }}
                    onClick={() => addTileInView(key)}>{t.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* Mode buttons */}
          <button style={{ ...styles.btn, background: mode === "link" ? "#c0392b" : undefined }}
            onClick={() => { setMode((m) => m === "link" ? "select" : "link"); setLinkFrom(null); }}>
            {mode === "link" ? <Unlink size={14} /> : <Link2 size={14} />}
            {mode === "link" ? "Linking" : "Link"}
          </button>

          <button style={{ ...styles.btn, background: mode === "pan" ? "rgba(255,255,255,0.25)" : undefined }}
            onClick={() => setMode((m) => m === "pan" ? "select" : "pan")}>
            <Move size={14} /> Pan
          </button>

          <div style={styles.separator} />

          {/* Undo / Redo */}
          <button style={{ ...styles.iconBtn, opacity: canUndo ? 1 : 0.35 }} onClick={() => dispatch({ type: "UNDO" })} title="Undo (Ctrl+Z)"><Undo2 size={16} /></button>
          <button style={{ ...styles.iconBtn, opacity: canRedo ? 1 : 0.35 }} onClick={() => dispatch({ type: "REDO" })} title="Redo (Ctrl+Shift+Z)"><Redo2 size={16} /></button>

          {/* Duplicate */}
          <button style={{ ...styles.iconBtn, opacity: selection.size > 0 ? 1 : 0.35 }}
            onClick={duplicateSelection} title="Duplicate (Ctrl+D)"><Copy size={16} /></button>

          <div style={styles.separator} />

          {/* Zoom */}
          <button style={styles.iconBtn} onClick={zoomOut} title="Zoom out"><ZoomOut size={16} /></button>
          <span style={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
          <button style={styles.iconBtn} onClick={zoomIn} title="Zoom in"><ZoomIn size={16} /></button>
          <button style={styles.iconBtn} onClick={fitToScreen} title="Fit all (Ctrl+0)"><Maximize size={16} /></button>

          <div style={styles.separator} />

          {/* IO */}
          <button style={styles.btn} onClick={exportBoard}><Download size={14} /> Save</button>
          <button style={styles.btn} onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Load</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={importBoard} />
        </div>
      </div>

      {mode === "link" && (
        <div style={styles.hintBar}>
          {linkFrom ? "Tap another tile to connect — or tap the same tile to cancel." : "Tap a tile to start a link."}
        </div>
      )}

      {/* ════════ BOARD (zoom + pan layer) ════════ */}
      <div
        ref={boardRef}
        style={{ ...styles.board, cursor: cursorStyle }}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onDoubleClick={onBoardDoubleClick}
        onWheel={onWheel}
      >
        <div style={{
          width: BOARD_W, height: BOARD_H,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          position: "relative",
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.045) 1.2px, transparent 1.2px)`,
          backgroundSize: "24px 24px",
        }}>
          {/* SVG layer: links + lasso */}
          <svg style={{ position: "absolute", inset: 0, width: BOARD_W, height: BOARD_H, pointerEvents: "none", overflow: "visible" }}>
            {links.map((l) => {
              const from = tiles.find((t) => t.id === l.from);
              const to = tiles.find((t) => t.id === l.to);
              if (!from || !to) return null;
              const c1 = tileCenter(from), c2 = tileCenter(to);
              const mx = (c1.x + c2.x) / 2, my = (c1.y + c2.y) / 2 - 30;
              const isSel = selectedLink === l.id;
              return (
                <g key={l.id}>
                  {/* fat invisible hit area */}
                  <path d={`M ${c1.x} ${c1.y} Q ${mx} ${my} ${c2.x} ${c2.y}`}
                    stroke="transparent" strokeWidth={16} fill="none"
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); setSelectedLink((c) => c === l.id ? null : l.id); }} />
                  <path d={`M ${c1.x} ${c1.y} Q ${mx} ${my} ${c2.x} ${c2.y}`}
                    stroke={isSel ? "#ffcf5c" : "#c0392b"} strokeWidth={isSel ? 3.5 : 2.2}
                    fill="none" strokeLinecap="round" style={{ pointerEvents: "none" }} />
                </g>
              );
            })}
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
            const cx = (tileCenter(from).x + tileCenter(to).x) / 2;
            const cy = (tileCenter(from).y + tileCenter(to).y) / 2 - 20;
            return (
              <button style={{ ...styles.removeLinkBtn, left: cx - 14, top: cy - 14 }}
                onClick={(e) => { e.stopPropagation(); dispatch({ type: "DELETE_LINK", id: selectedLink }); setSelectedLink(null); }}
                title="Remove link"><X size={14} /></button>
            );
          })()}

          {/* TILES */}
          {tiles.map((t) => {
            const isSel = selection.has(t.id);
            const isLinkPick = linkFrom === t.id;
            return (
              <div key={t.id} className="tile"
                style={{
                  ...styles.tile,
                  left: t.x, top: t.y, width: t.w, minHeight: t.h,
                  background: t.color,
                  outline: isLinkPick ? "3px solid #ffcf5c" : isSel ? `2px solid rgba(43,33,24,0.7)` : "none",
                  outlineOffset: isSel && !isLinkPick ? 2 : 0,
                  cursor: mode === "link" ? "pointer" : "grab",
                  boxShadow: isSel ? "0 6px 18px rgba(0,0,0,0.35)" : "0 3px 8px rgba(0,0,0,0.2)",
                  zIndex: isSel ? 5 : 1,
                }}
                onPointerDown={(e) => onTilePointerDown(e, t)}
                onClick={(e) => onTileClick(e, t)}
                onDoubleClick={(e) => onTileDoubleClick(e, t)}
              >
                <Pin size={13} color="#8a2e2e" style={styles.pin} />
                <div style={styles.tileBadge}>{TILE_TYPES[t.type]?.short || "•"}</div>
                <div style={styles.tileTitle}>{t.title || "Untitled"}</div>
                {t.content && <div style={styles.tileContent}>{t.content}</div>}
                {/* Resize handle */}
                <div className="resize-handle" style={styles.resizeHandle}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    resizeRef.current = { id: t.id };
                    boardRef.current.setPointerCapture(e.pointerId);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ════════ MINIMAP ════════ */}
      {Minimap}

      {/* ════════ ZOOM CONTROLS (bottom left, mobile-friendly) ════════ */}
      <div style={styles.zoomCorner}>
        <button style={styles.cornerBtn} onClick={zoomOut}><ZoomOut size={18} /></button>
        <span style={{ fontSize: 11, color: "#fff8ec", minWidth: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
        <button style={styles.cornerBtn} onClick={zoomIn}><ZoomIn size={18} /></button>
        <button style={styles.cornerBtn} onClick={fitToScreen}><Maximize size={18} /></button>
      </div>

      {/* ════════ SELECTION TOOLBAR (floating) ════════ */}
      {selection.size > 0 && !editingId && (
        <div style={styles.selToolbar}>
          <span style={{ fontSize: 12, color: "rgba(255,248,236,0.8)" }}>{selection.size} selected</span>
          <button style={styles.selBtn} onClick={duplicateSelection}><Copy size={14} /> Duplicate</button>
          <button style={{ ...styles.selBtn, color: "#f2a3a3" }} onClick={deleteSelection}><Trash2 size={14} /> Delete</button>
        </div>
      )}

      {/* ════════ EDIT PANEL (bottom sheet) ════════ */}
      {editingTile && (
        <div style={styles.editOverlay} onClick={() => setEditingId(null)}>
          <div style={styles.editPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.editHeaderRow}>
              <select value={editingTile.type} onChange={(e) => {
                const type = e.target.value;
                dispatch({ type: "UPDATE_TILE", id: editingTile.id, patch: { type, color: TILE_TYPES[type].color } });
              }} style={styles.select}>
                {Object.entries(TILE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button style={styles.closeBtn} onClick={() => setEditingId(null)}><X size={16} /></button>
            </div>

            <input style={styles.titleInput} value={editingTile.title} placeholder="Title"
              onChange={(e) => dispatch({ type: "UPDATE_TILE", id: editingTile.id, patch: { title: e.target.value }, _silent: true })}
              onBlur={() => dispatch({ type: "UPDATE_TILE", id: editingTile.id, patch: { title: editingTile.title } })} />

            <textarea style={styles.contentInput} value={editingTile.content} placeholder="Details, acceptance criteria, notes…"
              onChange={(e) => dispatch({ type: "UPDATE_TILE", id: editingTile.id, patch: { content: e.target.value }, _silent: true })}
              onBlur={() => dispatch({ type: "UPDATE_TILE", id: editingTile.id, patch: { content: editingTile.content } })} />

            <div style={styles.swatchRow}>
              {SWATCHES.map((c) => (
                <button key={c} onClick={() => dispatch({ type: "UPDATE_TILE", id: editingTile.id, patch: { color: c } })}
                  style={{ ...styles.swatch, background: c, outline: editingTile.color === c ? "2px solid #2b2118" : "1px solid rgba(0,0,0,0.15)" }} />
              ))}
            </div>

            <div style={styles.editFooterRow}>
              <button style={styles.dangerBtn} onClick={() => {
                dispatch({ type: "DELETE_TILES", ids: [editingTile.id] });
                setEditingId(null); setSelection(new Set());
              }}><Trash2 size={14} /> Delete</button>
              <button style={styles.btnPrimary} onClick={() => setEditingId(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ TOAST ════════ */}
      {toast && <div style={styles.toast}>{toast}</div>}

      {/* ════════ EMPTY STATE ════════ */}
      {tiles.length === 0 && loaded && (
        <div style={styles.emptyHint}>
          Double-click the board or tap <b>Add</b> to pin your first tile.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
  page: { fontFamily: FONT_BODY, height: "100vh", width: "100%", display: "flex", flexDirection: "column", background: FRAME_DARK, overflow: "hidden", position: "relative" },

  // Header
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "10px 12px", background: FRAME, borderBottom: `4px solid ${FRAME_DARK}` },
  headerTitle: { fontFamily: FONT_DISPLAY, fontSize: 22, color: "#fff8ec", lineHeight: 1.1 },
  headerSub: { fontSize: 10.5, color: "rgba(255,248,236,0.6)", marginTop: 1 },
  toolbarRow: { display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" },
  separator: { width: 1, height: 22, background: "rgba(255,255,255,0.15)", margin: "0 2px" },

  // Buttons
  btn: { display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 7, border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  btnPrimary: { display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 7, border: "none", background: "#e8b04b", color: "#3f2c0f", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  iconBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer" },
  zoomLabel: { fontSize: 11, color: "#fff8ec", minWidth: 36, textAlign: "center", fontWeight: 600 },

  // Add menu
  addMenu: { position: "absolute", top: "110%", left: 0, zIndex: 30, background: "#fff8ec", borderRadius: 10, padding: 5, display: "flex", flexDirection: "column", gap: 3, boxShadow: "0 10px 25px rgba(0,0,0,0.35)", minWidth: 170 },
  addMenuItem: { textAlign: "left", border: "none", borderRadius: 6, padding: "7px 10px", fontSize: 12, fontWeight: 600, color: INK, cursor: "pointer" },

  hintBar: { background: "#c0392b", color: "#fff", fontSize: 11, padding: "5px 14px", textAlign: "center" },

  // Board
  board: { flex: 1, overflow: "hidden", background: `linear-gradient(${BOARD_BG}, ${BOARD_BG_2})`, position: "relative", touchAction: "none" },

  // Tiles
  tile: { position: "absolute", borderRadius: 4, padding: "16px 12px 14px", boxSizing: "border-box", fontFamily: FONT_BODY, userSelect: "none", touchAction: "none" },
  pin: { position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)", filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.4))" },
  tileBadge: { fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, color: "rgba(43,33,24,0.5)", marginBottom: 3 },
  tileTitle: { fontFamily: FONT_DISPLAY, fontSize: 15, color: INK, lineHeight: 1.2, wordBreak: "break-word" },
  tileContent: { fontSize: 11, color: "rgba(43,33,24,0.8)", marginTop: 5, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 80, overflow: "hidden" },
  resizeHandle: { position: "absolute", bottom: 0, right: 0, width: RESIZE_HANDLE, height: RESIZE_HANDLE, cursor: "nwse-resize", opacity: 0, background: "linear-gradient(135deg, transparent 40%, rgba(43,33,24,0.3) 40%, rgba(43,33,24,0.3) 50%, transparent 50%, transparent 70%, rgba(43,33,24,0.3) 70%)", borderRadius: "0 0 4px 0", transition: "opacity 0.15s" },

  // Link remove
  removeLinkBtn: { position: "absolute", width: 28, height: 28, borderRadius: "50%", border: "none", background: "#c0392b", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 3px 8px rgba(0,0,0,0.4)", zIndex: 10 },

  // Minimap
  minimap: { position: "absolute", bottom: 52, right: 10, borderRadius: 6, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.12)", zIndex: 20 },

  // Zoom corner (mobile)
  zoomCorner: { position: "absolute", bottom: 10, right: 10, display: "flex", alignItems: "center", gap: 4, background: "rgba(43,33,24,0.75)", padding: "4px 6px", borderRadius: 8, zIndex: 20, backdropFilter: "blur(4px)" },
  cornerBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer" },

  // Selection toolbar
  selToolbar: { position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, background: "rgba(43,33,24,0.85)", padding: "6px 14px", borderRadius: 10, zIndex: 20, backdropFilter: "blur(6px)" },
  selBtn: { display: "flex", alignItems: "center", gap: 4, border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" },

  // Edit panel
  editOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 },
  editPanel: { background: "#fff8ec", width: "100%", maxWidth: 480, borderRadius: "16px 16px 0 0", padding: 16, display: "flex", flexDirection: "column", gap: 10, maxHeight: "70vh", overflowY: "auto" },
  editHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  select: { padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, fontWeight: 600, color: INK, background: "#fff" },
  closeBtn: { border: "none", background: "rgba(0,0,0,0.08)", borderRadius: 6, padding: 6, cursor: "pointer", color: INK },
  titleInput: { fontFamily: FONT_DISPLAY, fontSize: 20, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", color: INK },
  contentInput: { fontFamily: FONT_BODY, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", minHeight: 90, resize: "vertical", color: INK },
  swatchRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  swatch: { width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer" },
  editFooterRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  dangerBtn: { display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: "#c0392b", fontSize: 13, fontWeight: 600, cursor: "pointer" },

  // Toast
  toast: { position: "fixed", bottom: 56, left: "50%", transform: "translateX(-50%)", background: "#2b2118", color: "#fff8ec", padding: "7px 16px", borderRadius: 20, fontSize: 12, zIndex: 60, boxShadow: "0 6px 16px rgba(0,0,0,0.4)" },

  // Empty hint
  emptyHint: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "rgba(255,248,236,0.75)", fontSize: 14, textAlign: "center", maxWidth: 260, pointerEvents: "none", zIndex: 5 },
};
