import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../lib_api";
import { clearAccessToken, getAccessToken } from "../lib_auth";
import LogoutConfirmDialog from "../components/LogoutConfirmDialog";

function formatTime(totalSeconds) {
  const sec = Math.max(0, totalSeconds);
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function buildMockQuestions(questionCount, chapterName = "Chapter") {
  const count = Number.isFinite(questionCount) && questionCount > 0 ? questionCount : 10;
  return Array.from({ length: count }).map((_, idx) => ({
    id: idx + 1,
    question: `[Mock] ${chapterName} - Question ${idx + 1}`,
    choices: ["Choice A", "Choice B", "Choice C", "Choice D"],
    correctAnswer: 1,
    level: 2,
    choiceExplanations: {
      1: "This is the mock correct explanation.",
      2: "This is mock explanation for choice B.",
      3: "This is mock explanation for choice C.",
      4: "This is mock explanation for choice D.",
    },
  }));
}

export default function QuizTestPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { quizSetId } = useParams();

  const quizSet = location.state?.quizSet || { id: quizSetId, title: `Set ${quizSetId}`, questionCount: 10 };
  const durationMinutes = Number(location.state?.durationMinutes || 5);
  const chapterId = location.state?.chapterId;
  const subjectName = location.state?.subjectName || "Subject";
  const subjectCode = location.state?.subjectCode || "-";
  const chapterName = location.state?.chapterName || "Chapter";

  const [questions, setQuestions] = useState(() => buildMockQuestions(quizSet.questionCount, chapterName));
  const [profile, setProfile] = useState(null);
  const [quizTitle, setQuizTitle] = useState(quizSet.title);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [questionError, setQuestionError] = useState("");

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(Math.floor(durationMinutes * 60));
  const [timeUp, setTimeUp] = useState(false);
  const [submitWarning, setSubmitWarning] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  useEffect(() => {
    async function loadQuizSet() {
      const token = getAccessToken();
      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      setLoadingQuestions(true);
      setQuestionError("");
      try {
        const meResponse = await apiRequest("/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meResponse.ok) {
          setProfile(await meResponse.json());
        }

        const response = await apiRequest(`/core/exam/set/${quizSetId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401) {
          clearAccessToken();
          navigate("/login", { replace: true });
          return;
        }

        if (!response.ok) {
          const errPayload = await response.json().catch(() => ({}));
          setQuestionError(errPayload.detail || "Failed to load quiz set, showing mock questions");
          setQuestions(buildMockQuestions(quizSet.questionCount, chapterName));
          setQuizTitle(quizSet.title);
          return;
        }

        const payload = await response.json();
        const mapped = Array.isArray(payload.questions)
          ? payload.questions.map((q, idx) => ({
              id: idx + 1,
              question: q.question,
              choices: [q.choice_1, q.choice_2, q.choice_3, q.choice_4],
              correctAnswer: q.correct_answer,
              level: q.level || 1,
              choiceExplanations: {
                1: q.choice_1_exp || "",
                2: q.choice_2_exp || "",
                3: q.choice_3_exp || "",
                4: q.choice_4_exp || "",
              },
            }))
          : [];

        if (mapped.length === 0) {
          setQuestionError("Quiz set has no questions, showing mock questions");
          setQuestions(buildMockQuestions(quizSet.questionCount, chapterName));
          setQuizTitle(payload.title || quizSet.title);
          return;
        }

        setQuestions(mapped);
        setQuizTitle(payload.title || quizSet.title);
      } catch {
        setQuestionError("Network error while loading quiz set, showing mock questions");
        setQuestions(buildMockQuestions(quizSet.questionCount, chapterName));
        setQuizTitle(quizSet.title);
      } finally {
        setLoadingQuestions(false);
      }
    }

    loadQuizSet();
  }, [quizSetId, navigate, quizSet.questionCount, quizSet.title, chapterName]);

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

  useEffect(() => {
    if (timeUp) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setTimeUp(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeUp]);

  useEffect(() => {
    setCurrentIndex((prev) => Math.min(prev, Math.max(0, questions.length - 1)));
  }, [questions.length]);

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;
  const canSubmit = allAnswered || timeUp;

  const handleSelectChoice = (choiceNo) => {
    if (timeUp || !currentQuestion) return;
    setSubmitWarning("");
    setAnswers((prev) => {
      const key = String(currentQuestion.id);
      if (prev[key] === choiceNo) {
        const clone = { ...prev };
        delete clone[key];
        return clone;
      }
      return { ...prev, [key]: choiceNo };
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      setSubmitWarning(`Please answer all questions before submit (${answeredCount}/${questions.length})`);
      return;
    }

    const token = getAccessToken();
    if (!token) {
      clearAccessToken();
      navigate("/login", { replace: true });
      return;
    }

    setSubmitting(true);
    setSubmitWarning("");
    try {
      const response = await apiRequest(`/core/exam/submit/${quizSet.id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ answers }),
      });

      if (response.status === 401) {
        clearAccessToken();
        navigate("/login", { replace: true });
        return;
      }

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        setSubmitWarning(errPayload.detail || "Submit failed");
        return;
      }

      const result = await response.json();
      navigate("/summarize_test", {
        state: {
          attemptId: result.attempt_id,
          quizSetId: quizSet.id,
          quizSetTitle: quizTitle,
          durationMinutes,
          timeSpentSeconds: Math.floor(durationMinutes * 60) - timeLeft,
          totalQuestions: questions.length,
          answeredCount,
          answers,
          questions,
          subjectName,
          subjectCode,
          chapterId,
          chapterName,
        },
      });
    } catch {
      setSubmitWarning("Network error while submitting exam");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#081425", color: "#D8E3FB", fontFamily: "Plus Jakarta Sans, Manrope, Prompt, sans-serif" }}>
      <header style={{ height: 66, background: "rgba(13, 28, 46, 0.9)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            type="button"
            onClick={() => setShowLeaveDialog(true)}
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
          <span style={{ opacity: 0.85, fontSize: 14, fontWeight: 500, color: "#D8E3FB" }}>Quiz Session</span>
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
          <button type="button" onClick={() => setShowLogoutDialog(true)} style={{ borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#ff8b8b", background: "transparent", border: "1px solid rgba(255, 139, 139, 0.2)", fontSize: 13 }}>
            Logout
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1500, margin: "0 auto", padding: 20, display: "grid", gridTemplateColumns: typeof window !== "undefined" && window.innerWidth < 1060 ? "1fr" : "2fr 1fr", gap: 20 }}>
        <section
          style={{
            position: "relative",
            background: "rgba(17,28,45,0.45)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: 18,
            paddingBottom: 96,
            minHeight: "calc(100vh - 120px)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 12, color: "#9AA6BF", letterSpacing: 1 }}>SET: {quizTitle}</div>
            <h2 style={{ margin: 0, fontSize: 24 }}>{chapterName}</h2>
          </div>

          {loadingQuestions ? <div style={{ opacity: 0.8, fontSize: 14 }}>Loading questions...</div> : null}
          {questionError ? (
            <div style={{ background: "rgba(169,68,66,0.12)", color: "#ffb4ab", border: "1px solid rgba(169,68,66,0.45)", borderRadius: 10, padding: 10, fontSize: 13 }}>
              {questionError}
            </div>
          ) : null}

          {timeUp ? (
            <div style={{ background: "rgba(169,68,66,0.16)", color: "#ffb4ab", border: "1px solid rgba(169,68,66,0.5)", borderRadius: 10, padding: 10, fontSize: 14 }}>
              Time is up. Please click Submit Exam.
            </div>
          ) : null}

          {currentQuestion ? (
            <div style={{ display: "grid", gap: 10, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ background: "linear-gradient(135deg, #ff7a00, #FB5C0C)", color: "white", fontWeight: 800, borderRadius: 999, padding: "6px 12px", fontSize: 12, boxShadow: "0 6px 16px rgba(251,92,12,0.28)" }}>
                  Question {currentQuestion.id}
                </span>
                <span
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#AAB6CE",
                    fontWeight: 700,
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontSize: 11,
                  }}
                >
                  Lv.{currentQuestion.level || 1}
                </span>
              </div>

              <div style={{ fontSize: 24, lineHeight: 1.45, fontWeight: 600 }}>{currentQuestion.question}</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                {currentQuestion.choices.map((choice, idx) => {
                  const choiceNo = idx + 1;
                  const selected = answers[String(currentQuestion.id)] === choiceNo;
                  return (
                    <button
                      key={choiceNo}
                      type="button"
                      disabled={timeUp}
                      onClick={() => handleSelectChoice(choiceNo)}
                      style={{
                        textAlign: "left",
                        borderRadius: 12,
                        border: selected ? "2px solid #FB5C0C" : "1px solid #2A3548",
                        background: selected ? "rgba(251,92,12,0.08)" : "rgba(17,28,45,0.82)",
                        boxShadow: selected ? "0 0 0 1px rgba(251,92,12,0.18), 0 8px 20px rgba(251,92,12,0.18)" : "none",
                        color: selected ? "#EAF1FF" : "#d0d8ea",
                        minHeight: 64,
                        padding: "10px 12px",
                        cursor: timeUp ? "not-allowed" : "pointer",
                        opacity: timeUp ? 0.8 : 1,
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <span style={{ width: 24, height: 24, borderRadius: "50%", background: selected ? "#FB5C0C" : "#2A3548", color: "white", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>
                        {selected ? "✓" : choiceNo}
                      </span>
                      <span>{choice}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div
            style={{
              position: "absolute",
              bottom: 18,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(31,42,60,0.95)",
              backdropFilter: "blur(12px)",
              border: "1px solid #2A3548",
              padding: "12px 24px",
              borderRadius: 9999,
              display: "flex",
              alignItems: "center",
              gap: 20,
              boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
              zIndex: 10,
            }}
          >
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: currentIndex === 0 ? "#7B879D" : "#D8E3FB",
                background: "transparent",
                border: "none",
                cursor: currentIndex === 0 ? "not-allowed" : "pointer",
                fontWeight: 700,
                padding: "8px 2px",
              }}
            >
              <span style={{ fontSize: 20 }}>‹</span>
              <span style={{ fontSize: 13 }}>Previous</span>
            </button>
            <div style={{ width: 1, height: 20, background: "#2A3548" }} />
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: "#9AA6BF", textTransform: "uppercase" }}>
              Question {currentIndex + 1} of {questions.length}
            </div>
            <div style={{ width: 1, height: 20, background: "#2A3548" }} />
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIndex >= questions.length - 1}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: currentIndex >= questions.length - 1 ? "#7B879D" : "white",
                background: currentIndex >= questions.length - 1 ? "transparent" : "linear-gradient(135deg, #ff7a00, #FB5C0C)",
                border: currentIndex >= questions.length - 1 ? "none" : "1px solid rgba(251,92,12,0.65)",
                borderRadius: 999,
                padding: "8px 12px",
                cursor: currentIndex >= questions.length - 1 ? "not-allowed" : "pointer",
                fontWeight: 700,
                boxShadow: currentIndex >= questions.length - 1 ? "none" : "0 8px 16px rgba(251,92,12,0.25)",
              }}
            >
              <span style={{ fontSize: 13 }}>Next</span>
              <span style={{ fontSize: 20 }}>›</span>
            </button>
          </div>
        </section>

        <aside style={{ background: "rgba(17,28,45,0.82)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14, height: "fit-content", display: "grid", gap: 12 }}>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px", display: "grid", gap: 6 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: "#9AA6BF" }}>TIME REMAINING</div>
            <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 800, color: timeLeft <= 60 ? "#ff9a9a" : "#EAF1FF", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace", textShadow: timeLeft <= 60 ? "0 0 12px rgba(255,120,120,0.35)" : "0 0 10px rgba(216,227,251,0.25)" }}>
              {formatTime(timeLeft)}
            </div>
          </div>

          <h3 style={{ margin: 0, fontSize: 17 }}>Quiz Navigator</h3>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Questions Answered {answeredCount}/{questions.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
            {questions.map((q, idx) => {
              const active = idx === currentIndex;
              const answered = answers[String(q.id)] != null;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  style={{
                    height: 36,
                    borderRadius: 8,
                    border: active ? "1px solid #FB5C0C" : answered ? "1px solid rgba(71,189,130,0.55)" : "1px solid #334159",
                    background: active ? "#FB5C0C" : answered ? "rgba(61,154,109,0.22)" : "#0f1b2d",
                    color: active ? "white" : "#D8E3FB",
                    fontWeight: 700,
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {q.id}
                  {!active && answered ? <span style={{ position: "absolute", right: 5, top: 4, width: 6, height: 6, borderRadius: "50%", background: "#61E3A7" }} /> : null}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            style={{
              marginTop: 8,
              height: 44,
              borderRadius: 12,
              border: canSubmit ? "1px solid rgba(41,160,95,0.55)" : "1px solid #47546E",
              background: canSubmit ? "linear-gradient(135deg, #2f8f58, #3cae6f)" : "transparent",
              boxShadow: canSubmit ? "0 10px 20px rgba(47,143,88,0.28)" : "none",
              color: canSubmit ? "white" : "#A8B3C8",
              fontWeight: 800,
              cursor: submitting || !canSubmit ? "not-allowed" : "pointer",
              opacity: submitting ? 0.75 : 1,
            }}
          >
            {submitting ? "Submitting..." : "Submit"}
          </button>
          {submitWarning ? <div style={{ marginTop: 4, fontSize: 12, color: "#ffb4ab" }}>{submitWarning}</div> : null}
        </aside>
      </main>
      <LogoutConfirmDialog
        open={showLogoutDialog}
        onCancel={() => setShowLogoutDialog(false)}
        onConfirm={handleLogout}
      />
      {showLeaveDialog ? (
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
            zIndex: 1300,
          }}
          onClick={() => setShowLeaveDialog(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              background: "#111C2D",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: 18,
              display: "grid",
              gap: 10,
              color: "#D8E3FB",
            }}
          >
            <h3 style={{ margin: 0, fontSize: 19 }}>Leave Quiz Session?</h3>
            <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>
              If you go back now, your current progress in this quiz may be lost.
              <br />
              Please confirm before leaving.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowLeaveDialog(false)}
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
                Stay
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
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
                Leave Quiz
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
