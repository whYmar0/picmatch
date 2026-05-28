/**
 * components/RecentAlbumCard.jsx
 *
 * Same grid layout as AlbumCard, but read-only (no delete/privacy/invite controls).
 * Shows privacy badge and access-level action button.
 */
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Image, Clock, Lock, Globe, BarChart2, MessageCircle } from "lucide-react";
import { useLang } from "../contexts/LangContext";

function parseUTC(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(dateStr)) return new Date(dateStr);
  return new Date(dateStr + "Z");
}

function timeAgo(dateStr, lang) {
  const s = (Date.now() - parseUTC(dateStr).getTime()) / 1000;
  if (s < 60)    return lang === "ru" ? "только что" : "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}${lang === "ru" ? "м" : "m"} ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}${lang === "ru" ? "ч" : "h"} ago`;
  return `${Math.floor(s / 86400)}${lang === "ru" ? "д" : "d"} ago`;
}

export default function RecentAlbumCard({ album, index }) {
  const { t, lang } = useLang();

  // hasAccess=true  → user can see analytics (public album or explicitly granted)
  // hasAccess=false → user can only see their own comment thread
  const hasAccess = album.hasAccess !== false;
  const isPrivate = album.is_public === false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3 }}
      className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card
                 hover:shadow-card-hover transition-shadow flex flex-col gap-3 p-4
                 overflow-hidden w-full min-w-0"
    >
      {/* Thumbnail */}
      <div className="relative h-28 rounded-2xl overflow-hidden bg-border-light dark:bg-border-dark">
        {album.coverUrl ? (
          <img
            src={album.coverUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Image size={24} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {/* Privacy badge (top-left) */}
        <span className={`absolute top-2 left-2 flex items-center gap-1
                          text-[10px] font-semibold px-2 py-0.5 rounded-lg
                          ${isPrivate
                            ? "bg-amber-500/80 text-white"
                            : "bg-black/50 text-white"}`}>
          {isPrivate
            ? <><Lock size={9} /> {lang === "ru" ? "Приватный" : "Private"}</>
            : <><Globe size={9} /> {lang === "ru" ? "Открытый" : "Public"}</>
          }
        </span>
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between min-w-0">
        <div className="min-w-0 pr-2 flex-1">
          <h3 className="font-semibold text-sm leading-tight break-words">{album.title}</h3>
          <span className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
            {album.creatorUsername && (
              <span className="truncate">@{album.creatorUsername} ·&nbsp;</span>
            )}
            <Clock size={10} className="flex-shrink-0" />
            <span className="flex-shrink-0">{timeAgo(album.visitedAt, lang)}</span>
          </span>
        </div>

        {/* No-access indicator icon */}
        {!hasAccess && (
          <div className="flex items-center justify-center p-2 rounded-xl
                          bg-gray-100 dark:bg-gray-800 text-gray-500 flex-shrink-0"
            title={lang === "ru" ? "Нет доступа к аналитике" : "No analytics access"}
          >
            <Lock size={14} />
          </div>
        )}
      </div>

      {/* Action button */}
      <Link
        to={`/analytics/${album.id}`}
        className={`w-full text-xs py-2 flex items-center justify-center gap-1.5 rounded-2xl font-semibold transition-colors
          ${hasAccess
            ? "btn-primary"
            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
      >
        {hasAccess
          ? <><BarChart2 size={13} /> {t("viewAnalytics")}</>
          : <><MessageCircle size={13} /> {t("viewMyComments")}</>
        }
      </Link>
    </motion.div>
  );
}
