/**
 * App.jsx — Корневой компонент с маршрутизацией / Root component with routing
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { LangProvider } from "./contexts/LangContext";

import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import CreateAlbum from "./pages/CreateAlbum";
import VotePage from "./pages/VotePage";
import AnalyticsPage from "./pages/AnalyticsPage";

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AuthProvider>
          <BrowserRouter>
            {/* Toast notifications */}
            <Toaster
              position="top-center"
              toastOptions={{
                style: {
                  borderRadius: "16px",
                  background: "var(--card-bg, #fff)",
                  color: "#1a1a1a",
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "14px",
                  boxShadow: "0 8px 32px -4px rgba(0,0,0,0.14)",
                },
                success: { iconTheme: { primary: "#FFB347", secondary: "#fff" } },
                duration: 3000,
              }}
            />

            {/* Layout */}
            <div className="min-h-screen flex flex-col">
              <Navbar />
              <main className="flex-1">
                <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />

                  {/* Voting route — requires auth (any role) */}
                  <Route
                    path="/vote/:inviteCode"
                    element={
                      <ProtectedRoute>
                        <VotePage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Creator-only routes */}
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute requireCreator>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/create"
                    element={
                      <ProtectedRoute requireCreator>
                        <CreateAlbum />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/analytics/:albumId"
                    element={
                      <ProtectedRoute requireCreator>
                        <AnalyticsPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* 404 */}
                  <Route
                    path="*"
                    element={
                      <div className="min-h-[60vh] flex items-center justify-center text-center px-4">
                        <div>
                          <p className="text-7xl mb-4">🔍</p>
                          <h2 className="font-display font-bold text-3xl mb-2">404</h2>
                          <p className="text-gray-400 mb-6">Page not found / Страница не найдена</p>
                          <a href="/" className="btn-primary inline-flex">Go Home</a>
                        </div>
                      </div>
                    }
                  />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
        </AuthProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
