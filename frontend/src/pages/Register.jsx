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

  const [form, setForm] = useState({ email: "", username: "", password: "", remember: true });
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
      setError("Проверьте, что пароль соответствует всем требованиям.");
      return;
    }
    setLoading(true);
    try {
      const { remember, ...payload } = form;
      const res = await register({ ...payload, role: "creator" }, remember);
      toast.success(res.message || "Аккаунт создан");
      navigate("/dashboard", { replace: true });
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

        <div className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card p-5 sm:p-6">
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
              
              {/* Premium Password Strength Indicator */}
              {form.password.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl p-3.5 space-y-2.5"
                >
                  {/* Strength Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                      <span>{t("passwordStrength")}</span>
                      <span className={
                        (pwdStrength.length && pwdStrength.uppercase && pwdStrength.special) ? "text-green-500" :
                        (pwdStrength.length && (pwdStrength.uppercase || pwdStrength.special)) ? "text-primary-500" : "text-red-400"
                      }>
                        {(pwdStrength.length && pwdStrength.uppercase && pwdStrength.special) ? t("strengthStrong") :
                         (pwdStrength.length && (pwdStrength.uppercase || pwdStrength.special)) ? t("strengthMedium") : t("strengthWeak")}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 h-1.5">
                      <div className={`rounded-full transition-all duration-300 ${form.password.length > 0 ? (pwdStrength.length ? "bg-primary-500" : "bg-red-400") : "bg-gray-200 dark:bg-gray-800"}`} />
                      <div className={`rounded-full transition-all duration-300 ${pwdStrength.length && pwdStrength.uppercase ? "bg-primary-500" : "bg-gray-200 dark:bg-gray-800"}`} />
                      <div className={`rounded-full transition-all duration-300 ${pwdStrength.length && pwdStrength.uppercase && pwdStrength.special ? "bg-green-500" : "bg-gray-200 dark:bg-gray-800"}`} />
                    </div>
                  </div>

                  {/* Requirements List */}
                  <div className="space-y-1.5 text-xs">
                    <div className={`flex items-center gap-2 transition-colors duration-200 ${pwdStrength.length ? 'text-green-500 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {pwdStrength.length 
                        ? <CheckCircle size={13} className="text-green-500 flex-shrink-0" /> 
                        : <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-700 flex-shrink-0 flex items-center justify-center text-[9px] font-bold">1</div>
                      }
                      <span className="truncate">{t("reqMinLength")}</span>
                    </div>
                    <div className={`flex items-center gap-2 transition-colors duration-200 ${pwdStrength.uppercase ? 'text-green-500 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {pwdStrength.uppercase 
                        ? <CheckCircle size={13} className="text-green-500 flex-shrink-0" /> 
                        : <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-700 flex-shrink-0 flex items-center justify-center text-[9px] font-bold">2</div>
                      }
                      <span className="truncate">{t("reqUppercase")}</span>
                    </div>
                    <div className={`flex items-center gap-2 transition-colors duration-200 ${pwdStrength.special ? 'text-green-500 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {pwdStrength.special 
                        ? <CheckCircle size={13} className="text-green-500 flex-shrink-0" /> 
                        : <div className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-700 flex-shrink-0 flex items-center justify-center text-[9px] font-bold">3</div>
                      }
                      <span className="truncate">{t("reqSpecial")}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            <label className="remember-label">
              <input
                type="checkbox"
                checked={form.remember}
                onChange={(e) => setForm({ ...form, remember: e.target.checked })}
                className="remember-checkbox"
              />
              {t("rememberMe")}
            </label>

            <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.97 }}
              className="btn-primary w-full py-3 mt-2 rounded-full shadow-[0px_4px_10px_rgba(153,102,204,0.3)] whitespace-nowrap text-sm sm:text-base">
              {loading
                ? <motion.div animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mx-auto" />
                : <><UserPlus size={16} className="flex-shrink-0" /> {t("register") || "Register"}</>
              }
            </motion.button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-400 mt-5">
          {t("alreadyHaveAccount")}{" "}
          <Link to="/login" className="text-primary-500 hover:text-primary-600 font-semibold transition-colors">
            {t("login")}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
