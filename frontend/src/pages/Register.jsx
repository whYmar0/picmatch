/**
 * pages/Register.jsx
 *
 * FIXES:
 *  - Inline error banner identical to Login
 *  - Role buttons have min-height so they don't collapse on narrow phones
 *  - min-h-[100dvh] + overflow-y-auto for safe scrolling on short screens
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, Eye, EyeOff, UserPlus, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";

function RoleButton({ label, desc, value, selected, onSelect }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(value)}
      className={`flex-1 min-h-[4.5rem] p-3 rounded-2xl border-2 text-left transition-all ${
        selected
          ? "border-primary-400 bg-primary-50 dark:bg-primary-900/20"
          : "border-border-light dark:border-border-dark hover:border-primary-200 dark:hover:border-primary-700"
      }`}
    >
      <p className="font-semibold text-sm">{label}</p>
      <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{desc}</p>
    </motion.button>
  );
}

export default function Register() {
  const { register } = useAuth();
  const { t }        = useLang();
  const navigate     = useNavigate();

  const [form, setForm] = useState({
    email: "", username: "", password: "", role: "voter",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const update = (key) => (e) => {
    setError("");
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const user = await register(form);
      toast.success(`Welcome to PicMatch, ${user.username}! 🎉`);
      navigate(user.role === "creator" ? "/dashboard" : "/", { replace: true });
    } catch (err) {
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
          <h1 className="font-display font-bold text-3xl">{t("registerTitle")}</h1>
          <p className="text-gray-400 text-sm mt-1">{t("registerSubtitle")}</p>
        </div>

        {/* Inline error */}
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

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Role selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t("role")}
              </label>
              <div className="flex gap-2.5">
                <RoleButton
                  label={`📸 ${t("roleCreator")}`}
                  desc="Upload albums & view results"
                  value="creator"
                  selected={form.role === "creator"}
                  onSelect={(v) => setForm((f) => ({ ...f, role: v }))}
                />
                <RoleButton
                  label={`👍 ${t("roleVoter")}`}
                  desc="Vote on shared photos"
                  value="voter"
                  selected={form.role === "voter"}
                  onSelect={(v) => setForm((f) => ({ ...f, role: v }))}
                />
              </div>
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t("username")}
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text" required minLength={3}
                  autoComplete="username"
                  value={form.username}
                  onChange={update("username")}
                  placeholder="coolphotographer"
                  className="input-field pl-10"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t("email")}
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email" required
                  autoComplete="email"
                  value={form.email}
                  onChange={update("email")}
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
                  required minLength={6}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={update("password")}
                  placeholder="Min. 6 characters"
                  className="input-field pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2
                             text-gray-400 hover:text-gray-600 transition-colors p-1"
                  tabIndex={-1}
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
                : <><UserPlus size={17} /> {t("register")}</>
              }
            </motion.button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-400 mt-5">
          {t("alreadyHaveAccount")}{" "}
          <Link to="/login" className="text-primary-500 hover:text-primary-600 font-semibold">
            {t("login")}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
