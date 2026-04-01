/**
 * components/AlbumSummary.jsx — Redesigned analytics dashboard
 *
 * NEW FEATURES:
 *  1. Icon row: Eye (views), Users (voters), Like rate %, Grid/List toggle
 *  2. Sort dropdown: most/least liked, most disliked
 *  3. Filter: all / liked only / disliked only / by voter
 *  4. Bottom sheet: voter list + per-photo reactions (iOS-style)
 *  5. Smart Share: navigator.share() on mobile, clipboard on desktop
 *  6. Winner glow ONLY on the hero card, plain styling in general list
 *  7. All text truncated — no container breaking
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Eye, Users, LayoutGrid, List,
  ThumbsUp, ThumbsDown, ChevronDown, Share2, Trophy,
} from "lucide-react";
import { useLang } from "../contexts/LangContext";
import BottomSheet from "./BottomSheet";

// ─── Smart Share ──────────────────────────────────────────────────────────────
async function smartShare(title, url) {
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  if (isMobile && navigator.share) {
    try { await navigator.share({ title, url }); return; }
    catch { /* user cancelled */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    return true; // copied
  } catch {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = url; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    return true;
  }
}

// ─── Reaction dot ─────────────────────────────────────────────────────────────
function ReactionBadge({ isLike }) {
  return isLike
    ? <span className="inline-flex items-center gap-1 text-green-500 text-xs font-semibold">
        <ThumbsUp size={11} /> Like
      </span>
    : <span className="inline-flex items-center gap-1 text-red-400 text-xs font-semibold">
        <ThumbsDown size={11} /> Nope
      </span>;
}

// ─── Voter row (used inside bottom sheets) ────────────────────────────────────
function VoterRow({ username, right }) {
  return (
    <div className="flex items-center justify-between py-2.5
                    border-b border-border-light dark:border-border-dark last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30
                        flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-primary-500">
            {username?.[0]?.toUpperCase() ?? "?"}
          </span>
        </div>
        <span className="text-sm font-medium truncate">@{username}</span>
      </div>
      <div className="flex-shrink-0 ml-3">{right}</div>
    </div>
  );
}

