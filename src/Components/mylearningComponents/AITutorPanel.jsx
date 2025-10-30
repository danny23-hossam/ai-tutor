import React, { useState } from "react";
import "./AITutor.css";
import { LuSend } from 'react-icons/lu';
import { BsX } from "react-icons/bs";
import { BsRobot } from 'react-icons/bs';

const AITutorPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hi! I'm your AI Tutor. Ask me anything about Newton's Second Law!",
      sender: "tutor",
    },
  ]);
  const [inputValue, setInputValue] = useState("");

  const handleSend = () => {
    if (inputValue.trim() === "") return;

    const newMessage = {
      id: Date.now(),
      text: inputValue.trim(),
      sender: "user",
    };

    setMessages([...messages, newMessage]);
    setInputValue("");

    // --- Demo auto-reply ---
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: "That's a great question! Newton's Second Law is represented by the formula F = ma.",
          sender: "tutor",
        },
      ]);
    }, 1000);
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          className="btn btn-primary ai-float-btn"
          onClick={() => setIsOpen(true)}
        >
          <BsRobot size={25} />
        </button>
      )}

      {/* AI Tutor Panel */}
      <div className={`ai-tutor-panel ${isOpen ? "open" : ""}`}>
        <div className="header1 d-flex justify-content-between align-items-center p-3 border-bottom">
          <div className="d-flex align-items-center gap-2">
            <div className="ai-icon">🤖</div>
            <div>
              <div className="fw-bold">Ask AI Tutor</div>
              <small className="text-muted">Always here to help</small>
            </div>
          </div>
          <button className="btn ai-close-btn" onClick={() => setIsOpen(false)}>
            <BsX size={25} />
          </button>
        </div>

        {/* Chat Messages */}
        <div className="ai-body">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`ai-bubble mb-2 ${
                msg.sender === "user" ? "user-bubble ms-auto" : "ai-bubble-msg me-auto"
              }`}
            >
              {msg.text}
            </div>
          ))}
        </div>

        {/* Footer (Input + Send Button) */}
        <div className="ai-footer d-flex align-items-center">
          <input
            type="text"
            className="form-control ai-input"
            placeholder="Ask about this lesson..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button
            className="btn ai-send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim()}
          >
            <LuSend size={23} />
          </button>
        </div>

        {/* Note */}
        <div className="text-center text-muted ai-note mt-1 mb-2">
          AI responses are generated for demonstration
        </div>
      </div>
    </>
  );
};

export default AITutorPanel;
