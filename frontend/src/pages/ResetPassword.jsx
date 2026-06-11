import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "../api";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  
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
      setError("Please ensure your password meets all requirements.");
      return;
    }
    
    setLoading(true);
    setError("");
    try {
      await authApi.resetPassword({ token, password });
      setSuccess(true);
      toast.success("Password reset successfully!");
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 2000);
    } catch (err) {
      setError(err.message || "Failed to reset password.");
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
          <h1 className="font-display font-bold text-3xl">Set New Password</h1>
          <p className="text-gray-400 text-sm mt-2">
            Please create a new password for your account.
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
              <span>Password has been reset! Redirecting to login...</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                New Password
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type={showPwd ? "text" : "password"} 
                  required 
                  minLength={8}
                  value={password} 
                  onChange={(e) => { setError(""); setPassword(e.target.value); }}
                  placeholder="Create new password" 
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
              
              {/* Password Strength Indicator */}
              {password.length > 0 && (
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

            <motion.button 
              type="submit" 
              disabled={loading || success || !pwdStrength.length || !pwdStrength.uppercase || !pwdStrength.special} 
              whileTap={{ scale: 0.97 }}
              className="btn-primary w-full py-3 mt-1 rounded-full shadow-[0px_4px_10px_rgba(153,102,204,0.3)] disabled:opacity-50"
            >
              {loading
                ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }} className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mx-auto" />
                : "Reset Password"
              }
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
