import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../lib_api";
import { clearAccessToken, getAccessToken } from "../lib_auth";

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
  const [generating, setGenerating] = useState(false);

  const chapterIdNum = Number(chapterId);

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

        // Mock exam sets (backend-ready structure)
        setExamSets([
          {
            id: `set_${chapterId}_1`,
            title: "Adaptive Set A",
            questionCount: 10,
            status: "ready",
            generatedAt: new Date().toISOString(),
          },
          {
            id: `set_${chapterId}_2`,
            title: "Adaptive Set B",
            questionCount: 15,
            status: "ready",
            generatedAt: new Date().toISOString(),
          },
        ]);
      } catch (error) {
        setTocLoading(false);
        setTocError("Failed to load chapter data");
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [chapterIdNum, navigate]);

  const headerTitle = useMemo(() => {
    if (!subject) return "Subject Detail";
    return `${subject.name}`;
  }, [subject]);

  const handleGenerateExam = async () => {
    setGenerating(true);

    // TODO (backend-ready): call /core/chapters/{chapter_id}/generate-mcq
    await new Promise((resolve) => setTimeout(resolve, 700));

    setExamSets((prev) => [
      {
        id: `set_${chapterId}_${Date.now()}`,
        title: `Generated Set ${prev.length + 1}`,
        questionCount: 10,
        status: "ready",
        generatedAt: new Date().toISOString(),
      },
      ...prev,
    ]);

    setGenerating(false);
  };

  const handleStartSet = (setId) => {
    // TODO (backend-ready): navigate to real quiz attempt page with setId
    window.alert(`Start quiz set: ${setId}`);
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
              height: 52,
              background: generating ? "#7f8da8" : "#FB5C0C",
              color: "white",
              fontWeight: 800,
              cursor: generating ? "not-allowed" : "pointer",
            }}
          >
            {generating ? "Generating..." : "Generate Exam"}
          </button>

          <div style={{ background: "#111C2D", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", padding: 14, minHeight: 360 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Exam Sets</h3>
              <span style={{ fontSize: 12, opacity: 0.65 }}>{examSets.length} Sets</span>
            </div>

            {examSets.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No generated exam set yet</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {examSets.map((set) => (
                  <div key={set.id} style={{ background: "#0f1b2d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
                    <div style={{ fontWeight: 700 }}>{set.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{set.questionCount} Questions</div>
                    <button
                      type="button"
                      onClick={() => handleStartSet(set.id)}
                      style={{ height: 34, border: "none", borderRadius: 8, background: "#2A3548", color: "#D8E3FB", fontWeight: 700, cursor: "pointer" }}
                    >
                      Start Set
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
