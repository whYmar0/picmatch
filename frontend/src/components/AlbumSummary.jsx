/**
 * components/AlbumSummary.jsx
 *
 * CHANGES per spec:
 *  - Icon row: 3 items only (Eye, Users, Like rate%) — Grid/List toggle REMOVED
 *  - Below winner card: "Sort" + "Filter" buttons (icon + text)
 *  - Sort bottom sheet: Grid/List toggle at top + Most Likes / Most Dislikes
 *  - Filter bottom sheet: multi-select voters → filter photos by those voters
 *  - Winner glow ONLY on hero card; list rows are plain (no glow, no border)
 *  - All text truncated/break-words
 *  - Smart share
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Eye, Users, LayoutGrid, List,
  ThumbsUp, ThumbsDown, SlidersHorizontal, Filter, Share2, Check,
} from "lucide-react";
import { useLang } from "../contexts/LangContext";
import BottomSheet from "./BottomSheet";

// ─── Smart share ──────────────────────────────────────────────────────────────
async function smartShare(title, url) {
  if (/Mobi|Android/i.test(navigator.userAgent) && navigator.share) {
    try { await navigator.share({ title, url }); return; } catch { /**/ }
  }
  try { await navigator.clipboard.writeText(url); return true; }
  catch {
    const ta = document.createElement("textarea");
    ta.value = url; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta);
    return true;
  }
}

// ─── Reaction badge ───────────────────────────────────────────────────────────
function ReactionBadge({ isLike }) {
  return isLike
    ? <span className="inline-flex items-center gap-1 text-green-500 text-xs font-semibold">
        <ThumbsUp size={10} /> Like
      </span>
    : <span className="inline-flex items-center gap-1 text-red-400 text-xs font-semibold">
        <ThumbsDown size={10} /> Nope
      </span>;
}

