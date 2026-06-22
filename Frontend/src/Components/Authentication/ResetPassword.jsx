import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import apiClient from '../../api/apiClient';
import './Register.css';
import AuthHeader from './AuthHeader';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [errors, setErrors]     = useState({});

  // Sync dark mode preference (no toggle on auth pages)
  useEffect(() => {
    if (localStorage.getItem('darkmode') === 'true') {
      document.body.classList.add('darkmode');
    } else {
      document.body.classList.remove('darkmode');
    }
  }, []);

  const validate = () => {
    const errs = {};
    if (password.length < 8)        errs.password = 'Password must be at least 8 characters.';
    if (password !== confirm)        errs.confirm  = 'Passwords do not match.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { token, password });
      toast.success('Password updated! You can now sign in.');
      navigate('/login');
    } catch (err) {
      const data = err.response?.data;
      if (data?.expired) {
        setErrors({ form: 'This reset link has expired. Please request a new one.' });
      } else {
        setErrors({ form: data?.message || 'Failed to reset password. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  // No token in URL
  if (!token) {
    return (
      <div className="register-container">
        <AuthHeader />
        <main className="registermain">
          <div className="registerform auth-form-center">
            <div className="auth-status-icon" aria-hidden="true">❌</div>
            <h3 className="register-title">Invalid Link</h3>
            <p className="auth-muted-text auth-muted-text--gap">
              This password reset link is missing or invalid.
            </p>
            <Link to="/forgot-password" className="register-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
              Request New Link
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="register-container">
      <AuthHeader />

      <main className="registermain">
        <div className="registerform" style={{ padding: '36px 32px' }}>
          <h3 className="register-title">Choose a new password</h3>
          <p className="auth-muted-text auth-muted-text--sm auth-muted-text--gap">
            Must be at least 8 characters.
          </p>

          {errors.form && <p className="error" style={{ marginBottom: 16 }}>{errors.form}</p>}

          <form onSubmit={handleSubmit}>
            <div className="register-field">
              <label htmlFor="rp-password">New Password</label>
              <div className="input-wrapper">
                <input
                id="rp-password"
                type={showPw ? 'text' : 'password'}
                placeholder="Enter new password"
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="password-toggle pw-btn"
                onClick={() => setShowPw(!showPw)}
              >
                <i className={`bi ${showPw ? 'bi-eye' : 'bi-eye-slash'}`} aria-hidden="true" />
              </button>
              </div>
              {errors.password && <p className="error">{errors.password}</p>}
            </div>

            <div className="register-field">
              <label htmlFor="rp-confirm">Confirm Password</label>
              <input
                id="rp-confirm"
                type={showPw ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
              />
              {errors.confirm && <p className="error">{errors.confirm}</p>}
            </div>

            <button
              type="submit"
              className="register-btn"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>

          <p className="auth-link-footer">
            <Link to="/login" className="auth-link">← Back to Sign In</Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
