/**
 * contexts/AuthContext.jsx — Контекст аутентификации
 * Authentication context: user state, login, logout, register
 */

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("picmatch_user");
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  // Verify token on mount / Проверяем токен при загрузке
  useEffect(() => {
    const token = localStorage.getItem("picmatch_token");
    if (!token) { setLoading(false); return; }

    authApi.me()
      .then((data) => setUser(data))
      .catch(() => {
        localStorage.removeItem("picmatch_token");
        localStorage.removeItem("picmatch_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password });
    localStorage.setItem("picmatch_token", data.access_token);
    localStorage.setItem("picmatch_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (formData) => {
    const data = await authApi.register(formData);
    localStorage.setItem("picmatch_token", data.access_token);
    localStorage.setItem("picmatch_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("picmatch_token");
    localStorage.removeItem("picmatch_user");
    setUser(null);
  }, []);

  const isCreator = user?.role === "creator";
  const isVoter = user?.role === "voter";

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isCreator, isVoter }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
