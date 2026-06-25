/**
 * App.jsx — Root with routing + code-splitting (React.lazy)
 * All routes open to any authenticated user (unified auth).
 */
import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ThemeProvider }  from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LangProvider }   from "./contexts/LangContext";
import Navbar             from "./components/Navbar";
import ProtectedRoute     from "./components/ProtectedRoute";
import LoadingSpinner     from "./components/LoadingSpinner";

// Lazy-loaded pages — each becomes its own chunk
const Landing           = lazy(() => import("./pages/Landing"));
const Login             = lazy(() => import("./pages/Login"));
const Register          = lazy(() => import("./pages/Register"));
const VerifyEmail       = lazy(() => import("./pages/VerifyEmail"));
const ForgotPassword    = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword     = lazy(() => import("./pages/ResetPassword"));
const Dashboard         = lazy(() => import("./pages/Dashboard"));
const CreateAlbum       = lazy(() => import("./pages/CreateAlbum"));
const VotePage          = lazy(() => import("./pages/VotePage"));
const AnalyticsPage     = lazy(() => import("./pages/AnalyticsPage"));
const Notifications     = lazy(() => import("./pages/Notifications"));
const CommentThreadPage = lazy(() => import("./pages/CommentThreadPage"));

function PageFallback() {
  return <LoadingSpinner fullscreen />;
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  return user ? <Navigate to="/dashboard" replace /> : <Landing />;
}

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
                  <Route path="/"         element={<HomeRoute />} />
                  <Route path="/login"    element={<Suspense fallback={<PageFallback />}><Login /></Suspense>} />
                  <Route path="/register" element={<Suspense fallback={<PageFallback />}><Register /></Suspense>} />
                  <Route path="/verify-email" element={<Suspense fallback={<PageFallback />}><VerifyEmail /></Suspense>} />
                  <Route path="/forgot-password" element={<Suspense fallback={<PageFallback />}><ForgotPassword /></Suspense>} />
                  <Route path="/reset-password" element={<Suspense fallback={<PageFallback />}><ResetPassword /></Suspense>} />

                  {/* All auth-required routes — no role check */}
                  <Route path="/vote/:inviteCode" element={<Suspense fallback={<PageFallback />}><VotePage /></Suspense>} />
                  <Route path="/dashboard"         element={<ProtectedRoute><Suspense fallback={<PageFallback />}><Dashboard /></Suspense></ProtectedRoute>} />
                  <Route path="/inbox"             element={<ProtectedRoute><Suspense fallback={<PageFallback />}><Notifications /></Suspense></ProtectedRoute>} />
                  <Route path="/create"            element={<ProtectedRoute><Suspense fallback={<PageFallback />}><CreateAlbum /></Suspense></ProtectedRoute>} />
                  <Route path="/analytics/:albumId" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><AnalyticsPage /></Suspense></ProtectedRoute>} />
                  <Route path="/comment/:commentId" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><CommentThreadPage /></Suspense></ProtectedRoute>} />

                  <Route path="*" element={
                    <div className="min-h-[60vh] flex items-center justify-center text-center px-4">
                      <div>
                        <p className="text-7xl mb-4">🔍</p>
                        <h2 className="font-display font-bold text-3xl mb-2">404</h2>
                        <a href="/" className="btn-primary inline-flex mt-4">На главную</a>
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
