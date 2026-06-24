import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import { authApi } from "../api";
import { useLang } from "../contexts/LangContext";

export default function ForgotPassword() {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [remember, setRemember] = useState(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setError(t("errorEnterEmail"));
      return;
    }
    
    setLoading(true);
    setError("");
    try {
      await authApi.forgotPassword({ email });
      setSuccess(true);
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
        <div className="mb-4">
          <Link to="/login" className="inline-flex items-center text-sm text-gray-500 hover:text-primary-500 transition-colors">
            <ArrowLeft size={16} className="mr-1" /> {t("backToLogin")}
          </Link>
        </div>
        
        <div className="text-center mb-7">
          <h1 className="font-display font-bold text-3xl">{t("forgotPassword")}</h1>
          <p className="text-gray-400 text-sm mt-2">
            {t("forgotPasswordSubtitle")}
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
              <span>{t("resetLinkSent")}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t("email")}
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="email" 
                  required 
                  value={email}
                  onChange={(e) => { setError(""); setEmail(e.target.value); }}
                  placeholder="you@example.com" 
                  className="input-field pl-10" 
                  disabled={success}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 text-sm pt-1">
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
              disabled={loading || success || !email} 
              whileTap={{ scale: 0.97 }}
              className="btn-primary w-full py-3 mt-1 shadow-[0px_4px_10px_rgba(153,102,204,0.3)] disabled:opacity-50"
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
