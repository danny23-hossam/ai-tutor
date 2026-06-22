import React, { useEffect } from "react";
import "./App.css";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./contexts/AuthContext";

import Home from "./Components/Home";
import LandingPage from "./Components/LandingPage";
import Mylearning from "./Components/Mylearning";
import Reminder from "./Components/Reminder";
import Lesson from "./Components/Lesson";
import Login from "./Components/Authentication/Login";
import Register from "./Components/Authentication/Register";
import CheckEmail from "./Components/Authentication/CheckEmail";
import VerifyEmail from "./Components/Authentication/VerifyEmail";
import ForgotPassword from "./Components/Authentication/ForgotPassword";
import ResetPassword from "./Components/Authentication/ResetPassword";
import ProtectedRoute from "./Components/Authentication/ProtectedRoute";
import ExamStart from "./Components/mylearningComponents/ExamStart";
import QuizFlashcards from './Components/mylearningComponents/QuizFlashcards';
import Profile from './Components/Profile';

function App() {
  const navigate = useNavigate();

  useEffect(() => {
    // Support WebMCP to expose core site tools to AI agents via the browser (EPP)
    if (typeof navigator !== "undefined" && "modelContext" in navigator) {
      navigator.modelContext.provideContext({
        tools: [
          {
            name: "navigate_app",
            description: "Navigates to key functional pages within the PapyrusAI learning application.",
            inputSchema: {
              type: "object",
              properties: {
                destination: { 
                  type: "string", 
                  enum: ["home", "login", "register", "mylearning", "profile"],
                  description: "The endpoint to safely route the user to."
                }
              },
              required: ["destination"]
            },
            execute: async (args) => {
              const { destination } = args;
              navigate(`/${destination}`);
              return { content: [{ type: "text", text: `Successfully routed to /${destination}` }] };
            }
          },
          {
            name: "get_theme",
            description: "Gets the current visual theme configuration of the application (dark or light mode).",
            inputSchema: {
              type: "object",
              properties: {}
            },
            execute: async () => {
              const isDark = document.body.classList.contains("darkmode");
              return { content: [{ type: "text", text: isDark ? "darkmode" : "lightmode" }] };
            }
          }
        ]
      });
    }
  }, [navigate]);

  return (
    <AuthProvider>

      <Toaster position="top-center" reverseOrder={false} />

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/check-email" element={<CheckEmail />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mylearning"
          element={
            <ProtectedRoute>
              <Mylearning />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reminder"
          element={
            <ProtectedRoute>
              <Reminder />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson"
          element={
            <ProtectedRoute>
              <Lesson />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
       <Route
  path="/examstart"
  element={
    <ProtectedRoute>
      <ExamStart />
    </ProtectedRoute>
  }
  
/>

 <Route
  path="/flashcardquiz"
  element={
    <ProtectedRoute>
      <QuizFlashcards/>
    </ProtectedRoute>
  }
/>

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;
