import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../lib_api";
import { clearAccessToken, getAccessToken } from "../lib_auth";

function formatDate(date) {
  return new Date(date).toLocaleString();
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
  const [uploadMessage, setUploadMessage] = useState("");
  const [extractMessage, setExtractMessage] = useState("");
  const [extractingChapterId, setExtractingChapterId] = useState(null);

  const [subjectMessage, setSubjectMessage] = useState("");

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
  const createSubjectDisabled = !isAdmin || !subjectIdInput.trim() || !subjectNameInput.trim();
  const uploadSlideDisabled =
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

    const response = await apiRequest(`/admin/subjects/${encodeURIComponent(selectedSubject.subjectId)}/chapters/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setUploadMessage(payload.detail || "Upload failed");
      return;
    }

    setChapterName("");
    setChapterFile(null);
    setUploadMessage("Upload success");
    await loadChapters(selectedSubject.subjectId, token);
  };

  const handleExtractChapter = async (chapterId) => {
    const token = getAccessToken();
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    setExtractingChapterId(chapterId);
    setExtractMessage("");

    const response = await apiRequest(`/core/chapters/${chapterId}/extract`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setExtractMessage(payload.detail || "Extract failed");
      setExtractingChapterId(null);
      return;
    }

    const payload = await response.json();
    setExtractMessage(`Extracted: ${payload.output_path}`);
    setExtractingChapterId(null);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#081425", color: "#D8E3FB", fontFamily: "Inter, sans-serif" }}>
      <header
        style={{
          height: 64,
          background: "#111C2D",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ fontWeight: 800, color: "#FB5C0C", letterSpacing: -0.5 }}>E-Pretest</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, opacity: 0.85 }}>
            {loadingProfile ? "Loading..." : `${profile?.full_name || "Unknown"} (${profile?.role || "-"})`}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
              background: "#2A3548",
              color: "#D8E3FB",
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
          height: "calc(100vh - 64px)",
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
                  style={{
                    textAlign: "left",
                    border: active ? "1px solid #FB5C0C" : "1px solid rgba(255,255,255,0.08)",
                    borderLeft: active ? "4px solid #FB5C0C" : "4px solid transparent",
                    borderRadius: 12,
                    background: active ? "#2A3548" : "#111C2D",
                    color: "#D8E3FB",
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
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 22 }}>Subject Details</h2>

          {!selectedSubject ? (
            <div style={{ opacity: 0.75 }}>Select subject from left panel</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: isNarrowScreen ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div style={{ background: "#1b2738", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>Subject Name</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{selectedSubject.name}</div>
                </div>
                <div style={{ background: "#1b2738", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>Subject ID</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{selectedSubject.subjectId}</div>
                </div>
                <div style={{ background: "#1b2738", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>Created By (Auto)</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{selectedSubject.createdBy}</div>
                </div>
                <div style={{ background: "#1b2738", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>Created At (Auto)</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{formatDate(selectedSubject.createdAt)}</div>
                </div>
              </div>

              <form onSubmit={handleUploadSlide} style={{ background: "#0f1b2d", borderRadius: 12, padding: 14, display: "grid", gap: 10 }}>
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
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  setChapterFile(e.target.files?.[0] || null);
                  setUploadMessage("");
                }}
                required
                style={{ color: "#D8E3FB" }}
              />
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
                Upload Slide PDF
              </button>
                {uploadMessage ? <div style={{ fontSize: 13, opacity: 0.9 }}>{uploadMessage}</div> : null}
                {extractMessage ? <div style={{ fontSize: 13, opacity: 0.9 }}>{extractMessage}</div> : null}
              </form>

              <div
                style={{
                  background: "#0f1b2d",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
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
                    {selectedSubjectChapters.map((chapter) => (
                      <div key={chapter.id} style={{ background: "#111C2D", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10 }}>
                        <div style={{ fontWeight: 700 }}>{chapter.chapterName}</div>
                        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 3 }}>{chapter.filePath}</div>
                        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>Uploaded: {formatDate(chapter.uploadedAt)}</div>
                        <div style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            onClick={() => handleExtractChapter(chapter.id)}
                            disabled={extractingChapterId === chapter.id}
                            style={{
                              height: 32,
                              border: "none",
                              borderRadius: 8,
                              padding: "0 10px",
                              background: extractingChapterId === chapter.id ? "#7f8da8" : "#2f8f83",
                              color: "white",
                              fontWeight: 700,
                              cursor: extractingChapterId === chapter.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {extractingChapterId === chapter.id ? "Extracting..." : "Extract Markdown"}
                          </button>
                        </div>
                      </div>
                    ))}
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
                  setSubjectIdInput(e.target.value);
                  setSubjectMessage("");
                }}
                placeholder="ex: 0305xxxx"
                required
                style={{ height: 40, borderRadius: 8, border: "1px solid #334159", background: "#0f1b2d", color: "#D8E3FB", padding: "0 10px" }}
              />
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
    </div>
  );
}
