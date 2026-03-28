import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiRequest } from "../lib_api";
import { clearAccessToken, getAccessToken } from "../lib_auth";

const ATTEMPT_SUMMARY_STORAGE_KEY = "epretest_attempt_summary_v1";

function saveAttemptSummary(summary) {
  try {
    const raw = localStorage.getItem(ATTEMPT_SUMMARY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const next = parsed && typeof parsed === "object" ? parsed : {};
    next[String(summary.quizSetId)] = summary;
    localStorage.setItem(ATTEMPT_SUMMARY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // noop
  }
}

function pct(score, total) {
  if (!total) return 0;
  return Math.round((score / total) * 100);
}

function choiceText(question, choiceNo) {
  if (!choiceNo) return "-";
  return question.choices?.[choiceNo - 1] || `Choice ${choiceNo}`;
}

function explanationText(question, choiceNo) {
  if (!choiceNo) return "-";
  return question.choiceExplanations?.[choiceNo] || "No explanation available";
}

export default function SummarizeTestPlaceholderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const data = location.state || {};
  const attemptId = data.attemptId;

  const [attemptData, setAttemptData] = useState(null);
  const [loadingAttempt, setLoadingAttempt] = useState(Boolean(attemptId));
  const [attemptError, setAttemptError] = useState("");
  const [gapStatus, setGapStatus] = useState("none");
  const [gapMarkdown, setGapMarkdown] = useState("");
  const [gapLoading, setGapLoading] = useState(false);
  const [gapError, setGapError] = useState("");
  const [showGapModal, setShowGapModal] = useState(false);

  useEffect(() => {
    async function loadAttempt() {
      if (!attemptId) return;
      const token = getAccessToken();
      if (!token) {
        clearAccessToken();
        navigate("/login", { replace: true });
        return;
      }

      setLoadingAttempt(true);
      setAttemptError("");
      try {
        const response = await apiRequest(`/core/exam/attempt/${attemptId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401) {
          clearAccessToken();
          navigate("/login", { replace: true });
          return;
        }
        if (!response.ok) {
          const errPayload = await response.json().catch(() => ({}));
          setAttemptError(errPayload.detail || "Failed to load attempt detail");
          setLoadingAttempt(false);
          return;
        }

        const payload = await response.json();
        setAttemptData(payload);
      } catch {
        setAttemptError("Network error while loading attempt detail");
      } finally {
        setLoadingAttempt(false);
      }
    }
    loadAttempt();
  }, [attemptId, navigate]);

  useEffect(() => {
    async function loadGap() {
      if (!attemptId) return;
      const token = getAccessToken();
      if (!token) return;
      try {
        const response = await apiRequest(`/core/analysis/gap/${attemptId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const payload = await response.json();
        setGapStatus(payload.gap_status || "none");
        setGapMarkdown(payload.gap_markdown || "");
      } catch {
        // noop
      }
    }
    loadGap();
  }, [attemptId]);

  const fallbackQuestions = Array.isArray(data.questions) ? data.questions : [];
  const fallbackAnswers = data.answers || {};

  const reviewRows = useMemo(() => {
    if (attemptData?.result?.review_items) {
      return attemptData.result.review_items.map((r) => ({
        id: Number(r.question_id),
        question: r.question,
        selected: r.selected,
        correct: r.correct,
        isCorrect: r.is_correct,
        choices: [r.choice_1, r.choice_2, r.choice_3, r.choice_4],
        choiceExplanations: {
          1: r.choice_1_exp,
          2: r.choice_2_exp,
          3: r.choice_3_exp,
          4: r.choice_4_exp,
        },
      }));
    }

    return fallbackQuestions.map((q) => {
      const selected = fallbackAnswers[String(q.id)] ?? null;
      const correct = q.correctAnswer ?? null;
      const isCorrect = selected != null && correct != null && Number(selected) === Number(correct);
      return {
        ...q,
        selected,
        correct,
        isCorrect,
      };
    });
  }, [attemptData, fallbackQuestions, fallbackAnswers]);

  const total = reviewRows.length;
  const correctCount = reviewRows.filter((r) => r.isCorrect).length;
  const scorePct = pct(correctCount, total);

  useEffect(() => {
    if (!attemptData) return;
    const totalQ = Number(attemptData.total_questions || 0);
    const accuracy = totalQ > 0 ? Math.round((Number(attemptData.score || 0) / totalQ) * 100) : 0;
    saveAttemptSummary({
      attemptId: attemptData.attempt_id,
      quizSetId: attemptData.quiz_set_id,
      score: attemptData.score,
      totalQuestions: totalQ,
      accuracy,
      submittedAt: attemptData.submitted_at || new Date().toISOString(),
    });
  }, [attemptData]);

  const handleGenerateGap = async () => {
    if (!attemptId || gapLoading) return;
    const token = getAccessToken();
    if (!token) {
      clearAccessToken();
      navigate("/login", { replace: true });
      return;
    }

    setGapLoading(true);
    setGapError("");
    try {
      const response = await apiRequest(`/core/analysis/gap/${attemptId}/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        clearAccessToken();
        navigate("/login", { replace: true });
        return;
      }

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        setGapError(errPayload.detail || "Failed to generate GAP");
        return;
      }

      const payload = await response.json();
      setGapStatus(payload.gap_status || "ready");
      setGapMarkdown(payload.gap_markdown || "");
      setShowGapModal(true);
    } catch {
      setGapError("Network error while generating GAP");
    } finally {
      setGapLoading(false);
    }
  };

  const isGapReady = gapStatus === "ready" && Boolean(gapMarkdown);

  return (
    <main style={{ minHeight: "100vh", background: "#081425", color: "#D8E3FB", fontFamily: "Inter, sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 1220, margin: "0 auto", display: "grid", gap: 16 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>Summary</h1>
          <div style={{ display: "flex", gap: 8 }}>
            {attemptId ? (
              <button
                type="button"
                onClick={isGapReady ? () => setShowGapModal(true) : handleGenerateGap}
                disabled={gapLoading}
                style={{
                  height: 36,
                  borderRadius: 8,
                  border: "none",
                  background: isGapReady ? "#2F8F58" : "#FB5C0C",
                  color: "white",
                  padding: "0 12px",
                  cursor: gapLoading ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  opacity: gapLoading ? 0.7 : 1,
                }}
              >
                {gapLoading ? "Generating GAP..." : isGapReady ? "View GAP" : "Generate GAP"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate("/subjects", { replace: true })}
              style={{ height: 36, borderRadius: 8, border: "1px solid #334159", background: "#1b2738", color: "#D8E3FB", padding: "0 12px", cursor: "pointer" }}
            >
              Back to Subjects
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              style={{ height: 36, borderRadius: 8, border: "none", background: "#FB5C0C", color: "white", padding: "0 12px", cursor: "pointer", fontWeight: 700 }}
            >
              Back
            </button>
          </div>
        </header>
        {gapError ? <div style={{ color: "#ffb4ab", fontSize: 13 }}>{gapError}</div> : null}

        <section style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <div style={{ background: "rgba(31,42,60,0.7)", borderRadius: 12, borderLeft: "4px solid #FB5C0C", padding: 18 }}>
            <div style={{ fontSize: 11, color: "#9AA6BF", letterSpacing: 1.2, textTransform: "uppercase" }}>Final Performance</div>
            <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 52, fontWeight: 900, color: "#FB5C0C", lineHeight: 1 }}>{correctCount}</span>
              <span style={{ fontSize: 22, color: "#9AA6BF" }}>/ {total}</span>
            </div>
            <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: "#111C2D", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${scorePct}%`, background: "#FB5C0C" }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#FB5C0C", fontWeight: 700 }}>{scorePct}%</div>
          </div>

          <div style={{ background: "#111C2D", borderRadius: 12, padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: "#9AA6BF", letterSpacing: 1.2, textTransform: "uppercase" }}>Subject</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>{data.subjectName || "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9AA6BF", letterSpacing: 1.2, textTransform: "uppercase" }}>Test ID</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>{attemptData?.quiz_set_id || data.quizSetId || "-"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9AA6BF", letterSpacing: 1.2, textTransform: "uppercase" }}>Total Questions</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>{attemptData?.total_questions || total} Items</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#9AA6BF", letterSpacing: 1.2, textTransform: "uppercase" }}>Duration</div>
              <div style={{ marginTop: 6, fontWeight: 700 }}>{data.durationMinutes || "-"} mins</div>
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>Detailed Review</h2>
          {loadingAttempt ? <div style={{ opacity: 0.8 }}>Loading attempt result...</div> : null}
          {attemptError ? <div style={{ color: "#ffb4ab", fontSize: 13 }}>{attemptError}</div> : null}

          <div
            style={{
              display: "grid",
              gap: 12,
              maxHeight: "55vh",
              overflowY: "auto",
              paddingRight: 6,
            }}
          >
            {reviewRows.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "#111C2D",
                  borderRadius: 12,
                  borderLeft: `4px solid ${r.isCorrect ? "#2F8F58" : "#a94442"}`,
                  padding: 16,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: "#9AA6BF", letterSpacing: 1.2, textTransform: "uppercase" }}>Question {r.id}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: r.isCorrect ? "#7BE495" : "#FFB4AB", letterSpacing: 1.1, textTransform: "uppercase" }}>
                    {r.isCorrect ? "Correct" : "Incorrect"}
                  </div>
                </div>

                <div style={{ fontSize: 18, lineHeight: 1.45, fontWeight: 600 }}>{r.question}</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: "#081425", borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 10, color: "#9AA6BF", letterSpacing: 1.1, textTransform: "uppercase" }}>Your Answer</div>
                    <div style={{ marginTop: 5, fontWeight: 700 }}>{choiceText(r, r.selected)}</div>
                  </div>
                  <div style={{ background: "#081425", borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 10, color: "#9AA6BF", letterSpacing: 1.1, textTransform: "uppercase" }}>Correct Answer</div>
                    <div style={{ marginTop: 5, fontWeight: 700 }}>{choiceText(r, r.correct)}</div>
                  </div>
                </div>

                <div style={{ background: "#1F2A3C", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
                  {r.isCorrect ? (
                    <>
                      <div style={{ fontSize: 10, color: "#FB5C0C", letterSpacing: 1.1, textTransform: "uppercase" }}>Explanation</div>
                      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{explanationText(r, r.correct)}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 10, color: "#FB5C0C", letterSpacing: 1.1, textTransform: "uppercase" }}>Explanation</div>
                      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                        <strong>Correct choice:</strong> {explanationText(r, r.correct)}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                        <strong>Your choice:</strong> {r.selected ? explanationText(r, r.selected) : "No answer selected"}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}

            {reviewRows.length === 0 ? (
              <div style={{ background: "#111C2D", borderRadius: 12, padding: 14, opacity: 0.8 }}>No review data available.</div>
            ) : null}
          </div>
        </section>
      </div>

      {showGapModal ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: "min(920px, 100%)",
              maxHeight: "85vh",
              overflowY: "auto",
              background: "#111C2D",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 14,
              padding: 18,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>GAP Analysis</h2>
              <button
                type="button"
                onClick={() => setShowGapModal(false)}
                style={{ height: 34, borderRadius: 8, border: "1px solid #334159", background: "#1b2738", color: "#D8E3FB", padding: "0 10px", cursor: "pointer" }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                background: "#0f1b2d",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
                padding: 14,
                color: "#D8E3FB",
              }}
            >
              {gapMarkdown ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h1 style={{ margin: "8px 0 10px", fontSize: 26 }}>{children}</h1>,
                    h2: ({ children }) => <h2 style={{ margin: "8px 0 10px", fontSize: 22 }}>{children}</h2>,
                    h3: ({ children }) => <h3 style={{ margin: "8px 0 8px", fontSize: 18 }}>{children}</h3>,
                    p: ({ children }) => <p style={{ margin: "8px 0", lineHeight: 1.7 }}>{children}</p>,
                    ul: ({ children }) => <ul style={{ margin: "8px 0", paddingLeft: 20 }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ margin: "8px 0", paddingLeft: 20 }}>{children}</ol>,
                    li: ({ children }) => <li style={{ margin: "4px 0", lineHeight: 1.6 }}>{children}</li>,
                    strong: ({ children }) => <strong style={{ color: "#FFFFFF" }}>{children}</strong>,
                    em: ({ children }) => <em style={{ color: "#E8EEF8" }}>{children}</em>,
                    code: ({ children }) => (
                      <code
                        style={{
                          background: "#111C2D",
                          border: "1px solid rgba(255,255,255,0.09)",
                          borderRadius: 6,
                          padding: "2px 6px",
                          color: "#FFD9A8",
                          fontSize: 13,
                        }}
                      >
                        {children}
                      </code>
                    ),
                  }}
                >
                  {gapMarkdown}
                </ReactMarkdown>
              ) : (
                <div style={{ opacity: 0.8 }}>No GAP data available yet.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
