import React, { useEffect, useState, useCallback, useRef } from "react";
import UploadedFile from "./UploadedFile";
import VideoPlayer from "./VideoPlayer";
import AudioPlayer from "./AudioPlayer";
import AnalyticsSection from "./AnalyticsSection";
import ExamSection from "./ExamSection";
import Quiz from "./Quiz";
import "./LessonContent.css";
import apiClient from "../../api/apiClient";
import DomPurify from 'dompurify';

const TABS = [
  { key: "overview",   label: "Overview"   },
  { key: "quiz",       label: "Quiz"       },
  { key: "exam",       label: "Exam"       },
  { key: "analytics",  label: "Analytics"  },
];

function LessonContent({ mode, selectedName, selectedFilePath, selectedFileId, currentFile, onFileUpload, onVideoCompleted, lessonId, lessonTitle, analyticsKey }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [summarize, setSummarize] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(null); // which type is being generated
  const [errorToast, setErrorToast] = useState(null);
  const toastTimerRef = useRef(null);

  // Clear timer on unmount to prevent state update on dead component
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  useEffect(() => {
    if (!lessonId) {
      setLoading(false);
      return;
    }

    const fetchSummary = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(
          `/ai-generations/lesson/${lessonId}?type=summary`
        );
        const records = res.data;
        setSummarize(records.length > 0 ? (records[0].content || "") : "");
      } catch (error) {
        console.error("Failed to fetch summary:", error);
        setSummarize("");
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [lessonId]);

  // ── Trigger AI generation for a specific type ──────────────────
  const triggerGeneration = useCallback(async (type) => {
    if (!lessonId || generating) return;
    setGenerating(type);
    try {
      await apiClient.post('/ai-generations/trigger', {
        lesson_id: lessonId,
        types: [type],
      });
      // Refresh summary if that's what was generated
      if (type === 'summary') {
        const res = await apiClient.get(
          `/ai-generations/lesson/${lessonId}?type=summary`
        );
        const records = res.data;
        setSummarize(records.length > 0 ? (records[0].content || "") : "");
      }
    } catch (error) {
      console.error(`Failed to generate ${type}:`, error);
      const msg = error.response?.data?.message || 'Generation failed';
      setErrorToast(msg);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setErrorToast(null), 5000);
    } finally {
      setGenerating(null);
    }
  }, [lessonId, generating]);

  const displayTitle = selectedName || lessonTitle || "";

  return (
    <div className="lesson-content-root">
      {/* ── Title ── */}
      {displayTitle && (
        <h1 className="lc-title">{displayTitle}</h1>
      )}

      {/* ── Media area ── */}
      <div className="lc-media-wrap">
        {mode === "upload" && (
          <UploadedFile
            fileName={selectedName}
            file={currentFile}
            fileId={selectedFileId}
            fileUrl={selectedFilePath
              ? (selectedFilePath.startsWith('http')
                  ? selectedFilePath
                  : `${apiClient.defaults.baseURL?.replace('/api', '') || ''}/${selectedFilePath}`)
              : null}
            onUpload={onFileUpload}
          />
        )}
        {mode === "video" && (
          <VideoPlayer
            title={selectedName}
            filePath={selectedFilePath}
            fileId={selectedFileId}
            lessonId={lessonId}
            onVideoCompleted={() => onVideoCompleted(selectedFileId)}
          />
        )}
        {mode === "audio" && (
          <AudioPlayer title={selectedName} filePath={selectedFilePath} fileId={selectedFileId} />
        )}
      </div>

      {/* ── Custom Tab navigation ── */}
      <div className="lc-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            id={`lc-tab-${tab.key}`}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`lc-panel-${tab.key}`}
            className={`lc-tab${activeTab === tab.key ? " lc-tab--active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab panels ── */}
      <div className="lc-panel-wrap">

        <div
          id={`lc-panel-overview`}
          className={activeTab === "overview" ? "lc-panel lc-panel--active" : "lc-panel lc-panel--hidden"}
          role="tabpanel"
          aria-labelledby="lc-tab-overview"
          hidden={activeTab !== "overview" ? true : undefined}
        >
          <div className="lc-section-header">
            <p className="lc-section-label">Lesson Summary</p>
            {summarize && !loading && (
              <button
                className="lc-generate-btn lc-generate-btn--small"
                onClick={() => triggerGeneration('summary')}
                disabled={!!generating}
                aria-label={generating === 'summary' ? 'Regenerating summary' : 'Regenerate summary'}
              >
                <span aria-hidden="true">{generating === 'summary' ? '⏳' : '🔄'}</span>
                {generating === 'summary' ? ' Regenerating…' : ' Regenerate'}
              </button>
            )}
          </div>
          {loading ? (
            <div className="lc-loading">
              <div className="lc-spinner" role="status" aria-label="Loading summary" />
              <span>Loading summary…</span>
            </div>
          ) : generating === 'summary' ? (
            <div className="lc-loading">
              <div className="lc-spinner" role="status" aria-label="Generating summary" />
              <span>AI is generating your summary…</span>
            </div>
          ) : summarize ? (
            <div
              className="lc-summary-body"
              dangerouslySetInnerHTML={{ __html: DomPurify.sanitize(summarize) }}
            />
          ) : (
            <div className="lc-empty-state">
              <span className="lc-empty-icon" aria-hidden="true">📄</span>
              <p>No summary available for this lesson yet.</p>
              <button
                className="lc-generate-btn"
                onClick={() => triggerGeneration('summary')}
                disabled={!!generating}
                aria-label={generating === 'summary' ? 'Generating summary' : 'Generate summary with AI'}
              >
                <span aria-hidden="true">{generating === 'summary' ? '⏳' : '✨'}</span>
                {generating === 'summary' ? ' Generating…' : ' Generate Summary'}
              </button>
              <p className="lc-empty-sub">Upload files first, then generate a summary with AI.</p>
            </div>
          )}
        </div>

        <div
          id="lc-panel-quiz"
          className={activeTab === "quiz" ? "lc-panel lc-panel--active" : "lc-panel lc-panel--hidden"}
          role="tabpanel"
          aria-labelledby="lc-tab-quiz"
          hidden={activeTab !== "quiz" ? true : undefined}
        >
          <Quiz lessonId={lessonId} lessonTitle={lessonTitle} onGenerate={() => triggerGeneration('quiz')} generating={generating} />
        </div>

        <div
          id="lc-panel-exam"
          className={activeTab === "exam" ? "lc-panel lc-panel--active" : "lc-panel lc-panel--hidden"}
          role="tabpanel"
          aria-labelledby="lc-tab-exam"
          hidden={activeTab !== "exam" ? true : undefined}
        >
          <ExamSection lessonId={lessonId} lessonTitle={lessonTitle} onGenerate={() => triggerGeneration('exam')} generating={generating} />
        </div>

        <div
          id="lc-panel-analytics"
          className={activeTab === "analytics" ? "lc-panel lc-panel--active" : "lc-panel lc-panel--hidden"}
          role="tabpanel"
          aria-labelledby="lc-tab-analytics"
          hidden={activeTab !== "analytics" ? true : undefined}
        >
          <AnalyticsSection lessonId={lessonId} analyticsKey={analyticsKey} />
        </div>

      </div>

      {/* ── Inline error toast ── */}
      {errorToast && (
        <div className="lc-error-toast">
          <span className="lc-error-toast__icon">⚠️</span>
          <span className="lc-error-toast__msg">{errorToast}</span>
          <button className="lc-error-toast__close" onClick={() => setErrorToast(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
    </div>
  );
}

export default LessonContent;