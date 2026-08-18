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
//   - loads/syncs per-tile comments and dot-voting sessions/votes, both of
//     which live outside the undo history (like collaborators/cursors)
export function useBoardSync(mapId) {
  const { user, profile } = useAuth();
  const [board, rawDispatch, canUndo, canRedo] = useUndoReducer(boardReducer, initialBoard);
  const [loaded, setLoaded] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [comments, setComments] = useState([]);
  const [authorProfiles, setAuthorProfiles] = useState({}); // userId -> {display_name, color}
  const [voteSession, setVoteSession] = useState(null);
  const [votes, setVotes] = useState([]);
  const [strokes, setStrokes] = useState([]);

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
      const [{ data: tileRows }, { data: linkRows }, { data: commentRows }, { data: sessionRows }, { data: voteRows }, { data: strokeRows }] = await Promise.all([
        supabase.from("tiles").select("*").eq("map_id", mapId),
        supabase.from("links").select("*").eq("map_id", mapId),
        supabase.from("comments").select("*, author:profiles!author_id(display_name,color)").eq("map_id", mapId).order("created_at", { ascending: true }),
        supabase.from("vote_sessions").select("*").eq("map_id", mapId).order("created_at", { ascending: false }).limit(1),
        supabase.from("votes").select("*").eq("map_id", mapId),
        supabase.from("strokes").select("*").eq("map_id", mapId),
      ]);
      if (cancelled) return;
      const tiles = (tileRows || []).map(rowToTile);
      const links = (linkRows || []).map(rowToLink);
      applyRemote({ type: "LOAD", tiles, links });
      prevBoardRef.current = { tiles, links };
      setComments(commentRows || []);
      setAuthorProfiles((prev) => {
        const next = { ...prev };
        for (const c of commentRows || []) if (c.author) next[c.author_id] = c.author;
        return next;
      });
      setVoteSession((sessionRows && sessionRows[0]) || null);
      setVotes(voteRows || []);
      setStrokes(strokeRows || []);
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

    // ── Comments ──
    channel.on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `map_id=eq.${mapId}` },
      ({ eventType, new: row, old: oldRow }) => {
        if (eventType === "DELETE") {
          setComments((prev) => prev.filter((c) => c.id !== oldRow.id));
          return;
        }
        setComments((prev) => (prev.some((c) => c.id === row.id) ? prev.map((c) => (c.id === row.id ? row : c)) : [...prev, row]));
        // postgres_changes payloads carry only the raw row, no join — fetch
        // the author's profile once if this is the first time we've seen them.
        setAuthorProfiles((prev) => {
          if (prev[row.author_id]) return prev;
          supabase.from("profiles").select("display_name,color").eq("id", row.author_id).maybeSingle()
            .then(({ data }) => { if (data) setAuthorProfiles((p) => ({ ...p, [row.author_id]: data })); });
          return prev;
        });
      });

    // ── Voting ──
    channel.on("postgres_changes", { event: "*", schema: "public", table: "vote_sessions", filter: `map_id=eq.${mapId}` },
      ({ eventType, new: row, old: oldRow }) => {
        if (eventType === "DELETE") { setVoteSession((c) => (c?.id === oldRow.id ? null : c)); return; }
        // Only one session is ever active per map — the latest write is
        // always the one worth showing (a new session, or an update to the
        // current one, e.g. ending/revealing it).
        setVoteSession(row);
      });

    channel.on("postgres_changes", { event: "*", schema: "public", table: "votes", filter: `map_id=eq.${mapId}` },
      ({ eventType, new: row, old: oldRow }) => {
        if (eventType === "DELETE") {
          setVotes((prev) => prev.filter((v) => v.id !== oldRow.id));
          return;
        }
        setVotes((prev) => (prev.some((v) => v.id === row.id) ? prev.map((v) => (v.id === row.id ? row : v)) : [...prev, row]));
      });

    // ── Drawing ──
    channel.on("postgres_changes", { event: "*", schema: "public", table: "strokes", filter: `map_id=eq.${mapId}` },
      ({ eventType, new: row, old: oldRow }) => {
        if (eventType === "DELETE") {
          setStrokes((prev) => prev.filter((s) => s.id !== oldRow.id));
          return;
        }
        setStrokes((prev) => (prev.some((s) => s.id === row.id) ? prev : [...prev, row]));
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

  // ── Comments ──────────────────────────────────────────────────────────
  // No local-optimistic write here (unlike tiles/links): comments are add-
  // only chat-like entries, not something the user drags/types live, so the
  // small round-trip before postgres_changes echoes an insert back is an
  // acceptable trade for not maintaining a second reconciliation path.
  const addComment = useCallback(async (tileId, body) => {
    if (!mapId || !user || !body.trim()) return;
    const { error } = await supabase.from("comments").insert({ map_id: mapId, tile_id: tileId, author_id: user.id, body: body.trim() });
    if (error) console.error("[useBoardSync] add comment failed:", error);
  }, [mapId, user]);

  const deleteComment = useCallback(async (id) => {
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) console.error("[useBoardSync] delete comment failed:", error);
  }, []);

  // ── Voting ────────────────────────────────────────────────────────────
  const startVoteSession = useCallback(async (votesPerPerson) => {
    if (!mapId || !user) return;
    const { error } = await supabase.from("vote_sessions").insert({ map_id: mapId, votes_per_person: votesPerPerson, created_by: user.id });
    if (error) console.error("[useBoardSync] start vote session failed:", error);
  }, [mapId, user]);

  const endVoteSession = useCallback(async () => {
    if (!voteSession) return;
    const { error } = await supabase.from("vote_sessions")
      .update({ active: false, revealed: true, ended_at: new Date().toISOString() })
      .eq("id", voteSession.id);
    if (error) console.error("[useBoardSync] end vote session failed:", error);
  }, [voteSession]);

  const castVote = useCallback(async (tileId) => {
    if (!mapId || !user || !voteSession) return;
    const { error } = await supabase.from("votes").insert({ map_id: mapId, session_id: voteSession.id, tile_id: tileId, user_id: user.id });
    // A budget-exceeded attempt is rejected by RLS as a normal insert
    // failure — expected/silent rather than logged as an error.
    if (error && error.code !== "42501") console.error("[useBoardSync] cast vote failed:", error);
  }, [mapId, user, voteSession]);

  const retractVote = useCallback(async (voteId) => {
    const { error } = await supabase.from("votes").delete().eq("id", voteId);
    if (error) console.error("[useBoardSync] retract vote failed:", error);
  }, []);

  // ── Drawing ───────────────────────────────────────────────────────────
  // Written once per completed stroke (see the map-side capture logic),
  // not per point, so drawing doesn't flood the realtime channel.
  const addStroke = useCallback(async (points, color, width) => {
    if (!mapId || !user || points.length < 2) return;
    const { error } = await supabase.from("strokes").insert({ map_id: mapId, author_id: user.id, color, width, points });
    if (error) console.error("[useBoardSync] add stroke failed:", error);
  }, [mapId, user]);

  const deleteStroke = useCallback(async (id) => {
    const { error } = await supabase.from("strokes").delete().eq("id", id);
    if (error) console.error("[useBoardSync] delete stroke failed:", error);
  }, []);

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
    comments,
    authorProfiles,
    addComment,
    deleteComment,
    voteSession,
    votes,
    startVoteSession,
    endVoteSession,
    castVote,
    retractVote,
    strokes,
    addStroke,
    deleteStroke,
  };
}
