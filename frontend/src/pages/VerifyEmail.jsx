import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, AlertCircle, CheckCircle, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "../api";
import { useLang } from "../contexts/LangContext";

export default function VerifyEmail() {
  const { t } = useLang();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!email) {
      navigate("/register", { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError(t("errorVerifyCode"));
      return;
    }
    
    setLoading(true);
    setError("");
    try {
      await authApi.verifyEmail({ email, code });
      setSuccess(true);
      toast.success(t("emailVerifiedSuccess"));
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 2000);
    } catch (err) {
      setError(err.message || t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    
    setResendLoading(true);
    setError("");
    try {
      await authApi.resendVerification({ email });
      toast.success(t("resetLinkSent"));
      setCountdown(60); // 60 seconds cooldown
    } catch (err) {
      setError(err.message || t("errorGeneric"));
    } finally {
      setResendLoading(false);
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
          <div className="flex items-center justify-center mx-auto mb-4 w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full">
            <Mail className="text-primary-500" size={32} />
          </div>
          <h1 className="font-display font-bold text-3xl">{t("verifyEmailTitle")}</h1>
          <p className="text-gray-400 text-sm mt-2">
            We've sent a 6-digit verification code to <br/>
            <span className="font-semibold text-gray-700 dark:text-gray-200">{email}</span>
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
              <span>{t("emailVerifiedSuccess")}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 text-center block">
                {t("verifyEmailCode")}
              </label>
              <input 
                type="text" 
                maxLength={6}
                required
                value={code}
                onChange={(e) => {
                  setError("");
                  setCode(e.target.value.replace(/[^0-9]/g, ''));
                }}
                className="w-full text-center text-3xl tracking-[0.5em] font-bold py-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                placeholder="000000"
              />
            </div>

            <motion.button 
              type="submit" 
              disabled={loading || code.length !== 6 || success} 
              whileTap={{ scale: 0.97 }}
              className="btn-primary w-full py-3 shadow-[0px_4px_10px_rgba(153,102,204,0.3)] disabled:opacity-50"
            >
              {loading
                ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }} className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mx-auto" />
                : t("verifyAccountBtn")
              }
            </motion.button>
          </form>
          
          <div className="mt-6 text-center">
            <button
              onClick={handleResend}
              disabled={countdown > 0 || resendLoading || success}
              className="text-sm text-gray-500 hover:text-primary-500 flex items-center justify-center gap-2 mx-auto transition-colors disabled:opacity-50"
            >
              {resendLoading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {countdown > 0 ? `${t("resendCodeTimer")}${countdown}s` : t("resendCode")}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
