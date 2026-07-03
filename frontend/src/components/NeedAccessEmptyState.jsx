/**
 * NeedAccessEmptyState.jsx
 *
 * Friendly fallback page shown when a share-link visitor has no access:
 *   - invalid / expired token
 *   - token rotated out
 *   - album deleted
 *
 * Mirrors the 403 fallback in pages/AnalyticsPage.jsx so the share-link
 * route and the analytics-by-id route feel consistent when access is
 * missing.
 */
import { motion } from "framer-motion";
import { Lock, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLang } from "../contexts/LangContext";

export default function NeedAccessEmptyState() {
  const { t } = useLang();
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="max-w-md w-full text-center space-y-5"
      >
        <div className="mx-auto w-20 h-20 rounded-3xl flex items-center justify-center
                        bg-amber-50 dark:bg-amber-900/20
                        border border-amber-200/60 dark:border-amber-900/40">
          <motion.div
            initial={{ scale: 0.85, rotate: -4 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
          >
            <Lock size={28} className="text-amber-500" />
          </motion.div>
        </div>

        <div className="space-y-1.5">
          <h2 className="font-display font-bold text-2xl">
            {t("needAccessTitle")}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
            {t("needAccessBody")}
          </p>
        </div>

        <button
          onClick={() => navigate("/dashboard")}
          className="btn-primary inline-flex items-center gap-2 px-5 py-2.5"
        >
          <ArrowLeft size={15} />
          {t("backToAlbums")}
        </button>
      </motion.div>
    </div>
  );
}
