import React, { useEffect, useState } from 'react';
import './AnalyticsSection.css';
import apiClient from '../../api/apiClient';

/* ── Sub-component: animated progress bar row ───────────────────── */
const ProgressRow = ({ label, current, total }) => {
  const [mounted, setMounted] = useState(false);
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="as-progress-row">
      <div className="as-progress-meta">
        <span className="as-progress-label">{label}</span>
        <span className="as-progress-frac">{current}/{total}</span>
      </div>
      <div className="as-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="as-fill" style={{ width: `${mounted ? pct : 0}%` }} />
      </div>
    </div>
  );
};

/* ── Sub-component: stat card ───────────────────────────────────── */
const StatCard = ({ icon, iconColor, label, value, progress, mounted }) => (
  <div className="as-stat-card">
    <div className="as-stat-header">
      {icon && <span className="as-stat-icon" style={{ color: iconColor }}>{icon}</span>}
      <span className="as-stat-label">{label}</span>
    </div>
    <div className="as-stat-value">{value}</div>
    {progress !== undefined && (
      <div className="as-track as-track--thin" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="as-fill" style={{ width: `${mounted ? progress : 0}%`, transition: 'width 700ms cubic-bezier(0.25,1,0.5,1)' }} />
      </div>
    )}
  </div>
);

/* ── Main component ─────────────────────────────────────────────── */
const AnalyticsSection = ({ lessonId, analyticsKey = 0 }) => {
  const [data, setData] = useState(null);
  const [fileCounts, setFileCounts] = useState({ videos: 0, readyVideos: 0, audios: 0, quizzes: 0 });
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!lessonId) { setLoading(false); return; }

    const fetchAll = async () => {
      try {
        // Fetch all data in parallel
        const [trackingRes, filesRes, genRes] = await Promise.all([
          apiClient.get(`/user-lessons/${lessonId}`).catch(() => ({ data: null })),
          apiClient.get(`/lesson-files/${lessonId}`).catch(() => ({ data: [] })),
          apiClient.get(`/ai-generations/lesson/${lessonId}`).catch(() => ({ data: [] })),
        ]);

        setData(trackingRes.data);

        // Count files by type.
        // Total videos should represent all video records in the lesson.
        const files = filesRes.data || [];
        const videoCount = files.filter(f => f.type === 'video').length;
        const readyVideoCount = files.filter(f => f.type === 'video' && !!f.file_path).length;
        const audioCount = files.filter(f => f.type === 'audio').length;

        // Count quiz generations
        const gens = genRes.data || [];
        const quizCount = gens.filter(g => g.type === 'quiz').length;

        setFileCounts({
          videos: videoCount,
          readyVideos: readyVideoCount,
          audios: audioCount,
          quizzes: quizCount,
        });
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [lessonId, analyticsKey]);

  if (loading) {
    return (
      <div className="as-loading">
        <div className="as-spinner" />
        <span>Loading analytics…</span>
      </div>
    );
  }

  // Time spent from user_lesson.time_spent (cumulative per-lesson total)
  const timeSpentSec    = Number(data?.time_spent) || 0;
  const hours           = Math.floor(timeSpentSec / 3600);
  const minutes         = Math.floor((timeSpentSec % 3600) / 60);
  const timeLabel       = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  // Videos watched: capped at total (can't watch more unique videos than exist)
  const rawWatched        = Number(data?.videos_watched_count) || 0;
  const totalVideos       = fileCounts.videos;
  const readyVideos       = fileCounts.readyVideos;
  // Completed videos cannot exceed playable videos.
  const completedVideos   = Math.min(rawWatched, readyVideos);

  const quizScore       = Number(data?.quiz_score) || 0;
  const examScore       = Number(data?.exam_score) || 0;
  const practiceOk      = !!data?.practice_completed;

  const totalAudios     = fileCounts.audios;
  const totalQuizzes    = fileCounts.quizzes;

  // Completion: weighted across all components
  // 30% videos, 25% quiz score, 25% exam score, 20% practice
  const vPct = totalVideos > 0 ? (completedVideos / totalVideos) * 30 : 0;
  const qPct = (quizScore / 100) * 25;
  const ePct = (examScore / 100) * 25;
  const pPct = practiceOk ? 20 : 0;

  // If no content exists yet, show 0% instead of NaN
  const rawCompletion = vPct + qPct + ePct + pPct;
  const completion = Number.isFinite(rawCompletion) ? Math.round(Math.min(rawCompletion, 100)) : 0;

  // Quiz average (combine quiz + exam if both exist)
  let quizAvg = 0;
  if (quizScore > 0 && examScore > 0) {
    quizAvg = Math.round((quizScore + examScore) / 2);
  } else if (quizScore > 0) {
    quizAvg = Math.round(quizScore);
  } else if (examScore > 0) {
    quizAvg = Math.round(examScore);
  }

  return (
    <div className="as-root">

      {/* ── Stat cards row ── */}
      <div className="as-cards-row">
        <StatCard
          label="Completion"
          value={`${completion}%`}
          progress={completion}
          mounted={mounted}
        />
        <StatCard
          icon={<i className="bi bi-patch-question" />}
          iconColor="#f59e0b"
          label="Quiz Avg"
          value={`${quizAvg}%`}
          progress={quizAvg}
          mounted={mounted}
        />
        <StatCard
          icon={<i className="bi bi-clock-fill" />}
          iconColor="#22c55e"
          label="Time Spent"
          value={timeLabel}
        />
      </div>

      {/* ── Learning Progress card ── */}
      <div className="as-progress-card">
        <div className="as-progress-card-header">
          <i className="bi bi-bar-chart-fill" style={{ color: 'var(--color-accent, #ff6900)', fontSize: '1.1rem' }} />
          <h4 className="as-progress-title">Learning Progress</h4>
        </div>

        <ProgressRow label="Completed Videos" current={completedVideos}     total={totalVideos} />
        <ProgressRow label="Audio Lessons"    current={0}                    total={totalAudios} />
        <ProgressRow label="Practice Quizzes" current={practiceOk ? 1 : 0}  total={totalQuizzes} />
      </div>

    </div>
  );
};

export default AnalyticsSection;