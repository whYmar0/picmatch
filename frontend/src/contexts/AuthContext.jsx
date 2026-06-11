/**
 * contexts/AuthContext.jsx — Unified auth context
 * All users can create albums AND vote — no role distinction in UI.
 */
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pickmatch_user")); }
    catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("pickmatch_token");
    if (!token) { setLoading(false); return; }
    authApi.me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("pickmatch_token");
        localStorage.removeItem("pickmatch_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password });
    localStorage.setItem("pickmatch_token", data.access_token);
    localStorage.setItem("pickmatch_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (formData) => {
    const data = await authApi.register(formData);
    // Since registration now requires email verification, we don't log in immediately.
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("pickmatch_token");
    localStorage.removeItem("pickmatch_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
};
