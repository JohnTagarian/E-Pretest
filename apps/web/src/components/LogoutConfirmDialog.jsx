import React from "react";

export default function LogoutConfirmDialog({ open, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.48)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 1200,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#111C2D",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          padding: 18,
          display: "grid",
          gap: 10,
          color: "#D8E3FB",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 19 }}>Confirm Logout</h3>
        <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
          You are about to sign out from this session.
          <br />
          Unsaved progress may be lost.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              height: 36,
              borderRadius: 8,
              border: "1px solid #334159",
              background: "#1b2738",
              color: "#D8E3FB",
              padding: "0 12px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              height: 36,
              borderRadius: 8,
              border: "none",
              background: "#a94442",
              color: "white",
              fontWeight: 700,
              padding: "0 12px",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
