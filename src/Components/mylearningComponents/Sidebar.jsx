import React, { useState, useEffect } from "react";
import { Accordion, Button, ListGroup } from "react-bootstrap";
import { BsX } from "react-icons/bs";
import "./Sidebar.css";

function Sidebar({ onCloseSidebar, onSelectContent }) {
  const [uploadedFiles, setUploadedFiles] = useState([
    "Newton’s Laws - Lecture Notes.pdf",
    "Force Diagrams.pptx",
  ]);
  const [videos, setVideos] = useState([
    "Video 1: Introduction to Forces",
    "Video 2: Newton’s Second Law",
  ]);
  const [audios, setAudios] = useState(["Lesson Audio.mp3"]);

  const [activeItem, setActiveItem] = useState(null);
  useEffect(() => {
    if (videos.length > 0 && !activeItem) {
      setActiveItem(videos[0]);
      onSelectContent("video", videos[0]);
    }
  }, [videos]);

  const handleUpload = () => {
    const newFile = `UploadedFile_${uploadedFiles.length + 1}.pdf`;
    setUploadedFiles([...uploadedFiles, newFile]);
  };

  const handleGenerate = (type) => {
    if (type === "video") {
      const newVideo = `Generated Video ${videos.length + 1}`;
      setVideos([...videos, newVideo]);
    } else {
      const newAudio = `Generated Audio ${audios.length + 1}`;
      setAudios([...audios, newAudio]);
    }
  };

  const handleSelect = (type, item) => {
    setActiveItem(item);
    onSelectContent(type, item);
  };

  return (
    <div className="sidebar-container">
      <div className="sidebar-close-btn d-xl-none">
        <Button variant="link" className="p-0" onClick={onCloseSidebar}>
          <BsX size={28} />
        </Button>
      </div>

      <h4 className="sidebar-title mb-4">Lesson Content</h4>

      <Button
        variant="outline-dark"
        className="w-100 mb-3 sideButtons upload-button"
        onClick={handleUpload}
      >
        <i className="bi bi-upload me-2"></i> Upload File
      </Button>

      <Button
        variant="outline-dark"
        className="w-100 mb-2 sideButtons generate-button"
        onClick={() => handleGenerate("video")}
      >
        <i className="bi bi-camera-video me-2"></i> Generate Video
      </Button>

      <Button
        variant="outline-dark"
        className="w-100 mb-3 sideButtons generate-button"
        onClick={() => handleGenerate("audio")}
      >
        <i className="bi bi-mic me-2"></i> Generate Audio
      </Button>

      <Accordion>
        <Accordion.Item eventKey="0" className="accordion-item-custom">
          <Accordion.Header>Uploaded Files</Accordion.Header>
          <Accordion.Body>
            <ListGroup variant="flush">
              {uploadedFiles.map((file, i) => (
                <ListGroup.Item
                  key={i}
                  action
                  active={activeItem === file}
                  onClick={() => handleSelect("upload", file)}
                >
                  {file}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Accordion.Body>
        </Accordion.Item>

        <Accordion.Item eventKey="1" className="accordion-item-custom">
          <Accordion.Header>AI-Generated Videos</Accordion.Header>
          <Accordion.Body>
            <ListGroup variant="flush">
              {videos.map((vid, i) => (
                <ListGroup.Item
                  key={i}
                  action
                  active={activeItem === vid}
                  onClick={() => handleSelect("video", vid)}
                >
                  {vid}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Accordion.Body>
        </Accordion.Item>

        <Accordion.Item eventKey="2" className="accordion-item-custom">
          <Accordion.Header>AI-Generated Audios</Accordion.Header>
          <Accordion.Body>
            <ListGroup variant="flush">
              {audios.map((aud, i) => (
                <ListGroup.Item
                  key={i}
                  action
                  active={activeItem === aud}
                  onClick={() => handleSelect("audio", aud)}
                >
                  {aud}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}

export default Sidebar;
