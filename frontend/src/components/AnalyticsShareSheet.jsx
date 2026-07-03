/**
 * AnalyticsShareSheet.jsx
 *
 * Bottom sheet that owns the analytics share-link flow:
 *   - On open: lazily generate (or fetch) the album's share token via
 *     POST /api/albums/<id>/share-token.
 *   - Copy the public URL with smartShare (mobile share sheet → clipboard
 *     → textarea fallback), mirroring AlbumSummary's helper.
 *   - Regenerate the token with a confirm step that warns about invalidating
 *     the previous link.
 *
 * Replaces the prior stub share button on AlbumSummary that just copied
 * `window.location.href` to /analytics/:albumId (useless for any user
 * except the owner + blocked for private albums).
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Link2, RefreshCw, Loader2, Info } from "lucide-react";
import toast from "react-hot-toast";

import { albumsApi } from "../api";
import { useLang } from "../contexts/LangContext";
import BottomSheet from "./BottomSheet";

// Same fallback chain as smartShare() in AlbumSummary — keeps parity.
// `title` is supplied by the caller (typically t("appName")) so the
// navigator.share sheet on mobile shows the localized brand.
async function copyLink(url, title) {
  if (typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent || "") && navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch {
      // user cancelled or share API unsupported — fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export default function AnalyticsShareSheet({ open, onClose, albumId, zIndex = 50 }) {
  const { t } = useLang();

  const [url,       setUrl]      = useState("");
  const [copied,    setCopied]   = useState(false);
  const [loading,   setLoading]  = useState(false);
  const [rotating,  setRotating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errored,   setErrored]  = useState(false);

  // Lazy-load (or refetch) the token every time the sheet opens the first
  // time, OR after a successful rotation. `t` is intentionally excluded
  // from deps — toggling language shouldn't re-fire the network call;
  // the in-sheet banner handles error messaging instead.
  useEffect(() => {
    if (!open || !albumId) return;
    setErrored(false);
    setLoading(true);
    albumsApi
      .getShareToken(albumId)
      .then((out) => setUrl(out?.share_url ?? ""))
      .catch(() => {
        setErrored(true);
        // Banner below is the authoritative error surface.
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, albumId]);

  const handleCopy = async () => {
    if (!url) return;
    await copyLink(url, t("appName"));
    setCopied(true);
    toast.success(t("shareLinkCopied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRotate = async () => {
    setConfirmOpen(false);
    setRotating(true);
    try {
      const out = await albumsApi.rotateShareToken(albumId);
      setUrl(out?.share_url ?? "");
      toast.success(t("regenerateLinkDone"));
    } catch {
      toast.error(t("regenerateLinkFailed"));
    } finally {
      setRotating(false);
    }
  };

  const truncated = (raw) => {
    if (!raw) return "";
    if (raw.length <= 48) return raw;
    return raw.slice(0, 26) + "…" + raw.slice(-16);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t("shareAnalytics")} zIndex={zIndex}>
      <div className="space-y-5 pt-1">
        {/* Hint */}
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          {t("shareAnalyticsHint")}
        </p>

        {/* URL display + Copy */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3.5 bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
            <Link2 size={16} className="text-gray-400 flex-shrink-0" />
            {loading || !url ? (
              <div className="flex-1 flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" />
                <span>…</span>
              </div>
            ) : (
              <p
                className="flex-1 text-sm font-mono truncate text-gray-700 dark:text-gray-200 select-all"
                title={url}
              >
                {truncated(url)}
              </p>
            )}
            <motion.button
              onClick={handleCopy}
              disabled={!url || loading}
              whileTap={{ scale: 0.9 }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 ${
                copied
                  ? "bg-green-500 text-white"
                  : url
                    ? "bg-primary-500 text-white hover:bg-primary-600"
                    : "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
              }`}
              aria-label={t("copyLink")}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </motion.button>
          </div>

          {errored && (
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-red-50 dark:bg-red-900/15 text-red-600 dark:text-red-400 text-sm">
              <Info size={15} className="mt-0.5 flex-shrink-0" />
              <span>{t("shareLinkError")}</span>
            </div>
          )}
        </div>

        {/* Link management */}
        <div className="space-y-2 pt-2 border-t border-border-light dark:border-border-dark">
          <div className="flex items-center justify-between pt-3">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {t("linkManagement")}
            </h4>
          </div>

          {!confirmOpen ? (
            <motion.button
              onClick={() => setConfirmOpen(true)}
              disabled={loading || rotating || errored}
              whileTap={{ scale: 0.97 }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl
                         text-sm font-semibold
                         bg-border-light dark:bg-border-dark
                         text-gray-700 dark:text-gray-200
                         hover:bg-red-50 hover:text-red-600
                         dark:hover:bg-red-900/15 dark:hover:text-red-400
                         transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} />
              {t("regenerateLink")}
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="rounded-2xl border border-red-200 dark:border-red-900/40
                         bg-red-50/70 dark:bg-red-900/10 p-4 space-y-3"
            >
              <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
                {t("regenerateLinkConfirm")}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmOpen(false)}
                  disabled={rotating}
                  className="flex-1 py-2.5 rounded-2xl text-sm font-semibold
                             bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200
                             hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  {t("clearFilter")}
                </button>
                <button
                  onClick={handleRotate}
                  disabled={rotating}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold
                             bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-70"
                >
                  {rotating && <Loader2 size={14} className="animate-spin" />}
                  {t("regenerateLink")}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