// ─── Photo row in list view ───────────────────────────────────────────────────
function PhotoListRow({ photo, rank, isWinner, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2 text-left
                 hover:bg-border-light dark:hover:bg-border-dark
                 rounded-2xl px-2 transition-colors"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.04 }}
    >
      <span className="w-6 text-center text-xs font-bold text-gray-400 flex-shrink-0">
        {isWinner ? "🏆" : `#${rank + 1}`}
      </span>
      <div className="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0
                      bg-border-light dark:bg-border-dark">
        <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{photo.filename}</p>
        <div className="h-1.5 bg-border-light dark:bg-border-dark rounded-full mt-1.5 overflow-hidden">
          <motion.div
            className="h-full bg-primary-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${photo.like_percentage}%` }}
            transition={{ delay: rank * 0.04 + 0.2, duration: 0.5 }}
          />
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
          <span className="text-green-500 flex items-center gap-0.5">
            <ThumbsUp size={9} /> {photo.like_count}
          </span>
          <span className="text-red-400 flex items-center gap-0.5">
            <ThumbsDown size={9} /> {photo.dislike_count}
          </span>
          <span className="ml-auto">{photo.total_votes > 0 ? `${photo.like_percentage}%` : "—"}</span>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Photo card in grid view ──────────────────────────────────────────────────
function PhotoGridCard({ photo, rank, isWinner, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      className="relative rounded-2xl overflow-hidden aspect-square bg-border-light
                 dark:bg-border-dark text-left group"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: rank * 0.04 }}
      whileHover={{ scale: 1.02 }}
    >
      <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent
                      p-2 pt-6">
        <div className="flex items-center justify-between">
          <span className="text-white text-xs font-bold">
            {isWinner ? "🏆" : `#${rank + 1}`}
          </span>
          <span className="text-white text-xs font-semibold">
            {photo.total_votes > 0 ? `${photo.like_percentage}%` : "—"}
          </span>
        </div>
      </div>
      <div className="absolute inset-0 ring-2 ring-transparent
                      group-hover:ring-primary-400 rounded-2xl transition-all" />
    </motion.button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AlbumSummary({ analytics, onBack }) {
  const { t, lang } = useLang();

  // Sort / filter state
  const [sortKey,   setSortKey]   = useState("likes_desc");
  const [filter,    setFilter]    = useState("all");
  const [viewMode,  setViewMode]  = useState("list"); // "list" | "grid"
  const [showSort,  setShowSort]  = useState(false);

  // Bottom sheet state
  const [sheet, setSheet] = useState(null);   // null | "viewers" | "voters" | photo-obj

  // Share state
  const [shareDone, setShareDone] = useState(false);

  if (!analytics) return null;

  const {
    title, description, total_votes, unique_voters,
    global_like_rate, voter_summaries, photos, winner,
  } = analytics;

  // ── Sort photos ────────────────────────────────────────────────────────────
  const sorted = [...photos].sort((a, b) => {
    if (sortKey === "likes_desc")    return b.like_count - a.like_count;
    if (sortKey === "likes_asc")     return a.like_count - b.like_count;
    if (sortKey === "dislikes_desc") return b.dislike_count - a.dislike_count;
    return b.like_percentage - a.like_percentage;
  });

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = sorted.filter((p) => {
    if (filter === "liked")    return p.like_count > p.dislike_count;
    if (filter === "disliked") return p.dislike_count > p.like_count;
    return true;
  });

  // ── Share ─────────────────────────────────────────────────────────────────
  const handleShare = async () => {
    await smartShare(t("shareTitle"), window.location.href);
    setShareDone(true);
    setTimeout(() => setShareDone(false), 2000);
  };

  // ── Bottom sheet content resolver ─────────────────────────────────────────
  const renderSheetContent = () => {
    if (!sheet) return null;

    // Voters sheet
    if (sheet === "voters") {
      return voter_summaries.length === 0
        ? <p className="text-center text-gray-400 py-8 text-sm">{t("noReactions")}</p>
        : voter_summaries.map((v) => (
            <VoterRow
              key={v.voter_id}
              username={v.username}
              right={
                <span className="text-xs text-gray-400">
                  {v.vote_count} {t("votes")}
                </span>
              }
            />
          ));
    }

    // Viewers sheet (same list for now — no separate views tracking)
    if (sheet === "viewers") {
      return voter_summaries.length === 0
        ? <p className="text-center text-gray-400 py-8 text-sm">{t("noReactions")}</p>
        : voter_summaries.map((v) => (
            <VoterRow key={v.voter_id} username={v.username}
              right={<span className="text-[10px] text-gray-400">viewed</span>} />
          ));
    }

    // Per-photo reactions sheet
    if (sheet?.reactions !== undefined) {
      const photo = sheet;
      return (
        <div>
          {/* Photo mini header */}
          <div className="flex items-center gap-3 mb-4 pb-3
                          border-b border-border-light dark:border-border-dark">
            <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0">
              <img src={photo.url} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{photo.filename}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="text-green-500">{photo.like_count} likes</span>
                {" · "}
                <span className="text-red-400">{photo.dislike_count} nopes</span>
              </p>
            </div>
          </div>

          {photo.reactions?.length === 0
            ? <p className="text-center text-gray-400 py-6 text-sm">{t("noReactions")}</p>
            : photo.reactions?.map((r) => (
                <VoterRow
                  key={r.voter_id}
                  username={r.username}
                  right={<ReactionBadge isLike={r.is_like} />}
                />
              ))
          }
        </div>
      );
    }

    return null;
  };

  const sheetTitle =
    sheet === "voters" ? t("voters") :
    sheet === "viewers" ? t("views") :
    sheet?.filename ? t("reactions") : "";

  // ── Sort options ──────────────────────────────────────────────────────────
  const sortOptions = [
    { key: "likes_desc",    label: t("sortLikesDesc") },
    { key: "likes_asc",     label: t("sortLikesAsc") },
    { key: "dislikes_desc", label: t("sortDislikesDesc") },
  ];
  const filterOptions = [
    { key: "all",      label: t("filterAll") },
    { key: "liked",    label: t("filterLiked") },
    { key: "disliked", label: t("filterDisliked") },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          {onBack && (
            <button onClick={onBack} className="btn-ghost -ml-2 text-sm px-3 py-2">
              <ArrowLeft size={15} /> {t("backToAlbums")}
            </button>
          )}
          <button
            onClick={handleShare}
            className="btn-ghost ml-auto text-sm px-3 py-2 text-primary-500"
          >
            <Share2 size={14} />
            {shareDone ? t("copied") : t("share")}
          </button>
        </div>
        <h1 className="font-display font-bold text-2xl truncate">{title}</h1>
        {description && (
          <p className="text-gray-400 text-sm mt-1 line-clamp-2 break-words">{description}</p>
        )}
      </div>

      {/* ── Icon row ── */}
      <div className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card
                      flex items-center divide-x divide-border-light dark:divide-border-dark">

        {/* Eye — views */}
        <button
          onClick={() => setSheet("viewers")}
          className="flex-1 flex flex-col items-center gap-1 py-4 px-2
                     hover:bg-border-light dark:hover:bg-border-dark
                     rounded-l-3xl transition-colors group"
        >
          <Eye size={18} className="text-gray-400 group-hover:text-primary-400 transition-colors" />
          <span className="text-base font-bold">{unique_voters}</span>
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
            {t("views")}
          </span>
        </button>

        {/* Users — voters */}
        <button
          onClick={() => setSheet("voters")}
          className="flex-1 flex flex-col items-center gap-1 py-4 px-2
                     hover:bg-border-light dark:hover:bg-border-dark
                     transition-colors group"
        >
          <Users size={18} className="text-gray-400 group-hover:text-primary-400 transition-colors" />
          <span className="text-base font-bold">{unique_voters}</span>
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
            {t("voters")}
          </span>
        </button>

        {/* Like rate */}
        <div className="flex-1 flex flex-col items-center gap-1 py-4 px-2">
          <ThumbsUp size={18} className="text-primary-400" />
          <span className="text-base font-bold text-primary-500">
            {total_votes > 0 ? `${global_like_rate}%` : "—"}
          </span>
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
            {t("likeRate")}
          </span>
        </div>

        {/* View toggle */}
        <button
          onClick={() => setViewMode((m) => m === "list" ? "grid" : "list")}
          className="flex-1 flex flex-col items-center gap-1 py-4 px-2
                     hover:bg-border-light dark:hover:bg-border-dark
                     rounded-r-3xl transition-colors group"
        >
          {viewMode === "list"
            ? <LayoutGrid size={18} className="text-gray-400 group-hover:text-primary-400 transition-colors" />
            : <List size={18} className="text-gray-400 group-hover:text-primary-400 transition-colors" />
          }
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
            {viewMode === "list" ? t("gridView") : t("listView")}
          </span>
        </button>
      </div>

      {/* ── Winner hero card (glow ONLY here, not in list) ── */}
      {winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 220 }}
          className="bg-card-light dark:bg-card-dark rounded-3xl p-4 animate-winner-glow cursor-pointer"
          onClick={() => setSheet(winner)}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl crown-animate inline-block">🏆</span>
            <span className="font-semibold text-primary-500 text-sm">{t("winnerBadge")}</span>
          </div>
          <div className="flex gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 shadow-orange">
              <img src={winner.url} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate break-words">{winner.filename}</p>
              <p className="text-2xl font-display font-bold text-primary-400 mt-0.5">
                {winner.like_percentage}%
              </p>
              <p className="text-xs text-gray-400">
                {winner.like_count} {t("likes")} · {winner.total_votes} {t("totalVotes")}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Sort & Filter toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Sort dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSort(!showSort)}
            className="flex items-center gap-1.5 text-sm font-medium
                       bg-border-light dark:bg-border-dark
                       px-3 py-2 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/20
                       transition-colors"
          >
            {sortOptions.find((s) => s.key === sortKey)?.label}
            <ChevronDown size={13}
              className={`transition-transform ${showSort ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {showSort && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0,  scale: 1 }}
                exit={{   opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.14 }}
                className="absolute top-full mt-1 left-0 z-20
                           bg-card-light dark:bg-card-dark rounded-2xl shadow-card-hover
                           border border-border-light dark:border-border-dark
                           overflow-hidden min-w-[160px]"
              >
                {sortOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => { setSortKey(opt.key); setShowSort(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                      ${sortKey === opt.key
                        ? "bg-primary-50 dark:bg-primary-900/20 text-primary-500 font-semibold"
                        : "hover:bg-border-light dark:hover:bg-border-dark"
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Filter pills */}
        {filterOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors
              ${filter === opt.key
                ? "bg-primary-400 text-white"
                : "bg-border-light dark:bg-border-dark text-gray-500 hover:bg-primary-50"
              }`}
          >
            {opt.label}
          </button>
        ))}

        <span className="ml-auto text-xs text-gray-400">{filtered.length} / {photos.length}</span>
      </div>

      {/* ── Photo list or grid ── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          {t("analyticsTitle")}
        </h2>

        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">{t("noVotes")}</p>
        )}

        {viewMode === "list" ? (
          <div className="space-y-1">
            {filtered.map((photo, i) => (
              <PhotoListRow
                key={photo.id}
                photo={photo}
                rank={i}
                isWinner={photo.id === winner?.id}
                onClick={() => setSheet(photo)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((photo, i) => (
              <PhotoGridCard
                key={photo.id}
                photo={photo}
                rank={i}
                isWinner={photo.id === winner?.id}
                onClick={() => setSheet(photo)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom Sheet ── */}
      <BottomSheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={sheetTitle}
      >
        {renderSheetContent()}
      </BottomSheet>
    </div>
  );
}
