import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../lib_api";
import { clearAccessToken, getAccessToken } from "../lib_auth";
import LogoutConfirmDialog from "../components/LogoutConfirmDialog";

const ATTEMPTED_SET_STORAGE_KEY = "epretest_attempted_sets_v1";
const ATTEMPT_SUMMARY_STORAGE_KEY = "epretest_attempt_summary_v1";

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

function getAttemptSummaryMap() {
  try {
    const raw = localStorage.getItem(ATTEMPT_SUMMARY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function masteryLevelFromPercent(percent) {
  if (percent <= 19) return "Novice / ผู้เริ่มต้น";
  if (percent <= 39) return "Developing / กำลังพัฒนา";
  if (percent <= 59) return "Competent / เข้าใจพื้นฐาน";
  if (percent <= 79) return "Proficient / ชำนาญ";
  return "Mastered / เชี่ยวชาญ";
}

function masteryColor(level) {
  if (level === "Mastered") return "#2F8F58";
  if (level === "Proficient") return "#4AA96C";
  if (level === "Competent") return "#FB8C3C";
  if (level === "Developing") return "#D4A017";
  return "#7B879C";
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
  const [attemptSummaryMap, setAttemptSummaryMap] = useState({});
  const [masteryData, setMasteryData] = useState(null);
  const [masteryLoading, setMasteryLoading] = useState(false);
  const [masteryError, setMasteryError] = useState("");
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

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

  const loadMastery = async (token) => {
    setMasteryLoading(true);
    setMasteryError("");
    try {
      const response = await apiRequest(`/core/mastery/chapter/${chapterIdNum}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        setMasteryData(null);
        setMasteryError(errPayload.detail || "Failed to load mastery");
        return;
      }
      const payload = await response.json();
      setMasteryData(payload);
    } catch {
      setMasteryData(null);
      setMasteryError("Network error while loading mastery");
    } finally {
      setMasteryLoading(false);
    }
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
        await loadMastery(token);
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
    setAttemptSummaryMap(getAttemptSummaryMap());
  }, []);

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

  const hasPendingSet = useMemo(
    () => examSets.some((set) => !attemptSummaryMap[String(set.id)]),
    [examSets, attemptSummaryMap]
  );

  const masteryPercent = typeof masteryData?.mastery_percent === "number" ? masteryData.mastery_percent : 0;
  const masteryLevel = masteryData?.mastery_level || masteryLevelFromPercent(masteryPercent);

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
    const finished = attemptSummaryMap[String(setItem.id)];
    if (finished) {
      navigate("/summarize_test", {
        state: {
          attemptId: finished.attemptId,
          quizSetId: setItem.id,
          chapterId: chapterIdNum,
          subjectName: subject?.name || "",
          chapterName: chapter?.chapter_name || "",
        },
      });
      return;
    }

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
        chapterId: chapterIdNum,
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
    <div style={{ minHeight: "100vh", background: "#0A192F", color: "#D8E3FB", fontFamily: "Plus Jakarta Sans, Manrope, Prompt, sans-serif", position: "relative" }}>
      <style>{`
        @keyframes ept-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .entry-shell::before{
          content:"";
          position:fixed;
          inset:0;
          pointer-events:none;
          background:
            radial-gradient(circle at 16% 18%, rgba(251,92,12,.08), transparent 34%),
            radial-gradient(circle at 74% 68%, rgba(116,178,255,.08), transparent 36%),
            linear-gradient(120deg, rgba(255,255,255,.025), transparent 50%);
        }
        .entry-soft{
          background:linear-gradient(180deg,#10223a 0%, #0f1e34 100%);
          border:1px solid rgba(255,255,255,.08);
          box-shadow:0 14px 28px rgba(0,0,0,.24);
          border-radius:14px;
        }
        .entry-btn{transition:all .18s ease}
        .entry-ghost{
          background:transparent;
          border:1px solid rgba(216,227,251,.2);
          color:#d8e3fb;
        }
        .entry-ghost:hover{
          border-color:#FB5C0C;
          color:#FB5C0C;
        }
        .entry-generate{
          background:linear-gradient(135deg,#FF7A00 0%, #FB5C0C 100%);
          box-shadow:0 14px 30px rgba(251,92,12,.35);
        }
        .entry-generate:hover{filter:brightness(1.05); transform:translateY(-1px)}
        .entry-toc-scroll{scrollbar-width:thin; scrollbar-color:#2A3E5D #102038;}
        .entry-toc-scroll::-webkit-scrollbar{width:7px}
        .entry-toc-scroll::-webkit-scrollbar-thumb{background:#2A3E5D;border-radius:999px}
        .entry-toc-row{
          transition:all .15s ease;
          background:rgba(16,31,52,.8);
          border:1px solid rgba(255,255,255,.08);
        }
        .entry-toc-row:hover{background:rgba(23,41,67,.9); border-color:rgba(255,255,255,.18)}
        .entry-set-card{
          background:linear-gradient(180deg,#12243d 0%, #102037 100%);
          border:1px solid rgba(255,255,255,.08);
          transition:all .18s ease;
        }
        .entry-set-card:hover{border-color:rgba(255,255,255,.16); transform:translateY(-1px)}
        .entry-pill{
          border-radius:999px;
          padding:3px 10px;
          font-size:11px;
          font-weight:800;
          letter-spacing:.3px;
        }
        .entry-exam-list{scrollbar-width:thin; scrollbar-color:#2A3E5D #102038;}
        .entry-exam-list::-webkit-scrollbar{width:7px}
        .entry-exam-list::-webkit-scrollbar-thumb{background:#2A3E5D;border-radius:999px}
        .entry-exam-item{
          background:rgba(255,255,255,.03);
          border:1px solid rgba(255,255,255,.06);
          border-radius:12px;
          transition:all .2s ease;
        }
        .entry-exam-item:hover{
          background:rgba(255,255,255,.06);
          border-color:rgba(255,255,255,.12);
          transform:translateY(-1px);
        }
        .entry-summary-btn{
          height:28px;
          border:1px solid rgba(216,227,251,.2);
          border-radius:6px;
          background:transparent;
          color:#D8E3FB;
          font-size:12px;
          font-weight:600;
          padding:0 12px;
          cursor:pointer;
          transition:all .2s ease;
        }
        .entry-summary-btn:hover{background:#2A3548}
      `}</style>
      <div className="entry-shell" />
      <header style={{ height: 66, background: "rgba(13, 28, 46, 0.9)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            type="button"
            className="entry-btn entry-ghost"
            onClick={() => navigate("/subjects", { replace: true })}
            style={{
              borderRadius: 8,
              padding: "6px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "#a3b1cc",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <span style={{ fontSize: 10 }}>◀</span> Back
          </button>

          <div style={{ width: 1, height: 20, background: "rgba(255, 255, 255, 0.1)" }} />
          <div style={{ fontWeight: 900, color: "rgb(251, 92, 12)", letterSpacing: -0.5, fontSize: 20 }}>E-Pretest</div>
          <span style={{ opacity: 0.4, fontSize: 14 }}>/</span>
          <span style={{ opacity: 0.85, fontSize: 14, fontWeight: 500, color: "#D8E3FB" }}>Subject Detail</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, rgb(42, 64, 95), rgb(31, 51, 79))", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, color: "#ffffff", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "inset 0 2px 4px rgba(255,255,255,0.1)" }}>
            {String(profile?.full_name || "U").trim().charAt(0).toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#D8E3FB", lineHeight: 1.2 }}>{profile?.full_name || "Unknown User"}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgb(251, 92, 12)", textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.9 }}>
                {profile?.role || "Student"}
              </span>
            </div>
          </div>

          <div style={{ width: 1, height: 24, background: "rgba(255, 255, 255, 0.1)" }} />
          <button
            type="button"
            onClick={() => setShowLogoutDialog(true)}
            className="entry-btn entry-ghost"
            style={{
              borderRadius: 8,
              padding: "6px 12px",
              cursor: "pointer",
              color: "#ff8b8b",
              background: "transparent",
              border: "1px solid rgba(255, 139, 139, 0.2)",
              fontSize: 13,
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1460, margin: "0 auto", padding: 22, display: "grid", gridTemplateColumns: typeof window !== "undefined" && window.innerWidth < 980 ? "1fr" : "2fr 1fr", gap: 18, position: "relative", zIndex: 1 }}>
        <section style={{ display: "grid", gap: 14 }}>
          <div className="entry-soft" style={{ padding: 20, borderLeft: "3px solid #FB5C0C" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.3, color: "#9FB0CB" }}>Subject Identifier</div>
            <h1 style={{ margin: "8px 0 0", fontSize: 34, fontWeight: 900 }}>{headerTitle}</h1>
            <div style={{ opacity: 0.7, marginTop: 4, fontSize: 13 }}>{subject?.subject_id || "Unknown Subject ID"}</div>
            <div style={{ marginTop: 10, opacity: 0.75 }}>Selected Chapter: {chapter?.chapter_name || `Chapter ${chapterId}`}</div>
          </div>

          <div className="entry-soft" style={{ padding: 18, minHeight: 420, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Table Of Contents</h2>
              <span style={{ fontSize: 12, opacity: 0.65 }}>{tocItems.length} Topics</span>
            </div>

            {tocLoading ? (
              <div style={{ opacity: 0.75 }}>Loading TOC...</div>
            ) : tocItems.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No TOC found yet</div>
            ) : (
              <div
                className="entry-toc-scroll"
                style={{
                  display: "grid",
                  gap: 8,
                  maxHeight: 360,
                  overflowY: "auto",
                  paddingRight: 4,
                }}
              >
                {tocItems.map((topic, idx) => (
                  <button key={`${topic}_${idx}`} type="button" className="entry-toc-row" style={{ textAlign: "left", borderRadius: 10, color: "#D8E3FB", padding: "11px 12px", cursor: "default", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(251,92,12,.14)", color: "#FB5C0C", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 11 }}>{String(idx + 1).padStart(2, "0")}</span>
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

        <aside style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <button
            type="button"
            onClick={handleGenerateExam}
            disabled={generating || hasPendingSet}
            className="entry-btn entry-generate"
            style={{
              width: "100%",
              border: "none",
              borderRadius: 14,
              height: 58,
              background: generating || hasPendingSet ? "#7f8da8" : undefined,
              color: "white",
              fontWeight: 800,
              cursor: generating || hasPendingSet ? "not-allowed" : "pointer",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {generating ? (
              <>
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
                {`Generating... ${generatingProgress}%`}
              </>
            ) : hasPendingSet ? (
              "Finish existing exam set before generating new one"
            ) : (
              <>
                <span style={{ fontSize: 15 }}>⚡</span>
                Generate Exam
              </>
            )}
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

          <div className="entry-soft" style={{ padding: 20, minHeight: 360, background: "#111C2D", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Exam Sets</h3>
              <span style={{ fontSize: 12, color: "#a3b1cc", fontWeight: 500 }}>{examSets.length} Sets</span>
            </div>

            {examSets.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", border: "2px dashed rgba(255,255,255,0.1)", borderRadius: 12, padding: "30px 20px", background: "rgba(255,255,255,0.02)" }}>
                <div style={{ fontSize: 42, marginBottom: 16, opacity: 0.8, filter: "grayscale(0.5)" }}>📝</div>
                <h4 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 700, color: "#D8E3FB" }}>
                  {examLoading ? "Loading Exam Sets..." : "No Exam Sets Yet"}
                </h4>
                <p style={{ margin: 0, fontSize: 13, color: "#a3b1cc", lineHeight: 1.6, maxWidth: 260 }}>
                  คุณยังไม่เคยทำข้อสอบในบทเรียนนี้
                  <br />
                  คลิกปุ่ม <strong style={{ color: "#FB5C0C" }}>Generate Exam</strong> เพื่อเริ่มต้นทดสอบความรู้ได้เลย
                </p>
              </div>
            ) : (
              <div className="entry-exam-list" style={{ display: "grid", gap: 12, maxHeight: 320, overflowY: "auto", paddingRight: 6 }}>
                {examSets.map((set) => {
                  const summary = attemptSummaryMap[String(set.id)];
                  const finished = Boolean(summary);
                  const newSet = !finished && isSetNew(set.id);
                  const accuracy = finished ? Number(summary.accuracy || 0) : 0;
                  const pillBg = accuracy >= 60 ? "rgba(47,143,88,.2)" : "rgba(123,135,157,.22)";
                  const pillColor = accuracy >= 60 ? "#85E1A3" : "#C7D0DF";
                  const dateText = String(set.generatedAt || "").slice(0, 10) || "-";
                  return (
                  <div key={set.id} className="entry-exam-item" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "#D8E3FB", marginBottom: 4, lineHeight: 1.35 }}>{set.title}</div>
                        <div style={{ fontSize: 12, color: "#a3b1cc", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span>Set ID: {set.id}</span>
                        </div>
                      </div>
                      <span className="entry-pill" style={{ background: pillBg, color: pillColor, whiteSpace: "nowrap" }}>
                        Acc: {accuracy}%
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12 }}>
                      <div style={{ fontSize: 11, color: "#8a9bbd" }}>
                        {set.questionCount} Questions • {dateText}
                      </div>
                      <button type="button" onClick={() => openStartModal(set)} className={finished ? "entry-summary-btn" : "entry-btn"} style={finished ? undefined : { height: 28, border: "none", borderRadius: 6, background: newSet ? "#2F8F58" : "#2A3548", color: "#D8E3FB", fontSize: 12, fontWeight: 700, padding: "0 12px", cursor: "pointer" }}>
                        {finished ? "View Summary" : "Start Set"}
                      </button>
                    </div>
                  </div>
                )})}
              </div>
            )}
            {examError ? <div style={{ marginTop: 10, fontSize: 12, color: "#ffb4ab" }}>{examError}</div> : null}
          </div>

          <div className="entry-soft" style={{ padding: 14, display: "grid", gap: 10, position: "relative", minHeight: 176 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Mastery Profile</h3>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Chapter Level</span>
            </div>
            {masteryLoading ? (
              <div style={{ fontSize: 13, opacity: 0.75 }}>Loading mastery...</div>
            ) : (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: -2 }}>
                <span style={{ fontSize: 52, lineHeight: 1, fontWeight: 900, color: masteryColor(masteryData?.mastery_level) }}>{masteryPercent}%</span>
                <span
                  style={{
                    fontSize: 13,
                    color: masteryColor(masteryData?.mastery_level),
                    background: `${masteryColor(masteryData?.mastery_level)}22`,
                    border: `1px solid ${masteryColor(masteryData?.mastery_level)}55`,
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontWeight: 800,
                  }}
                >
                  {masteryLevel}
                </span>
              </div>
            )}
            <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden", boxShadow: "inset 0 1px 4px rgba(0,0,0,.35)" }}>
              <div style={{ height: "100%", width: `${masteryPercent}%`, background: `linear-gradient(90deg, ${masteryColor(masteryData?.mastery_level)}bb 0%, ${masteryColor(masteryData?.mastery_level)} 100%)`, boxShadow: `0 0 16px ${masteryColor(masteryData?.mastery_level)}99` }} />
            </div>
            {masteryData ? (
              <div style={{ fontSize: 10, opacity: 0.56, position: "absolute", bottom: 12, right: 14 }}>
                Attempts: {masteryData.attempt_count} | alpha: {masteryData.alpha.toFixed(2)} beta: {masteryData.beta.toFixed(2)}
              </div>
            ) : null}
            {masteryError ? <div style={{ fontSize: 11, color: "#ffb4ab" }}>{masteryError}</div> : null}
          </div>
        </aside>
      </main>
      <LogoutConfirmDialog
        open={showLogoutDialog}
        onCancel={() => setShowLogoutDialog(false)}
        onConfirm={handleLogout}
      />

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
