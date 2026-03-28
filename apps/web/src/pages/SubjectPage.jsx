import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../lib_api";
import { clearAccessToken, getAccessToken } from "../lib_auth";

export default function SubjectPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [chaptersBySubject, setChaptersBySubject] = useState({});
  const [masteryByChapter, setMasteryByChapter] = useState({});
  const [loadingMasteryByChapter, setLoadingMasteryByChapter] = useState({});
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [chapterLoadError, setChapterLoadError] = useState("");

  const masteryColor = (level) => {
    if (level === "Mastered") return "#2F8F58";
    if (level === "Proficient") return "#4AA96C";
    if (level === "Competent") return "#FB5C0C";
    if (level === "Developing") return "#B07D2A";
    return "#7B879C";
  };

  const loadMasteryByChapterIds = async (chapterIds, token) => {
    if (!Array.isArray(chapterIds) || chapterIds.length === 0) return;

    setLoadingMasteryByChapter((prev) => {
      const next = { ...prev };
      chapterIds.forEach((id) => {
        next[id] = true;
      });
      return next;
    });

    await Promise.all(
      chapterIds.map(async (chapterId) => {
        try {
          const response = await apiRequest(`/core/mastery/chapter/${chapterId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) {
            setMasteryByChapter((prev) => ({
              ...prev,
              [chapterId]: null,
            }));
            return;
          }
          const payload = await response.json();
          setMasteryByChapter((prev) => ({
            ...prev,
            [chapterId]: payload,
          }));
        } catch {
          setMasteryByChapter((prev) => ({
            ...prev,
            [chapterId]: null,
          }));
        } finally {
          setLoadingMasteryByChapter((prev) => ({
            ...prev,
            [chapterId]: false,
          }));
        }
      })
    );
  };

  const fetchChaptersBySubjectId = async (subjectId, token) => {
    const response = await apiRequest(`/admin/subjects/${encodeURIComponent(subjectId)}/chapters`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errPayload = await response.json().catch(() => ({}));
      return {
        ok: false,
        mapped: [],
        error: errPayload.detail || "Failed to load chapters",
      };
    }

    const payload = await response.json();
    const mapped = payload.map((row) => ({
      id: row.chapter_id,
      chapterName: row.chapter_name,
      uploadedAt: row.uploaded_at,
    }));
    return { ok: true, mapped, error: "" };
  };

  const loadSubjects = async (token) => {
    const response = await apiRequest("/admin/subjects", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      setSubjects([]);
      return [];
    }

    const payload = await response.json();
    const mapped = payload.map((row) => ({
      subjectId: row.subject_id,
      name: row.name,
      createdAt: row.created_at,
    }));

    setSubjects(mapped);
    setSelectedSubjectId((prev) => {
      if (mapped.length === 0) return null;
      if (prev && mapped.some((s) => s.subjectId === prev)) return prev;
      return mapped[0].subjectId;
    });
    return mapped;
  };

  const loadChapters = async (subjectId, token) => {
    if (!subjectId) return;
    setChapterLoadError("");
    const result = await fetchChaptersBySubjectId(subjectId, token);
    if (!result.ok) {
      setChaptersBySubject((prev) => ({ ...prev, [subjectId]: [] }));
      setChapterLoadError(result.error);
      return;
    }
    const mapped = result.mapped;
    setChaptersBySubject((prev) => ({ ...prev, [subjectId]: mapped }));
    await loadMasteryByChapterIds(mapped.map((c) => c.id), token);
  };

  useEffect(() => {
    async function bootstrap() {
      const token = getAccessToken();
      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const me = await apiRequest("/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!me.ok) {
          clearAccessToken();
          navigate("/login", { replace: true });
          return;
        }

        const user = await me.json();
        setProfile(user);
        const rows = await loadSubjects(token);

        // Auto-select subject that already has at least 1 chapter (if any).
        let subjectToSelect = rows[0]?.subjectId || null;
        for (const row of rows) {
          const preview = await fetchChaptersBySubjectId(row.subjectId, token);
          if (preview.ok && preview.mapped.length > 0) {
            subjectToSelect = row.subjectId;
            break;
          }
        }
        if (subjectToSelect) {
          setSelectedSubjectId(subjectToSelect);
        }
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [navigate]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !selectedSubjectId) return;
    loadChapters(selectedSubjectId, token);
  }, [selectedSubjectId]);

  const filteredSubjects = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) => s.name.toLowerCase().includes(q) || s.subjectId.toLowerCase().includes(q));
  }, [subjects, searchText]);

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.subjectId === selectedSubjectId) || null,
    [subjects, selectedSubjectId]
  );
  const selectedChapters = chaptersBySubject[selectedSubjectId] || [];

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

  return (
    <div style={{ minHeight: "100vh", background: "#081425", color: "#D8E3FB", fontFamily: "Inter, sans-serif" }}>
      <header style={{ height: 64, background: "#111C2D", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 800, color: "#FB5C0C", letterSpacing: -0.5 }}>E-Pretest</div>
          <span style={{ opacity: 0.7 }}>Subjects</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, opacity: 0.85 }}>{loading ? "Loading..." : `${profile?.full_name || "Unknown"} (${profile?.role || "-"})`}</span>
          <button
            type="button"
            onClick={handleLogout}
            style={{ border: "none", borderRadius: 8, padding: "8px 12px", background: "#2A3548", color: "#D8E3FB", cursor: "pointer" }}
          >
            Logout
          </button>
        </div>
      </header>

      <main
        style={{
          maxWidth: 1600,
          margin: "0 auto",
          padding: 24,
          display: "grid",
          gap: 20,
          gridTemplateColumns: typeof window !== "undefined" && window.innerWidth < 980 ? "1fr" : "minmax(320px, 420px) 1fr",
          minHeight: "calc(100vh - 64px)",
        }}
      >
        <section style={{ background: "#111C2D", borderRadius: 16, padding: 16, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: "2px 0 6px", fontSize: 22 }}>Library Subject</h2>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search subject..."
            style={{ height: 40, borderRadius: 10, border: "1px solid #334159", background: "#0f1b2d", color: "#D8E3FB", padding: "0 10px" }}
          />

          <div style={{ overflowY: "auto", display: "grid", gap: 10, paddingRight: 4 }}>
            {filteredSubjects.length === 0 ? (
              <div style={{ opacity: 0.7, fontSize: 14 }}>No subject found</div>
            ) : (
              filteredSubjects.map((subject) => {
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
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section style={{ background: "#111C2D", borderRadius: 16, padding: 16, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", display: "flex", flexDirection: "column", gap: 12 }}>
          {!selectedSubject ? (
            <div style={{ opacity: 0.6 }}>Please select a subject from the left panel.</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ margin: 0, fontSize: 22 }}>Available: {selectedSubject.name}</h2>
                <span style={{ fontSize: 12, opacity: 0.7 }}>{selectedChapters.length} Chapters Found</span>
              </div>

              <div style={{ display: "grid", gap: 10, overflowY: "auto", paddingRight: 4 }}>
                {selectedChapters.length === 0 ? (
                  <div style={{ opacity: 0.65 }}>
                    {chapterLoadError ? `Load chapter failed: ${chapterLoadError}` : "No chapter in this subject yet"}
                  </div>
                ) : (
                  selectedChapters.map((chapter) => (
                    <div key={chapter.id} style={{ background: "#0f1b2d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{chapter.chapterName}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Chapter ID: {chapter.id}</div>
                        <div style={{ marginTop: 8 }}>
                          {loadingMasteryByChapter[chapter.id] ? (
                            <div style={{ fontSize: 12, opacity: 0.75 }}>Loading mastery...</div>
                          ) : masteryByChapter[chapter.id] ? (
                            <>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 12, opacity: 0.88 }}>
                                  Mastery: {masteryByChapter[chapter.id].mastery_percent}% ({masteryByChapter[chapter.id].mastery_level})
                                </span>
                                <span style={{ fontSize: 11, color: "#9AA6BF" }}>
                                  Attempts: {masteryByChapter[chapter.id].attempt_count}
                                </span>
                              </div>
                              <div style={{ height: 6, borderRadius: 999, background: "#111C2D", overflow: "hidden" }}>
                                <div
                                  style={{
                                    height: "100%",
                                    width: `${masteryByChapter[chapter.id].mastery_percent}%`,
                                    background: masteryColor(masteryByChapter[chapter.id].mastery_level),
                                  }}
                                />
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 12, opacity: 0.75 }}>Mastery: No data yet</div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/chapter/${chapter.id}/exam`)}
                        style={{ height: 36, border: "none", borderRadius: 8, padding: "0 12px", background: "#FB5C0C", color: "white", fontWeight: 700, cursor: "pointer" }}
                      >
                        Start Quiz
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
