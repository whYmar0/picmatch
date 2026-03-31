/**
 * pages/Login.jsx
 *
 * FIXES:
 *  - Inline error banner (red) + toast so errors are never silent
 *  - Mobile: uses min-h-[100dvh] + overflow-y-auto for short-screen safety
 *  - Input autocomplete attributes for password managers
 */

import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";

export default function Login() {
  const { login }    = useAuth();
  const { t }        = useLang();
  const navigate     = useNavigate();
  const location     = useLocation();
  const from = location.state?.from?.pathname || "/dashboard";

  const [form,    setForm]    = useState({ email: "", password: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");   // inline error message

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome back, ${user.username}! 👋`);
      navigate(user.role === "creator" ? "/dashboard" : from, { replace: true });
    } catch (err) {
      // Show inline — toast alone is easy to miss on mobile
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-10 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-7">
          <div className="w-14 h-14 bg-primary-400 rounded-3xl flex items-center
                          justify-center mx-auto mb-3 shadow-orange">
            <span className="text-2xl">📸</span>
          </div>
          <h1 className="font-display font-bold text-3xl">{t("loginTitle")}</h1>
          <p className="text-gray-400 text-sm mt-1">{t("loginSubtitle")}</p>
        </div>

        {/* Inline error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              key="err"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0,  height: "auto" }}
              exit={{    opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20
                         border border-red-200 dark:border-red-800
                         text-red-600 dark:text-red-400 text-sm
                         rounded-2xl px-4 py-3 mb-4"
            >
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form card */}
        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t("email")}
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => { setError(""); setForm({ ...form, email: e.target.value }); }}
                  placeholder="you@example.com"
                  className="input-field pl-10"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t("password")}
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPwd ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => { setError(""); setForm({ ...form, password: e.target.value }); }}
                  placeholder="••••••••"
                  className="input-field pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2
                             text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                             transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.97 }}
              className="btn-primary w-full py-3 mt-1"
            >
              {loading
                ? <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                  />
                : <><LogIn size={17} /> {t("login")}</>
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
