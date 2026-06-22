// src/contexts/AuthContext.jsx
// Exports AuthProvider component only.
// useAuth hook is in ./useAuth.js — keeping them separate satisfies
// Vite's Fast Refresh requirement (a file must export ONLY components
// OR only non-components — not both).

import { createContext, useState, useEffect } from 'react';
import apiClient from '../api/apiClient';

// Export the context object so useAuth.js can read it
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // 'checking' while verifying cookie on startup
  // 'authed'   cookie is valid
  // 'unauthed' no cookie / expired / error
  const [authStatus, setAuthStatus] = useState('checking');

  useEffect(() => {
    apiClient.get('/users/profile')
      .then(() => setAuthStatus('authed'))
      .catch(() => {
        // Race condition guard: only downgrade to 'unauthed' if nothing else
        // has already updated the status (e.g. a login that happened while
        // this startup check was still in flight).
        setAuthStatus((current) => current === 'checking' ? 'unauthed' : current);
      });
  }, []); // runs once on app load — not on every page change

  return (
    <AuthContext.Provider value={{ authStatus, setAuthStatus }}>
      {children}
    </AuthContext.Provider>
  );
}
