/**
 * components/ProtectedRoute.jsx — Защищённый маршрут
 * Redirects unauthenticated users to /login
 * Перенаправляет неаутентифицированных пользователей на /login
 */

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import LoadingSpinner from "./LoadingSpinner";

export default function ProtectedRoute({ children, requireCreator = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingSpinner fullscreen />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireCreator && user.role !== "creator") {
    return <Navigate to="/" replace />;
  }

  return children;
}
