import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Container } from "react-bootstrap";
import './Examstart.css';
import { useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import FloatingToast from './FloatingToast';
import renderLatexText from '../../utils/renderLatexText';
import { FaCheck, FaTimes, FaLightbulb, FaTrophy, FaArrowLeft } from 'react-icons/fa';
import { IoCheckmarkCircle } from 'react-icons/io5';

const ExamStart = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const lessonId = location.state?.lessonId || null;
    const lessonTitle = location.state?.lessonTitle || '';
    const examRef = useRef(null);

    const [correctanswers, setcorrectanswers] = useState(0);
    const [showResult, setShowResult] = useState(false);
    const [exam, setexam] = useState([]);
    const [answersChosen, setAnswersChosen] = useState([]);
    const [locked, setLocked] = useState([]);
    const [result, setResult] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [scoreSaved, setScoreSaved] = useState(false);
    const [toast, setToast] = useState(null);
    const dismissToast = useCallback(() => setToast(null), []);

    const examfinished = () => locked.length > 0 && locked.every(l => l === true);
    const answeredCount = locked.filter(Boolean).length;

    const handleShowResult = async () => {
        if (!examfinished()) {
            setToast("Please answer all questions before viewing results.");
            return;
        }
        setShowResult(true);

        // Save exam_score to the database
        if (lessonId && !scoreSaved) {
            const scorePercent = Math.round((correctanswers / exam.length) * 100);
            try {
                await apiClient.put(`/user-lessons/${lessonId}`, {
                    exam_score: scorePercent,
                    practice_completed: true,
                });
                setScoreSaved(true);
            } catch (err) {
                console.error("Failed to save exam score:", err);
            }
        }
    };

    const chooseAnswer = (index, option) => {
        if (locked[index]) return;
        const updated = [...answersChosen];
        updated[index] = option;
        setAnswersChosen(updated);
    };

    const reviewAnswer = (index) => {
        if (locked[index]) return;
        if (!answersChosen[index]) {
            setToast("Please select an answer first.");
            return;
        }
        const correct =
            answersChosen[index]?.toString().trim().toLowerCase() ===
            exam[index].solution?.toString().trim().toLowerCase();
        if (correct) setcorrectanswers(prev => prev + 1);

        const newResult = [...result];
        newResult[index] = correct;
        setResult(newResult);

        const newLocked = [...locked];
        newLocked[index] = true;
        setLocked(newLocked);
    };

    useEffect(() => {
        const fetchExam = async () => {
            setLoading(true);
            setError(null);
            try {
                if (lessonId) {
                    const res = await apiClient.get(`/ai-generations/lesson/${lessonId}?type=exam`);
                    if (res.data.length > 0) {
                        const questions = JSON.parse(res.data[0].content);
                        setexam(Array.isArray(questions) ? questions : []);
                    } else {
                        setError("No exam has been generated for this lesson yet.");
                    }
                } else {
                    setError("No lesson selected.");
                }
            } catch (err) {
                console.error("Failed to fetch exam:", err);
                setError("Could not load exam. Please try again later.");
            } finally {
                setLoading(false);
            }
        };
        fetchExam();
    }, [lessonId]);

    useEffect(() => {
        if (exam.length > 0) {
            setAnswersChosen(Array(exam.length).fill(null));
            setLocked(Array(exam.length).fill(false));
            setResult(Array(exam.length).fill(null));
            setcorrectanswers(0);
            setScoreSaved(false);
        }
    }, [exam]);

    // Helper to determine option CSS class
    const getOptionClass = (qIndex, opt) => {
        const isSelected = answersChosen[qIndex] === opt;
        const isLocked = locked[qIndex];
        const isCorrectOption = exam[qIndex]?.solution?.toLowerCase() === opt;
        const wasWrong = result[qIndex] === false;

        let classes = 'exam-option';

        if (isLocked) {
            classes += ' exam-option--locked';
            if (isCorrectOption) {
                classes += ' exam-option--correct';
            } else if (isSelected && wasWrong) {
                classes += ' exam-option--wrong';
            }
        } else if (isSelected) {
            classes += ' exam-option--selected';
        }

        return classes;
    };

    // Score percentage and grade
    const scorePercent = exam.length > 0 ? Math.round((correctanswers / exam.length) * 100) : 0;
    const getScoreEmoji = () => {
        if (scorePercent >= 90) return '🏆';
        if (scorePercent >= 70) return '🎉';
        if (scorePercent >= 50) return '💪';
        return '📚';
    };
    const getScoreBarClass = () => {
        if (scorePercent >= 80) return 'exam-result-bar-fill--excellent';
        if (scorePercent >= 50) return 'exam-result-bar-fill--good';
        return 'exam-result-bar-fill--needs-work';
    };

    return (
        <>
            <Container ref={examRef} className="py-4 py-md-5" style={{ maxWidth: 800 }}>

                {/* Page Header */}
                <div className="exam-page-header">
                    <h1 className="exam-page-title">📝 Exam</h1>
                    {lessonTitle && (
                        <p className="exam-page-subtitle">{lessonTitle}</p>
                    )}
                </div>

                {/* Floating error toast */}
                <FloatingToast message={toast} onClose={dismissToast} />

                {/* Loading */}
                {loading && (
                    <div className="exam-loading">
                        <div className="exam-loading-spinner" />
                        <p>Loading exam questions…</p>
                    </div>
                )}

                {/* Error */}
                {!loading && error && (
                    <div className="exam-error">{error}</div>
                )}

                {/* Progress Bar */}
                {!loading && !error && exam.length > 0 && (
                    <div className="exam-progress-bar-wrapper">
                        <div className="exam-progress-track">
                            <div
                                className="exam-progress-fill"
                                style={{ width: `${(answeredCount / exam.length) * 100}%` }}
                            />
                        </div>
                        <div className="exam-progress-label">
                            <span>{answeredCount} of {exam.length} answered</span>
                            <span>{Math.round((answeredCount / exam.length) * 100)}%</span>
                        </div>
                    </div>
                )}

                {/* Questions */}
                {!loading && !error && exam.map((part, index) => (
                    <div className="exam-question-card" key={index}>

                        {/* Question Badge */}
                        <div className="exam-question-badge">
                            Question {index + 1} / {exam.length}
                        </div>

                        {/* Question Text */}
                        <div className="exam-question-text">
                            {renderLatexText(part.question)}
                        </div>

                        {/* Answer Options */}
                        <ul className="exam-options-list">
                            {['a', 'b', 'c', 'd'].map(opt => {
                                const isLocked = locked[index];
                                const isCorrectOption = part.solution?.toLowerCase() === opt;
                                const isSelected = answersChosen[index] === opt;
                                const wasWrong = result[index] === false;

                                return (
                                    <li
                                        key={opt}
                                        className={getOptionClass(index, opt)}
                                        onClick={() => !locked[index] && chooseAnswer(index, opt)}
                                        role="button"
                                        tabIndex={locked[index] ? -1 : 0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                !locked[index] && chooseAnswer(index, opt);
                                            }
                                        }}
                                        aria-label={`Option ${opt.toUpperCase()}: ${part[opt]}`}
                                    >
                                        <span className="exam-option-letter">
                                            {opt.toUpperCase()}
                                        </span>
                                        <span className="exam-option-content">
                                            {renderLatexText(part[opt])}
                                        </span>
                                        {/* Show check/cross icons after locking */}
                                        {isLocked && isCorrectOption && (
                                            <span className="exam-option-icon exam-option-icon--correct">
                                                <FaCheck />
                                            </span>
                                        )}
                                        {isLocked && isSelected && wasWrong && !isCorrectOption && (
                                            <span className="exam-option-icon exam-option-icon--wrong">
                                                <FaTimes />
                                            </span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>

                        {/* Check Answer Button */}
                        {!locked[index] && (
                            <button
                                onClick={() => reviewAnswer(index)}
                                className="exam-check-btn"
                                disabled={!answersChosen[index]}
                            >
                                <IoCheckmarkCircle />
                                Check Answer
                            </button>
                        )}

                        {/* Feedback Banner */}
                        {result[index] === true && (
                            <div className="exam-feedback exam-feedback--correct">
                                <span className="exam-feedback-icon">✓</span>
                                <div className="exam-feedback-body">
                                    <div className="exam-feedback-title">Correct! Well done 🎯</div>
                                </div>
                            </div>
                        )}

                        {result[index] === false && (
                            <div className="exam-feedback exam-feedback--wrong">
                                <span className="exam-feedback-icon">✗</span>
                                <div className="exam-feedback-body">
                                    <div className="exam-feedback-title">
                                        Not quite right
                                    </div>
                                    <div className="exam-feedback-detail">
                                        The correct answer is <strong>{part.solution?.toUpperCase()}</strong>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Explanation — shown after answering */}
                        {locked[index] && part.explanation && (
                            <div className="exam-explanation">
                                <div className="exam-explanation-header">
                                    <FaLightbulb />
                                    Explanation
                                </div>
                                <div className="exam-explanation-text">
                                    {renderLatexText(part.explanation)}
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {/* Bottom Action Bar */}
                {!loading && !error && exam.length > 0 && (
                    <div className="exam-actions-bar">
                        <button
                            className="exam-action-btn exam-action-btn--primary"
                            onClick={handleShowResult}
                        >
                            <FaTrophy />
                            Show Result
                        </button>
                        <button
                            className="exam-action-btn exam-action-btn--secondary"
                            onClick={() => navigate("/lesson", { state: location.state })}
                        >
                            <FaArrowLeft />
                            Return to Session
                        </button>
                    </div>
                )}
            </Container>

            {/* Result Modal Overlay */}
            {showResult && (
                <div
                    className="exam-result-overlay"
                    onClick={() => setShowResult(false)}
                >
                    <div
                        className="exam-result-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="exam-result-emoji">{getScoreEmoji()}</div>
                        <div className="exam-result-score">{scorePercent}%</div>
                        <div className="exam-result-label">
                            {correctanswers} out of {exam.length} correct
                        </div>
                        <div className="exam-result-bar-track">
                            <div
                                className={`exam-result-bar-fill ${getScoreBarClass()}`}
                                style={{ width: `${scorePercent}%` }}
                            />
                        </div>
                        {scoreSaved && (
                            <div className="exam-result-saved">
                                <IoCheckmarkCircle /> Score saved
                            </div>
                        )}
                        <button
                            className="exam-result-close"
                            onClick={() => setShowResult(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

export default ExamStart;