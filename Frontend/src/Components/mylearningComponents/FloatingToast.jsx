import React, { useEffect } from 'react';
import './FloatingToast.css';

/**
 * FloatingToast — slides in from top-right, auto-dismisses after `duration` ms.
 * Props:
 *   message  string   — the text to show (null/empty = hidden)
 *   type     string   — 'error' | 'success' | 'info'  (default 'error')
 *   onClose  fn       — called when dismissed or auto-expired
 *   duration number   — ms before auto-close (default 5000)
 */
function FloatingToast({ message, type = 'error', onClose, duration = 5000 }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [message, duration, onClose]);

  if (!message) return null;

  const icons = { error: '⚠️', success: '✅', info: 'ℹ️' };

  return (
    <div className={`ft-toast ft-toast--${type}`} role="alert" aria-live="assertive">
      <span className="ft-toast__icon" aria-hidden="true">{icons[type] ?? '⚠️'}</span>
      <span className="ft-toast__msg">{message}</span>
      <button className="ft-toast__close" onClick={onClose} aria-label="Dismiss notification">✕</button>
    </div>
  );
}

export default FloatingToast;
