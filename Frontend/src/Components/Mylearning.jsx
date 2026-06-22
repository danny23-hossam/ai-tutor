import React, { useState, useEffect, useRef } from "react";
import Header from "./Header";
import { useNavigate } from "react-router-dom";
import "./Mylearning.css";
import apiClient from "../api/apiClient";
import toast from "react-hot-toast";

// Compute completion % using same formula as AnalyticsSection
function computeCompletion(tracking) {
  if (!tracking) return 0;
  const completedVideos = Math.min(
    tracking.videos_watched_count || 0,
    tracking.ready_videos || 0
  );
  const vPct = tracking.total_videos > 0
    ? (completedVideos / tracking.total_videos) * 30
    : 0;
  const qPct = ((tracking.quiz_score || 0) / 100) * 25;
  const ePct = ((tracking.exam_score || 0) / 100) * 25;
  const pPct = tracking.practice_completed ? 20 : 0;
  return Math.round(vPct + qPct + ePct + pPct);
}

function formatTime(seconds) {
  if (!seconds || seconds === 0) return null;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const Mylearning = () => {
  const [lessons, setLessons] = useState([]);
  const [trackingMap, setTrackingMap] = useState({});
  const [lessonTitle, setLessonTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const navigate = useNavigate();
  const modalCloseRef = useRef(null); // used to close the Bootstrap modal reliably

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [lessonsRes, trackingRes, filesRes] = await Promise.all([
          apiClient.get('/lessons'),
          apiClient.get('/user-lessons').catch(() => ({ data: [] })),
          apiClient.get('/lesson-files/all').catch(() => ({ data: [] })),
        ]);

        setLessons(lessonsRes.data);

        // Count videos per lesson (all videos + ready/playable videos)
        const videosPerLesson = {};
        const readyVideosPerLesson = {};
        (filesRes.data || []).forEach(f => {
          if (f.type === 'video') {
            videosPerLesson[f.lesson_id] = (videosPerLesson[f.lesson_id] || 0) + 1;
            if (f.file_path) {
              readyVideosPerLesson[f.lesson_id] = (readyVideosPerLesson[f.lesson_id] || 0) + 1;
            }
          }
        });

        // Build map: lessonId → tracking + total_videos
        const map = {};
        (trackingRes.data || []).forEach(record => {
          map[record.lesson_id] = {
            ...record,
            total_videos: videosPerLesson[record.lesson_id] || 0,
            ready_videos: readyVideosPerLesson[record.lesson_id] || 0,
          };
        });

        setTrackingMap(map);
      } catch (err) {
        console.error("Failed to fetch lessons:", err);
        toast.error("Could not load lessons.");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const createLesson = async () => {
    if (lessonTitle.trim() === "") return;
    setCreating(true);
    try {
      const res = await apiClient.post('/lessons', { title: lessonTitle });
      setLessons((prev) => [res.data, ...prev]);
      setLessonTitle("");
      toast.success("Lesson created!");
      modalCloseRef.current?.click(); // triggers Bootstrap's own data-bs-dismiss
    } catch (err) {
      console.error("Failed to create lesson:", err);
      toast.error("Could not create lesson.");
    } finally {
      setCreating(false);
    }
  };

  const deleteLesson = async (id) => {
    if (!window.confirm("Delete this lesson? This cannot be undone.")) return;
    try {
      await apiClient.delete(`/lessons/${id}`);
      setLessons(prev => prev.filter(l => l.id !== id));
      toast.success("Lesson deleted.");
    } catch (err) {
      console.error("Failed to delete lesson:", err);
      toast.error("Could not delete lesson.");
    }
  };

  const startEdit = (lesson) => {
    setEditingId(lesson.id);
    setEditTitle(lesson.title);
  };

  const saveEdit = async (id) => {
    if (!editTitle.trim()) return;
    try {
      const res = await apiClient.put(`/lessons/${id}`, { title: editTitle });
      setLessons(prev => prev.map(l => l.id === id ? { ...l, title: res.data.title } : l));
      toast.success("Lesson renamed.");
    } catch (err) {
      console.error("Failed to rename lesson:", err);
      toast.error("Could not rename lesson.");
    } finally {
      setEditingId(null);
    }
  };

  return (
    <>
      <Header />

      <main className="container pt-4 pb-5" style={{ maxWidth: '1200px' }}>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-5 gap-3">
          <div>
            <h3 className="mb-1 page-heading" style={{ fontWeight: '400' }}>My Learning</h3>
            <p className="text-muted mb-0" style={{ fontSize: '1.05rem' }}>Continue your learning journey</p>
          </div>
          <button
            className="btn btn-accent rounded-3 px-4 py-2 d-flex align-items-center justify-content-center hover-scale shadow-sm"
            data-bs-toggle="modal"
            data-bs-target="#exampleModal"
            style={{ whiteSpace: 'nowrap', fontSize: '1.05rem' }}
          >
            <i className="bi bi-plus-lg me-2"></i>Start a New Lesson
          </button>
        </div>

        {/* Modal */}
        <div className="modal fade" id="exampleModal" tabIndex="-1" aria-labelledby="exampleModalLabel" aria-hidden="true">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow rounded-4 p-3 modal-themed">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-semibold" id="exampleModalLabel">Start a New Lesson</h5>
                {/* Visible close button */}
                <button type="button" className="btn-close btn-close-themed shadow-none" data-bs-dismiss="modal" aria-label="Close"></button>
                {/* Hidden close button — clicked programmatically after lesson creation */}
                <button ref={modalCloseRef} type="button" data-bs-dismiss="modal" aria-hidden="true" style={{ display: 'none' }} />
              </div>
              <div className="modal-body pb-0">
                <p className="text-muted mb-4">Create a new learning session</p>
                <div className="mb-3">
                  <label className="form-label fw-medium text-muted small">Lesson Title</label>
                  <input
                    type="text"
                    className="form-control form-control-lg input-themed border-0 shadow-sm"
                    placeholder="Enter Lesson Name"
                    value={lessonTitle}
                    onChange={(e) => setLessonTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createLesson()}
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer border-0 pt-0 d-flex gap-2">
                <button type="button" className="btn btn-cancel-themed px-4 flex-grow-1" data-bs-dismiss="modal">Cancel</button>
                <button type="button" className="btn btn-accent px-4 flex-grow-1" onClick={createLesson} disabled={creating}>
                  {creating ? "Creating..." : "Create Lesson"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {loading && <p className="text-center text-muted mt-5">Loading lessons...</p>}
        {!loading && lessons.length === 0 && (
          <div className="text-center py-5">
            <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
                 style={{ width: '80px', height: '80px', backgroundColor: 'var(--color-accent-muted, rgba(255,105,0,0.12))' }}>
              <i className="bi bi-journal-plus fs-1" style={{ color: 'var(--color-accent)' }}></i>
            </div>
            <h5 className="fw-medium" style={{ color: 'var(--color-text)' }}>No lessons yet</h5>
            <p className="text-muted">Start by creating a new lesson!</p>
          </div>
        )}

        <div className="row g-4">
          {lessons.map((item, index) => {
            const tracking = trackingMap[item.id] || null;
            const completion = computeCompletion(tracking);
            const timeLabel = formatTime(tracking?.time_spent);

            return (
              <div className="col-12 col-md-6 col-lg-4" key={item.id || index}>
                <div className="card shadow-sm border-light rounded-4 h-100 lesson-card-hover">
                  <div className="card-body p-4 d-flex flex-column">

                    {editingId === item.id ? (
                      <div className="d-flex gap-2 mb-3">
                        <input
                          className="form-control form-control-sm border-secondary"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveEdit(item.id)}
                          autoFocus
                        />
                        <button className="btn btn-sm btn-dark px-3" onClick={() => saveEdit(item.id)}>✓</button>
                        <button className="btn btn-sm btn-light px-3" onClick={() => setEditingId(null)}>✕</button>
                      </div>
                    ) : (
                      <h5 className="mb-4 fw-medium text-truncate lesson-card-title" title={item.title}>{item.title}</h5>
                    )}

                    <div className="mb-2">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="text-muted small">Progress</span>
                        <span className="small fw-semibold" style={{ color: 'var(--color-accent)' }}>{completion}%</span>
                      </div>
                      <div className="progress" style={{ height: '6px', borderRadius: '4px', backgroundColor: 'rgba(128,128,128,0.2)' }}>
                        <div
                          className="progress-bar"
                          style={{ width: `${completion}%`, borderRadius: '4px', backgroundColor: 'var(--color-accent)', transition: 'width 0.6s ease' }}
                        ></div>
                      </div>
                    </div>

                    <p className="text-muted small mb-4">
                      <i className="bi bi-clock me-1"></i>
                      {timeLabel ? `Total ${timeLabel}` : 'Not started yet'}
                    </p>

                    <div className="mt-auto d-flex flex-column gap-3">
                      <button
                        className="btn btn-dark w-100 rounded-pill py-2 hover-scale d-flex align-items-center justify-content-center"
                        style={{ transition: 'transform 0.2s', fontWeight: '500' }}
                        onClick={() => navigate("/lesson", { state: { lessonId: item.id, lessonTitle: item.title } })}
                      >
                        <i className="bi bi-play-circle me-2"></i> Resume
                      </button>

                      <div className="d-flex align-items-center" style={{ gap: '8px' }}>
                        <button
                          className="btn edit-btn btn-sm rounded-pill px-3 d-flex align-items-center"
                          onClick={() => startEdit(item)}
                        >
                          <i className="bi bi-pencil me-1"></i> Edit
                        </button>

                        <button
                          className="btn delete-btn btn-sm rounded-pill px-3 d-flex align-items-center"
                          onClick={() => deleteLesson(item.id)}
                        >
                          <i className="bi bi-trash me-1"></i> Delete
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
};

export default Mylearning;
