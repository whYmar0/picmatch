/**
 * pages/Login.jsx — Clean, fully translated, inline error banner.
 */
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";

export default function Login() {
  const { login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/dashboard";

  const [form, setForm] = useState({ email: "", password: "", remember: true });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(form.email, form.password, form.remember);
      toast.success(`${t("login")} ✓ @${user.username}`);
      navigate(from === "/" ? "/dashboard" : from, { replace: true });
    } catch (err) {
      setError(err.message);    // inline — no page refresh
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-10 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-7">
          <div className="flex items-center justify-center mx-auto mb-4">
            <img src="/pickmatch_logo.png" alt="Pickmatch Logo" className="h-16 w-auto object-contain" />
          </div>
          <h1 className="font-display font-bold text-3xl">{t("loginTitle")}</h1>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div key="err"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20
                         border border-red-200 dark:border-red-800
                         text-red-600 dark:text-red-400 text-sm
                         rounded-2xl px-4 py-3 mb-4"
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span className="break-words">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t("email")}
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="email" required autoComplete="email"
                  value={form.email}
                  onChange={(e) => { setError(""); setForm({ ...form, email: e.target.value }); }}
                  placeholder="you@example.com"
                  className="input-field pl-10" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t("password")}
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type={showPwd ? "text" : "password"} required autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => { setError(""); setForm({ ...form, password: e.target.value }); }}
                  placeholder="••••••••"
                  className="input-field pl-10 pr-11" />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2
                             text-gray-400 hover:text-gray-600 transition-colors p-1">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="remember-label">
                <input
                  type="checkbox"
                  checked={form.remember}
                  onChange={(e) => setForm({ ...form, remember: e.target.checked })}
                  className="remember-checkbox"
                />
                {t("rememberMe")}
              </label>
              <Link to="/forgot-password" className="font-semibold text-primary-500 hover:text-primary-600">
                {t("forgotPassword")}
              </Link>
            </div>

            <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.97 }}
              className="btn-primary w-full py-3 mt-1">
              {loading
                ? <motion.div animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                : <><LogIn size={16} /> {t("login")}</>
              }
            </motion.button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-400 mt-5">
          {t("dontHaveAccount")}{" "}
          <Link to="/register" className="text-primary-500 hover:text-primary-600 font-semibold">
            {t("register")}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
