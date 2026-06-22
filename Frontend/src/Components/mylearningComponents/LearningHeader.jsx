import React, { useState, useEffect } from "react";
import { ArrowLeft, MoonFill, SunFill } from "react-bootstrap-icons";
import "./LearningHeader.css";
import { useNavigate } from "react-router-dom";

function LearningHeader({ lessonTitle }) {
  const navigate = useNavigate();

  // Mirror the same dark-mode state logic as the main Header
  const [darkmode, setDarkmode] = useState(
    () => localStorage.getItem("darkmode") === "true"
  );

  // Sync body class on mount (in case lesson page loads with darkmode already on)
  useEffect(() => {
    if (darkmode) {
      document.body.classList.add("darkmode");
    } else {
      document.body.classList.remove("darkmode");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDark = () => {
    const next = !darkmode;
    setDarkmode(next);
    localStorage.setItem("darkmode", String(next));
    if (next) {
      document.body.classList.add("darkmode");
      document.body.classList.remove("lightmode");
    } else {
      document.body.classList.remove("darkmode");
      document.body.classList.add("lightmode");
    }
  };

  return (
    <div className="learning-header sticky-top">
      <div className="lh-inner">

        {/* ── Back link ── */}
        <button
          className="lh-back"
          onClick={() => navigate("/mylearning")}
          aria-label="Back to My Learning"
        >
          <ArrowLeft size={17} />
          <span className="lh-back-text">Back to My Learning</span>
        </button>

        <div className="lh-divider" aria-hidden="true" />

        {/* ── Lesson title (fills remaining space) ── */}
        <h1 className="lh-title">{lessonTitle || "Lesson"}</h1>

        {/* ── Dark mode toggle ── */}
        <button
          className="lh-dark-toggle"
          onClick={toggleDark}
          aria-label={darkmode ? "Switch to light mode" : "Switch to dark mode"}
          title={darkmode ? "Light mode" : "Dark mode"}
        >
          {darkmode ? <SunFill size={16} /> : <MoonFill size={16} />}
        </button>

      </div>
      <div className="lh-border" />
    </div>
  );
}

export default LearningHeader;
