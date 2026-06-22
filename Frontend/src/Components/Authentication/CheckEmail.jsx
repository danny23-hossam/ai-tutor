import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Register.css';
import AuthHeader from './AuthHeader';

const CheckEmail = () => {
  // Sync dark mode preference (no toggle on auth pages)
  useEffect(() => {
    if (localStorage.getItem('darkmode') === 'true') {
      document.body.classList.add('darkmode');
    } else {
      document.body.classList.remove('darkmode');
    }
  }, []);

  return (
    <div className="register-container">
      <AuthHeader />

      <main className="registermain">
        <div className="registerform auth-form-center">
          <div className="auth-status-icon" aria-hidden="true">📧</div>

          <h3 className="register-title">Check your inbox</h3>
          <p className="auth-muted-text auth-muted-text--gap">
            We sent a verification link to your email address.
            Click the link in that email to activate your account.
          </p>
          <p className="auth-muted-text auth-muted-text--sm auth-muted-text--gap">
            The link expires in <strong>24 hours</strong>. Check your spam folder if you don't see it.
          </p>

          <Link to="/login" className="auth-link">
            Already verified? Sign in →
          </Link>
        </div>
      </main>
    </div>
  );
};

export default CheckEmail;
