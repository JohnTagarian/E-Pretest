import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../lib_api";
import { setAccessToken } from "../lib_auth";

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }
    hasStartedRef.current = true;

    async function runCallback() {
      const code = searchParams.get("code");
      if (!code) {
        setError("Missing OAuth code");
        return;
      }

      const state = searchParams.get("state") || "";
      const callbackKey = `oauth_callback_done:${code}:${state}`;
      if (window.sessionStorage.getItem(callbackKey) === "1") {
        setError("OAuth callback already processed. Please login again.");
        return;
      }

      try {
        const callbackResponse = await apiRequest(
          `/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || "")}`
        );

        if (!callbackResponse.ok) {
          const payload = await callbackResponse.json().catch(() => ({}));
          if (callbackResponse.status === 403) {
            navigate("/unauthorized?reason=domain", { replace: true });
            return;
          }
          setError(payload.detail || "OAuth callback failed");
          return;
        }

        const callbackPayload = await callbackResponse.json();
        window.sessionStorage.setItem(callbackKey, "1");
        setAccessToken(callbackPayload.access_token);
        navigate("/archive", { replace: true });
      } catch (callbackError) {
        setError(callbackError instanceof Error ? callbackError.message : "Unexpected callback error");
      }
    }

    runCallback();
  }, [navigate, searchParams]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#090e17", color: "#f3e5e1" }}>
      <section style={{ width: "100%", maxWidth: 560, background: "#13100e", borderRadius: 16, padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>Authenticating...</h1>
        {!error ? <p>Please wait while we finish Google sign in.</p> : <p style={{ color: "#ff7351" }}>{error}</p>}
      </section>
    </main>
  );
}
