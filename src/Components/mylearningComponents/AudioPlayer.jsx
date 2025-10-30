import React from "react";
import { Card } from "react-bootstrap";
import "./AudioPlayer.css";

function AudioPlayer({ title }) {
  return (
    <Card className="bg-dark text-center border-0">
      <Card.Body className="p-0">
        <div className="audio-placeholder p-5 text-center border rounded bg-white">
          <i className="bi bi-music-note-beamed fs-1 mb-3 d-block"></i>
          <p>{title || "Audio playback area – your generated audio will appear here."}</p>
        </div>
      </Card.Body>
    </Card>
  );
}

export default AudioPlayer;
