/**
 * RecentAlbumCard.jsx — v2
 *
 * Same grid layout as AlbumCard v4 (2/3 photo, 1/3 info).
 * Privacy badge kept. Single-line truncation for titles.
 * "Results" button stays as is.
 */
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Image, Lock, Globe, BarChart2, MessageCircle } from "lucide-react";
import { useLang } from "../contexts/LangContext";

function parseUTC(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(dateStr)) return new Date(dateStr);
  return new Date(dateStr + "Z");
}

function timeAgo(dateStr, lang) {
  const s = (Date.now() - parseUTC(dateStr).getTime()) / 1000;
  if (s < 60)    return lang === "ru" ? "только что" : "just now";
  if (s < 3600) return lang === "ru"
    ? `${Math.floor(s / 60)} мин. назад`
    : `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return lang === "ru"
    ? `${Math.floor(s / 3600)} ч. назад`
    : `${Math.floor(s / 3600)} h ago`;
  return lang === "ru"
    ? `${Math.floor(s / 86400)} дн. назад`
    : `${Math.floor(s / 86400)} d ago`;
}

export default function RecentAlbumCard({ album, index }) {
  const { t, lang } = useLang();

  const hasAccess = album.hasAccess !== false;
  const isPrivate = album.is_public === false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3 }}
      className="bg-card-light dark:bg-card-dark rounded-3xl card-shadow overflow-hidden flex flex-col w-full min-w-0"
    >
      {/* Photo area (2/3) — same as AlbumCard */}
      <div className="relative w-full aspect-[4/3] bg-border-light dark:bg-border-dark overflow-hidden">
        {album.coverUrl ? (
          <img
            src={album.coverUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Image size={32} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {/* Privacy badge (top-left) — KEPT */}
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

      {/* Info area (1/3) */}
      <div className="flex flex-col gap-2 p-3.5">
        {/* Title + Creator */}
        <div className="min-w-0">
          <h3 className="font-semibold text-sm leading-tight break-words line-clamp-1">{album.title}</h3>
          <span className="text-[11px] text-gray-400 mt-0.5 block line-clamp-1">
            {album.creatorUsername && (
              <span>@{album.creatorUsername} · </span>
            )}
            {timeAgo(album.visitedAt, lang)}
          </span>
        </div>

        {/* Results button or no-access indicator */}
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
      </div>
    </motion.div>
  );
}
