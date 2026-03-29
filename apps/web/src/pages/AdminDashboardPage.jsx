import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../lib_api";
import { clearAccessToken, getAccessToken } from "../lib_auth";
import LogoutConfirmDialog from "../components/LogoutConfirmDialog";

function formatDate(date) {
  return new Date(date).toLocaleString();
}

const SUBJECT_ID_REGEX = /^\d{9}$/;

function fileTypeMeta(path = "") {
  const p = String(path).toLowerCase();
  if (p.endsWith(".pdf")) return { tag: "PDF", color: "#FB5C0C" };
  if (p.endsWith(".mp4") || p.endsWith(".mov") || p.endsWith(".mkv")) return { tag: "VIDEO", color: "#3b82f6" };
  if (p.endsWith(".png") || p.endsWith(".jpg") || p.endsWith(".jpeg") || p.endsWith(".gif")) return { tag: "IMAGE", color: "#16a34a" };
  return { tag: "FILE", color: "#7B879C" };
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const isNarrowScreen = typeof window !== "undefined" && window.innerWidth < 980;

  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [chaptersBySubject, setChaptersBySubject] = useState({});

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [subjectIdInput, setSubjectIdInput] = useState("");
  const [subjectNameInput, setSubjectNameInput] = useState("");

  const [chapterName, setChapterName] = useState("");
  const [chapterFile, setChapterFile] = useState(null);
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [extractingNow, setExtractingNow] = useState(false);
  const [uploadPopup, setUploadPopup] = useState({ show: false, type: "success", title: "", message: "" });

  const [subjectMessage, setSubjectMessage] = useState("");
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const loadSubjects = async (token) => {
    const response = await apiRequest("/admin/subjects", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      setSubjects([]);
      return;
    }

    const rows = await response.json();
    const mapped = rows.map((r) => ({
      subjectId: r.subject_id,
      name: r.name,
      createdBy: String(r.created_by_user_id),
      createdAt: r.created_at,
    }));

    setSubjects(mapped);
    setSelectedSubjectId((prev) => {
      if (mapped.length === 0) return null;
      if (prev && mapped.some((x) => x.subjectId === prev)) return prev;
      return mapped[0].subjectId;
    });
  };

  const loadChapters = async (subjectId, token) => {
    if (!subjectId) return;

    const response = await apiRequest(`/admin/subjects/${encodeURIComponent(subjectId)}/chapters`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      setChaptersBySubject((prev) => ({ ...prev, [subjectId]: [] }));
      return;
    }

    const rows = await response.json();
    const mapped = rows.map((r) => ({
      id: r.chapter_id,
      chapterName: r.chapter_name,
      filePath: r.file_path,
      uploadedByUserId: r.uploaded_by_user_id,
      uploadedAt: r.uploaded_at,
    }));

    setChaptersBySubject((prev) => ({ ...prev, [subjectId]: mapped }));
  };

  useEffect(() => {
    async function loadProfile() {
      const token = getAccessToken();
      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const response = await apiRequest("/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          clearAccessToken();
          navigate("/login", { replace: true });
          return;
        }

        const payload = await response.json();
        if (payload?.role === "student") {
          navigate("/subjects", { replace: true });
          return;
        }
        setProfile(payload);
        await loadSubjects(token);
      } finally {
        setLoadingProfile(false);
      }
    }

    loadProfile();
  }, [navigate]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !selectedSubjectId) return;
    loadChapters(selectedSubjectId, token);
  }, [selectedSubjectId]);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.subjectId === selectedSubjectId) || null,
    [subjects, selectedSubjectId]
  );

  const selectedSubjectChapters = chaptersBySubject[selectedSubjectId] || [];
  const isAdmin = profile?.role === "admin";
  const isSubjectIdValid = SUBJECT_ID_REGEX.test(subjectIdInput.trim());
  const createSubjectDisabled = !isAdmin || !isSubjectIdValid || !subjectNameInput.trim();
  const uploadSlideDisabled =
    extractingNow ||
    !selectedSubject ||
    !chapterName.trim() ||
    !chapterFile ||
    !chapterFile.name?.toLowerCase().endsWith(".pdf");

  const handleLogout = async () => {
    const token = getAccessToken();
    if (token) {
      await apiRequest("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    clearAccessToken();
    navigate("/login", { replace: true });
  };

  const handleCreateSubject = async (event) => {
    event.preventDefault();
    if (!isAdmin) return;

    const sid = subjectIdInput.trim();
    const sname = subjectNameInput.trim();

    if (!sid || !sname) {
      setSubjectMessage("Please provide Subject ID and Name");
      return;
    }
    if (!SUBJECT_ID_REGEX.test(sid)) {
      setSubjectMessage("Subject ID must be exactly 9 digits");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    const response = await apiRequest("/admin/subjects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject_id: sid,
        name: sname,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setSubjectMessage(payload.detail || "Create subject failed");
      return;
    }

    setSubjectMessage("");
    setSubjectIdInput("");
    setSubjectNameInput("");
    setShowCreateModal(false);

    await loadSubjects(token);
    setSelectedSubjectId(sid);
  };

  const handleUploadSlide = async (event) => {
    event.preventDefault();
    setUploadMessage("");

    if (!selectedSubject) {
      setUploadMessage("Please select subject first");
      return;
    }

    if (!chapterName.trim()) {
      setUploadMessage("Please enter chapter name");
      return;
    }

    if (!chapterFile) {
      setUploadMessage("Please select PDF file");
      return;
    }

    if (!chapterFile.name.toLowerCase().endsWith(".pdf")) {
      setUploadMessage("Only .pdf file is allowed");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    const formData = new FormData();
    formData.append("chapter_name", chapterName.trim());
    formData.append("file", chapterFile);

    setExtractingNow(true);
    try {
      const response = await apiRequest(`/admin/subjects/${encodeURIComponent(selectedSubject.subjectId)}/chapters/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload.detail || "Upload failed";
        setUploadMessage(message);
        setUploadPopup({
          show: true,
          type: "error",
          title: "Upload Failed",
          message,
        });
        return;
      }

      setChapterName("");
      setChapterFile(null);
      setUploadMessage("Upload + Extract + TOC completed");
      await loadChapters(selectedSubject.subjectId, token);
      setUploadPopup({
        show: true,
        type: "success",
        title: "Completed",
        message: "Upload + Extract MD + Build TOC สำเร็จแล้ว",
      });
    } finally {
      setExtractingNow(false);
    }
  };

  const handleDeleteSubject = async () => {
    if (!selectedSubject) return;
    if (!window.confirm(`Delete subject ${selectedSubject.subjectId}?`)) return;

    const token = getAccessToken();
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    const response = await apiRequest(`/admin/subjects/${encodeURIComponent(selectedSubject.subjectId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setUploadMessage(payload.detail || "Delete subject failed");
      return;
    }

    setUploadMessage("Subject deleted");
    setSelectedSubjectId(null);
    setChaptersBySubject((prev) => {
      const next = { ...prev };
      delete next[selectedSubject.subjectId];
      return next;
    });
    await loadSubjects(token);
  };

  const handleDeleteChapter = async (chapterId) => {
    if (!selectedSubject) return;
    if (!window.confirm("Delete this chapter?")) return;

    const token = getAccessToken();
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    const response = await apiRequest(
      `/admin/subjects/${encodeURIComponent(selectedSubject.subjectId)}/chapters/${chapterId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setUploadMessage(payload.detail || "Delete chapter failed");
      return;
    }

    setUploadMessage("Chapter deleted");
    await loadChapters(selectedSubject.subjectId, token);
  };

  const handleDropFile = (event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    setChapterFile(file);
    setUploadMessage("");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0A192F", color: "#D8E3FB", fontFamily: "Plus Jakarta Sans, Manrope, Prompt, sans-serif" }}>
      <style>{`
        @keyframes ept-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .adm-btn{transition:all .2s ease}
        .adm-card{transition:all .2s ease}
        .adm-subject-card{background:linear-gradient(180deg,#13243d 0%,#102039 100%); border:1px solid rgba(255,255,255,.08)}
        .adm-subject-card:hover{transform:translateY(-1px); border-color:rgba(198,214,241,.3); background:linear-gradient(180deg,#1a2f4c 0%,#18304b 100%)}
        .adm-subject-card.active{border-left:4px solid #FB5C0C; box-shadow:0 0 0 1px rgba(251,92,12,.35),0 12px 30px rgba(0,0,0,.22)}
        .adm-accent-btn{box-shadow:0 10px 24px rgba(251,92,12,.28)}
        .adm-accent-btn:hover{background:#ff6f2c !important; transform:translateY(-1px)}
        .adm-danger-btn:hover{background:#cf4a4a !important}
        .adm-soft-card{background:linear-gradient(180deg,#14263f 0%,#112238 100%); border:1px solid rgba(255,255,255,.08)}
        .adm-soft-card:hover{border-color:rgba(255,255,255,.16)}
        .adm-upload-zone{border:1.5px dashed rgba(216,227,251,.35); background:linear-gradient(180deg,#12233a 0%,#102038 100%); transition:all .2s ease}
        .adm-upload-zone:hover{border-color:#FB5C0C; background:linear-gradient(180deg,#152942 0%,#132740 100%)}
        .adm-upload-zone.active{border-color:#FB5C0C; box-shadow:0 0 0 3px rgba(251,92,12,.2)}
        .adm-chapter-row{transition:all .18s ease}
        .adm-chapter-row:hover{background:#1a2f4a !important; border-color:rgba(255,255,255,.16) !important}
        .adm-mini-del:hover{background:#cf4a4a !important}
      `}</style>
      <header
        style={{
          height: 66,
          background: "rgba(13, 28, 46, 0.9)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          position: "sticky",
          top: 0,
          zIndex: 5,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontWeight: 900, color: "rgb(251, 92, 12)", letterSpacing: -0.5, fontSize: 20 }}>E-Pretest</div>
          <span style={{ opacity: 0.4, fontSize: 14 }}>/</span>
          <span style={{ opacity: 0.85, fontSize: 14, fontWeight: 500, color: "rgb(216, 227, 251)" }}>Subjects</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, rgb(42, 64, 95), rgb(31, 51, 79))", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, color: "rgb(255, 255, 255)", border: "1px solid rgba(255, 255, 255, 0.1)", boxShadow: "rgba(255, 255, 255, 0.1) 0px 2px 4px inset" }}>
            {String(profile?.full_name || "U").trim().charAt(0).toUpperCase()}
          </div>
          <div style={{ display: "grid", gap: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgb(216, 227, 251)", lineHeight: 1.2 }}>
              {loadingProfile ? "Loading..." : profile?.full_name || "Unknown"}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "rgb(251, 92, 12)", textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.9 }}>
              {profile?.role || "-"}
            </span>
          </div>
          <div style={{ width: 1, height: 24, background: "rgba(255, 255, 255, 0.1)" }} />
          <button
            type="button"
            onClick={() => setShowLogoutDialog(true)}
            style={{
              borderRadius: 8,
              padding: "6px 12px",
              color: "rgb(255, 139, 139)",
              background: "transparent",
              border: "1px solid rgba(255, 139, 139, 0.2)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <main
        style={{
          maxWidth: 1500,
          margin: "0 auto",
          padding: 24,
          display: "grid",
          gridTemplateColumns: isNarrowScreen ? "1fr" : "minmax(320px, 380px) 1fr",
          gap: 20,
          height: "calc(100vh - 66px)",
        }}
      >
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ margin: "4px 0 8px", fontSize: 22 }}>Archived Subjects</h2>

          <button
            type="button"
            onClick={() => {
              setSubjectMessage("");
              if (isAdmin) setShowCreateModal(true);
            }}
            disabled={!isAdmin}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 12,
              padding: "12px 14px",
              background: isAdmin ? "#FB5C0C" : "#6f7b92",
              color: "white",
              fontWeight: 700,
              cursor: isAdmin ? "pointer" : "not-allowed",
              opacity: isAdmin ? 1 : 0.65,
            }}
            className="adm-btn adm-accent-btn"
          >
            Add New Subject
          </button>

          <div style={{ overflowY: "auto", display: "grid", gap: 10, paddingRight: 4 }}>
            {subjects.length === 0 && (
              <div style={{ background: "#111C2D", borderRadius: 12, padding: 14, opacity: 0.8, fontSize: 14 }}>
                No subject yet. {isAdmin ? "Click Add New Subject" : "Waiting for admin to create subject"}
              </div>
            )}

            {subjects.map((subject) => {
              const active = selectedSubjectId === subject.subjectId;
              return (
                <button
                  key={subject.subjectId}
                  type="button"
                  onClick={() => setSelectedSubjectId(subject.subjectId)}
                  className={`adm-card adm-subject-card ${active ? "active" : ""}`}
                  style={{
                    textAlign: "left",
                    borderLeft: active ? "4px solid #FB5C0C" : "4px solid transparent",
                    borderRadius: 12,
                    background: active ? "linear-gradient(180deg,#1a2f4c 0%,#18304b 100%)" : undefined,
                    color: active ? "#ffffff" : "#D8E3FB",
                    padding: "12px 12px 12px 14px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{subject.name}</div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{subject.subjectId}</div>
                  <div style={{ marginTop: 3, fontSize: 11, opacity: 0.55 }}>Added: {formatDate(subject.createdAt)}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section
          style={{
            background: "#111C2D",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.08)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>Subject Details</h2>
            {selectedSubject ? (
              <button
                type="button"
                onClick={handleDeleteSubject}
                className="adm-btn adm-danger-btn"
                style={{
                  height: 34,
                  border: "none",
                  borderRadius: 8,
                  padding: "0 10px",
                  background: "#aa3b3b",
                  color: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Delete Subject
              </button>
            ) : null}
          </div>

          {!selectedSubject ? (
            <div style={{ opacity: 0.75 }}>Select subject from left panel</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: isNarrowScreen ? "1fr" : "1fr 1fr", gap: 8 }}>
                <div className="adm-card adm-soft-card" style={{ borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 11, opacity: 0.72 }}>BOOK • Subject Name</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{selectedSubject.name}</div>
                </div>
                <div className="adm-card adm-soft-card" style={{ borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 11, opacity: 0.72 }}>ID • Subject ID</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{selectedSubject.subjectId}</div>
                </div>
                <div className="adm-card adm-soft-card" style={{ borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 11, opacity: 0.72 }}>USER • Created By</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{selectedSubject.createdBy}</div>
                </div>
                <div className="adm-card adm-soft-card" style={{ borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 11, opacity: 0.72 }}>TIME • Created At</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{formatDate(selectedSubject.createdAt)}</div>
                </div>
              </div>

              <form onSubmit={handleUploadSlide} style={{ background: "#0f1b2d", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
                <h3 style={{ margin: 0 }}>Upload Slide (PDF)</h3>
              <input
                type="text"
                value={chapterName}
                onChange={(e) => {
                  setChapterName(e.target.value);
                  setUploadMessage("");
                }}
                placeholder="Chapter name"
                required
                style={{ height: 40, borderRadius: 8, border: "1px solid #334159", background: "#111C2D", color: "#D8E3FB", padding: "0 10px" }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  setChapterFile(e.target.files?.[0] || null);
                  setUploadMessage("");
                }}
                style={{ display: "none" }}
              />
              <div
                role="button"
                tabIndex={0}
                className={`adm-upload-zone ${dragActive ? "active" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDropFile}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                style={{
                  minHeight: 40,
                  borderRadius: 12,
                  display: "grid",
                  placeItems: "center",
                  textAlign: "center",
                  cursor: "pointer",
                  padding: "0 12px",
                }}
              >
                <div style={{ display: "grid", gap: 1, justifyItems: "center", width: "100%" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                    {chapterFile ? chapterFile.name : "Drag and Drop"}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.72 }}>{chapterFile ? "PDF selected" : "or click to upload PDF"}</div>
                </div>
              </div>
              <button
                type="submit"
                disabled={uploadSlideDisabled}
                style={{
                  height: 40,
                  border: "none",
                  borderRadius: 8,
                  background: uploadSlideDisabled ? "#7f8da8" : "#FB5C0C",
                  color: "white",
                  fontWeight: 700,
                  cursor: uploadSlideDisabled ? "not-allowed" : "pointer",
                }}
              >
                {extractingNow ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        border: "2px solid rgba(255,255,255,0.5)",
                        borderTopColor: "white",
                        borderRadius: "50%",
                        display: "inline-block",
                        animation: "ept-spin 0.9s linear infinite",
                      }}
                    />
                    Extracting...
                  </span>
                ) : (
                  "Upload Slide PDF"
                )}
              </button>
                {uploadMessage ? <div style={{ fontSize: 13, opacity: 0.9 }}>{uploadMessage}</div> : null}
              </form>

              <div
                style={{
                  background: "#0f1b2d",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  flex: 1,
                  minHeight: 220,
                  overflow: "hidden",
                }}
              >
                <h3 style={{ margin: 0 }}>Uploaded Chapters</h3>
                {selectedSubjectChapters.length === 0 ? (
                  <div style={{ opacity: 0.75, fontSize: 14 }}>No chapter uploaded yet</div>
                ) : (
                  <div style={{ display: "grid", gap: 10, overflowY: "auto", paddingRight: 4 }}>
                    {selectedSubjectChapters.map((chapter) => {
                      const meta = fileTypeMeta(chapter.filePath);
                      return (
                        <div key={chapter.id} className="adm-chapter-row" style={{ background: "#111C2D", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ minWidth: 56, textAlign: "center" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: meta.color }}>{meta.tag}</div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700 }}>{chapter.chapterName}</div>
                            <div style={{ fontSize: 12, opacity: 0.74, marginTop: 3 }}>Uploaded By: {chapter.uploadedByUserId} • {formatDate(chapter.uploadedAt)}</div>
                            <div style={{ fontSize: 12, opacity: 0.62, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{chapter.filePath}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteChapter(chapter.id)}
                            className="adm-btn adm-mini-del"
                            style={{
                              width: 34,
                              height: 34,
                              border: "none",
                              borderRadius: 8,
                              background: "#aa3b3b",
                              color: "white",
                              cursor: "pointer",
                              display: "grid",
                              placeItems: "center",
                            }}
                            aria-label="Delete chapter"
                            title="Delete chapter"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M4 7h16M9 7V5h6v2m-8 0 1 12h8l1-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </main>

      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <form
            onSubmit={handleCreateSubject}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#111C2D",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 14,
              padding: 18,
              display: "grid",
              gap: 10,
            }}
          >
            <h3 style={{ margin: 0 }}>Create New Subject</h3>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Subject ID
              <input
                type="text"
                value={subjectIdInput}
                onChange={(e) => {
                  const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 9);
                  setSubjectIdInput(digitsOnly);
                  setSubjectMessage("");
                }}
                placeholder="ex: 030124567"
                inputMode="numeric"
                pattern="[0-9]{9}"
                title="Subject ID must be exactly 9 digits (0-9)"
                maxLength={9}
                required
                style={{ height: 40, borderRadius: 8, border: "1px solid #334159", background: "#0f1b2d", color: "#D8E3FB", padding: "0 10px" }}
              />
              {subjectIdInput && !isSubjectIdValid ? (
                <span style={{ color: "#ffb4ab", fontSize: 12 }}>Subject ID must be exactly 9 digits</span>
              ) : null}
            </label>

            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              Name Subject
              <input
                type="text"
                value={subjectNameInput}
                onChange={(e) => {
                  setSubjectNameInput(e.target.value);
                  setSubjectMessage("");
                }}
                placeholder="ex: Calculus II"
                required
                style={{ height: 40, borderRadius: 8, border: "1px solid #334159", background: "#0f1b2d", color: "#D8E3FB", padding: "0 10px" }}
              />
            </label>

            <div style={{ fontSize: 13, opacity: 0.9, background: "#0f1b2d", borderRadius: 8, padding: 10 }}>
              <div>Created By (Auto): {profile?.email || "-"}</div>
              <div>Created At (Auto): {formatDate(new Date().toISOString())}</div>
            </div>

            {subjectMessage ? <div style={{ color: "#ffb4ab", fontSize: 13 }}>{subjectMessage}</div> : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid #334159", background: "#1b2738", color: "#D8E3FB", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createSubjectDisabled}
                style={{
                  height: 38,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "none",
                  background: createSubjectDisabled ? "#7f8da8" : "#FB5C0C",
                  color: "white",
                  fontWeight: 700,
                  cursor: createSubjectDisabled ? "not-allowed" : "pointer",
                }}
              >
                Create Subject
              </button>
            </div>
          </form>
        </div>
      )}

      <LogoutConfirmDialog
        open={showLogoutDialog}
        onCancel={() => setShowLogoutDialog(false)}
        onConfirm={handleLogout}
      />

      {uploadPopup.show ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 40,
          }}
          onClick={() => setUploadPopup((prev) => ({ ...prev, show: false }))}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 14,
              background: "#111C2D",
              border: `1px solid ${uploadPopup.type === "success" ? "#2f8f58" : "#a94442"}`,
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
              padding: 18,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: uploadPopup.type === "success" ? "#7BE495" : "#FFB4AB" }}>
              {uploadPopup.title}
            </div>
            <div style={{ fontSize: 14, opacity: 0.9 }}>{uploadPopup.message}</div>
            <button
              type="button"
              onClick={() => setUploadPopup((prev) => ({ ...prev, show: false }))}
              style={{
                justifySelf: "end",
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                background: uploadPopup.type === "success" ? "#2f8f58" : "#a94442",
                color: "white",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
