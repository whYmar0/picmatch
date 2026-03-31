/**
 * components/AlbumCard.jsx
 *
 * FIXES:
 *  - album.photos is now always present (AlbumOut schema updated on backend)
 *    but we still guard with ?. for safety
 *  - Shows a "no photos" placeholder with photo count badge instead of
 *    silently rendering an empty grey box
 *  - invite_url copy button works for any URL, not just localhost:5173
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Copy, Check, BarChart2, Trash2, Image, Clock } from "lucide-react";
import { useLang } from "../contexts/LangContext";

function timeAgo(dateStr) {
  const s = (Date.now() - new Date(dateStr)) / 1000;
  if (s < 60)      return "just now";
  if (s < 3600)    return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)   return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function AlbumCard({ album, onDelete, index }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(album.invite_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for HTTP contexts where clipboard API is blocked
      const ta = document.createElement("textarea");
      ta.value = album.invite_url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = (e) => {
    e.preventDefault();
    if (window.confirm(`Delete "${album.title}"?`)) onDelete(album.id);
  };

  const previewPhotos = (album.photos || []).slice(0, 3);
  const extra = (album.photo_count || 0) - previewPhotos.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.32 }}
      className="card p-4 flex flex-col gap-3 hover:shadow-card-hover transition-shadow"
    >
      {/* ── Preview thumbnails ── */}
      <div className="relative h-32 rounded-2xl overflow-hidden bg-border-light dark:bg-border-dark flex-shrink-0">
        {previewPhotos.length > 0 ? (
          <div className="flex h-full gap-0.5">
            {previewPhotos.map((photo, i) => (
              <div
                key={photo.id}
                className={`h-full overflow-hidden ${i === 0 ? "flex-[2]" : "flex-1"}`}
              >
                <img
                  src={photo.url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
            {extra > 0 && (
              <div className="absolute right-0 top-0 bottom-0 w-10
                              bg-black/50 flex items-center justify-center">
                <span className="text-white text-xs font-bold">+{extra}</span>
              </div>
            )}
          </div>
        ) : (
          /* Empty state — photo count not yet known / uploads in progress */
          <div className="flex h-full items-center justify-center flex-col gap-1">
            <Image size={28} className="text-gray-300 dark:text-gray-600" />
            <span className="text-xs text-gray-400">
              {album.photo_count ?? 0} {t("photos")}
            </span>
          </div>
        )}

        {/* Photo count badge overlaid on thumbnail */}
        {previewPhotos.length > 0 && (
          <span className="absolute top-2 left-2 badge bg-black/50 text-white text-[10px]">
            {album.photo_count} {t("photos")}
          </span>
        )}
      </div>

      {/* ── Meta ── */}
      <div>
        <h3 className="font-semibold text-sm truncate">{album.title}</h3>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Clock size={11} /> {timeAgo(album.created_at)}
          </span>
        </div>
      </div>

      {/* ── Invite link ── */}
      <div className="flex items-center gap-2 bg-border-light dark:bg-border-dark
                      rounded-xl px-3 py-2">
        <span className="text-[11px] text-gray-400 truncate flex-1 font-mono">
          {album.invite_url.replace(/^https?:\/\//, "")}
        </span>
        <motion.button
          onClick={handleCopy}
          whileTap={{ scale: 0.85 }}
          className="flex-shrink-0 text-primary-400 hover:text-primary-500 transition-colors"
          aria-label={t("copyLink")}
        >
          {copied
            ? <Check size={14} className="text-green-500" />
            : <Copy size={14} />
          }
        </motion.button>
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-2">
        <Link
          to={`/analytics/${album.id}`}
          className="flex-1 btn-primary text-xs py-2 justify-center"
        >
          <BarChart2 size={14} /> {t("viewAnalytics")}
        </Link>
        <motion.button
          onClick={handleDelete}
          whileTap={{ scale: 0.9 }}
          className="w-9 h-9 flex items-center justify-center rounded-xl
                     text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30
                     transition-colors"
          aria-label={t("deleteAlbum")}
        >
          <Trash2 size={15} />
        </motion.button>
      </div>
    </motion.div>
  );
}
