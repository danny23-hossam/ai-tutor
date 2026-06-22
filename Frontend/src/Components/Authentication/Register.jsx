import React, { useState, useEffect } from 'react';
import './Register.css';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import apiClient from '../../api/apiClient';
import AuthHeader from './AuthHeader';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../../contexts/useAuth';

const Register = () => {
  const navigate = useNavigate();
  const { authStatus } = useAuth();

  const [formData, setFormData] = useState({
    fullname: "",
    email: "",
    password: "",
    confirmPassword: "",
    terms: false
  });

  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

    if (!formData.fullname.trim()) newErrors.fullname = "Full name is required";
    else if (formData.fullname.length < 3) newErrors.fullname = "Full name must be at least 3 characters";

    if (!formData.email.trim()) newErrors.email = "Email is required";
    else {
      const emailRegex = /\S+@\S+\.\S+/;
      if (!emailRegex.test(formData.email)) newErrors.email = "Invalid email format";
    }

    if (!formData.password) newErrors.password = "Password is required";
    else if (formData.password.length < 8) newErrors.password = "Password must be at least 8 characters";

    if (!formData.confirmPassword) newErrors.confirmPassword = "Confirm your password";
    else if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";

    if (!formData.terms) newErrors.terms = "You must agree before creating an account";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      await apiClient.post('/auth/register', {
        full_name: formData.fullname,
        email: formData.email,
        password: formData.password,
      });

      toast.success("Account created! Check your inbox to verify your email.");
      navigate("/check-email");
    } catch (err) {
      const message = err.response?.data?.message || "Registration failed. Please try again.";
      if (message.toLowerCase().includes("email")) {
        setErrors({ email: message });
      } else {
        setErrors({ general: message });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <AuthHeader />

      <main className='registermain'>
        <Helmet>
          <title>Create Your PapyrusAI Account — Free AI Learning Platform</title>
          <meta name="description" content="Sign up for PapyrusAI. Turn your lectures and notes into smart flashcards, quizzes, and summaries automatically. Start learning for free." />
          <meta property="og:title" content="Create Your PapyrusAI Account — Free AI Learning Platform" />
          <meta property="og:description" content="Sign up for PapyrusAI and transform your study material into interactive learning tools." />
          <meta property="og:site_name" content="PapyrusAI" />
          <link rel="canonical" href="https://papyrusai.me/register" />
        </Helmet>
        
        <form className='registerform' onSubmit={handleSubmit}>
          <h3 className='register-title'>Create your account</h3>

          {errors.general && (
            <div role="alert" aria-live="polite" aria-atomic="true">
              <p className="error">{errors.general}</p>
            </div>
          )}

          {/* Full Name */}
          <label htmlFor="fullname">Full Name</label>
          <div className="input-wrapper">
            <i className="bi bi-person input-icon" aria-hidden="true"></i>
            <input
              type="text"
              id="fullname"
              autoComplete="name"
              placeholder='Enter your full name'
              value={formData.fullname}
              onChange={(e) => setFormData({...formData, fullname: e.target.value})}
            />
          </div>
          {errors.fullname && <p className="error" role="alert">{errors.fullname}</p>}

          {/* Email */}
          <label htmlFor="email">Email</label>
          <div className="input-wrapper">
            <i className="bi bi-envelope input-icon" aria-hidden="true"></i>
            <input
              type="email"
              id="email"
              autoComplete="email"
              placeholder='Enter your email'
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>
          {errors.email && <p className="error" role="alert">{errors.email}</p>}

          {/* Password */}
          <label htmlFor="password">Password</label>
          <div className="input-wrapper">
            <i className="bi bi-lock input-icon" aria-hidden="true"></i>
            <input
              type={showPassword ? "text" : "password"}
              id="password"
              autoComplete="new-password"
              placeholder='Create a password'
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="password-toggle pw-btn"
              onClick={() => setShowPassword(!showPassword)}
            >
              <i className={`bi ${showPassword ? 'bi-eye' : 'bi-eye-slash'}`} aria-hidden="true" />
            </button>
          </div>
          {errors.password && <p className="error" role="alert">{errors.password}</p>}

          {/* Confirm Password */}
          <label htmlFor="confirm-password">Confirm Password</label>
          <div className="input-wrapper">
            <i className="bi bi-lock input-icon" aria-hidden="true"></i>
            <input
              type={showConfirmPassword ? "text" : "password"}
              id="confirm-password"
              autoComplete="new-password"
              placeholder='Confirm your password'
              value={formData.confirmPassword}
              onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
            />
            <button
              type="button"
              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              className="password-toggle pw-btn"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              <i className={`bi ${showConfirmPassword ? 'bi-eye' : 'bi-eye-slash'}`} aria-hidden="true" />
            </button>
          </div>
          {errors.confirmPassword && <p className="error" role="alert">{errors.confirmPassword}</p>}

          {/* Terms Checkbox */}
          <div className="terms-check">
            <input
              type="checkbox"
              id="terms"
              onChange={(e) => setFormData({...formData, terms: e.target.checked})}
            />
            <label htmlFor="terms">
              I agree to the <strong>Terms of Service</strong> and <strong>Privacy Policy</strong>
            </label>
          </div>
          {errors.terms && <p className="error" role="alert">{errors.terms}</p>}

          <button type="submit" className="register-btn" disabled={loading}>
            {loading ? "Creating Account..." : "Create Account"}
          </button>

          <p className='register-footer-text'>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </main>
    </div>
  );
};

export default Register;
