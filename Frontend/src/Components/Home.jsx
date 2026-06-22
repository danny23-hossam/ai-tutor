import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import "./Home.css";
import apiClient from "../api/apiClient";

const Home = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user")) || {};
  // Guard: truncate extremely long names gracefully in JS too
  const username = (user.full_name || "User").slice(0, 60);

  const [stats, setStats] = useState({ studyTime: "0m", lessons: 0, streak: 0 });
  const [lastLesson, setLastLesson] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    let cancelled = false; // prevent state updates on unmounted component

    const fetchStats = async () => {
      try {
        const [statsRes, lessonsRes, filesRes] = await Promise.all([
          apiClient.get('/study-days/stats'),
          apiClient.get('/user-lessons'),
          apiClient.get('/lesson-files/all').catch(() => ({ data: [] })),
        ]);

        if (cancelled) return;

        const { studyTimeSeconds, lessonCount, streak } = statsRes.data;

        // Guard against missing or NaN values from API
        const safeSecs    = Number(studyTimeSeconds) || 0;
        const safeCount   = Number(lessonCount)       || 0;
        const safeStreak  = Number(streak)            || 0;

        const hours   = Math.floor(safeSecs / 3600);
        const minutes = Math.floor((safeSecs % 3600) / 60);
        const studyTime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        // Count videos per lesson (same approach as Mylearning)
        const videosPerLesson = {};
        (filesRes.data || []).forEach(f => {
          if (f.type === 'video') {
            videosPerLesson[f.lesson_id] = (videosPerLesson[f.lesson_id] || 0) + 1;
          }
        });

        const records = Array.isArray(lessonsRes.data) ? lessonsRes.data : [];
        const sorted = [...records].sort((a, b) =>
          new Date(b.last_entered || 0) - new Date(a.last_entered || 0)
        );
        const recent = sorted[0]
          ? { ...sorted[0], total_videos: videosPerLesson[sorted[0].lesson_id] || 0 }
          : null;

        setStats({ studyTime, lessons: safeCount, streak: safeStreak });
        setLastLesson(recent);
        setStatsError(false);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch stats:", err);
        setStatsError(true);
      } finally {
        if (!cancelled) setLoadingStats(false);
      }
    };

    fetchStats();
    return () => { cancelled = true; };
  }, []);

  // ── Calculate dynamic progress ──
  // Formula must match AnalyticsSection exactly:
  //   30% videos, 25% quiz, 25% exam, 20% practice
  const getProgressPercent = () => {
    if (!lastLesson) return 0;
    const videosWatched = Number(lastLesson.videos_watched_count) || 0;
    const quizScore     = Number(lastLesson.quiz_score)           || 0;
    const examScore     = Number(lastLesson.exam_score)           || 0;
    const practiceOk    = !!lastLesson.practice_completed;
    // total_videos comes from /user-lessons enriched with file counts
    const totalVideos   = Number(lastLesson.total_videos)         || 0;

    // Only award video % when there are actual videos to watch
    const vPct = totalVideos > 0 ? (Math.min(videosWatched, totalVideos) / totalVideos) * 30 : 0;
    const qPct = (quizScore / 100) * 25;
    const ePct = (examScore / 100) * 25;
    const pPct = practiceOk ? 20 : 0;

    const total = vPct + qPct + ePct + pPct;
    return Number.isFinite(total) ? Math.round(Math.min(total, 100)) : 0;
  };

  const progress = getProgressPercent();
  // Format time_spent safely (could be null/undefined/NaN)
  const minutesSpent = Math.max(0, Math.floor((Number(lastLesson?.time_spent) || 0) / 60));

  const handleContinue = () => {
    if (lastLesson) {
      navigate("/lesson", {
        state: {
          lessonId:    lastLesson.lesson_id,
          lessonTitle: lastLesson.lesson_title,
        },
      });
    } else {
      navigate("/mylearning");
    }
  };

  return (
    <>
      <Header />

      <main className="home-container container pt-4 pb-5">

        {/* ── Welcome + Continue Learning ──────────────────── */}
        <section className="mb-5" aria-label="Continue learning">
          <h2 className="mb-2 page-heading home-welcome-heading">
            Welcome back, <span className="home-username">{username}</span>
          </h2>

          <div className="continue-card card border-0 rounded-4">
            <div className="card-body p-4 p-md-5">
              <div className="d-flex flex-column flex-md-row align-items-md-center gap-4">

                {/* Left: icon + lesson info */}
                <div className="d-flex align-items-start gap-3 flex-grow-1 min-w-0">
                  <i
                    className="bi bi-lightning-charge-fill text-warning fs-1 mt-1 flex-shrink-0"
                    aria-hidden="true"
                  ></i>
                  <div className="w-100 min-w-0">
                    <h4 className="continue-card-title mb-1">
                      {lastLesson ? "Continue Learning" : "Start Learning"}
                    </h4>
                    <p className="continue-card-subtitle continue-card-lesson-title mb-4">
                      {lastLesson ? lastLesson.lesson_title : "Open My Learning to begin"}
                    </p>

                    {lastLesson && (
                      <>
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="home-label-muted">Progress</span>
                          <span className="home-progress-pct" aria-label={`${progress} percent complete`}>
                            {progress}%
                          </span>
                        </div>

                        <div
                          className="progress mb-3 home-progress-track"
                          role="progressbar"
                          aria-valuenow={progress}
                          aria-valuemin="0"
                          aria-valuemax="100"
                          aria-label="Lesson completion progress"
                        >
                          <div
                            className="progress-bar rounded home-progress-bar"
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>

                        <p className="home-label-muted mb-0">
                          {minutesSpent > 0
                            ? `${minutesSpent} min studied`
                            : "No study time yet"}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Right: CTA button */}
                <div className="d-flex justify-content-start justify-content-md-end align-items-center mt-3 mt-md-0 ms-md-4 flex-shrink-0">
                  <button
                    className="btn btn-accent rounded-3 px-4 py-3 d-flex align-items-center home-continue-btn"
                    onClick={handleContinue}
                    aria-label={lastLesson
                      ? `Continue ${lastLesson.lesson_title}`
                      : "Go to My Learning to start"}
                  >
                    <i className="bi bi-caret-right fs-5 me-2 home-caret-icon" aria-hidden="true"></i>
                    {lastLesson ? 'Continue' : 'Start'}
                  </button>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* ── Weekly Stats ──────────────────────────────────── */}
        <section aria-label="This week's stats">
          <p className="home-eyebrow" aria-hidden="true">This Week</p>

          {/* Error fallback */}
          {statsError && !loadingStats && (
            <p className="home-label-muted mb-3" role="alert">
              Couldn't load your stats.{" "}
              <button
                className="btn btn-link p-0 home-retry-btn"
                onClick={() => { setStatsError(false); setLoadingStats(true); window.location.reload(); }}
              >
                Try again
              </button>
            </p>
          )}

          <div className="stats-grid">

            {/* Study Time */}
            <div className="card border-0 rounded-4 stats-card-primary">
              <div className="card-body p-4 d-flex align-items-center gap-4">
                {loadingStats ? (
                  <>
                    <span className="stat-icon-skel stat-icon-skel--lg" aria-hidden="true" />
                    <div>
                      <span className="stat-skeleton stat-skeleton--label" />
                      <span className="stat-skeleton stat-skeleton--lg" aria-label="Loading study time" />
                    </div>
                  </>
                ) : (
                  <>
                    <i className="bi bi-clock-fill fs-3 stat-icon stat-icon--warning" aria-hidden="true"></i>
                    <div className="stat-content">
                      <div className="home-label-muted mb-1">Study Time</div>
                      <div className="stat-value-lg" aria-live="polite">{stats.studyTime}</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Lessons — shows dot indicators for lesson count */}
            <div className="card border-0 rounded-4">
              <div className="card-body p-4 d-flex flex-column justify-content-between stat-card-inner">
                {loadingStats ? (
                  <>
                    <span className="stat-icon-skel stat-icon-skel--md" aria-hidden="true" />
                    <div className="mt-3">
                      <span className="stat-skeleton stat-skeleton--label" aria-label="Loading lesson count" />
                      <span className="stat-skeleton" />
                    </div>
                  </>
                ) : (
                  <>
                    <i className="bi bi-book-fill stat-icon stat-icon--success" aria-hidden="true"></i>
                    <div className="stat-content mt-3">
                      <div className="stat-value-md" aria-live="polite">{stats.lessons}</div>
                      <div className="home-label-muted home-label-sm mt-1">My Lessons</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Streak — icon pulses when streak is active */}
            <div className="card border-0 rounded-4">
              <div className="card-body p-4 d-flex flex-column justify-content-between stat-card-inner">
                {loadingStats ? (
                  <>
                    <span className="stat-icon-skel stat-icon-skel--md" aria-hidden="true" />
                    <div className="mt-3">
                      <span className="stat-skeleton stat-skeleton--label" aria-label="Loading streak" />
                      <span className="stat-skeleton" />
                    </div>
                  </>
                ) : (
                  <>
                    <i className="bi bi-lightning-charge-fill stat-icon stat-icon--accent" aria-hidden="true"></i>
                    <div className="stat-content mt-3">
                      <div className="stat-value-md" aria-live="polite">{stats.streak}</div>
                      <div className="home-label-muted home-label-sm mt-1">Day streak</div>
                      {stats.streak > 0 && (
                        <p className="streak-encouragement home-label-muted home-label-xs mt-1 mb-0" aria-hidden="true">
                          {stats.streak >= 7 ? '🔥 Keep it up!' : 'Come back tomorrow!'}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </section>
      </main>
    </>
  );
};

export default Home;
