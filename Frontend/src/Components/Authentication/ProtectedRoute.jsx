import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';

// LOW-NEW-3: No longer makes its own API call per mount.
// Reads auth status from the global AuthContext (verified once on app load).
// Shows nothing while checking (avoids flashing the login page).
export default function ProtectedRoute({ children }) {
  const { authStatus } = useAuth();

  if (authStatus === 'checking') {
    return null; // silent wait — no flash
  }

  if (authStatus === 'unauthed') {
    return <Navigate to="/login" replace />;
  }

  return children;
}