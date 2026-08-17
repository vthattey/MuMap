import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, LogOut, Map as MapIcon, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { FONT, INK, INK_SOFT, INK_FAINT, BORDER, ACCENT, SUBTLE_BG, DANGER } from "../lib/theme.js";

export default function DashboardPage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [maps, setMaps] = useState(null); // null = loading
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const loadMaps = useCallback(async () => {
    // RLS already restricts this to maps the caller owns or has been
    // granted access to — no extra filtering needed client-side.
    const { data } = await supabase
      .from("maps")
      .select("*, owner:profiles!created_by(display_name)")
      .order("updated_at", { ascending: false });
    setMaps(data || []);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadMaps();
    // Also listen for map_shares changes naming this user, so a newly
    // shared map appears without needing a manual refresh.
    const channel = supabase
      .channel("maps-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "maps" }, () => loadMaps())
      .on("postgres_changes", { event: "*", schema: "public", table: "map_shares", filter: `user_id=eq.${user.id}` }, () => loadMaps())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadMaps, user?.id]);

  const createMap = useCallback(async (e) => {
    e.preventDefault();
    const name = newName.trim() || "Untitled map";
    setCreating(false);
    setNewName("");
    // Insert with a client-generated id and no RETURNING, then fetch the
    // row back as a separate query — asking Postgres to RETURN the row
    // from the INSERT itself re-checks the SELECT policy (has_map_access)
    // against a row that's still mid-transaction, which the security
    // definer helper doesn't reliably see yet; a follow-up SELECT does.
    const id = crypto.randomUUID();
    const { error: insertError } = await supabase.from("maps").insert({ id, name });
    if (insertError) { console.error("[createMap] insert failed:", insertError); return; }
    navigate(`/map/${id}`);
  }, [newName, navigate]);

  const deleteMap = useCallback(async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Delete this map for everyone? This can't be undone.")) return;
    await supabase.from("maps").delete().eq("id", id);
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>MuMap</div>
        <div style={styles.headerRight}>
          {profile && <span style={styles.who}>{profile.display_name}</span>}
          <button style={styles.iconBtn} onClick={signOut} title="Sign out"><LogOut size={16} /></button>
        </div>
      </div>

      <div style={styles.body}>
        <div style={styles.bodyHeader}>
          <div style={styles.h1}>Your maps</div>
          {!creating && (
            <button style={styles.btnPrimary} onClick={() => setCreating(true)}><Plus size={15} /> New map</button>
          )}
        </div>

        {creating && (
          <form style={styles.newForm} onSubmit={createMap}>
            <input autoFocus style={styles.input} placeholder="Map name" value={newName}
              onChange={(e) => setNewName(e.target.value)} />
            <button style={styles.btnPrimary} type="submit">Create</button>
            <button style={styles.btn} type="button" onClick={() => { setCreating(false); setNewName(""); }}>Cancel</button>
          </form>
        )}

        {maps === null && <div style={styles.empty}>Loading…</div>}
        {maps && maps.length === 0 && <div style={styles.empty}>No maps yet — create the first one.</div>}

        <div style={styles.grid}>
          {maps && maps.map((m) => {
            const isOwner = m.created_by === user?.id;
            const ownership = isOwner ? "Owned by you"
              : m.created_by === null ? "Legacy shared map"
              : `Shared by ${m.owner?.display_name || "someone"}`;
            return (
            <div key={m.id} style={styles.card} onClick={() => navigate(`/map/${m.id}`)}>
              <div style={styles.cardIcon}><MapIcon size={18} color={ACCENT} /></div>
              <div style={styles.cardName}>{m.name}</div>
              <div style={styles.cardMeta}>{ownership} · Updated {new Date(m.updated_at).toLocaleDateString()}</div>
              {(isOwner || m.created_by === null) && (
                <button style={styles.deleteBtn} onClick={(e) => deleteMap(e, m.id)} title="Delete map"><Trash2 size={14} /></button>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { fontFamily: FONT, minHeight: "100vh", background: "#ffffff" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: `1px solid ${BORDER}` },
  title: { fontWeight: 700, fontSize: 20, color: INK },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  who: { fontSize: 13, color: INK_SOFT, fontWeight: 600 },
  iconBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "none", background: SUBTLE_BG, color: INK, cursor: "pointer" },

  body: { maxWidth: 920, margin: "0 auto", padding: "32px 20px" },
  bodyHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  h1: { fontSize: 22, fontWeight: 700, color: INK },
  btnPrimary: { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  btn: { padding: "8px 14px", borderRadius: 8, border: "none", background: SUBTLE_BG, color: INK, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  input: { flex: 1, padding: "9px 11px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, color: INK, fontFamily: FONT },
  newForm: { display: "flex", gap: 8, marginBottom: 20 },

  empty: { color: INK_FAINT, fontSize: 14, padding: "30px 0", textAlign: "center" },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 },
  card: { position: "relative", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, cursor: "pointer", transition: "box-shadow 0.15s" },
  cardIcon: { width: 34, height: 34, borderRadius: 8, background: "rgba(79,70,229,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  cardName: { fontWeight: 700, fontSize: 15, color: INK, marginBottom: 4, wordBreak: "break-word" },
  cardMeta: { fontSize: 11.5, color: INK_FAINT },
  deleteBtn: { position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: 6, border: "none", background: "transparent", color: INK_FAINT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
};
