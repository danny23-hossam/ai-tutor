import React from "react";
import { Card } from "react-bootstrap";
import "./VideoPlayer.css";

function VideoPlayer({ title }) {
  return (
    <Card className="bg-dark text-center border-0">
      <Card.Body className="p-0">
        <div className="video-placeholder text-white p-5">
          {title || "AI-Generated Video Lesson (Placeholder)"}
        </div>
      </Card.Body>
    </Card>
  );
}

export default VideoPlayer;
