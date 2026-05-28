/**
 * AlbumCard.jsx — v2
 * Added: Share button → opens ShareModal
 * Fixed: timeAgo UTC parsing (Ref 34 — appends Z for SQLite strings)
 */
import { useState } from "react";
import { motion }   from "framer-motion";
import { Link }     from "react-router-dom";
import { Copy, Check, BarChart2, Trash2, Image, Clock, Share2, Globe, Lock } from "lucide-react";
import { useLang }  from "../contexts/LangContext";
import { albumsApi } from "../api";
import toast       from "react-hot-toast";

function parseUTC(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(dateStr)) return new Date(dateStr);
  return new Date(dateStr + "Z");
}

function timeAgo(dateStr) {
  const s = (Date.now() - parseUTC(dateStr).getTime()) / 1000;
  if (s < 60)      return "just now";
  if (s < 3600)    return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)   return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function smartCopy(text) {
  if (/Mobi|Android/i.test(navigator.userAgent) && navigator.share) {
    try { await navigator.share({ title: "PicMatch invite", url: text }); return true; } catch { /**/ }
  }
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta); return true;
  }
}

export default function AlbumCard({ album: initialAlbum, onDelete, index }) {
  const { t } = useLang();
  const [album, setAlbum] = useState(initialAlbum);
  const [copied,     setCopied]     = useState(false);
  const [updating,   setUpdating]   = useState(false);

  const handleCopy = async (e) => {
    e.preventDefault();
    if (await smartCopy(album.invite_url)) {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  };

  const togglePrivacy = async (e) => {
    e.preventDefault();
    setUpdating(true);
    try {
      const nextPublic = !album.is_public;
      const updated = await albumsApi.updatePrivacy(album.id, nextPublic);
      setAlbum(updated);
      toast.success(nextPublic ? "Album is now Public ✓" : "Album is now Private ✓");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = (e) => {
    e.preventDefault();
    if (window.confirm(`Delete "${album.title}"?`)) onDelete(album.id);
  };

  const previewPhotos = (album.photos || []).slice(0, 3);
  const extra         = Math.max(0, (album.photo_count || 0) - previewPhotos.length);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.07, duration: 0.3 }}
        className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card
                   hover:shadow-card-hover transition-shadow flex flex-col gap-3 p-4
                   overflow-hidden w-full min-w-0"
      >
        {/* Thumbnail strip */}
        <div className="relative h-28 rounded-2xl overflow-hidden bg-border-light dark:bg-border-dark">
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
            <div className="flex h-full items-center justify-center">
              <Image size={24} className="text-gray-300 dark:text-gray-600" />
            </div>
          )}
          <span className="absolute top-2 left-2 bg-black/50 text-white
                           text-[10px] font-semibold px-2 py-0.5 rounded-lg">
            {album.photo_count ?? 0} {t("photos")}
          </span>
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between min-w-0">
          <div className="min-w-0 pr-2 flex-1">
            <h3 className="font-semibold text-sm leading-tight break-words">{album.title}</h3>
            <span className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
              <Clock size={10} /> {timeAgo(album.created_at)}
            </span>
          </div>
          <motion.button
            onClick={togglePrivacy}
            disabled={updating}
            whileTap={{ scale: 0.9 }}
            className={`flex items-center justify-center p-2 rounded-xl transition-colors ${
              album.is_public 
                ? "bg-primary-50 dark:bg-primary-900/20 text-primary-500" 
                : "bg-gray-100 dark:bg-gray-800 text-gray-500"
            }`}
            title={album.is_public ? "Public Album" : "Private Album"}
          >
            {updating ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />
            ) : album.is_public ? (
              <Globe size={14} />
            ) : (
              <Lock size={14} />
            )}
          </motion.button>
        </div>

        {/* Invite link */}
        <div className="flex items-center gap-2 bg-border-light dark:bg-border-dark
                        rounded-xl px-3 py-2 min-w-0 overflow-hidden">
          <span className="text-[10px] text-gray-400 truncate flex-1 font-mono min-w-0">
            {album.invite_url.replace(/^https?:\/\//, "")}
          </span>
          <motion.button onClick={handleCopy} whileTap={{ scale: 0.82 }}
            className="flex-shrink-0 text-primary-400 hover:text-primary-500 transition-colors"
            aria-label={t("copyLink")}>
            {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
          </motion.button>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link to={`/analytics/${album.id}`}
            className="flex-1 btn-primary text-xs py-2 justify-center">
            <BarChart2 size={13} /> {t("viewAnalytics")}
          </Link>
          <motion.button onClick={handleDelete} whileTap={{ scale: 0.9 }}
            className="w-9 h-9 flex items-center justify-center rounded-xl
                       text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            aria-label={t("deleteAlbum")}>
            <Trash2 size={14} />
          </motion.button>
        </div>
      </motion.div>

    </>
  );
}
