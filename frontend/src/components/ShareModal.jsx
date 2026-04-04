/**
 * ShareModal.jsx — Bottom sheet for sharing an album with another user
 * Shows current shared users + add new share by username/email
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { UserPlus, Trash2, Check } from "lucide-react";
import toast from "react-hot-toast";
import { sharedApi } from "../api";
import { useLang } from "../contexts/LangContext";
import BottomSheet from "./BottomSheet";

export default function ShareModal({ album, open, onClose }) {
  const { t } = useLang();
  const [shares,  setShares]  = useState([]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !album) return;
    sharedApi.listShares(album.id)
      .then(setShares)
      .catch(() => {});
  }, [open, album]);

  const handleShare = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    try {
      const newAccess = await sharedApi.shareAlbum(album.id, {
        username_or_email: input.trim(),
        can_view_stats: true,
      });
      setShares((prev) => [...prev, newAccess]);
      setInput("");
      toast.success(t("shareSuccess"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (accessId) => {
    try {
      await sharedApi.revokeShare(album.id, accessId);
      setShares((prev) => prev.filter((s) => s.id !== accessId));
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t("sharedAccess")}>
      {/* Add user form */}
      <form onSubmit={handleShare} className="flex gap-2 mb-5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("shareWithUser")}
          className="input-field flex-1 py-2 text-sm"
        />
        <motion.button
          type="submit"
          disabled={loading || !input.trim()}
          whileTap={{ scale: 0.92 }}
          className="btn-primary px-4 py-2 text-sm"
        >
          {loading
            ? <motion.div animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
            : <UserPlus size={16} />
          }
        </motion.button>
      </form>

      {/* Current shares */}
      {shares.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-6">{t("noSharedAlbums")}</p>
      ) : (
        <div className="space-y-1">
          {shares.map((acc) => (
            <div key={acc.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-2xl
                         bg-border-light dark:bg-border-dark">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30
                                flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary-500">
                    {acc.user?.username?.[0]?.toUpperCase() ?? "?"}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{acc.user?.username}</p>
                  <p className="text-[10px] text-gray-400 flex items-center gap-1">
                    <Check size={9} className="text-green-500" />
                    {t("viewAnalytics")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRevoke(acc.id)}
                className="text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30
                           w-8 h-8 flex items-center justify-center rounded-xl
                           transition-colors flex-shrink-0"
                aria-label={t("revokeAccess")}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