// ─── Voter avatar row ─────────────────────────────────────────────────────────
function VoterRow({ username, right }) {
  return (
    <div className="flex items-center justify-between py-2.5
                    border-b border-border-light dark:border-border-dark last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30
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

// ─── Photo list row (no glow) ─────────────────────────────────────────────────
function PhotoListRow({ photo, rank, isWinner, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2 px-2 text-left rounded-2xl
                 hover:bg-border-light dark:hover:bg-border-dark transition-colors"
      initial={{ opacity: 0, x: -10 }}
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
        <p className="text-sm font-medium truncate break-words">{photo.filename}</p>
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
          <span className="ml-auto">
            {photo.total_votes > 0 ? `${photo.like_percentage}%` : "—"}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Photo grid card (no glow) ────────────────────────────────────────────────
function PhotoGridCard({ photo, rank, isWinner, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      className="relative aspect-square rounded-2xl overflow-hidden
                 bg-border-light dark:bg-border-dark group"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: rank * 0.04 }}
      whileHover={{ scale: 1.02 }}
    >
      <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
        <div className="flex justify-between">
          <span className="text-white text-xs font-bold">{isWinner ? "🏆" : `#${rank + 1}`}</span>
          <span className="text-white text-xs">{photo.total_votes > 0 ? `${photo.like_percentage}%` : "—"}</span>
        </div>
      </div>
    </motion.button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AlbumSummary({ analytics, onBack }) {
  const { t } = useLang();

  // Sort + view state (sort sheet)
  const [sortKey,  setSortKey]  = useState("likes_desc");   // "likes_desc" | "dislikes_desc"
  const [viewMode, setViewMode] = useState("list");          // "list" | "grid"
  const [sortOpen, setSortOpen] = useState(false);

  // Filter by voter state (filter sheet)
  const [filterOpen,    setFilterOpen]    = useState(false);
  const [selectedVoters, setSelectedVoters] = useState(new Set()); // Set of voter_id strings
  const [pendingVoters,  setPendingVoters]  = useState(new Set());

  // Reaction drill-down sheet
  const [reactionSheet, setReactionSheet] = useState(null); // null | "viewers" | "voters" | photo

  // Share
  const [shareDone, setShareDone] = useState(false);

  if (!analytics) return null;

  const {
    title, description, total_votes, unique_voters,
    global_like_rate, voter_summaries, photos, winner,
  } = analytics;

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => [...photos].sort((a, b) =>
    sortKey === "dislikes_desc"
      ? b.dislike_count - a.dislike_count
      : b.like_count - a.like_count
  ), [photos, sortKey]);

  // ── Filter by voter ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (selectedVoters.size === 0) return sorted;
    return sorted.filter((p) =>
      p.reactions?.some((r) => selectedVoters.has(String(r.voter_id)))
    );
  }, [sorted, selectedVoters]);

  // ── Reaction sheet content ────────────────────────────────────────────────
  const renderReactionContent = () => {
    if (!reactionSheet) return null;
    if (reactionSheet === "voters" || reactionSheet === "viewers") {
      return voter_summaries.length === 0
        ? <p className="text-center text-gray-400 py-8 text-sm">{t("noVoters")}</p>
        : voter_summaries.map((v) => (
            <VoterRow key={v.voter_id} username={v.username}
              right={<span className="text-xs text-gray-400">{v.vote_count} {t("votes")}</span>} />
          ));
    }
    // Per-photo reactions
    const photo = reactionSheet;
    return (
      <div>
        <div className="flex gap-3 mb-4 pb-3 border-b border-border-light dark:border-border-dark">
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
        {!photo.reactions?.length
          ? <p className="text-center text-gray-400 py-6 text-sm">{t("noReactions")}</p>
          : photo.reactions.map((r) => (
              <VoterRow key={r.voter_id} username={r.username}
                right={<ReactionBadge isLike={r.is_like} />} />
            ))
        }
      </div>
    );
  };

  // ── Filter sheet ──────────────────────────────────────────────────────────
  const togglePending = (id) => {
    setPendingVoters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const openFilter = () => { setPendingVoters(new Set(selectedVoters)); setFilterOpen(true); };
  const applyFilter = () => { setSelectedVoters(new Set(pendingVoters)); setFilterOpen(false); };
  const clearFilter = () => { setPendingVoters(new Set()); setSelectedVoters(new Set()); setFilterOpen(false); };

  const handleShare = async () => {
    await smartShare(t("shareTitle"), window.location.href);
    setShareDone(true); setTimeout(() => setShareDone(false), 2000);
  };

  const reactionSheetTitle =
    reactionSheet === "voters" || reactionSheet === "viewers" ? t("voters") :
    reactionSheet?.filename ? t("reactions") : "";

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          {onBack && (
            <button onClick={onBack} className="btn-ghost -ml-2 text-sm px-3 py-2">
              <ArrowLeft size={14} /> {t("backToAlbums")}
            </button>
          )}
          <button onClick={handleShare}
            className="btn-ghost ml-auto text-sm px-3 py-2 text-primary-500">
            <Share2 size={13} /> {shareDone ? t("copied") : t("share")}
          </button>
        </div>
        <h1 className="font-display font-bold text-2xl truncate">{title}</h1>
        {description && (
          <p className="text-gray-400 text-sm mt-1 break-words line-clamp-2">{description}</p>
        )}
      </div>

      {/* ── Icon row — 3 items, NO Grid/List toggle here ──────────────────── */}
      <div className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card
                      flex items-center divide-x divide-border-light dark:divide-border-dark">
        {/* Eye — views */}
        <button onClick={() => setReactionSheet("viewers")}
          className="flex-1 flex flex-col items-center gap-1 py-4 px-2
                     hover:bg-border-light dark:hover:bg-border-dark rounded-l-3xl
                     transition-colors group">
          <Eye size={18} className="text-gray-400 group-hover:text-primary-400 transition-colors" />
          <span className="text-base font-bold">{unique_voters}</span>
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{t("views")}</span>
        </button>

        {/* Users — voters */}
        <button onClick={() => setReactionSheet("voters")}
          className="flex-1 flex flex-col items-center gap-1 py-4 px-2
                     hover:bg-border-light dark:hover:bg-border-dark
                     transition-colors group">
          <Users size={18} className="text-gray-400 group-hover:text-primary-400 transition-colors" />
          <span className="text-base font-bold">{unique_voters}</span>
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{t("voters")}</span>
        </button>

        {/* Like rate */}
        <div className="flex-1 flex flex-col items-center gap-1 py-4 px-2 rounded-r-3xl">
          <ThumbsUp size={18} className="text-primary-400" />
          <span className="text-base font-bold text-primary-500">
            {total_votes > 0 ? `${global_like_rate}%` : "—"}
          </span>
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{t("likeRate")}</span>
        </div>
      </div>

      {/* ── Winner hero (glow ONLY here) ──────────────────────────────────── */}
      {winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 220 }}
          className="bg-card-light dark:bg-card-dark rounded-3xl p-4 animate-winner-glow cursor-pointer"
          onClick={() => setReactionSheet(winner)}
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

      {/* ── Sort + Filter buttons (below winner) ─────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSortOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-medium text-sm
                     bg-border-light dark:bg-border-dark
                     hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
        >
          <SlidersHorizontal size={15} /> {t("sort")}
          {sortKey === "dislikes_desc" && (
            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary-400" />
          )}
        </button>

        <button
          onClick={openFilter}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-medium text-sm
                      transition-colors
                      ${selectedVoters.size > 0
                        ? "bg-primary-400 text-white"
                        : "bg-border-light dark:bg-border-dark hover:bg-primary-50 dark:hover:bg-primary-900/20"
                      }`}
        >
          <Filter size={15} /> {t("filterBy")}
          {selectedVoters.size > 0 && (
            <span className="bg-white/30 text-white text-xs font-bold px-1.5 rounded-md">
              {selectedVoters.size}
            </span>
          )}
        </button>

        <span className="ml-auto text-xs text-gray-400">
          {filtered.length}/{photos.length}
        </span>
      </div>

      {/* ── Photo list ───────────────────────────────────────────────────── */}
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
              <PhotoListRow key={photo.id} photo={photo} rank={i}
                isWinner={photo.id === winner?.id}
                onClick={() => setReactionSheet(photo)} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((photo, i) => (
              <PhotoGridCard key={photo.id} photo={photo} rank={i}
                isWinner={photo.id === winner?.id}
                onClick={() => setReactionSheet(photo)} />
            ))}
          </div>
        )}
      </div>

      {/* ══ SORT bottom sheet ════════════════════════════════════════════════ */}
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} title={t("sort")}>
        {/* Grid / List toggle at TOP of sort sheet */}
        <div className="flex gap-2 mb-5">
          {[
            { key: "list", icon: <List size={15} />,       label: t("listView") },
            { key: "grid", icon: <LayoutGrid size={15} />, label: t("gridView") },
          ].map(({ key, icon, label }) => (
            <button key={key}
              onClick={() => { setViewMode(key); setSortOpen(false); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl
                          font-medium text-sm transition-colors
                          ${viewMode === key
                            ? "bg-primary-400 text-white"
                            : "bg-border-light dark:bg-border-dark hover:bg-primary-50 dark:hover:bg-primary-900/20"
                          }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="w-full h-px bg-border-light dark:bg-border-dark mb-4" />

        {/* Sort options (descending only per spec) */}
        {[
          { key: "likes_desc",    label: t("sortMostLikes") },
          { key: "dislikes_desc", label: t("sortMostDislikes") },
        ].map(({ key, label }) => (
          <button key={key}
            onClick={() => { setSortKey(key); setSortOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl
                        text-sm font-medium transition-colors mb-2
                        ${sortKey === key
                          ? "bg-primary-50 dark:bg-primary-900/20 text-primary-500"
                          : "hover:bg-border-light dark:hover:bg-border-dark"
                        }`}
          >
            {label}
            {sortKey === key && <Check size={16} className="text-primary-400" />}
          </button>
        ))}
      </BottomSheet>

      {/* ══ FILTER bottom sheet ══════════════════════════════════════════════ */}
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title={t("filterByVoter")}>
        {voter_summaries.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">{t("noVoters")}</p>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-3">{t("selectVoters")}</p>
            <div className="space-y-1 mb-6">
              {voter_summaries.map((v) => {
                const vid      = String(v.voter_id);
                const selected = pendingVoters.has(vid);
                return (
                  <button key={vid}
                    onClick={() => togglePending(vid)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl
                                text-sm transition-colors
                                ${selected
                                  ? "bg-primary-50 dark:bg-primary-900/20"
                                  : "hover:bg-border-light dark:hover:bg-border-dark"
                                }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                                       ${selected ? "bg-primary-400" : "bg-border-light dark:bg-border-dark"}`}>
                        <span className={`text-xs font-bold ${selected ? "text-white" : "text-primary-500"}`}>
                          {v.username?.[0]?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                      <span className="font-medium truncate">@{v.username}</span>
                    </div>
                    {selected && <Check size={16} className="text-primary-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={clearFilter}
                className="flex-1 btn-secondary py-3">{t("clearFilter")}</button>
              <button onClick={applyFilter}
                className="flex-1 btn-primary py-3">{t("applyFilter")}</button>
            </div>
          </>
        )}
      </BottomSheet>

      {/* ══ Reactions bottom sheet ════════════════════════════════════════════ */}
      <BottomSheet
        open={!!reactionSheet}
        onClose={() => setReactionSheet(null)}
        title={reactionSheetTitle}
      >
        {renderReactionContent()}
      </BottomSheet>
    </div>
  );
}
