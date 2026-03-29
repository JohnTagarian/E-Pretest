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
    if (level === "Proficient") return "#66B3FF";
    if (level === "Competent") return "#FB8C3C";
    if (level === "Developing") return "#8E7B3A";
    return "#7B879C";
  };

  const titleCase = (value) => {
    return String(value || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");
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
  const selectedChapters = useMemo(() => {
    const rows = chaptersBySubject[selectedSubjectId] || [];
    return [...rows].sort((a, b) => String(a.chapterName || "").localeCompare(String(b.chapterName || ""), undefined, { sensitivity: "base" }));
  }, [chaptersBySubject, selectedSubjectId]);

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
    <div style={{ minHeight: "100vh", background: "#0A192F", color: "#D8E3FB", fontFamily: "Inter, sans-serif", position: "relative" }}>
      <style>{`
        .sub-shell::before{
          content:"";
          position:fixed;
          inset:0;
          pointer-events:none;
          background:
            radial-gradient(circle at 18% 14%, rgba(251,92,12,.09), transparent 34%),
            radial-gradient(circle at 78% 70%, rgba(102,179,255,.08), transparent 36%),
            linear-gradient(120deg, rgba(255,255,255,.03) 0%, transparent 45%);
        }
        .sub-card{transition:all .2s ease}
        .sub-btn{transition:all .18s ease}
        .sub-sidebar{
          background:linear-gradient(180deg,#101f36 0%,#0e1c31 100%);
          box-shadow:0 18px 36px rgba(0,0,0,.25);
        }
        .sub-search{
          background:#0f2139;
          border:1px solid rgba(216,227,251,.16);
        }
        .sub-search input{
          appearance:none;
          -webkit-appearance:none;
          border:none !important;
          outline:none !important;
          box-shadow:none !important;
          background:transparent !important;
        }
        .sub-search input:focus{
          border:none !important;
          outline:none !important;
          box-shadow:none !important;
        }
        .sub-search:focus-within{
          border-color:#FB5C0C;
          box-shadow:0 0 0 3px rgba(251,92,12,.15);
        }
        .sub-item{
          background:linear-gradient(180deg,#13243d 0%,#102039 100%);
          border:1px solid rgba(255,255,255,.08);
        }
        .sub-item:hover{
          transform:translateY(-1px);
          border-color:rgba(255,255,255,.2);
          background:linear-gradient(180deg,#18304d 0%,#152a46 100%);
        }
        .sub-item.active{
          border-left:4px solid #FB5C0C;
          box-shadow:0 0 0 1px rgba(251,92,12,.35),0 12px 28px rgba(0,0,0,.22);
        }
        .sub-main{
          background:linear-gradient(180deg,#101f36 0%,#0e1c31 100%);
          box-shadow:0 18px 36px rgba(0,0,0,.25);
        }
        .chapter-card{
          background:linear-gradient(180deg,#12233b 0%,#102036 100%);
          border:1px solid rgba(255,255,255,.08);
          box-shadow:0 10px 24px rgba(0,0,0,.2);
        }
        .chapter-card:hover{
          border-color:rgba(255,255,255,.18);
          transform:translateY(-1px);
        }
        .start-btn{
          background:#FB5C0C;
          box-shadow:0 10px 22px rgba(251,92,12,.3);
        }
        .start-btn:hover{
          background:#ff6f2c;
          transform:translateY(-1px);
        }
        .logout-btn{
          border:1px solid rgba(216,227,251,.24);
          background:#13243d;
        }
        .logout-btn:hover{
          border-color:#FB5C0C;
          color:#FB5C0C;
        }
      `}</style>
      <div className="sub-shell" />
      <header style={{ height: 66, background: "rgba(13, 28, 46, 0.9)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontWeight: 900, color: "rgb(251, 92, 12)", letterSpacing: -0.5, fontSize: 20 }}>E-Pretest</div>
          <span style={{ opacity: 0.4, fontSize: 14 }}>/</span>
          <span style={{ opacity: 0.85, fontSize: 14, fontWeight: 500, color: "#D8E3FB" }}>Subjects</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, rgb(42, 64, 95), rgb(31, 51, 79))", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, color: "#ffffff", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "inset 0 2px 4px rgba(255,255,255,0.1)" }}>
            {String(profile?.full_name || "U").trim().charAt(0).toUpperCase()}
          </div>
          <div style={{ display: "grid", gap: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#D8E3FB", lineHeight: 1.2 }}>{loading ? "Loading..." : titleCase(profile?.full_name || "Unknown User")}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "rgb(251, 92, 12)", textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.9 }}>
              {titleCase(profile?.role || "student")}
            </span>
          </div>
          <div style={{ width: 1, height: 24, background: "rgba(255, 255, 255, 0.1)" }} />
          <button type="button" onClick={handleLogout} className="sub-btn" style={{ borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#ff8b8b", background: "transparent", border: "1px solid rgba(255, 139, 139, 0.2)", fontSize: 13 }}>
            Logout
          </button>
        </div>
      </header>

      <main
        style={{
          maxWidth: 1600,
          margin: "0 auto",
          padding: 22,
          display: "grid",
          gap: 18,
          gridTemplateColumns: typeof window !== "undefined" && window.innerWidth < 980 ? "1fr" : "minmax(320px, 420px) 1fr",
          minHeight: "calc(100vh - 68px)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <section className="sub-sidebar" style={{ borderRadius: 20, padding: 16, border: "1px solid rgba(255,255,255,.08)", overflow: "hidden", display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ margin: "2px 0 6px", fontSize: 22 }}>Library Subject</h2>
          <div className="sub-search" style={{ height: 42, borderRadius: 12, display: "flex", alignItems: "center", gap: 8, padding: "0 10px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search your subject..."
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#D8E3FB", fontSize: 14 }}
            />
          </div>

          <div style={{ overflowY: "auto", display: "grid", gap: 10, paddingRight: 4, maskImage: "linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)" }}>
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
                    className={`sub-card sub-item ${active ? "active" : ""}`}
                    style={{
                      textAlign: "left",
                      borderLeft: active ? "4px solid #FB5C0C" : "4px solid transparent",
                      borderRadius: 14,
                      color: active ? "#ffffff" : "#D8E3FB",
                      padding: "12px 12px 12px 14px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{subject.name}</div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{subject.subjectId}</div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="sub-main" style={{ borderRadius: 20, padding: 16, border: "1px solid rgba(255,255,255,.08)", overflow: "hidden", display: "flex", flexDirection: "column", gap: 12 }}>
          {!selectedSubject ? (
            <div style={{ opacity: 0.6 }}>Please select a subject from the left panel.</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 24 }}>Available Chapters for {selectedSubject.name}</h2>
                <span style={{ fontSize: 12, opacity: 0.8, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {selectedChapters.length} Chapters Found
                </span>
              </div>

              <div style={{ display: "grid", gap: 12, overflowY: "auto", paddingRight: 4 }}>
                {selectedChapters.length === 0 ? (
                  <div style={{ opacity: 0.65 }}>
                    {chapterLoadError ? `Load chapter failed: ${chapterLoadError}` : "No chapter in this subject yet"}
                  </div>
                ) : (
                  selectedChapters.map((chapter) => {
                    const mastery = masteryByChapter[chapter.id];
                    const percent = mastery?.mastery_percent ?? 0;
                    const level = mastery?.mastery_level || "Novice";
                    const color = masteryColor(level);
                    const attempts = mastery?.attempt_count ?? 0;
                    return (
                      <div key={chapter.id} className="sub-card chapter-card" style={{ borderRadius: 14, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 16 }}>{chapter.chapterName}</div>
                          <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>Chapter ID: {chapter.id}</div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div
                            style={{
                              width: 58,
                              height: 58,
                              borderRadius: "50%",
                              background: `conic-gradient(${color} ${Math.max(0, Math.min(100, percent))}%, rgba(255,255,255,.12) 0)`,
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#12243d", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800 }}>
                              {loadingMasteryByChapter[chapter.id] ? "..." : `${percent}%`}
                            </div>
                          </div>

                          <div style={{ minWidth: 165 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color }}>{level}</div>
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.78, display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
                                <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                              Attempts: {attempts}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => navigate(`/chapter/${chapter.id}/exam`)}
                            className="sub-btn start-btn"
                            style={{ height: 38, border: "none", borderRadius: 10, padding: "0 14px", color: "white", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}
                          >
                            Start Quiz
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
