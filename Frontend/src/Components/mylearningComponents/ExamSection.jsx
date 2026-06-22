import React, { useState, useEffect } from "react";
import { Card, Button, Container } from "react-bootstrap";
import { FaClock } from "react-icons/fa";
import "./ExamSection.css";
import { IoDocumentTextOutline } from "react-icons/io5";
import { PiMedalDuotone } from "react-icons/pi";
import { useNavigate } from "react-router-dom";
import apiClient from "../../api/apiClient";

const ExamSection = ({ lessonId, lessonTitle, onGenerate, generating }) => {
  const navigate = useNavigate();
  const [hasExam, setHasExam] = useState(null); // null=loading, true/false

  useEffect(() => {
    if (!lessonId) { setHasExam(false); return; }
    // Re-check whenever generation finishes (generating goes null)
    if (generating) return;
    const check = async () => {
      try {
        const res = await apiClient.get(`/ai-generations/lesson/${lessonId}?type=exam`);
        setHasExam(res.data.length > 0);
      } catch {
        setHasExam(false);
      }
    };
    check();
  }, [lessonId, generating]);

  return (
    <Container className="py-3 py-md-5 px-0 exam-section-container">
      <Card className="shadow-sm border-0 text-center exam-card">
        <Card.Body className="p-3 p-md-5">

          {/* Icon */}
          <div className="exam-icon-wrapper mb-4" aria-hidden="true">
            <span className="exam-medal-icon">
              <PiMedalDuotone aria-hidden="true" />
            </span>
          </div>

          <Card.Title as="h2" className="fw-normal mb-3 exam-card-title">
            Full Exam Mode
          </Card.Title>

          {/* Loading */}
          {hasExam === null && (
            <Card.Text className="exam-card-text mb-4">
              Checking exam status…
            </Card.Text>
          )}

          {/* Generating in progress */}
          {generating === 'exam' && (
            <Card.Text className="exam-card-text mb-4 exam-generating-text">
              <span className="exam-spinner" aria-hidden="true" />
              AI is generating your exam…
            </Card.Text>
          )}

          {/* No exam yet */}
          {hasExam === false && !generating && (
            <>
              <Card.Text className="exam-card-text mb-4 px-md-5">
                No exam generated yet. Generate one to test your understanding of this lesson.
              </Card.Text>
              {onGenerate && (
                <div className="d-flex justify-content-center">
                  <button
                    className="exam-gen-btn"
                    onClick={onGenerate}
                    disabled={!!generating}
                    aria-busy={generating === 'exam'}
                    aria-label="Generate an exam for this lesson"
                  >
                    <span aria-hidden="true">✨</span>
                    {' Generate Exam'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Exam exists */}
          {hasExam === true && (
            <>
              <Card.Text className="exam-card-text mb-4 px-md-5">
                Take a comprehensive exam to test your understanding of all lesson material.
              </Card.Text>

              <div className="d-flex justify-content-center align-items-center exam-card-meta mb-4">
                <span className="me-4">
                  <FaClock className="me-2" aria-hidden="true" /> 45 minutes
                </span>
                <span>
                  <IoDocumentTextOutline className="me-2" aria-hidden="true" /> 15 questions
                </span>
              </div>

              <div className="d-flex flex-column align-items-center gap-2">
                <Button
                  className="fw-bold py-1 exam-start-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/examstart", { state: { lessonId, lessonTitle } });
                  }}
                  aria-label={`Start exam for ${lessonTitle || 'this lesson'}`}
                >
                  Start Exam
                </Button>
                {onGenerate && (
                  <button
                    className="quiz-generate-link"
                    onClick={onGenerate}
                    disabled={!!generating}
                    aria-busy={generating === 'exam'}
                    aria-label="Regenerate exam"
                  >
                    <span aria-hidden="true">🔄</span>
                    {' Regenerate Exam'}
                  </button>
                )}
              </div>
            </>
          )}

        </Card.Body>
      </Card>
    </Container>
  );
};

export default ExamSection;
