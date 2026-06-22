import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import './Register.css';
import AuthHeader from './AuthHeader';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'expired' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Sync dark mode preference
    if (localStorage.getItem('darkmode') === 'true') {
      document.body.classList.add('darkmode');
    } else {
      document.body.classList.remove('darkmode');
    }

    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('No verification token found in the link.');
      return;
    }

    apiClient.get(`/auth/verify-email?token=${token}`)
      .then((res) => {
        setMessage(res.data.message);
        setStatus(res.data.expired ? 'expired' : 'success');
      })
      .catch((err) => {
        const data = err.response?.data;
        setMessage(data?.message || 'Verification failed. Please try again.');
        setStatus(data?.expired ? 'expired' : 'error');
      });
  }, []);

  const icons = {
    loading: '⏳',
    success: '✅',
    expired: '⏰',
    error:   '❌',
  };

  return (
    <div className="register-container">
      <AuthHeader />

      <main className="registermain">
        <div className="registerform auth-form-center">
          {/* aria-live announces async status changes to screen readers */}
          <div aria-live="polite" aria-atomic="true">
            <div className="auth-status-icon" aria-hidden="true">
              {icons[status] || '📧'}
            </div>

            {status === 'loading' && (
              <>
                <h3 className="register-title">Verifying your email…</h3>
                <p className="auth-muted-text">Please wait a moment.</p>
              </>
            )}

            {status === 'success' && (
              <>
                <h3 className="register-title">Email Verified!</h3>
                <p className="auth-muted-text auth-muted-text--gap">{message}</p>
                <Link to="/login" className="register-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
                  Sign In Now
                </Link>
              </>
            )}

            {(status === 'expired' || status === 'error') && (
              <>
                <h3 className="register-title">
                  {status === 'expired' ? 'Link Expired' : 'Verification Failed'}
                </h3>
                <p className="auth-muted-text auth-muted-text--gap">{message}</p>
                <Link to="/register" className="register-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
                  Register Again
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default VerifyEmail;
