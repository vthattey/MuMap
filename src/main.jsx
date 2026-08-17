import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import RequireAuth from "./auth/RequireAuth.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import MapPage from "./pages/MapPage.jsx";
import { supabaseConfigured } from "./lib/supabaseClient.js";

function ConfigWarning() {
  if (supabaseConfigured) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: "#dc2626", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif",
      fontSize: 12.5, padding: "8px 14px", textAlign: "center",
    }}>
      Supabase isn't configured yet — copy <code>.env.example</code> to <code>.env.local</code>, fill in your project's URL/anon key, and restart the dev server.
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfigWarning />
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/map/:mapId" element={<RequireAuth><MapPage /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
