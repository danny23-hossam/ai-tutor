import React, { useState, useEffect } from "react";
import "./Login.css";
import { useNavigate, Link } from "react-router-dom";
import toast from 'react-hot-toast';
import apiClient from "../../api/apiClient";
import { useAuth } from "../../contexts/useAuth";
import { Helmet } from "react-helmet-async";

const Login = () => {
  const navigate = useNavigate();
  const { authStatus, setAuthStatus } = useAuth(); // get authStatus

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redirect to home if already authenticated
  useEffect(() => {
    if (authStatus === 'authed') {
      navigate('/home');
    }
  }, [authStatus, navigate]);

  // Auto-apply saved dark mode preference (no toggle needed on auth pages)
  useEffect(() => {
    if (localStorage.getItem('darkmode') === 'true') {
      document.body.classList.add('darkmode');
    } else {
      document.body.classList.remove('darkmode');
    }
  }, []);

  const validateForm = () => {
    const newErrors = {};
    if (!email.trim()) newErrors.email = "Email is required";
    if (!password.trim()) newErrors.password = "Password is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const res = await apiClient.post('/auth/login', { email, password });
      const { user } = res.data;

      // Auth is handled by the HttpOnly cookie set by the server.
      // Only save non-sensitive display data (name/email) for the UI.
      localStorage.setItem('user', JSON.stringify(user));

      // Tell the AuthContext the user is now authenticated so
      // ProtectedRoute lets them through without another API call.
      setAuthStatus('authed');

      toast.success('Logged in successfully!');
      navigate('/home');
    } catch (err) {
      const message = err.response?.data?.message || "Invalid email or password";
      setErrors({ login: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <header className="loginheader">
        <a href="/" className="login-brand" aria-label="Papyrus home">
          <i className="bi bi-book login-brand-icon" aria-hidden="true" />
          <span className="login-brand-name">Papyrus</span>
        </a>
      </header>

      <main className="loginmain">
        <Helmet>
          <title>Sign In to PapyrusAI — Access Your AI Learning Dashboard</title>
          <meta name="description" content="Sign in to your PapyrusAI account. Access AI-generated flashcards, summaries, quizzes, and personalized study tools. Start learning smarter today." />
          <meta property="og:title" content="Sign In to PapyrusAI — Access Your AI Learning Dashboard" />
          <meta property="og:description" content="Log in to PapyrusAI and continue your AI-powered learning journey with flashcards, quizzes, and summaries." />
          <meta property="og:site_name" content="PapyrusAI" />
          <link rel="canonical" href="https://papyrusai.me/login" />
        </Helmet>

        <form className="loginform" onSubmit={handleSubmit}>
          <h1 className="loginp1">Sign in</h1>

          {/* Live error region — screen readers announce changes here */}
          <div role="alert" aria-live="polite" aria-atomic="true">
            {errors.login && <p className="error">{errors.login}</p>}
          </div>

          {/* Email */}
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            placeholder="Enter Your Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {errors.email && <p className="error" role="alert">{errors.email}</p>}

          {/* Password */}
          <label htmlFor="login-password">Password</label>
          <div style={{ position: "relative" }}>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter Your Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {/* P1: use <button> so it's keyboard-focusable and screen-reader accessible */}
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword(!showPassword)}
              className="pw-toggle"
            >
              <i className={`bi ${showPassword ? "bi-eye" : "bi-eye-slash"}`} aria-hidden="true" />
            </button>
          </div>
          {errors.password && <p className="error" role="alert">{errors.password}</p>}

          <button type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</button>

          <p style={{ textAlign: 'center', marginTop: 8, marginBottom: 0, fontSize: 13 }}>
            <Link to="/forgot-password" style={{ color: 'var(--accent, #ff6900)' }}>
              Forgot your password?
            </Link>
          </p>

          <p className="loginp2">
            Don't have an account?
            <Link to="/register">Sign up</Link>
          </p>
        </form>
      </main>

      <footer className="loginfooter">
        <p>
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </footer>
    </div>
  );
};

export default Login;
