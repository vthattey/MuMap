import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { boardReducer, initialBoard, useUndoReducer } from "../lib/boardModel.js";
import { rowToTile, rowToLink, diffBoards, isDiffEmpty, pushDiff } from "../lib/boardSyncUtil.js";

const CURSOR_THROTTLE_MS = 40;

// Owns the local undoable board state AND keeps it in sync with Supabase:
//   - loads the map's tiles/links on mount
//   - subscribes to Postgres changes so other collaborators' commits appear
//   - diffs every local, non-silent change against the previous board and
//     writes only what changed (covers add/edit/delete/duplicate/undo/redo
//     uniformly, since undo/redo already just swap in a full snapshot)
//   - broadcasts in-progress drags and live cursor position (not persisted)
export function useBoardSync(mapId) {
  const { user, profile } = useAuth();
  const [board, rawDispatch, canUndo, canRedo] = useUndoReducer(boardReducer, initialBoard);
  const [loaded, setLoaded] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});

  const prevBoardRef = useRef(initialBoard);
  const syncMetaRef = useRef({ shouldSync: false });
  const channelRef = useRef(null);
  const lastCursorSentRef = useRef(0);

  // Dispatch used by the canvas — every non-silent action gets diffed and
  // written to Supabase after the reducer applies it. Silent actions (drag/
  // resize/typing previews) update local state only — the diff baseline is
  // deliberately NOT advanced for them (see the effect below), so the
  // eventual commit still sees the full accumulated change.
  const dispatch = useCallback((action) => {
    syncMetaRef.current = { kind: action._silent ? "local-silent" : "local-commit" };
    rawDispatch(action);
  }, [rawDispatch]);

  // Dispatch used for changes that arrived from Supabase (initial load,
  // realtime events) — never re-diffed/re-written, never enters undo history.
  const applyRemote = useCallback((action) => {
    syncMetaRef.current = { kind: "remote" };
    rawDispatch({ ...action, _silent: true });
  }, [rawDispatch]);

  // ── Initial load ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapId) return;
    let cancelled = false;
    setLoaded(false);
    (async () => {
      const [{ data: tileRows }, { data: linkRows }] = await Promise.all([
        supabase.from("tiles").select("*").eq("map_id", mapId),
        supabase.from("links").select("*").eq("map_id", mapId),
      ]);
      if (cancelled) return;
      const tiles = (tileRows || []).map(rowToTile);
      const links = (linkRows || []).map(rowToLink);
      applyRemote({ type: "LOAD", tiles, links });
      prevBoardRef.current = { tiles, links };
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [mapId, applyRemote]);

  // ── Diff-and-push local changes ──────────────────────────────────────
  // prevBoardRef tracks "last state known to match the database" — it only
  // ever moves forward on a remote apply or a successful local commit, NOT
  // on silent local previews, so a commit's diff always reflects the full
  // change since the last real DB state, no matter how many silent updates
  // (drag frames, keystrokes) happened in between.
  useEffect(() => {
    const { kind } = syncMetaRef.current;
    syncMetaRef.current = { kind: "local-silent" };
    if (kind === "local-silent") return;
    if (kind === "remote") {
      prevBoardRef.current = board;
      return;
    }
    if (!mapId) return;
    const diff = diffBoards(prevBoardRef.current, board);
    prevBoardRef.current = board;
    if (!isDiffEmpty(diff)) pushDiff(supabase, mapId, diff);
  }, [board, mapId]);

  // ── Realtime: postgres changes + presence + broadcast cursors/drags ──
  useEffect(() => {
    if (!mapId || !user) return;
    const channel = supabase.channel(`map:${mapId}`, { config: { presence: { key: user.id } } });
    channelRef.current = channel;

    channel.on("postgres_changes", { event: "*", schema: "public", table: "tiles", filter: `map_id=eq.${mapId}` },
      ({ eventType, new: row, old: oldRow }) => {
        if (eventType === "DELETE") applyRemote({ type: "DELETE_TILES", ids: [oldRow.id] });
        else applyRemote({ type: "UPSERT_TILE", tile: rowToTile(row) });
      });

    channel.on("postgres_changes", { event: "*", schema: "public", table: "links", filter: `map_id=eq.${mapId}` },
      ({ eventType, new: row, old: oldRow }) => {
        if (eventType === "DELETE") applyRemote({ type: "DELETE_LINK", id: oldRow.id });
        else applyRemote({ type: "UPSERT_LINK", link: rowToLink(row) });
      });

    channel.on("broadcast", { event: "tiles" }, ({ payload }) => {
      if (payload.userId === user.id) return;
      applyRemote({ type: "UPDATE_TILES", updates: payload.updates });
    });

    channel.on("broadcast", { event: "cursor" }, ({ payload }) => {
      if (payload.userId === user.id) return;
      setRemoteCursors((prev) => ({ ...prev, [payload.userId]: { x: payload.x, y: payload.y, name: payload.name, color: payload.color } }));
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const list = Object.values(state).flat().map((p) => ({ id: p.userId, name: p.name, color: p.color }));
      const seen = new Set();
      const uniq = list.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
      setCollaborators(uniq);
      setRemoteCursors((prev) => {
        const ids = new Set(uniq.map((c) => c.id));
        const next = {};
        for (const [id, v] of Object.entries(prev)) if (ids.has(id)) next[id] = v;
        return next;
      });
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          userId: user.id,
          name: profile?.display_name || user.email,
          color: profile?.color || "#4f46e5",
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
      setCollaborators([]);
      setRemoteCursors({});
    };
  }, [mapId, user?.id, user?.email, profile?.display_name, profile?.color, applyRemote]);

  // ── Outbound broadcasts (not persisted) ──────────────────────────────
  const broadcastTileUpdates = useCallback((updates) => {
    channelRef.current?.send({ type: "broadcast", event: "tiles", payload: { userId: user?.id, updates } });
  }, [user?.id]);

  const broadcastCursor = useCallback((x, y) => {
    const now = performance.now();
    if (now - lastCursorSentRef.current < CURSOR_THROTTLE_MS) return;
    lastCursorSentRef.current = now;
    channelRef.current?.send({
      type: "broadcast", event: "cursor",
      payload: { userId: user?.id, x, y, name: profile?.display_name || user?.email, color: profile?.color || "#4f46e5" },
    });
  }, [user?.id, user?.email, profile?.display_name, profile?.color]);

  return {
    tiles: board.tiles,
    links: board.links,
    dispatch,
    canUndo,
    canRedo,
    loaded,
    collaborators,
    remoteCursors,
    broadcastTileUpdates,
    broadcastCursor,
  };
}
