/**
 * components/AlbumCard.jsx
 *
 * CHANGES:
 *  - No visible border (card class now border-free)
 *  - Smart share: navigator.share() on mobile, clipboard on desktop
 *  - Truncated filenames and invite URLs
 *  - Photo count badge on thumbnail strip
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Copy, Check, BarChart2, Trash2, Image, Clock } from "lucide-react";
import { useLang } from "../contexts/LangContext";

function timeAgo(dateStr) {
  const s = (Date.now() - new Date(dateStr)) / 1000;
  if (s < 60)      return "just now";
  if (s < 3600)    return `${Math.floor(s / 60)}m`;
  if (s < 86400)   return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

async function smartCopy(text) {
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  if (isMobile && navigator.share) {
    try { await navigator.share({ title: "PicMatch vote", url: text }); return true; }
    catch { /* cancelled */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    return true;
  }
}

export default function AlbumCard({ album, onDelete, index }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.preventDefault();
    const ok = await smartCopy(album.invite_url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = (e) => {
    e.preventDefault();
    if (window.confirm(`Delete "${album.title}"?`)) onDelete(album.id);
  };

  const previewPhotos = (album.photos || []).slice(0, 3);
  const extra = Math.max(0, (album.photo_count || 0) - previewPhotos.length);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3 }}
      className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card
                 hover:shadow-card-hover transition-shadow flex flex-col gap-3 p-4"
    >
      {/* Thumbnail strip */}
      <div className="relative h-28 rounded-2xl overflow-hidden
                      bg-border-light dark:bg-border-dark flex-shrink-0">
        {previewPhotos.length > 0 ? (
          <div className="flex h-full gap-0.5">
            {previewPhotos.map((photo, i) => (
              <div key={photo.id}
                className={`h-full overflow-hidden ${i === 0 ? "flex-[2]" : "flex-1"}`}>
                <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
            {extra > 0 && (
              <div className="absolute right-0 top-0 bottom-0 w-9
                              bg-black/50 flex items-center justify-center">
                <span className="text-white text-xs font-bold">+{extra}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center flex-col gap-1">
            <Image size={24} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}
        {/* Count badge */}
        <span className="absolute top-2 left-2 bg-black/50 text-white
                         text-[10px] font-semibold px-2 py-0.5 rounded-lg">
          {album.photo_count ?? 0} {t("photos")}
        </span>
      </div>

      {/* Title + meta */}
      <div className="min-w-0">
        <h3 className="font-semibold text-sm truncate">{album.title}</h3>
        <span className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
          <Clock size={10} /> {timeAgo(album.created_at)}
        </span>
      </div>

      {/* Invite link */}
      <div className="flex items-center gap-2 bg-border-light dark:bg-border-dark
                      rounded-xl px-3 py-2 min-w-0">
        <span className="text-[10px] text-gray-400 truncate flex-1 font-mono">
          {album.invite_url.replace(/^https?:\/\//, "")}
        </span>
        <motion.button
          onClick={handleCopy}
          whileTap={{ scale: 0.82 }}
          className="flex-shrink-0 text-primary-400 hover:text-primary-500 transition-colors"
          aria-label={t("copyLink")}
        >
          {copied
            ? <Check size={13} className="text-green-500" />
            : <Copy size={13} />
          }
        </motion.button>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Link to={`/analytics/${album.id}`}
          className="flex-1 btn-primary text-xs py-2 justify-center">
          <BarChart2 size={13} /> {t("viewAnalytics")}
        </Link>
        <motion.button
          onClick={handleDelete}
          whileTap={{ scale: 0.9 }}
          className="w-9 h-9 flex items-center justify-center rounded-xl
                     text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          aria-label={t("deleteAlbum")}
        >
          <Trash2 size={14} />
        </motion.button>
      </div>
    </motion.div>
  );
}
