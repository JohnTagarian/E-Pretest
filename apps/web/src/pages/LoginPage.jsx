import React from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest, getApiBaseUrl } from "../lib_api";
import { getAccessToken } from "../lib_auth";

export default function LoginPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (getAccessToken()) {
      navigate("/me", { replace: true });
    }
  }, [navigate]);

  const handleGoogleLogin = async () => {
    const apiBaseUrl = getApiBaseUrl();

    try {
      const response = await apiRequest("/auth/google/start", { method: "POST" });
      if (!response.ok) {
        window.alert("Unable to start Google OAuth");
        return;
      }

      const payload = await response.json();
      if (!payload?.auth_url) {
        window.alert("Invalid OAuth response");
        return;
      }

      // In current backend skeleton, dev mode returns a callback URL with code.
      // Redirect to frontend callback route so React can store token and continue flow.
      if (payload.auth_url.startsWith("/auth/google/callback")) {
        const parsed = new URL(`${apiBaseUrl}${payload.auth_url}`);
        const code = parsed.searchParams.get("code");
        const state = parsed.searchParams.get("state");
        if (code) {
          const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
          callbackUrl.searchParams.set("code", code);
          if (state) {
            callbackUrl.searchParams.set("state", state);
          }
          window.location.href = callbackUrl.toString();
          return;
        }
      }

      window.location.href = payload.auth_url;
    } catch (_error) {
      window.alert("OAuth start request failed");
    }
  };

  return (
    <div
      className="bg-surface text-on-surface min-h-screen flex flex-col"
      style={{ minHeight: "100vh", backgroundColor: "#090e17", color: "#f3e5e1" }}
    >
      <header className="fixed top-0 w-full z-50 bg-[#0e131d] shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between px-6 h-16 w-full max-w-none">
          <div className="text-2xl font-black tracking-tighter text-[#ff8f6f]">E-PreTest</div>
        </div>
      </header>

      <main
        className="flex-grow flex items-center justify-center px-4 pt-24 pb-12 relative overflow-hidden"
        style={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "96px 16px 48px" }}
      >
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-secondary-container/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="w-full max-w-[440px] z-10" style={{ width: "100%", maxWidth: 440 }}>
          <div
            className="bg-surface-container-low rounded-[2rem] p-8 md:p-12 shadow-2xl shadow-black/60 relative overflow-hidden"
            style={{ backgroundColor: "#13100e", borderRadius: 24, padding: 32 }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

            <div className="relative z-10">
              <div className="mb-10 text-center">
                <h1 className="text-3xl font-extrabold tracking-tight text-on-surface mb-2">Sign In To E-PreTest</h1>
                <p className="text-on-surface-variant text-sm">
                  Login with Google account only. Access is limited to @email.kmutnb.ac.th
                </p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2">
                  <span className="material-symbols-outlined text-primary text-base">verified_user</span>
                  <p className="text-xs font-medium tracking-wide text-on-surface">
                    Domain filtering is validated by backend after Google OAuth callback.
                  </p>
                </div>
              </div>

              <button
                className="w-full h-14 bg-surface-container-highest border border-outline-variant/30 hover:border-primary/50 text-on-surface font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-3 group active:scale-[0.98]"
                type="button"
                onClick={handleGoogleLogin}
              >
                <svg className="w-5 h-5 transition-transform group-hover:scale-110" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Login with Google KMUTNB
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
