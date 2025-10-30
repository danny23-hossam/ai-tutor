import React from "react";
import { Card, Button, Container } from "react-bootstrap";
import { FaClock } from "react-icons/fa";
import "./ExamSection.css";
import { IoDocumentTextOutline } from "react-icons/io5";
import { PiMedalDuotone } from "react-icons/pi";
const ExamSection = () => {
  return (
    <Container className="py-5 px-0 exam-section-container">
      <Card className="shadow-sm border-0 text-center exam-card">
        <Card.Body className="p-5">
          <div className="exam-icon-wrapper mb-4">
            <span className="exam-medal-icon">
              <PiMedalDuotone />
            </span>
          </div>

          <Card.Title as="h2" className="fw-normal mb-3">
            Full Exam Mode
          </Card.Title>
          <Card.Text className="text-muted mb-5 px-md-5">
            Take a comprehensive exam to test your understanding of all lesson
            material.
          </Card.Text>

          <div className="d-flex justify-content-center align-items-center text-muted mb-5">
            <span className="me-4">
              <FaClock className="me-2" /> 45 minutes
            </span>
            <span>
              <IoDocumentTextOutline className="me-2" /> 15 questions
            </span>
          </div>

          <Button className="w-100 fw-bold py-1 exam-start-btn">
            Start Exam
          </Button>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default ExamSection;
