/**
 * AlbumCard.jsx — v6
 *
 * - Card keeps `rounded-3xl overflow-hidden` (rounded card appearance).
 * - Photo area is wrapped in `<div className="mx-2 mt-2">` (8px inset) so its
 *   corners are NEVER clipped by the parent's rounded-3xl — the IMAGE is a
 *   clean rectangle inside the rounded card.
 * - Photo button uses `aspect-[4/3]` + `object-cover` to fill ~2/3 of card.
 * - No hover scale on image (no `group-hover:scale-105`).
 * - Photo count badge and rounded-square (rounded-2xl) action buttons.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Trash2, Image, Globe, Lock } from "lucide-react";
import { useLang } from "../contexts/LangContext";
import { albumsApi } from "../api";
import toast from "react-hot-toast";

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
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);

  const photoCount = (album.photos || []).length;

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
      className="bg-card-light dark:bg-card-dark rounded-3xl card-shadow overflow-hidden flex flex-col w-full min-w-0"
    >
      {/* Photo area */}
      <div
        onClick={handlePhotoClick}
        className="relative w-full aspect-[4/3] bg-border-light dark:bg-border-dark
                   overflow-hidden cursor-pointer">
        {firstPhoto ? (
          <img
            src={firstPhoto.url}
            alt=""
            className="w-full h-full object-cover rounded-t-2xl pointer-events-none"
            style={{ pointerEvents: "none" }}
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Image size={32} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}
        {/* Photo count badge (top-right) */}
        {photoCount > 0 && (
          <span className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-lg">
            {photoCount} {photoCount === 1 ? (lang === "ru" ? "фото" : "photo") : (lang === "ru" ? "фото" : "photos")}
          </span>
        )}
      </div>

      {/* Info area (1/3) */}
      <div className="flex flex-col gap-2 p-3.5">
        {/* Title + Time */}
        <div className="min-w-0">
          <h3 className="font-semibold text-sm leading-tight break-words line-clamp-1">{album.title}</h3>
          <span className="text-[11px] text-gray-400 mt-0.5 block">
            {timeAgo(album.created_at, lang)}
          </span>
        </div>

        {/* Action buttons row — rounded-square */}
        <div className="flex items-center justify-center gap-3">
          {/* Private/Public toggle */}
          <motion.button
            onClick={togglePrivacy}
            disabled={updating}
            whileTap={{ scale: 0.9 }}
            className={`flex items-center justify-center p-2.5 rounded-xl btn-rounded-square transition-colors flex-shrink-0 ${album.is_public
              ? "bg-primary-50 dark:bg-primary-900/20 text-primary-500"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500"
              }`}
            title={album.is_public ? "Public" : "Private"}
          >
            {updating ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : album.is_public ? (
              <Globe size={15} />
            ) : (
              <Lock size={15} />
            )}
          </motion.button>

          {/* Copy link */}
          <motion.button
            onClick={handleCopy}
            whileTap={{ scale: 0.9 }}
            className="flex items-center justify-center p-2.5 rounded-xl btn-rounded-square bg-gray-100 dark:bg-gray-800
                       text-gray-500 hover:text-primary-500 transition-colors flex-shrink-0"
            title={t("copyLink")}
          >
            {copied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
          </motion.button>

          {/* Delete */}
          <motion.button
            onClick={handleDelete}
            whileTap={{ scale: 0.9 }}
            className="flex items-center justify-center p-2.5 rounded-xl btn-rounded-square btn-no-touch-hover
                       text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 active:bg-red-50 dark:active:bg-red-950/30 transition-colors flex-shrink-0"
            title={t("deleteAlbum")}
          >
            <Trash2 size={15} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
