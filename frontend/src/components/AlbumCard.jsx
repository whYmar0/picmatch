/**
 * AlbumCard.jsx — v3 (Redesign)
 *
 * New layout:
 *   - 2/3 of card height = first photo (clickable -> gallery)
 *   - 1/3 bottom = title, time, action buttons row (private/public, copy, delete)
 *   - Grid of 2 columns on Dashboard
 */
import { useState } from "react";
import { motion }   from "framer-motion";
import { Copy, Check, Trash2, Image, Globe, Lock } from "lucide-react";
import { useLang }  from "../contexts/LangContext";
import { albumsApi } from "../api";
import toast       from "react-hot-toast";

function parseUTC(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(dateStr)) return new Date(dateStr);
  return new Date(dateStr + "Z");
}

function timeAgo(dateStr, lang) {
  const s = (Date.now() - parseUTC(dateStr).getTime()) / 1000;
  if (lang === "ru") {
    if (s < 60) return "только что";
    if (s < 3600) return `${Math.floor(s / 60)} мин. назад`;
    if (s < 86400) return `${Math.floor(s / 3600)} ч. назад`;
    return `${Math.floor(s / 86400)} дн. назад`;
  }
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function smartCopy(text) {
  if (/Mobi|Android/i.test(navigator.userAgent) && navigator.share) {
    try { await navigator.share({ title: "Pickmatch invite", url: text }); return true; } catch { /**/ }
  }
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta); return true;
  }
}

export default function AlbumCard({ album: initialAlbum, onDelete, index, onPhotoClick }) {
  const { t, lang } = useLang();
  const [album, setAlbum] = useState(initialAlbum);
  const [copied,     setCopied]     = useState(false);
  const [updating,   setUpdating]   = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    if (await smartCopy(album.invite_url)) {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  };

  const togglePrivacy = async (e) => {
    e.stopPropagation();
    setUpdating(true);
    try {
      const nextPublic = !album.is_public;
      const updated = await albumsApi.updatePrivacy(album.id, nextPublic);
      setAlbum(updated);
      toast.success(nextPublic ? "Альбом теперь публичный" : "Альбом теперь приватный");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (window.confirm(`Удалить альбом «${album.title}»?`)) onDelete(album.id);
  };

  const firstPhoto = (album.photos || [])[0];
  const photoCount = album.photo_count || 0;

  const handlePhotoClick = (e) => {
    e.stopPropagation();
    if (firstPhoto && onPhotoClick) {
      onPhotoClick(album, firstPhoto);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3 }}
      className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card
                 hover:shadow-card-hover transition-shadow flex flex-col
                 overflow-hidden w-full min-w-0 group"
    >
      {/* Photo area (2/3) */}
      <button
        onClick={handlePhotoClick}
        className="relative w-full aspect-[4/3] bg-border-light dark:bg-border-dark
                   overflow-hidden cursor-pointer focus:outline-none"
      >
        {firstPhoto ? (
          <img
            src={firstPhoto.url}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500
                       group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Image size={32} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        {/* Photo count badge */}
        <span className="absolute top-2.5 left-2.5 bg-black/60 backdrop-blur-sm text-white
                         text-[10px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1">
          <Image size={10} /> {photoCount}
        </span>
        {/* Privacy badge */}
        <span className={`absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-1 rounded-lg
                          text-[10px] font-semibold backdrop-blur-sm
                          ${album.is_public
                            ? "bg-green-500/70 text-white"
                            : "bg-amber-500/70 text-white"}`}>
          {album.is_public ? <Globe size={9} /> : <Lock size={9} />}
          {album.is_public
            ? (lang === "ru" ? "Публичный" : "Public")
            : (lang === "ru" ? "Приватный" : "Private")}
        </span>
        {/* Hover play icon */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </button>

      {/* Info area (1/3) */}
      <div className="flex flex-col gap-2 p-3.5">
        {/* Title + Time */}
        <div className="min-w-0">
          <h3 className="font-semibold text-sm leading-tight break-words line-clamp-1">{album.title}</h3>
          <span className="text-[11px] text-gray-400 mt-0.5 block">
            {timeAgo(album.created_at, lang)}
          </span>
        </div>

        {/* Action buttons row */}
        <div className="flex items-center gap-2">
          {/* Private/Public toggle */}
          <motion.button
            onClick={togglePrivacy}
            disabled={updating}
            whileTap={{ scale: 0.9 }}
            className={`flex items-center justify-center p-2 rounded-xl transition-colors flex-shrink-0 ${
              album.is_public
                ? "bg-primary-50 dark:bg-primary-900/20 text-primary-500"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500"
            }`}
            title={album.is_public ? "Public" : "Private"}
          >
            {updating ? (
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : album.is_public ? (
              <Globe size={13} />
            ) : (
              <Lock size={13} />
            )}
          </motion.button>

          {/* Copy link */}
          <motion.button
            onClick={handleCopy}
            whileTap={{ scale: 0.9 }}
            className="flex items-center justify-center p-2 rounded-xl bg-gray-100 dark:bg-gray-800
                       text-gray-500 hover:text-primary-500 transition-colors flex-shrink-0"
            title={t("copyLink")}
          >
            {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
          </motion.button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Delete */}
          <motion.button
            onClick={handleDelete}
            whileTap={{ scale: 0.9 }}
            className="flex items-center justify-center p-2 rounded-xl
                       text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex-shrink-0"
            title={t("deleteAlbum")}
          >
            <Trash2 size={13} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
