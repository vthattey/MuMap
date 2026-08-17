import React, { useCallback, useEffect, useState } from "react";
import { X, UserPlus, Trash2 } from "lucide-react";
import { listShares, inviteByEmail, updateShare, removeShare } from "../lib/mapShares.js";
import { FONT, INK, INK_SOFT, INK_FAINT, BORDER, ACCENT, SUBTLE_BG, DANGER } from "../lib/theme.js";

export default function ShareMapPanel({ mapId, onClose }) {
  const [shares, setShares] = useState(null);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try { setShares(await listShares(mapId)); } catch { setShares([]); }
  }, [mapId]);

  useEffect(() => { refresh(); }, [refresh]);

  const onInvite = useCallback(async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setError("");
    try {
      await inviteByEmail(mapId, email, permission);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err.message || "Couldn't share the map");
    } finally {
      setBusy(false);
    }
  }, [mapId, email, permission, refresh]);

  const onChangePermission = useCallback(async (shareId, next) => {
    await updateShare(shareId, next);
    refresh();
  }, [refresh]);

  const onRemove = useCallback(async (shareId) => {
    await removeShare(shareId);
    refresh();
  }, [refresh]);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.headerRow}>
          <div style={styles.title}>Share this map</div>
          <button style={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <form style={styles.inviteRow} onSubmit={onInvite}>
          <input style={styles.input} type="email" required placeholder="Email address" value={email}
            onChange={(e) => setEmail(e.target.value)} />
          <select style={styles.select} value={permission} onChange={(e) => setPermission(e.target.value)}>
            <option value="view">Can view</option>
            <option value="edit">Can edit</option>
          </select>
          <button style={styles.inviteBtn} type="submit" disabled={busy}><UserPlus size={14} /> Invite</button>
        </form>
        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.listLabel}>People with access</div>
        {shares === null && <div style={styles.empty}>Loading…</div>}
        {shares && shares.length === 0 && <div style={styles.empty}>Only you can access this map so far.</div>}
        {shares && shares.map((s) => (
          <div key={s.id} style={styles.shareRow}>
            <div style={{ ...styles.avatar, background: s.profiles?.color || ACCENT }}>
              {(s.profiles?.display_name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div style={styles.shareName}>{s.profiles?.display_name || "Unknown user"}</div>
            <select style={styles.rowSelect} value={s.permission} onChange={(e) => onChangePermission(s.id, e.target.value)}>
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
            </select>
            <button style={styles.removeBtn} title="Remove access" onClick={() => onRemove(s.id)}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(31,41,55,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, fontFamily: FONT },
  panel: { background: "#fff", width: 380, maxWidth: "90vw", borderRadius: 14, padding: 18, boxShadow: "0 20px 50px rgba(31,41,55,0.25)" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  title: { fontWeight: 700, fontSize: 16, color: INK },
  closeBtn: { border: "none", background: SUBTLE_BG, borderRadius: 6, padding: 6, cursor: "pointer", color: INK },
  inviteRow: { display: "flex", gap: 6, marginBottom: 6 },
  input: { flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, color: INK, fontFamily: FONT },
  select: { padding: "8px 6px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 12.5, color: INK, background: "#fff" },
  inviteBtn: { display: "flex", alignItems: "center", gap: 5, padding: "8px 10px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  error: { fontSize: 12, color: DANGER, marginBottom: 8 },
  listLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: INK_FAINT, textTransform: "uppercase", marginTop: 14, marginBottom: 8 },
  empty: { fontSize: 12.5, color: INK_FAINT, padding: "6px 0" },
  shareRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0" },
  avatar: { width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 },
  shareName: { flex: 1, fontSize: 13, color: INK, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowSelect: { padding: "5px 6px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, color: INK_SOFT, background: "#fff" },
  removeBtn: { border: "none", background: "transparent", color: INK_FAINT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 4 },
};
