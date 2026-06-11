/**
 * App.jsx — Root with routing
 * All routes open to any authenticated user (unified auth).
 */
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ThemeProvider }  from "./contexts/ThemeContext";
import { AuthProvider }   from "./contexts/AuthContext";
import { LangProvider }   from "./contexts/LangContext";
import Navbar             from "./components/Navbar";
import ProtectedRoute     from "./components/ProtectedRoute";
import Landing            from "./pages/Landing";
import Login              from "./pages/Login";
import Register           from "./pages/Register";
import VerifyEmail        from "./pages/VerifyEmail";
import ForgotPassword     from "./pages/ForgotPassword";
import ResetPassword      from "./pages/ResetPassword";
import Dashboard          from "./pages/Dashboard";
import CreateAlbum        from "./pages/CreateAlbum";
import VotePage           from "./pages/VotePage";
import AnalyticsPage      from "./pages/AnalyticsPage";
import Notifications      from "./pages/Notifications";
import CommentThreadPage  from "./pages/CommentThreadPage";

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AuthProvider>
          <BrowserRouter>
            <Toaster
              position="top-center"
              toastOptions={{
                style: {
                  borderRadius: "16px",
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "14px",
                  boxShadow: "0 10px 40px -10px rgba(0,0,0,0.3)",
                  background: "var(--card-bg)",
                  color: "var(--text-main)",
                  border: "1px solid rgba(128,128,128,0.15)",
                },
                success: { iconTheme: { primary: "#9966CC", secondary: "#fff" } },
                duration: 3000,
              }}
            />
            <div className="min-h-screen flex flex-col overflow-x-hidden">
              <Navbar />
              <main className="flex-1 overflow-x-hidden">
                <Routes>
                  <Route path="/"         element={<Landing />} />
                  <Route path="/login"    element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/verify-email" element={<VerifyEmail />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />

                  {/* All auth-required routes — no role check */}
                  <Route path="/vote/:inviteCode" element={<VotePage />} />
                  <Route path="/dashboard"         element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/inbox"             element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                  <Route path="/create"            element={<ProtectedRoute><CreateAlbum /></ProtectedRoute>} />
                  <Route path="/analytics/:albumId" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
                  <Route path="/comment/:commentId" element={<ProtectedRoute><CommentThreadPage /></ProtectedRoute>} />

                  <Route path="*" element={
                    <div className="min-h-[60vh] flex items-center justify-center text-center px-4">
                      <div>
                        <p className="text-7xl mb-4">🔍</p>
                        <h2 className="font-display font-bold text-3xl mb-2">404</h2>
                        <a href="/" className="btn-primary inline-flex mt-4">Go Home</a>
                      </div>
                    </div>
                  } />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
        </AuthProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
