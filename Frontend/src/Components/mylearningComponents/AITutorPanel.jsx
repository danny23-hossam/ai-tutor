import React, { useState, useRef, useEffect } from "react";
import "./AITutor.css";
import { LuSend } from 'react-icons/lu';
import { BsX } from "react-icons/bs";
import { BsRobot } from 'react-icons/bs';
import { motion, AnimatePresence } from "framer-motion";
import apiClient from "../../api/apiClient";

const EASE_OUT_QUART = [0.25, 1, 0.5, 1];

const AITutorPanel = ({ lessonId, lessonTitle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hi! I'm your AI Tutor. Ask me anything about this lesson!",
      sender: "tutor",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bodyRef = useRef(null);
  const abortRef = useRef(null); // AbortController for pending request

  // Auto-scroll to latest message
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Lock body scroll on mobile when panel is open
  useEffect(() => {
    const html = document.documentElement;
    if (isOpen) {
      html.classList.add('ai-panel-open');
    } else {
      html.classList.remove('ai-panel-open');
    }
    // Always clean up on unmount
    return () => html.classList.remove('ai-panel-open');
  }, [isOpen]);

  const handleSend = async () => {
    if (inputValue.trim() === "" || isSending) return;

    const userMessage = {
      id: Date.now(),
      text: inputValue.trim(),
      sender: "user",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsSending(true);

    // Show typing indicator
    const typingId = Date.now() + 1;
    setMessages((prev) => [...prev, { id: typingId, text: "Thinking…", sender: "tutor", isTyping: true }]);

    try {
      // Try calling the AI chat endpoint
      abortRef.current = new AbortController();
      const res = await apiClient.post('/ai-generations/chat', {
        lesson_id: lessonId,
        message: userMessage.text,
      }, { signal: abortRef.current.signal });

      // Remove typing indicator and add real response
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== typingId),
        {
          id: Date.now() + 2,
          text: res.data?.reply || res.data?.message || "I received your question!",
          sender: "tutor",
        },
      ]);
    } catch (error) {
      // Remove typing indicator
      setMessages((prev) => prev.filter((m) => m.id !== typingId));

      if (error.name === 'CanceledError') return;

      // If endpoint doesn't exist yet (404), show demo response
      if (error.response?.status === 404 || error.response?.status === 503) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 2,
            text: "🚧 The AI chat feature is coming soon! The AI team is working on connecting the chat endpoint.",
            sender: "tutor",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 2,
            text: "Sorry, I couldn't process that. Please try again.",
            sender: "tutor",
          },
        ]);
      }
    } finally {
      setIsSending(false);
    }
  };


  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            className="btn btn-primary ai-float-btn"
            onClick={() => setIsOpen(true)}
            aria-label="Open AI Tutor"
            aria-expanded={isOpen}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT_QUART }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.93 }}
          >
            <BsRobot size={25} aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* AI Tutor Panel */}
      {/* Backdrop — closes panel when clicking outside */}
      {isOpen && (
        <div
          className="ai-tutor-backdrop"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
      <div className={`ai-tutor-panel ${isOpen ? "open" : ""}`}>
        <div className="ai-panel-header">
          <div className="ai-icon">🤖</div>
          <div className="ai-header-text">
            <div className="fw-bold">Ask AI Tutor</div>
            <small className="text-muted">{lessonTitle || 'Always here to help'}</small>
          </div>
          <button
            className="btn ai-close-btn"
            onClick={() => setIsOpen(false)}
            aria-label="Close AI Tutor"
          >
            <BsX size={25} aria-hidden="true" />
          </button>
        </div>

        {/* Chat Messages */}
        <div
          className="ai-body"
          ref={bodyRef}
          role="log"
          aria-label="AI Tutor conversation"
          aria-live="polite"
          aria-atomic="false"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`ai-bubble mb-2 ${
                msg.sender === "user" ? "user-bubble ms-auto" : "ai-bubble-msg me-auto"
              } ${msg.isTyping ? "typing-indicator" : ""}`}
            >
              {msg.text}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="ai-footer d-flex align-items-center">
          <input
            id="ai-tutor-input"
            type="text"
            className="form-control ai-input"
            placeholder="Ask about this lesson..."
            aria-label="Message AI Tutor"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            maxLength={500}
            disabled={isSending}
          />
          <motion.button
            className="btn ai-send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim() || isSending}
            aria-label={isSending ? "Sending…" : "Send message"}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.12 }}
          >
            <LuSend size={23} aria-hidden="true" />
          </motion.button>
        </div>

        {/* Note */}
        <div className="text-center text-muted ai-note mt-1 mb-2">
          AI responses are powered by your lesson content
        </div>
      </div>
    </>
  );
};

export default AITutorPanel;
