import React, { useState } from "react";
import { Nav, Tab } from "react-bootstrap";
import VideoPlayer from "./VideoPlayer";
import AudioPlayer from "./AudioPlayer";
import Quiz from "./Quiz";
import "./LessonContent.css";

function LessonContent({ mode, selectedName }) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <Tab.Container activeKey={activeTab} onSelect={(k) => setActiveTab(k)}>
      <h5 className="">{selectedName}</h5>
      <div>
      {mode === "video" && <VideoPlayer title={selectedName} />}
      {mode === "audio" && <AudioPlayer title={selectedName} />}
      {mode === "file" && (
        <div className="p-5 text-center border rounded bg-white">
          <i className="bi bi-file-earmark-text fs-1 mb-3 d-block"></i>
          <p>{selectedName}</p>
        </div>
      )}
    </div>

      <Nav variant="tabs" className="mt-3 lesson-tabs">
        <Nav.Item>
          <Nav.Link eventKey="overview">Overview</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="quiz">Quiz</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="exam">Exam</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="analytics">Analytics</Nav.Link>
        </Nav.Item>
      </Nav>

      <Tab.Content className="mt-3">
        <Tab.Pane eventKey="overview">
          <p>
            <strong>Lesson Summary:</strong>
            {mode === "video"
              ? "This lesson introduces the concept of force and Newton’s second law of motion."
              : "This audio provides a concise explanation of Newton’s Laws and their applications."}
          </p>
        </Tab.Pane>

        <Tab.Pane eventKey="quiz">
          <Quiz />
        </Tab.Pane>

        <Tab.Pane eventKey="exam">
          <p>Exam section coming soon...</p>
        </Tab.Pane>

        <Tab.Pane eventKey="analytics">
          <p>Analytics section coming soon...</p>
        </Tab.Pane>
      </Tab.Content>
    </Tab.Container>
  );
}

export default LessonContent;
