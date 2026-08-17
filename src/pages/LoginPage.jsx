import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { FONT, INK, INK_FAINT, BORDER, ACCENT, DANGER } from "../lib/theme.js";

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || "/"} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await signIn(email, password);
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setError(err.message || "Couldn't sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={onSubmit}>
        <div style={styles.title}>MuMap</div>
        <div style={styles.subtitle}>Sign in to your maps</div>

        <label style={styles.label}>Email</label>
        <input style={styles.input} type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

        <label style={styles.label}>Password</label>
        <input style={styles.input} type="password" required value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />

        {error && <div style={styles.error}>{error}</div>}

        <button style={styles.btnPrimary} type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div style={styles.footer}>
          No account? <Link to="/register" style={styles.link}>Register</Link>
        </div>
      </form>
    </div>
  );
}

const styles = {
  page: { fontFamily: FONT, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" },
  card: { width: 340, display: "flex", flexDirection: "column", gap: 6, padding: 28, borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: "0 10px 30px rgba(31,41,55,0.08)" },
  title: { fontWeight: 700, fontSize: 22, color: INK },
  subtitle: { fontSize: 13, color: INK_FAINT, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: 600, color: INK, marginTop: 10, marginBottom: 4 },
  input: { padding: "9px 11px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, color: INK, fontFamily: FONT },
  btnPrimary: { marginTop: 18, padding: "10px 12px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  error: { marginTop: 10, fontSize: 12.5, color: DANGER },
  footer: { marginTop: 16, fontSize: 12.5, color: INK_FAINT, textAlign: "center" },
  link: { color: ACCENT, fontWeight: 600, textDecoration: "none" },
};
