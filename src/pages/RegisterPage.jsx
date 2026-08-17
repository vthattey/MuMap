import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { FONT, INK, INK_FAINT, BORDER, ACCENT, DANGER } from "../lib/theme.js";

export default function RegisterPage() {
  const { user, signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const data = await signUp(email, password, name.trim() || email.split("@")[0]);
      if (data?.session) {
        navigate("/", { replace: true });
      } else {
        setCheckEmail(true);
      }
    } catch (err) {
      setError(err.message || "Couldn't register");
    } finally {
      setBusy(false);
    }
  };

  if (checkEmail) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.title}>Check your email</div>
          <div style={styles.subtitle}>We sent a confirmation link to {email}. Click it, then sign in.</div>
          <Link to="/login" style={{ ...styles.btnPrimary, textAlign: "center", textDecoration: "none", display: "block" }}>Go to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={onSubmit}>
        <div style={styles.title}>MuMap</div>
        <div style={styles.subtitle}>Create your account</div>

        <label style={styles.label}>Display name</label>
        <input style={styles.input} type="text" required value={name}
          onChange={(e) => setName(e.target.value)} placeholder="Jamie" />

        <label style={styles.label}>Email</label>
        <input style={styles.input} type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

        <label style={styles.label}>Password</label>
        <input style={styles.input} type="password" required minLength={6} value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />

        {error && <div style={styles.error}>{error}</div>}

        <button style={styles.btnPrimary} type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Register"}
        </button>

        <div style={styles.footer}>
          Already have an account? <Link to="/login" style={styles.link}>Sign in</Link>
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
