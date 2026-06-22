// src/contexts/useAuth.js
// Separated from AuthContext.jsx so Vite Fast Refresh works correctly.
// (Each file must export only components OR only non-components.)

import { useContext } from 'react';
import { AuthContext } from './AuthContext';

export function useAuth() {
  return useContext(AuthContext);
}
