import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../lib_api";
import { clearAccessToken, getAccessToken } from "../lib_auth";

const ATTEMPTED_SET_STORAGE_KEY = "epretest_attempted_sets_v1";

function getAttemptedSetMap() {
  try {
    const raw = localStorage.getItem(ATTEMPTED_SET_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function markSetAsStarted(setId) {
  const current = getAttemptedSetMap();
  current[String(setId)] = true;
  localStorage.setItem(ATTEMPTED_SET_STORAGE_KEY, JSON.stringify(current));
}

function isSetNew(setId) {
  const current = getAttemptedSetMap();
  return !current[String(setId)];
}

export default function ChapterExamEntryPage() {
  const { chapterId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [subject, setSubject] = useState(null);
  const [chapter, setChapter] = useState(null);

  const [tocItems, setTocItems] = useState([]);
  const [tocLoading, setTocLoading] = useState(false);
  const [tocError, setTocError] = useState("");
  const [examSets, setExamSets] = useState([]);
  const [examLoading, setExamLoading] = useState(false);
  const [examError, setExamError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [popup, setPopup] = useState({ show: false, type: "success", title: "", message: "" });
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [selectedSet, setSelectedSet] = useState(null);
  const [durationMode, setDurationMode] = useState("5");
  const [customDuration, setCustomDuration] = useState("");
  const [durationError, setDurationError] = useState("");

  const chapterIdNum = Number(chapterId);

  const loadExamSets = async (token) => {
    setExamLoading(true);
    setExamError("");
    const listRes = await apiRequest(`/core/exam/sets/${chapterIdNum}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) {
      setExamSets([]);
      const errPayload = await listRes.json().catch(() => ({}));
      setExamError(errPayload.detail || "Failed to load exam sets");
      setExamLoading(false);
      return;
    }

    const payload = await listRes.json();
    const mapped = Array.isArray(payload)
      ? payload.map((row) => ({
          id: row.quiz_set_id,
          title: row.title,
          questionCount: row.question_count,
          status: row.status,
          generatedAt: row.created_at,
        }))
      : [];
    setExamSets(mapped);
    setExamLoading(false);
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
        setProfile(await me.json());

        const subjRes = await apiRequest("/admin/subjects", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!subjRes.ok) {
          setLoading(false);
          return;
        }

        const subjects = await subjRes.json();
        let foundSubject = null;
        let foundChapter = null;

        for (const s of subjects) {
          const chaptersRes = await apiRequest(`/admin/subjects/${encodeURIComponent(s.subject_id)}/chapters`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!chaptersRes.ok) continue;

          const chapters = await chaptersRes.json();
          const hit = chapters.find((c) => Number(c.chapter_id) === chapterIdNum);
          if (hit) {
            foundSubject = s;
            foundChapter = hit;
            break;
          }
        }

        setSubject(foundSubject);
        setChapter(foundChapter);

        // Load TOC from backend first.
        setTocLoading(true);
        setTocError("");
        const tocRes = await apiRequest(`/core/chapters/${chapterIdNum}/toc`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (tocRes.ok) {
          const tocPayload = await tocRes.json();
          setTocItems(Array.isArray(tocPayload.toc) ? tocPayload.toc : []);
        } else {
          // Keep fallback mock for demo while MCQ backend is still in progress.
          setTocItems([
            foundChapter?.chapter_name || "Chapter Overview",
            "Key Concepts",
            "Important Examples",
            "Practice Focus",
          ]);
          const errPayload = await tocRes.json().catch(() => ({}));
          setTocError(errPayload.detail || "TOC not ready yet, showing mock topics");
        }
        setTocLoading(false);

        await loadExamSets(token);
      } catch (error) {
        setTocLoading(false);
        setTocError("Failed to load chapter data");
        setExamLoading(false);
        setExamError("Failed to load exam sets");
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [chapterIdNum, navigate]);

  useEffect(() => {
    if (!generating) {
      setGeneratingProgress(0);
      return;
    }
    const timer = setInterval(() => {
      setGeneratingProgress((prev) => {
        if (prev >= 95) return 95;
        const next = prev + Math.max(2, Math.floor((100 - prev) / 8));
        return Math.min(next, 95);
      });
    }, 350);
    return () => clearInterval(timer);
  }, [generating]);

  const headerTitle = useMemo(() => {
    if (!subject) return "Subject Detail";
    return `${subject.name}`;
  }, [subject]);

  const handleGenerateExam = async () => {
    const token = getAccessToken();
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    setGenerating(true);
    setExamError("");
    const genRes = await apiRequest(`/core/exam/generate/${chapterIdNum}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!genRes.ok) {
      const errPayload = await genRes.json().catch(() => ({}));
      setExamError(errPayload.detail || "Generate exam failed");
      setPopup({
        show: true,
        type: "error",
        title: "Generate Failed",
        message: errPayload.detail || "Generate exam failed",
      });
      setGenerating(false);
      return;
    }
    await loadExamSets(token);
    setGeneratingProgress(100);
    setPopup({
      show: true,
      type: "success",
      title: "Generate Completed",
      message: "A new exam set has been generated successfully.",
    });
    setGenerating(false);
  };

  const openStartModal = (setItem) => {
    setSelectedSet(setItem);
    setDurationMode("5");
    setCustomDuration("");
    setDurationError("");
    setStartModalOpen(true);
  };

  const handleConfirmStart = () => {
    if (!selectedSet) return;

    let minutes = Number(durationMode);
    if (durationMode === "custom") {
      minutes = Number(customDuration);
    }

    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 180) {
      setDurationError("Please enter a valid duration between 1 and 180 minutes");
      return;
    }

    markSetAsStarted(selectedSet.id);
    setStartModalOpen(false);
    navigate(`/quiz/${selectedSet.id}`, {
      state: {
        quizSet: selectedSet,
        durationMinutes: Math.floor(minutes),
        subjectName: subject?.name || "",
        subjectCode: subject?.subject_id || "",
        chapterName: chapter?.chapter_name || "",
      },
    });
  };

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

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#081425", color: "#D8E3FB" }}>
        Loading...
      </main>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#081425", color: "#D8E3FB", fontFamily: "Inter, sans-serif" }}>
      <header style={{ height: 64, background: "#111C2D", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 800, color: "#FB5C0C", letterSpacing: -0.5 }}>E-Pretest</div>
          <span style={{ opacity: 0.7 }}>Subject Detail</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, opacity: 0.85 }}>{profile ? `${profile.full_name} (${profile.role})` : "-"}</span>
          <button type="button" onClick={() => navigate("/subjects", { replace: true })} style={{ border: "none", borderRadius: 8, padding: "8px 10px", background: "#2A3548", color: "#D8E3FB", cursor: "pointer" }}>
            Back
          </button>
          <button type="button" onClick={handleLogout} style={{ border: "none", borderRadius: 8, padding: "8px 10px", background: "#2A3548", color: "#D8E3FB", cursor: "pointer" }}>
            Logout
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1440, margin: "0 auto", padding: 24, display: "grid", gridTemplateColumns: typeof window !== "undefined" && window.innerWidth < 980 ? "1fr" : "2fr 1fr", gap: 20 }}>
        <section style={{ display: "grid", gap: 16 }}>
          <div style={{ background: "#111C2D", borderRadius: 14, padding: 20, border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#FB5C0C" }}>Subject Identifier</div>
            <h1 style={{ margin: "6px 0 0", fontSize: 34 }}>{headerTitle}</h1>
            <div style={{ opacity: 0.7, marginTop: 4 }}>{subject?.subject_id || "Unknown Subject ID"}</div>
            <div style={{ marginTop: 10, opacity: 0.75 }}>Selected Chapter: {chapter?.chapter_name || `Chapter ${chapterId}`}</div>
          </div>

          <div style={{ background: "#111C2D", borderRadius: 14, padding: 20, border: "1px solid rgba(255,255,255,0.08)", minHeight: 420 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Table Of Contents</h2>
              <span style={{ fontSize: 12, opacity: 0.65 }}>{tocItems.length} Topics</span>
            </div>

            {tocLoading ? (
              <div style={{ opacity: 0.75 }}>Loading TOC...</div>
            ) : tocItems.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No TOC found yet</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {tocItems.map((topic, idx) => (
                  <button key={`${topic}_${idx}`} type="button" style={{ textAlign: "left", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, background: "#0f1b2d", color: "#D8E3FB", padding: "12px 14px", cursor: "default" }}>
                    <span style={{ color: "#FB5C0C", marginRight: 8 }}>{String(idx + 1).padStart(2, "0")}</span>
                    {topic}
                  </button>
                ))}
              </div>
            )}
            {tocError ? (
              <div style={{ marginTop: 10, fontSize: 12, color: "#ffb4ab" }}>{tocError}</div>
            ) : null}
          </div>
        </section>

        <aside style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <button
            type="button"
            onClick={handleGenerateExam}
            disabled={generating}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 12,
              height: 56,
              background: generating ? "#7f8da8" : "#FB5C0C",
              color: "white",
              fontWeight: 800,
              cursor: generating ? "not-allowed" : "pointer",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {generating ? `Generating... ${generatingProgress}%` : "Generate Exam"}
            {generating ? (
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: 0,
                  height: 4,
                  width: `${generatingProgress}%`,
                  background: "rgba(255,255,255,0.95)",
                  transition: "width 220ms ease",
                }}
              />
            ) : null}
          </button>

          <div style={{ background: "#111C2D", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", padding: 14, minHeight: 360 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Exam Sets</h3>
              <span style={{ fontSize: 12, opacity: 0.65 }}>{examSets.length} Sets</span>
            </div>

            {examSets.length === 0 ? (
              <div style={{ opacity: 0.7 }}>{examLoading ? "Loading exam sets..." : "No generated exam set yet"}</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {examSets.map((set) => {
                  const newSet = isSetNew(set.id);
                  return (
                  <div key={set.id} style={{ background: "#0f1b2d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
                    <div style={{ fontWeight: 700 }}>{set.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{set.questionCount} Questions</div>
                    <div style={{ fontSize: 11, opacity: 0.65 }}>{newSet ? "New exam set" : "Started before"}</div>
                    <button
                      type="button"
                      onClick={() => openStartModal(set)}
                      style={{
                        height: 36,
                        border: "none",
                        borderRadius: 8,
                        background: newSet ? "#2F8F58" : "#2A3548",
                        color: "#D8E3FB",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Start Set
                    </button>
                  </div>
                )})}
              </div>
            )}
            {examError ? <div style={{ marginTop: 10, fontSize: 12, color: "#ffb4ab" }}>{examError}</div> : null}
          </div>
        </aside>
      </main>

      {popup.show ? (
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
            zIndex: 30,
          }}
          onClick={() => setPopup((prev) => ({ ...prev, show: false }))}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 14,
              background: "#111C2D",
              border: `1px solid ${popup.type === "success" ? "#2f8f58" : "#a94442"}`,
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
              padding: 18,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: popup.type === "success" ? "#7BE495" : "#FFB4AB" }}>
              {popup.title}
            </div>
            <div style={{ fontSize: 14, opacity: 0.9 }}>{popup.message}</div>
            <button
              type="button"
              onClick={() => setPopup((prev) => ({ ...prev, show: false }))}
              style={{
                justifySelf: "end",
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                background: popup.type === "success" ? "#2f8f58" : "#a94442",
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

      {startModalOpen && selectedSet ? (
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
            zIndex: 35,
          }}
          onClick={() => setStartModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 14,
              background: "#111C2D",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
              padding: 18,
              display: "grid",
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 20 }}>Start Exam Confirmation</h3>
            <div style={{ fontSize: 14, opacity: 0.88 }}>
              <div><strong>Set:</strong> {selectedSet.title}</div>
              <div><strong>Questions:</strong> {selectedSet.questionCount}</div>
              <div><strong>Chapter:</strong> {chapter?.chapter_name || "-"}</div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Select duration</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["3", "5", "10"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setDurationMode(m);
                      setDurationError("");
                    }}
                    style={{
                      height: 36,
                      borderRadius: 8,
                      border: durationMode === m ? "1px solid #FB5C0C" : "1px solid #334159",
                      background: durationMode === m ? "#1F2A3C" : "#0f1b2d",
                      color: "#D8E3FB",
                      padding: "0 12px",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {m} min
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setDurationMode("custom");
                    setDurationError("");
                  }}
                  style={{
                    height: 36,
                    borderRadius: 8,
                    border: durationMode === "custom" ? "1px solid #FB5C0C" : "1px solid #334159",
                    background: durationMode === "custom" ? "#1F2A3C" : "#0f1b2d",
                    color: "#D8E3FB",
                    padding: "0 12px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Custom
                </button>
              </div>
              {durationMode === "custom" ? (
                <input
                  type="number"
                  min="1"
                  max="180"
                  step="1"
                  value={customDuration}
                  onChange={(e) => {
                    setCustomDuration(e.target.value);
                    setDurationError("");
                  }}
                  placeholder="Enter minutes (1-180)"
                  style={{
                    height: 38,
                    borderRadius: 8,
                    border: "1px solid #334159",
                    background: "#0f1b2d",
                    color: "#D8E3FB",
                    padding: "0 10px",
                  }}
                />
              ) : null}
              {durationError ? <div style={{ color: "#ffb4ab", fontSize: 12 }}>{durationError}</div> : null}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setStartModalOpen(false)}
                style={{
                  height: 38,
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
                onClick={handleConfirmStart}
                style={{
                  height: 38,
                  borderRadius: 8,
                  border: "none",
                  background: "#2F8F58",
                  color: "white",
                  fontWeight: 700,
                  padding: "0 12px",
                  cursor: "pointer",
                }}
              >
                Start
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
