import React, { useState, useEffect, useRef } from "react";
import { Button, ToastContainer, Toast } from "react-bootstrap";
import { useLocation } from "react-router-dom";
import LearningHeader from "./mylearningComponents/LearningHeader";
import Sidebar from "./mylearningComponents/Sidebar";
import LessonContent from "./mylearningComponents/LessonContent";
import AITutorPanel from "./mylearningComponents/AITutorPanel";
import "./Lesson.css";
import apiClient from "../api/apiClient";

function Lesson() {
  const location = useLocation();
  const { lessonId, lessonTitle } = location.state || {};

  const [showSidebar, setShowSidebar] = useState(false);
  const [mode, setMode] = useState("video");
  const [selectedName, setSelectedName] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState(null);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "" });
  const [lessonFiles, setLessonFiles] = useState({});
  const [analyticsKey, setAnalyticsKey] = useState(0);

  // Called by Sidebar when files are added/deleted → refresh analytics
  const handleFilesChanged = () => setAnalyticsKey(k => k + 1);

  // Track which video IDs have already fired onEnded this session.
  // Prevents the same video from inflating the count if the user
  // rewinds and lets it end again.
  const watchedVideoIdsRef = useRef(new Set());

  // Called by VideoPlayer when a video ends → count as watched (once per unique video)
  const handleVideoCompleted = async (fileId) => {
    if (!lessonId || !fileId) return;
    // Guard: only count each unique video once per session
    if (watchedVideoIdsRef.current.has(fileId)) return;
    try {
      // Hard guard: only increment if the exact file is a ready video.
      const res = await apiClient.get(`/lesson-files/${lessonId}`);
      const fileRecord = (res.data || []).find((f) => f.id === fileId);
      const isReadyVideo = !!fileRecord && fileRecord.type === "video" && !!fileRecord.file_path;
      if (!isReadyVideo) return;

      watchedVideoIdsRef.current.add(fileId);
      await apiClient.put(`/user-lessons/${lessonId}`, {
        videos_watched_count: 1,
      });
      setAnalyticsKey(k => k + 1);
    } catch {
      // Silent fail: do not increment on errors.
    }
  };

  const showToast = (message) => setToast({ show: true, message });

  const hasStartedRef = useRef(false);
  const entryTimeRef = useRef(null); // tracks entry time on every mount

  // --- Progress Tracking + Study Day Logging ---
  useEffect(() => {
    if (!lessonId) return;

    // Always record entry time — even on StrictMode re-mount
    entryTimeRef.current = Date.now();

    // Only call APIs once (guard against StrictMode double-mount)
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;

      // Init or update user_lesson tracking record
      const initTracking = async () => {
        try {
          await apiClient.put(`/user-lessons/${lessonId}`, {
            last_entered: new Date().toISOString(),
          });
        } catch (err) {
          if (err.response?.status === 404) {
            try {
              await apiClient.post(`/user-lessons/${lessonId}`, {
                last_entered: new Date().toISOString(),
              });
            } catch {/* silent */}
          }
        }
      };

      // Mark today as a study day (idempotent)
      const startStudyDay = async () => {
        try {
          await apiClient.post('/study-days/start');
        } catch {/* silent */}
      };

      initTracking();
      startStudyDay();
    }

    const saveTime = () => {
      // Prevent saving double times if unmount happens right after beforeunload
      if (!entryTimeRef.current) return;
      const secondsSpent = Math.floor((Date.now() - entryTimeRef.current) / 1000);
      entryTimeRef.current = null; // mark as saved

      if (secondsSpent < 5) return; // ignore accidental flashes

      // Update user_lesson cumulative time (for per-lesson analytics)
      apiClient.put(`/user-lessons/${lessonId}`, {
        time_spent: secondsSpent,
        last_entered: new Date().toISOString(),
      }).catch(() => {});

      // Add duration to today's study_days row
      apiClient.put('/study-days/end', {
        duration: secondsSpent,
      }).catch(() => {});
    };

    // Save time when user closes the browser or refreshes
    window.addEventListener('beforeunload', saveTime);

    // Cleanup always runs on EVERY unmount (soft navigation away from this page)
    return () => {
      window.removeEventListener('beforeunload', saveTime);
      saveTime();
    };
  }, [lessonId]);

  // Select content from sidebar — no longer counts as watched on click
  const handleSelectContent = (type, name, filePath = null, fileId = null) => {
    setMode(type);
    setSelectedName(name);
    setSelectedFilePath(filePath);
    setSelectedFileId(fileId);
    showToast(
      type === "video" ? `🎬 Opened ${name}` :
      type === "audio" ? `🎧 Playing ${name}` : `📄 Opened ${name}`
    );
  };

  const handleGenerate = (type) => {
    setMode(type);
    const generatedName = type === "video" ? "AI Video Generated" : "AI Audio Generated";
    setSelectedName(generatedName);
    showToast(type === "video" ? "🎥 Video generated successfully!" : "🎧 Audio generated successfully!");
  };

  const handleUpload = () => {
    setMode("upload");
    setSelectedName("Uploaded File");
    showToast("📄 Ready to upload!");
  };

  const handleFileUpdate = (file) => {
    setLessonFiles((prevFiles) => ({ ...prevFiles, [selectedName]: file }));
    showToast("📄 File saved for " + selectedName);
  };

  return (
    <>
      <LearningHeader lessonTitle={lessonTitle} />

      <div className="lesson-layout">
        {/* ── Backdrop overlay (mobile/tablet) ── */}
        <div
          className={`sidebar-backdrop${showSidebar ? " open" : ""}`}
          onClick={() => setShowSidebar(false)}
        />

        {/* ── Sidebar ── */}
        <aside className={`lesson-sidebar${showSidebar ? " open" : ""}`}>
          <Sidebar
            onCloseSidebar={() => setShowSidebar(false)}
            onSelectContent={handleSelectContent}
            onFilesChanged={handleFilesChanged}
            lessonId={lessonId}
          />
        </aside>

        {/* ── Main Content ── */}
        <main className="lesson-main">
          <Button
            variant="primary"
            className="d-xl-none menu-button"
            onClick={() => setShowSidebar(true)}
          >
            <i className="bi bi-list"></i> Menu
          </Button>

          <LessonContent
            mode={mode}
            selectedName={selectedName}
            selectedFilePath={selectedFilePath}
            selectedFileId={selectedFileId}
            currentFile={lessonFiles[selectedName]}
            onFileUpload={handleFileUpdate}
            onVideoCompleted={handleVideoCompleted}
            lessonId={lessonId}
            lessonTitle={lessonTitle}
            analyticsKey={analyticsKey}
          />
          <AITutorPanel lessonId={lessonId} lessonTitle={lessonTitle} />
        </main>
      </div>

      {/* Toast — rendered OUTSIDE lesson-layout so it is never inside a
          scrollable container. The explicit style ensures it stays fixed
          to the viewport on all browsers including mobile Chrome/Safari. */}
      <ToastContainer
        position="bottom-end"
        className="p-3"
        style={{ position: "fixed", bottom: 0, right: 0, zIndex: 9999 }}
      >
        <Toast
          show={toast.show}
          onClose={() => setToast({ ...toast, show: false })}
          delay={3000}
          autohide
        >
          <Toast.Body>{toast.message}</Toast.Body>
        </Toast>
      </ToastContainer>
    </>
  );
}

export default Lesson;