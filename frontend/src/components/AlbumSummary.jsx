/**
 * components/AlbumSummary.jsx — Компонент аналитики альбома
 * Displays vote results, winner, and per-photo statistics
 * Отображает результаты голосования, победителя и статистику по фото
 */

import { motion } from "framer-motion";
import { Trophy, ThumbsUp, ThumbsDown, Users, BarChart2, ArrowLeft, Share2 } from "lucide-react";
import { useLang } from "../contexts/LangContext";

// ─── Stat Tile ────────────────────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, color = "primary" }) {
  const colorMap = {
    primary: "bg-primary-50 dark:bg-primary-900/20 text-primary-500",
    green: "bg-green-50 dark:bg-green-900/20 text-green-500",
    red: "bg-red-50 dark:bg-red-900/20 text-red-500",
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-500",
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${colorMap[color]}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
        <p className="font-bold text-lg leading-tight">{value}</p>
      </div>
    </div>
  );
}

// ─── Photo Result Row ─────────────────────────────────────────────────────────
function PhotoResultRow({ photo, index, isWinner }) {
  const { t } = useLang();
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      className={`card p-3 flex items-center gap-3 ${
        isWinner ? "animate-winner-glow border-primary-300 dark:border-primary-600" : ""
      }`}
    >
      {/* Rank */}
      <div className="w-8 text-center">
        {isWinner ? (
          <span className="text-xl crown-animate inline-block">🏆</span>
        ) : (
          <span className="text-sm font-bold text-gray-400">#{index + 1}</span>
        )}
      </div>

      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 bg-border-light dark:bg-border-dark">
        <img src={photo.url} alt={photo.filename} className="w-full h-full object-cover" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{photo.filename}</p>
        {/* Progress bar */}
        <div className="mt-1.5 h-2 bg-border-light dark:bg-border-dark rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${photo.like_percentage}%` }}
            transition={{ delay: index * 0.06 + 0.3, duration: 0.6, ease: "easeOut" }}
            className="h-full bg-primary-400 rounded-full"
          />
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-green-500 flex items-center gap-0.5">
            <ThumbsUp size={10} /> {photo.like_count}
          </span>
          <span className="text-xs text-red-400 flex items-center gap-0.5">
            <ThumbsDown size={10} /> {photo.dislike_count}
          </span>
          <span className="text-xs text-gray-400 ml-auto">
            {photo.total_votes > 0 ? `${photo.like_percentage}%` : t("noVotes")}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AlbumSummary({ analytics, onBack }) {
  const { t } = useLang();

  if (!analytics) return null;

  const { title, description, total_photos, total_votes, unique_voters, photos, winner } = analytics;

  // Sort photos: winner first, then by like_percentage desc
  const sortedPhotos = [...photos].sort((a, b) => {
    if (a.id === winner?.id) return -1;
    if (b.id === winner?.id) return 1;
    return b.like_percentage - a.like_percentage;
  });

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-1">
          {onBack && (
            <button onClick={onBack} className="btn-ghost px-3 py-2 text-sm">
              <ArrowLeft size={16} /> {t("backToAlbums")}
            </button>
          )}
          <button onClick={handleShare} className="btn-ghost px-3 py-2 text-sm ml-auto">
            <Share2 size={14} /> Share
          </button>
        </div>
        <h1 className="font-display font-bold text-3xl">{title}</h1>
        {description && <p className="text-gray-400 mt-1">{description}</p>}
      </motion.div>

      {/* Stats grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 gap-3"
      >
        <StatTile icon={BarChart2} label={t("totalVotes")} value={total_votes} color="primary" />
        <StatTile icon={Users} label={t("uniqueVoters")} value={unique_voters} color="blue" />
        <StatTile icon={ThumbsUp} label={t("photos")} value={total_photos} color="green" />
        {winner && (
          <StatTile
            icon={Trophy}
            label={t("likeRate")}
            value={`${winner.like_percentage}%`}
            color="primary"
          />
        )}
      </motion.div>

      {/* Winner highlight */}
      {winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="card p-4 border-2 border-primary-300 dark:border-primary-600 animate-winner-glow"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl crown-animate inline-block">🏆</span>
            <span className="font-semibold text-primary-500">{t("winnerBadge")}</span>
          </div>
          <div className="flex gap-4">
            <div className="w-24 h-24 rounded-3xl overflow-hidden flex-shrink-0 shadow-orange">
              <img src={winner.url} alt={winner.filename} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-lg truncate">{winner.filename}</p>
              <p className="text-3xl font-display font-bold text-primary-400 mt-1">
                {winner.like_percentage}%
              </p>
              <p className="text-sm text-gray-400">
                {winner.like_count} {t("likes")} · {winner.total_votes} {t("totalVotes")}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* All photos */}
      <div>
        <h2 className="font-semibold text-sm text-gray-400 uppercase tracking-wider mb-3">
          {t("analyticsTitle")}
        </h2>
        <div className="space-y-2.5">
          {sortedPhotos.map((photo, i) => (
            <PhotoResultRow
              key={photo.id}
              photo={photo}
              index={i}
              isWinner={photo.id === winner?.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
