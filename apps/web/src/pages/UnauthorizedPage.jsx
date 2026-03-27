import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function UnauthorizedPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const reason = searchParams.get("reason");
  const message =
    reason === "domain"
      ? "Your Google account is not in @email.kmutnb.ac.th domain."
      : "You are not authorized to access this application.";

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#090e17", color: "#f3e5e1" }}>
      <section style={{ width: "100%", maxWidth: 560, background: "#13100e", borderRadius: 16, padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>Access Denied</h1>
        <p style={{ marginBottom: 16, color: "#ffb4ab" }}>{message}</p>
        <button
          type="button"
          onClick={() => navigate("/login", { replace: true })}
          style={{ height: 44, padding: "0 16px", borderRadius: 8, border: "none", background: "#ff8f6f", color: "#3d1100", fontWeight: 700 }}
        >
          Back to Login
        </button>
      </section>
    </main>
  );
}
