/**
 * contexts/AuthContext.jsx — Unified auth context
 * All users can create albums AND vote — no role distinction in UI.
 */
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi, authStorage } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(authStorage.getUser()); }
    catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = authStorage.getToken();
    if (!token) { setLoading(false); return; }
    authApi.me()
      .then(setUser)
      .catch(() => {
        authStorage.clear();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password, remember = true) => {
    const data = await authApi.login({ email, password });
    authStorage.setSession(data.access_token, data.user, remember);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (formData, remember = true) => {
    const data = await authApi.register(formData);
    if (data.access_token && data.user) {
      authStorage.setSession(data.access_token, data.user, remember);
      setUser(data.user);
    }
    return data;
  }, []);

  const logout = useCallback(() => {
    authStorage.clear();
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
