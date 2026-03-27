import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../lib_api";
import { clearAccessToken, getAccessToken } from "../lib_auth";

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadProfile() {
      const token = getAccessToken();
      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const response = await apiRequest("/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          if (response.status === 401) {
            clearAccessToken();
            navigate("/login", { replace: true });
            return;
          }
          setError(payload.detail || "Failed to load profile");
          return;
        }

        const payload = await response.json();
        setProfile(payload);
      } catch (profileError) {
        setError(profileError instanceof Error ? profileError.message : "Unexpected error");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [navigate]);

  const handleLogout = async () => {
    const token = getAccessToken();
    if (token) {
      await apiRequest("/auth/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => undefined);
    }

    clearAccessToken();
    navigate("/login", { replace: true });
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#090e17", color: "#f3e5e1" }}>
      <section style={{ width: "100%", maxWidth: 640, background: "#13100e", borderRadius: 16, padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>My Profile</h1>
        {loading && <p>Loading...</p>}
        {!loading && error && <p style={{ color: "#ff7351" }}>{error}</p>}
        {!loading && profile && (
          <div>
            <p><strong>User ID:</strong> {profile.user_id}</p>
            <p><strong>Email:</strong> {profile.email}</p>
            <p><strong>Name:</strong> {profile.full_name}</p>
            <p><strong>Role:</strong> {profile.role}</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          style={{ marginTop: 16, height: 44, padding: "0 16px", borderRadius: 8, border: "none", background: "#ff8f6f", color: "#3d1100", fontWeight: 700 }}
        >
          Logout
        </button>
      </section>
    </main>
  );
}
