import React from 'react';
import { Card, Row, Col, ProgressBar } from 'react-bootstrap';
import './AnalyticsSection.css';

const analyticsData = {
  completion: 68,
  quizAvg: 85,
  timeSpent: "2.5h",
  learningProgress: [
    { label: "Videos Watched", current: 2, total: 2 },
    { label: "Audio Lessons", current: 1, total: 1 },
    { label: "Practice Quizzes", current: 0, total: 3 },
  ],
};

const LearningProgressBar = ({ label, current, total }) => {
  const percentage = (current / total) * 100;

  return (
    <div className="mb-3">
      <div className="d-flex justify-content-between align-items-center mb-1">
        <small className="text-dark fw-bold">{label}</small>
        <small className="text-dark fw-bold">{`${current}/${total}`}</small>
      </div>
      
      <div className="progress analytics-progress-track" style={{ height: '5px' }}>
        <ProgressBar 
          now={percentage} 
          variant="dark" 
          className="analytics-progress-fill"
          style={{ minWidth: percentage > 0 ? '2%' : '0' }}
        />
      </div>
    </div>
  );
};

const AnalyticsContent = () => {
  return (
    <div className="analytics-content py-4">
      <Row className="mb-4">
        
        <Col md={4} className="mb-3">
          <Card className="shadow-sm border-0 h-100 analytics-card">
            <Card.Body>
              <p className="text-muted">Completion</p>
              <h3 className="fw-normal mb-3">{analyticsData.completion}%</h3>
              <div className="progress analytics-progress-track" style={{ height: '3px' }}>
                <ProgressBar now={analyticsData.completion} variant="dark" className="analytics-progress-fill" />
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="mb-3">
          <Card className="shadow-sm border-0 h-100 analytics-card">
            <Card.Body>
              <p className="text-muted">Quiz Avg</p>
              <h3 className="fw-normal mb-3">{analyticsData.quizAvg}%</h3>
              <div className="progress analytics-progress-track" style={{ height: '3px' }}>
                <ProgressBar now={analyticsData.quizAvg} variant="dark" className="analytics-progress-fill" />
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="mb-3">
          <Card className="shadow-sm border-0 h-100 analytics-card">
            <Card.Body>
              <p className="text-muted">Time Spent</p>
              <h3 className="fw-normal mb-3">{analyticsData.timeSpent}</h3>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="shadow-sm border-0 analytics-card">
        <Card.Body>
          <h4 className="fw-bold mb-4">Learning Progress</h4>
          
          {analyticsData.learningProgress.map((item, index) => (
            <LearningProgressBar 
              key={index}
              label={item.label}
              current={item.current}
              total={item.total}
            />
          ))}
        </Card.Body>
      </Card>
    </div>
  );
};

export default AnalyticsContent;