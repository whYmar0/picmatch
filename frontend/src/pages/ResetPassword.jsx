import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { authApi, authStorage } from "../api";
import { useLang } from "../contexts/LangContext";

export default function ResetPassword() {
  const { t } = useLang();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [remember, setRemember] = useState(true);
  
  // Password validation state
  const [pwdStrength, setPwdStrength] = useState({
    length: false,
    uppercase: false,
    special: false
  });

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
    }
  }, [token, navigate]);

  useEffect(() => {
    setPwdStrength({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      special: /[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/.test(password)
    });
  }, [password]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pwdStrength.length || !pwdStrength.uppercase || !pwdStrength.special) {
      setError("Пароль должен соответствовать всем требованиям.");
      return;
    }
    
    setLoading(true);
    setError("");
    try {
      const data = await authApi.resetPassword({ token, password });
      if (data.access_token && data.user) {
        authStorage.setSession(data.access_token, data.user, remember);
      }
      setSuccess(true);
      toast.success(t("passwordResetSuccess"));
      setTimeout(() => {
        navigate(data.access_token ? "/dashboard" : "/login", { replace: true });
      }, 900);
    } catch (err) {
      setError(err.message || t("errorGeneric"));
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
          <h1 className="font-display font-bold text-3xl">{t("resetPassword")}</h1>
          <p className="text-gray-400 text-sm mt-2">
            {t("setNewPasswordSubtitle")}
          </p>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              key="err"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm rounded-2xl px-4 py-3 mb-4"
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
          
          {success && (
            <motion.div
              key="succ"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 text-sm rounded-2xl px-4 py-3 mb-4"
            >
              <CheckCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{t("passwordResetSuccess")}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t("newPassword")}
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type={showPwd ? "text" : "password"} 
                  required 
                  minLength={8}
                  value={password} 
                  onChange={(e) => { setError(""); setPassword(e.target.value); }}
                  placeholder="••••••••" 
                  className="input-field pl-10 pr-11" 
                  disabled={success}
                />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                  disabled={success}
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              
              {/* Premium Password Strength Indicator */}
              {password.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl p-3.5 space-y-2.5"
                >
                  {/* Strength Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">
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
                      <div className={`rounded-full transition-all duration-300 ${password.length > 0 ? (pwdStrength.length ? "bg-primary-500" : "bg-red-400") : "bg-gray-200 dark:bg-gray-800"}`} />
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

            <div className="flex items-center gap-2 text-sm pt-1">
              <label className="flex items-center gap-2 text-gray-500 dark:text-gray-400 select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-400"
                />
                {t("rememberMe")}
              </label>
            </div>

            <motion.button 
              type="submit" 
              disabled={loading || success || !pwdStrength.length || !pwdStrength.uppercase || !pwdStrength.special} 
              whileTap={{ scale: 0.97 }}
              className="btn-primary w-full py-3 mt-2 shadow-[0px_4px_10px_rgba(153,102,204,0.3)] disabled:opacity-50 whitespace-nowrap text-sm sm:text-base"
            >
              {loading
                ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }} className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mx-auto" />
                : t("resetPassword")
              }
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
