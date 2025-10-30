import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import { ArrowLeft } from "react-bootstrap-icons";
import "./LearningHeader.css";
import { useNavigate } from "react-router-dom";
    
function LearningHeader() {
  const navigate = useNavigate();

  return (
    <div className="learning-header ">
      <Container fluid className="px-4 py-2">
        <Row className="align-items-center">
          <Col xs="auto" className="d-flex align-items-center back-link-container"
          onClick={() => navigate("/mylearning")}>
            <ArrowLeft size={18} className="me-2" />
            <span className="back-link">Back to My Learning</span>
          </Col>

          <Col xs="auto">
            <div className="vertical-divider"></div>
          </Col>

          {/* Lesson title and instructor */}
          <Col>
            <div className="lesson-details">
              <h5 className="lesson-title mb-0">Newton&apos;s Second Law</h5>
              <small className="lesson-instructor text-muted">
                Dr. Sarah Mitchell
              </small>
            </div>
          </Col>
        </Row>
      </Container>

      <hr className="header-divider" />
    </div>
  );
}

export default LearningHeader;
