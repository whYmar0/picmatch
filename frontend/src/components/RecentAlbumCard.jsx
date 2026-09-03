/**
 * RecentAlbumCard.jsx — v3
 *
 * Card for recently visited albums (people's albums — own ones are excluded).
 * - Cover tap opens the album (statistics when the viewer has access,
 *   otherwise the comment thread for limited-access albums).
 * - A single compact icon action: "Голосовать" (Vote) for public albums the
 *   user hasn't voted in yet, or "Переголосовать" (Re-vote) after they have.
 * - No dedicated statistics button — stats are one cover tap away, same as
 *   the owner's own albums.
 */
import { Image, Lock, Globe, Play, BarChart2, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useLang } from "../contexts/LangContext";
import { isVideo } from "../utils/media";

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

export default function RecentAlbumCard({ album, index, onOpen, onVote }) {
  const { t, lang } = useLang();
  const [imgLoaded, setImgLoaded] = useState(false);

  const hasAccess = album.hasAccess !== false;
  const isPrivate = album.is_public === false;
  // Public albums always expose the vote action, including after voting.
  const canVote = Boolean(album.invite_code || album.invite_url) && !isPrivate;
  // Prefer the code (short client route); fall back to the stored invite URL
  // path for legacy records that only saved the full link. Re-voting appends
  // ?revote=1 so VotePage annuls the previous decisions first.
  const baseVoteUrl = album.invite_code
    ? `/vote/${album.invite_code}`
    : (() => {
        try {
          const u = new URL(album.invite_url, window.location.origin);
          return `${u.pathname}${u.search}`;
        } catch {
          return album.invite_url || "";
        }
      })();
  const voteUrl = album.hasVoted
    ? `${baseVoteUrl}${baseVoteUrl.includes("?") ? "&" : "?"}revote=1`
    : baseVoteUrl;

  return (
    <div className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card hover:shadow-card-hover-compact transition-shadow duration-200 flex flex-col w-full min-w-0">
      {/* Photo area (2/3) — cover tap opens the album (stats / comments) */}
      <div
        onClick={() => onOpen?.(album, hasAccess ? "stats" : "comments")}
        className="relative w-full aspect-[4/3] bg-border-light dark:bg-border-dark overflow-hidden rounded-t-3xl cursor-pointer"
      >
        {album.coverUrl ? (
          isVideo({ url: album.coverUrl }) ? (
            <div className="relative w-full h-full">
              <video
                src={album.coverUrl}
                className="w-full h-full object-cover"
                preload="metadata"
                muted
                playsInline
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                  <Play size={18} className="text-white ml-0.5" />
                </div>
              </div>
            </div>
          ) : (
            <motion.img
              src={album.coverUrl}
              alt=""
              layoutId={`album-cover-${album.id}`}
              data-shared-media={`album-cover-${album.id}`}
              className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgLoaded(true)}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center">
            <Image size={32} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {/* Privacy indicator (top-left) */}
        {isPrivate ? (
          <span
            className="absolute top-2 left-2 flex items-center justify-center
                       w-7 h-7 rounded-lg bg-amber-500/80 text-white"
            title={lang === "ru" ? "Приватный альбом" : "Private album"}
            aria-label={lang === "ru" ? "Приватный альбом" : "Private album"}
          >
            <Lock size={13} />
          </span>
        ) : (
          <span className="absolute top-2 left-2 flex items-center gap-1
                           text-[10px] font-semibold px-2 py-0.5 rounded-lg
                           bg-black/50 text-white">
            <Globe size={9} /> {lang === "ru" ? "Открытый" : "Public"}
          </span>
        )}

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


        {/* Service action row — kept below the cover and aligned right. */}
        {canVote && onVote && (
          <div className="flex items-center justify-end mt-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onVote(voteUrl);
              }}
              className="flex items-center justify-center p-2.5 rounded-xl btn-rounded-square
                         bg-gray-100 dark:bg-gray-800
                         text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              title={album.hasVoted ? t("revote") : t("vote")}
              aria-label={album.hasVoted ? t("revote") : t("vote")}
            >
              {album.hasVoted ? <RotateCcw size={15} /> : <BarChart2 size={15} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
