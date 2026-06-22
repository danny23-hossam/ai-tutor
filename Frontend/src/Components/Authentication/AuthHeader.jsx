import React from 'react';

/**
 * AuthHeader — shared brand wordmark for all auth pages.
 * (Register, ResetPassword, VerifyEmail, CheckEmail)
 *
 * Replaces the icon-in-rounded-box anti-pattern with a clean
 * inline wordmark: orange icon + "Papyrus" in 800 weight.
 */
const AuthHeader = () => (
  <header className="registerheader">
    <a href="/login" className="auth-brand" aria-label="Papyrus home">
      <i className="bi bi-book auth-brand-icon" aria-hidden="true" />
      <span className="auth-brand-name">Papyrus</span>
    </a>
  </header>
);

export default AuthHeader;
