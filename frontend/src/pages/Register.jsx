/**
 * pages/Register.jsx — Unified registration with email verification & password requirements
 */
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, Eye, EyeOff, UserPlus, AlertCircle, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";

export default function Register() {
  const { register } = useAuth();
  const { t }        = useLang();
  const navigate     = useNavigate();

  const [form, setForm] = useState({ email: "", username: "", password: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  
  // Password validation state
  const [pwdStrength, setPwdStrength] = useState({
    length: false,
    uppercase: false,
    special: false
  });

  useEffect(() => {
    setPwdStrength({
      length: form.password.length >= 8,
      uppercase: /[A-Z]/.test(form.password),
      special: /[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/.test(form.password)
    });
  }, [form.password]);

  const update = (key) => (e) => {
    setError("");
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pwdStrength.length || !pwdStrength.uppercase || !pwdStrength.special) {
      setError("Please ensure your password meets all requirements.");
      return;
    }
    setLoading(true);
    try {
      const res = await register({ ...form, role: "creator" });
      if (res.requires_verification) {
        toast.success(res.message || "Registration successful! Please verify your email.");
        navigate(`/verify-email?email=${encodeURIComponent(form.email)}`, { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-10 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-7">
          <div className="flex items-center justify-center mx-auto mb-4">
            <img src="/pickmatch_logo.png" alt="Pickmatch Logo" className="h-16 w-auto object-contain" />
          </div>
          <h1 className="font-display font-bold text-3xl">{t("registerTitle") || "Create an Account"}</h1>
          <p className="text-gray-400 text-sm mt-1">{t("registerSubtitle") || "Join Pickmatch to share and vote."}</p>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              key="err"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20
                         border border-red-200 dark:border-red-800
                         text-red-600 dark:text-red-400 text-sm
                         rounded-2xl px-4 py-3 mb-4"
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t("username")}
              </label>
              <div className="relative">
                <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" required minLength={3} autoComplete="username"
                  value={form.username} onChange={update("username")}
                  placeholder="coolphotographer" className="input-field pl-10" />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t("email")}
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="email" required autoComplete="email"
                  value={form.email} onChange={update("email")}
                  placeholder="you@example.com" className="input-field pl-10" />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t("password")}
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type={showPwd ? "text" : "password"} required minLength={8}
                  autoComplete="new-password"
                  value={form.password} onChange={update("password")}
                  placeholder="Create password" className="input-field pl-10 pr-11" />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2
                             text-gray-400 hover:text-gray-600 transition-colors p-1">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              
              {/* Password Strength Indicator */}
              {form.password.length > 0 && (
                <div className="mt-2 space-y-1 text-xs px-1">
                  <p className="text-gray-500 mb-1">Password must contain:</p>
                  <div className={`flex items-center gap-1.5 ${pwdStrength.length ? 'text-green-500' : 'text-gray-400'}`}>
                    {pwdStrength.length ? <CheckCircle size={12} /> : <div className="w-3 h-3 rounded-full border border-current" />}
                    At least 8 characters
                  </div>
                  <div className={`flex items-center gap-1.5 ${pwdStrength.uppercase ? 'text-green-500' : 'text-gray-400'}`}>
                    {pwdStrength.uppercase ? <CheckCircle size={12} /> : <div className="w-3 h-3 rounded-full border border-current" />}
                    At least 1 uppercase letter
                  </div>
                  <div className={`flex items-center gap-1.5 ${pwdStrength.special ? 'text-green-500' : 'text-gray-400'}`}>
                    {pwdStrength.special ? <CheckCircle size={12} /> : <div className="w-3 h-3 rounded-full border border-current" />}
                    At least 1 special character
                  </div>
                </div>
              )}
            </div>

            <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.97 }}
              className="btn-primary w-full py-3 mt-1 rounded-full shadow-[0px_4px_10px_rgba(153,102,204,0.3)]">
              {loading
                ? <motion.div animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mx-auto" />
                : <><UserPlus size={16} /> {t("register") || "Register"}</>
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
