import React, { useState } from "react";
import { Container, Row, Col, Button, ToastContainer, Toast } from "react-bootstrap";
import LearningHeader from "./mylearningComponents/LearningHeader";
import Sidebar from "./mylearningComponents/Sidebar";
import LessonContent from "./mylearningComponents/LessonContent";
import AITutorPanel from "./mylearningComponents/AITutorPanel";
import "./Lesson.css";
function App() {
  const [showTutor, setShowTutor] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [mode, setMode] = useState("video");
  const [selectedName, setSelectedName] = useState("");
  const [toast, setToast] = useState({ show: false, message: "" });

  const showToast = (message) => setToast({ show: true, message });

  const handleGenerate = (type) => {
    setMode(type);
    const generatedName =
      type === "video" ? "AI Video Generated" : "AI Audio Generated";
    setSelectedName(generatedName);
    showToast(
      type === "video"
        ? "🎥 Video generated successfully!"
        : "🎧 Audio generated successfully!"
    );
  };

  const handleUpload = () => {
    setMode("file");
    setSelectedName("Uploaded File");
    showToast("📄 File uploaded successfully!");
  };

  const handleSelectContent = (type, name) => {
    setMode(type);
    setSelectedName(name);
    showToast(
      type === "video"
        ? `🎬 Opened ${name}`
        : type === "audio"
        ? `🎧 Playing ${name}`
        : `📄 Opened ${name}`
    );
  };

  return (
    <>
      <LearningHeader />

      <Container fluid className="vh-100 bg-light position-relative">
        <Row className="h-100">
          {/* Sidebar */}
          <Col
            xl={2}
            className={`sidebarlearning bg-white border-end position-absolute position-xl-static ${
              showSidebar ? "d-block" : "d-none d-xl-block"
            }`}
            style={{ zIndex: 1050 }}
          >
            <Sidebar
              onCloseSidebar={() => setShowSidebar(false)}
              onSelectContent={handleSelectContent}
              onGenerate={handleGenerate}
              onUpload={handleUpload}
            />
          </Col>

          {/* Main Lesson Area */}
          <Col
            xl={10}
            sm={12}
            className="h-100 offset-xl-2 px-xl-4 learningContainer"
          >
            <Button
              variant="primary"
              className="d-xl-none mb-3 menu-button"
              onClick={() => setShowSidebar(true)}
            >
              <i className="bi bi-list"></i> Menu
            </Button>

            <LessonContent mode={mode} selectedName={selectedName} />
            <AITutorPanel />
          </Col>
        </Row>

        <ToastContainer position="bottom-end" className="p-3">
          <Toast
            show={toast.show}
            onClose={() => setToast({ ...toast, show: false })}
            delay={3000}
            autohide
          >
            <Toast.Body>{toast.message}</Toast.Body>
          </Toast>
        </ToastContainer>
      </Container>
    </>
  );
}

export default App;
