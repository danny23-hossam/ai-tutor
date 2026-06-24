import React, { useState, useEffect, useCallback } from 'react'
import { motion, easeInOut } from "framer-motion";
import { useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import FloatingToast from './FloatingToast';
import renderLatexText from '../../utils/renderLatexText';
import './QuizFlashcards.css';

const QuizFlashcards = () => {
  const MotionDiv = motion.div;
  const navigate = useNavigate();
  const location = useLocation();
  const lessonId = location.state?.lessonId || null;

  const [showanswers, setshowanswers] = useState(0);
  const [questionnumber, setquestionnumber] = useState(0);
  const [quiz, setquiz] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [scoreSaved, setScoreSaved] = useState(false);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const fetchdata = async () => {
      setLoading(true);
      setToast(null);
      try {
        if (lessonId) {
          const res = await apiClient.get(`/ai-generations/lesson/${lessonId}?type=quiz`);
          if (res.data.length > 0) {
            const flashcards = JSON.parse(res.data[0].content);
            setquiz(Array.isArray(flashcards) ? flashcards : []);
          } else {
            setToast("No quiz has been generated for this lesson yet.");
          }
        } else {
          setToast("No lesson selected.");
        }
      } catch (error) {
        console.error("Failed to fetch quiz:", error);
        setToast("Could not load quiz. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchdata();
  }, [lessonId]);

  const getnextquestion = async () => {
    if (questionnumber === quiz.length - 1) {
      if (lessonId && !scoreSaved) {
        try {
          await apiClient.put(`/user-lessons/${lessonId}`, {
            quiz_score: 100,
            practice_completed: true,
          });
          setScoreSaved(true);
          setToast("Quiz complete! Score saved. ✅");
        } catch (err) {
          console.error("Failed to save quiz score:", err);
          setToast("You finished all questions!");
        }
      } else {
        setToast("You finished all questions!");
      }
    } else {
      setquestionnumber(prev => prev + 1);
      setshowanswers(0);
    }
  };

  const getprevquestion = () => {
    if (questionnumber === 0) return;
    setquestionnumber(prev => prev - 1);
  };

  const rotation = () => {
    setshowanswers(prev => (prev === 2 ? 0 : prev + 1));
  };

  if (loading) return (
    <div className="qf-root">
      <p className="qf-section-label">Loading quiz…</p>
    </div>
  );

  if (quiz.length === 0) return (
    <div className="qf-root">
      <p className="qf-section-label" style={{ opacity: 0.6 }}>No questions available yet.</p>
      <button className="qf-return-btn" onClick={() => navigate("/lesson", { state: location.state })}>
        ← Return to Session
      </button>
      <FloatingToast message={toast} onClose={dismissToast} />
    </div>
  );

  return (
    <>
      <FloatingToast message={toast} onClose={dismissToast} />
      <div className="qf-root">
        <MotionDiv
          className="qf-card"
          animate={showanswers > 0 ? { rotate: [0, 360, 0] } : { rotate: 0 }}
          transition={{ duration: 1, ease: easeInOut }}
          onClick={rotation}
          key={showanswers}
          role="button"
          aria-label="Click to flip card and reveal answer"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && rotation()}
        >
          {/* Question header */}
          <div className="qf-card-header">
            <div className="qf-icon-wrap"><i className="bi bi-lightbulb" aria-hidden="true"></i></div>
            <span className="qf-section-label">Question {questionnumber + 1} of {quiz.length}</span>
          </div>

          <h3 className="qf-question">{renderLatexText(quiz[questionnumber].question)}</h3>

          <div className="qf-btn-row">
            <button className="qf-nav-btn" onClick={(e) => { e.stopPropagation(); getprevquestion(); }}>
              ← Previous
            </button>
            <button className="qf-nav-btn" onClick={(e) => { e.stopPropagation(); getnextquestion(); }}>
              Next →
            </button>
          </div>

          {/* Answer */}
          {showanswers === 1 && (
            <div className="qf-answer-section">
              <div className="qf-card-header" style={{ marginTop: '16px', marginBottom: '4px' }}>
                <div className="qf-icon-wrap"><i className="bi bi-check-circle" aria-hidden="true" style={{ color: 'var(--color-success)' }}></i></div>
                <span className="qf-section-label">Answer</span>
              </div>
              <p className="qf-answer-text">{renderLatexText(quiz[questionnumber].answer)}</p>
              {quiz[questionnumber].why_correct && (
                <>
                  <div className="qf-card-header" style={{ marginBottom: '4px' }}>
                    <div className="qf-icon-wrap"><i className="bi bi-check2-all" aria-hidden="true" style={{ color: 'var(--color-success)' }}></i></div>
                    <span className="qf-section-label">Why This Is Correct</span>
                  </div>
                  <p className="qf-answer-text">{renderLatexText(quiz[questionnumber].why_correct)}</p>
                </>
              )}
            </div>
          )}

          {/* Common mistakes */}
          {showanswers === 2 && (
            <div className="qf-answer-section">
              <p className="qf-answer-text">{renderLatexText(quiz[questionnumber].answer)}</p>
              {quiz[questionnumber].common_mistake ? (
                <>
                  <div className="qf-card-header" style={{ marginTop: '16px', marginBottom: '4px' }}>
                    <div className="qf-icon-wrap"><i className="bi bi-exclamation-triangle" aria-hidden="true" style={{ color: 'var(--color-error)' }}></i></div>
                    <span className="qf-section-label">Common Mistakes</span>
                  </div>
                  <p className="qf-mistake-text">{renderLatexText(quiz[questionnumber].common_mistake)}</p>
                </>
              ) : (
                <p className="qf-answer-text" style={{ opacity: 0.5, fontStyle: 'italic' }}>No common mistakes noted for this card.</p>
              )}
            </div>
          )}
        </MotionDiv>

        <button
          className="qf-return-btn"
          onClick={() => navigate("/lesson", { state: location.state })}
        >
          ← Return to Session
        </button>
      </div>
    </>
  );
};

export default QuizFlashcards;