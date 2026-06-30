/**
 * components/ProtectedRoute.jsx
 * Redirects unauthenticated users. No role check — all users are unified.
 */
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import LoadingSpinner from "./LoadingSpinner";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingSpinner fullscreen />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  // Блокируем доступ к защищённым страницам, если email не подтверждён
  if (!user.is_verified) {
    return <Navigate to={`/verify-email?email=${encodeURIComponent(user.email)}`} replace />;
  }
  return children;
}
