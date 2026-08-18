import { useState, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// DATA MODEL — shared between the canvas (MuMap.jsx) and the Supabase sync
// hook (hooks/useBoardSync.js), so both agree on the exact same shapes.
// ═══════════════════════════════════════════════════════════════════════════
export const TILE_TYPES = {
  "user-story": { label: "User Story", color: "#f5d76e", short: "US" },
  "tech-story": { label: "Technical Story", color: "#7ec8e3", short: "TS" },
  assumption:   { label: "Assumption", color: "#d8b4f0", short: "A" },
  question:     { label: "Question", color: "#93d9a8", short: "Q" },
};

export const SHAPES = {
  square:    { label: "Square",    w: 160, h: 160 },
  rectangle: { label: "Rectangle", w: 220, h: 140 },
  circle:    { label: "Circle",    w: 170, h: 170 },
};

export const SWATCHES = [
  "#f5d76e","#7ec8e3","#d8b4f0","#93d9a8",
  "#f2a3a3","#f3c98b","#a9c9f7","#e6e2d3",
];

export const STATUSES = {
  none:          { label: "No status", color: "#cbd5e1" },
  todo:          { label: "To do",     color: "#94a3b8" },
  "in-progress": { label: "In progress", color: "#3b82f6" },
  blocked:       { label: "Blocked",   color: "#ef4444" },
  done:          { label: "Done",      color: "#22c55e" },
};

const HISTORY_LIMIT = 60;

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function makeTile(type, shape, x, y, overrides = {}) {
  const t = TILE_TYPES[type] || TILE_TYPES["user-story"];
  const dims = SHAPES[shape] || SHAPES.rectangle;
  return {
    id: uid(),
    kind: "tile",
    type,
    shape: shape || "rectangle",
    title: t.label,
    content: "",
    color: t.color,
    x, y,
    w: dims.w,
    h: dims.h,
    tags: [],
    status: "none",
    points: null,
    ...overrides,
  };
}

// A frame is a labeled organizing region, not a story/task card — it reuses
// the tile shape (and therefore every existing add/move/resize/delete/sync
// code path) but is rendered and dragged differently in MuMap.jsx.
export function makeFrame(x, y, overrides = {}) {
  return {
    id: uid(),
    kind: "frame",
    type: "frame",
    shape: "rectangle",
    title: "Frame",
    content: "",
    color: "#94a3b8",
    x, y,
    w: 480,
    h: 360,
    tags: [],
    status: "none",
    points: null,
    ...overrides,
  };
}

// An image/GIF tile — reuses the existing `content` field to hold the
// uploaded image's URL (no new column, same minimal-schema-churn approach
// frames used for their title) and `title` as an optional caption.
export function makeImageTile(x, y, url, overrides = {}) {
  return {
    id: uid(),
    kind: "image",
    type: "user-story",
    shape: "rectangle",
    title: "",
    content: url,
    color: "#f5d76e",
    x, y,
    w: 260,
    h: 220,
    tags: [],
    status: "none",
    points: null,
    ...overrides,
  };
}

export function makeLink(fromId, toId, overrides = {}) {
  return {
    id: uid(),
    from: fromId,
    to: toId,
    label: "",
    directed: true,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BOARD REDUCER — single source of truth for tiles + links.
// UPSERT_TILE / UPSERT_LINK are add-or-update, used when applying changes
// that arrived from another collaborator (we don't know locally whether
// it's a brand new row or an edit to one we already have).
// ═══════════════════════════════════════════════════════════════════════════
export const initialBoard = { tiles: [], links: [] };

export function boardReducer(state, action) {
  switch (action.type) {
    case "LOAD":
      return { tiles: action.tiles || [], links: action.links || [] };

    case "ADD_TILE":
      return { ...state, tiles: [...state.tiles, action.tile] };

    case "ADD_TILES":
      return { ...state, tiles: [...state.tiles, ...action.tiles] };

    case "UPSERT_TILE": {
      const exists = state.tiles.some((t) => t.id === action.tile.id);
      return {
        ...state,
        tiles: exists
          ? state.tiles.map((t) => (t.id === action.tile.id ? action.tile : t))
          : [...state.tiles, action.tile],
      };
    }

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

    case "UPSERT_LINK": {
      const exists = state.links.some((l) => l.id === action.link.id);
      return {
        ...state,
        links: exists
          ? state.links.map((l) => (l.id === action.link.id ? action.link : l))
          : [...state.links, action.link],
      };
    }

    case "UPDATE_LINK":
      return {
        ...state,
        links: state.links.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l)),
      };

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
// UNDO / REDO WRAPPER around the reducer — stays local per browser tab.
// Collaborative undo is out of scope; each client only undoes its own
// non-silent actions, silent (in-progress drag/remote-applied) actions
// never enter the history stack.
// ═══════════════════════════════════════════════════════════════════════════
export function useUndoReducer(reducer, init) {
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
      // "silent" actions (in-progress drag/resize, or changes applied from
      // another collaborator) don't push to this client's history.
      if (action._silent) {
        return { ...h, present: reducer(h.present, action) };
      }
      const newPresent = reducer(h.present, action);
      return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: newPresent, future: [] };
    });
  }, [reducer]);

  return [history.present, dispatch, history.past.length > 0, history.future.length > 0];
}
