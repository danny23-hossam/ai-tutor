import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import apiClient from '../../api/apiClient';
import './Register.css';
import AuthHeader from './AuthHeader';
import { Helmet } from 'react-helmet-async';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Sync dark mode preference (no toggle on auth pages)
  useEffect(() => {
    if (localStorage.getItem('darkmode') === 'true') {
      document.body.classList.add('darkmode');
    } else {
      document.body.classList.remove('darkmode');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      // Show success even on errors — prevents email enumeration on the frontend too
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <AuthHeader />

      <main className="registermain">
        <Helmet>
          <title>Reset Password — PapyrusAI</title>
          <meta name="description" content="Forgot your password? Reset it here to regain access to your PapyrusAI account and your AI study tools." />
          <meta property="og:title" content="Reset Password — PapyrusAI" />
          <meta property="og:site_name" content="PapyrusAI" />
          <link rel="canonical" href="https://papyrusai.me/forgot-password" />
        </Helmet>

        <div className="registerform" style={{ padding: '36px 32px' }}>

          {!sent ? (
            <>
              <h3 className="register-title">Forgot your password?</h3>
              <p className="auth-muted-text auth-muted-text--sm auth-muted-text--gap">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit}>
                <div className="register-field">
                  <label htmlFor="fp-email">Email address</label>
                  <input
                    id="fp-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="register-btn"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            </>
          ) : (
            <div className="auth-form-center" style={{ padding: '16px 0' }}>
              <div className="auth-status-icon" aria-hidden="true">📧</div>
              <h3 className="register-title">Check your inbox</h3>
              <p className="auth-muted-text auth-muted-text--gap">
                If <strong>{email}</strong> is registered, you'll receive a reset link shortly.
                The link expires in <strong>1 hour</strong>.
              </p>
              <p className="auth-muted-text auth-muted-text--sm">
                Didn't receive it? Check your spam folder.
              </p>
            </div>
          )}

          <p className="auth-link-footer">
            <Link to="/login" className="auth-link">
              &larr; Back to Sign In
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default ForgotPassword;
