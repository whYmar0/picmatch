/**
 * AlbumSummary.jsx — v6
 *
 * CHANGES v6:
 *  - Photo detail BottomSheet now has two tabs: Reactions | Comments
 *  - Tab bar lives in the sheet header (headerChildren prop) — never stacks
 *  - PhotoComments receives albumCreatorId so owner can delete any comment
 *  - Album owner identity resolved from analytics.creator_id vs useAuth()
 */
import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, LayoutGrid, List,
  SlidersHorizontal, Filter, Share2, MessageCircle, Check,
} from "lucide-react";
import FilledHeart   from "./FilledHeart";
import BrokenHeart   from "./BrokenHeart";
import { isVideo } from "../utils/media";
import { useLang }        from "../contexts/LangContext";
import { useAuth }        from "../contexts/AuthContext";
import BottomSheet        from "./BottomSheet";
import ImageLightbox      from "./ImageLightbox";
import PhotoComments      from "./PhotoComments";
import AnalyticsShareSheet from "./AnalyticsShareSheet";
import VideoPlayer from "./VideoPlayer";
import { UserAvatar }     from "./Navbar";

function ReactionBadge({ isLike }) {
  return isLike
    ? <span className="inline-flex items-center gap-1 text-green-500 text-xs font-semibold">
        <FilledHeart size={10} /> Нравится
      </span>
    : <span className="inline-flex items-center gap-1 text-red-400 text-xs font-semibold">
        <BrokenHeart size={10} strokeWidth={2} /> Пропуск
      </span>;
}

function VoterRow({ username, avatarUrl, right }) {
  const user = { username, avatar_url: avatarUrl };
  return (
    <div className="flex items-center justify-between py-2.5
                    border-b border-border-light dark:border-border-dark last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <UserAvatar user={user} size={32} />
        <span className="text-sm font-medium truncate">{username}</span>
      </div>
      <div className="flex-shrink-0 ml-3">{right}</div>
    </div>
  );
}

function PhotoListRow({ photo, rank, onPhotoClick, canViewStats }) {
  return (
    <div className="flex items-center gap-3 py-2 px-2 rounded-2xl
                    hover:bg-border-light dark:hover:bg-border-dark transition-colors">
      <span className="w-6 text-center text-xs font-bold text-gray-400 flex-shrink-0">
        #{rank + 1}
      </span>      <button onClick={() => onPhotoClick(photo)} className="media-thumbnail w-12 h-12 rounded-xl overflow-hidden flex-shrink-0
                   bg-border-light dark:bg-border-dark
                   hover:ring-2 hover:ring-primary-400 transition-all"
      >
        {isVideo(photo) ? (
          <video src={photo.url} className="w-full h-full object-cover" preload="metadata" muted playsInline />
        ) : (
          <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
        )}
      </button>
      <button onClick={() => onPhotoClick(photo)} className="flex-1 min-w-0 text-left">
        {canViewStats ? (
          <>
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
                <FilledHeart size={9} /> {photo.like_count}
              </span>
              <span className="text-red-400 flex items-center gap-0.5">
                <BrokenHeart size={9} strokeWidth={2} /> {photo.dislike_count}
              </span>
              <span className="ml-auto">
                {photo.total_votes > 0 ? `${photo.like_percentage}%` : "—"}
              </span>
            </div>
          </>
        ) : null}
      </button>
    </div>
  );
}

function PhotoGridCard({ photo, rank, onPhotoClick, canViewStats }) {
  return (
    <div className="relative aspect-square rounded-xl overflow-hidden
                    bg-border-light dark:bg-border-dark group">
      <button onClick={() => onPhotoClick(photo)} className="media-thumbnail absolute inset-0 z-10">
        {isVideo(photo) ? (
          <video src={photo.url} className="w-full h-full object-cover" preload="metadata" muted playsInline />
        ) : (
          <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
        )}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onPhotoClick(photo); }}
        className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t
                   from-black/70 to-transparent p-2 pt-5 text-left"
      >
        <div className="flex justify-between">
          <span className="text-white text-xs font-bold">#{rank + 1}</span>
          {canViewStats && (
            <span className="text-white text-xs">
              {photo.total_votes > 0 ? `${photo.like_percentage}%` : "—"}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

// ─── Tab Bar for photo detail sheet ─────────────────────────────────────────
function PhotoTabBar({ tab, setTab, likeCount, dislikeCount, canViewStats, commentsLabel }) {
  return (
    <div className="flex gap-2">
      {canViewStats && (
        <button
          onClick={() => setTab("reactions")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl
                      text-sm font-semibold transition-colors
                      ${tab === "reactions"
                        ? "bg-primary-400 text-white"
                        : "bg-border-light dark:bg-border-dark text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/20"}`}
        >
          <FilledHeart size={14} />
          <span>{likeCount}</span>
          <span className="text-xs opacity-70">·</span>
          <BrokenHeart size={14} strokeWidth={2} />
          <span>{dislikeCount}</span>
        </button>
      )}
      <button
        onClick={() => setTab("comments")}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl
                    text-sm font-semibold transition-colors
                    ${tab === "comments" || !canViewStats
                      ? "bg-primary-400 text-white"
                      : "bg-border-light dark:bg-border-dark text-gray-500 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900/20"}`}
      >
        <MessageCircle size={14} />
        {commentsLabel}
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AlbumSummary({ analytics, onBack, initialPhotoId = null, initialTab = "comments" }) {
  const { t }    = useLang();
  const { user } = useAuth();

  const [sortKey,        setSortKey]        = useState("likes_desc");
  const [viewMode,       setViewMode]       = useState("list");
  const [sortOpen,       setSortOpen]       = useState(false);
  const [filterOpen,     setFilterOpen]     = useState(false);
  const [selectedVoters, setSelectedVoters] = useState(new Set());
  const [pendingVoters,  setPendingVoters]  = useState(new Set());
  const [reactionSheet,  setReactionSheet]  = useState(null);  // null | "voters" | photo object
  const [reactionTab,    setReactionTab]    = useState("reactions"); // "reactions" | "comments"
  const [lightbox,       setLightbox]       = useState(null);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);

  if (!analytics) return null;
  const { title, description, total_votes, unique_voters,
          global_like_rate, voter_summaries, photos,
          creator_id, is_public, can_view_stats } = analytics;

  const isOwner = user && String(user.id) === String(creator_id);
  const canViewStats = Boolean(can_view_stats);
  const visiblePhotos = canViewStats
    ? photos
    : photos.map((photo) => ({
        ...photo,
        like_count: 0,
        dislike_count: 0,
        total_votes: 0,
        like_percentage: 0,
        reactions: [],
      }));

  // ── Open photo detail (always resets to reactions tab if authorized) ────────
  const openPhotoSheet = (photo) => {
    setReactionTab(canViewStats ? "reactions" : "comments");
    setReactionSheet(photo);
  };

  // Auto-open sheet when navigated from a notification deep-link
  useEffect(() => {
    if (!initialPhotoId || !photos?.length) return;
    const photo = photos.find((p) => String(p.id) === String(initialPhotoId));
    if (!photo) return;
    setReactionSheet(photo);
    setReactionTab(canViewStats ? initialTab : "comments");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount — analytics is already available as a prop

  useEffect(() => {
    if (!canViewStats) {
      setSortOpen(false);
      setFilterOpen(false);
      setSelectedVoters(new Set());
      setPendingVoters(new Set());
      setReactionTab("comments");
    }
  }, [canViewStats]);

  // Sort
  const sorted = useMemo(() => [...visiblePhotos].sort((a, b) =>
    sortKey === "dislikes_desc"
      ? b.dislike_count - a.dislike_count
      : b.like_count - a.like_count
  ), [visiblePhotos, sortKey]);

  // Ref 23: robust filter — recomputes counts per photo from selected voters only
  const filtered = useMemo(() => {
    if (selectedVoters.size === 0) return sorted;
    return sorted
      .map((photo) => {
        const filteredRx = (photo.reactions || []).filter(
          (r) => selectedVoters.has(String(r.voter_id))
        );
        if (filteredRx.length === 0) return null;
        const likes    = filteredRx.filter((r) => r.is_like).length;
        const dislikes = filteredRx.length - likes;
        const pct      = filteredRx.length > 0
          ? Math.round((likes / filteredRx.length) * 1000) / 10 : 0;
        return { ...photo, reactions: filteredRx, like_count: likes,
                 dislike_count: dislikes, total_votes: filteredRx.length, like_percentage: pct };
      })
      .filter(Boolean);
  }, [sorted, selectedVoters, canViewStats]);

  // ── Reaction sheet content ───────────────────────────────────────────────────
  const renderVotersList = () =>
    voter_summaries.length === 0
      ? <p className="text-center text-gray-400 py-8 text-sm">{t("noVoters")}</p>
      : voter_summaries.map((v) => (
          <VoterRow key={v.voter_id} username={v.username}
            right={<span className="text-xs text-gray-400">{v.vote_count} {t("votes")}</span>} />
        ));

  const renderPhotoReactions = (photo) => {
    const reactions = selectedVoters.size > 0
      ? (photo.reactions || []).filter((r) => selectedVoters.has(String(r.voter_id)))
      : (photo.reactions || []);
    return reactions.length === 0
      ? <p className="text-center text-gray-400 py-6 text-sm">{t("noReactions")}</p>
      : reactions.map((r) => (
          <VoterRow key={r.voter_id} username={r.username}
            right={<ReactionBadge isLike={r.is_like} />} />
        ));
  };

  const renderSheetContent = () => {
    if (!reactionSheet) return null;
    if (reactionSheet === "voters") return renderVotersList();

    const photo = reactionSheet;
    if (reactionTab === "comments") {
      return (
        <PhotoComments
          photoId={String(photo.id)}
          albumCreatorId={String(creator_id)}
        />
      );
    }
    return renderPhotoReactions(photo);
  };

  // ── Tab bar for photo sheet header ──────────────────────────────────────────
  const photoSheetHeaderChildren = reactionSheet && reactionSheet !== "voters" ? (
    <PhotoTabBar
      tab={reactionTab}
      setTab={setReactionTab}
      likeCount={reactionSheet.like_count}
      dislikeCount={reactionSheet.dislikeCount || reactionSheet.dislike_count}
      canViewStats={canViewStats}
      commentsLabel={t("Comments")}
    />
  ) : null;

  const togglePending = (id) => setPendingVoters((prev) => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const openFilter  = () => { setPendingVoters(new Set(selectedVoters)); setFilterOpen(true); };
  const applyFilter = () => { setSelectedVoters(new Set(pendingVoters)); setFilterOpen(false); };
  const clearFilter = () => { setPendingVoters(new Set()); setSelectedVoters(new Set()); setFilterOpen(false); };
  // Owner-only: opens the token-share bottom sheet. Visitors have nothing
  // to share — they arrived via someone else's link.
  const handleShare = () => setShareSheetOpen(true);

  const sheetTitle =
    reactionSheet === "voters" ? t("voters") :
    reactionSheet && reactionSheet !== "voters"
      ? (reactionTab === "comments" ? t("Comments") : t("reactions"))
      : "";

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          {onBack && (
            <button onClick={onBack} className="btn-ghost -ml-2 text-sm px-3 py-2">
              <ArrowLeft size={14} /> {t("backToAlbums")}
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            {canViewStats && (
              <button onClick={() => setReactionSheet("voters")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl
                           text-gray-500 dark:text-gray-400 hover:text-primary-500 hover:bg-primary-50
                           dark:hover:bg-primary-900/20 transition-all font-sans font-bold text-sm">
                <Users size={15} />
                <span>{unique_voters}</span>
              </button>
            )}
            {isOwner && (
              <button onClick={handleShare}
                aria-label={t("shareAnalytics")}
                className="w-10 h-10 rounded-2xl flex items-center justify-center
                           bg-gray-100 dark:bg-gray-800 text-primary-500
                           hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                <Share2 size={18} />
              </button>
            )}
          </div>
        </div>
        <h1 className="font-display font-bold text-2xl truncate">{title}</h1>
        {description && (
          <p className="text-gray-400 text-sm mt-1 break-words line-clamp-2">{description}</p>
        )}
      </div>

      {/* Sort + Filter */}
      {canViewStats && <div className="flex items-center gap-3">
        <button onClick={() => setSortOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-medium text-sm
                     bg-border-light dark:bg-border-dark
                     hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
          <SlidersHorizontal size={15} /> {t("sort")}
        </button>
        <button onClick={openFilter}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-medium text-sm
                      transition-colors
                      ${selectedVoters.size > 0
                        ? "bg-primary-400 text-white"
                        : "bg-border-light dark:bg-border-dark hover:bg-primary-50"}`}>
          <Filter size={15} /> {t("filterBy")}
          {selectedVoters.size > 0 && (
            <span className="bg-white/30 text-white text-xs font-bold px-1.5 rounded-md">
              {selectedVoters.size}
            </span>
          )}
        </button>
        <span className="ml-auto text-xs text-gray-400 hidden">
          {filtered.length}/{photos.length}
        </span>
      </div>}

      {/* Photo list/grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
          {t("analyticsTitle")}
        </h2>
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">{t("noVotes")}</p>
        )}
        {viewMode === "list" ? (
          <div className="space-y-1">
            {filtered.map((photo, i) => (
              <PhotoListRow key={photo.id} photo={photo} rank={i}
                onPhotoClick={openPhotoSheet} canViewStats={canViewStats} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((photo, i) => (
              <PhotoGridCard key={photo.id} photo={photo} rank={i}
                onPhotoClick={openPhotoSheet} canViewStats={canViewStats} />
            ))}
          </div>
        )}
      </div>

      {/* Sort sheet */}
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} title={t("sort")}>
        <div className="flex gap-2 mb-5">
          {[
            { key: "list", icon: <List size={15} />,       label: t("listView") },
            { key: "grid", icon: <LayoutGrid size={15} />, label: t("gridView") },
          ].map(({ key, icon, label }) => (
            <button key={key} onClick={() => { setViewMode(key); setSortOpen(false); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl
                          font-medium text-sm transition-colors
                          ${viewMode === key
                            ? "bg-primary-400 text-white"
                            : "bg-border-light dark:bg-border-dark hover:bg-primary-50"}`}>
              {icon} {label}
            </button>
          ))}
        </div>
        <div className="w-full h-px bg-border-light dark:bg-border-dark mb-4" />
        {[
          { key: "likes_desc",    label: t("sortMostLikes") },
          { key: "dislikes_desc", label: t("sortMostDislikes") },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => { setSortKey(key); setSortOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl
                        text-sm font-medium transition-colors mb-2
                        ${sortKey === key
                          ? "bg-primary-50 dark:bg-primary-900/20 text-primary-500"
                          : "hover:bg-border-light dark:hover:bg-border-dark"}`}>
            {label}
            {sortKey === key && <Check size={16} className="text-primary-400" />}
          </button>
        ))}
      </BottomSheet>

      {/* Filter sheet */}
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
                  <button key={vid} onClick={() => togglePending(vid)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl
                                text-sm transition-colors
                                ${selected
                                  ? "bg-primary-50 dark:bg-primary-900/20"
                                  : "hover:bg-border-light dark:hover:bg-border-dark"}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                                       ${selected ? "bg-primary-400" : "bg-border-light dark:bg-border-dark"}`}>
                        <span className={`text-xs font-bold ${selected ? "text-white" : "text-primary-500"}`}>
                          {v.username?.[0]?.toUpperCase() ?? "?"}
                        </span>
                      </div>
                      <span className="font-medium truncate">{v.username}</span>
                    </div>
                    {selected && <Check size={16} className="text-primary-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={clearFilter} className="flex-1 btn-secondary py-3">{t("clearFilter")}</button>
              <button onClick={applyFilter} className="flex-1 btn-primary py-3">{t("applyFilter")}</button>
            </div>
          </>
        )}
      </BottomSheet>

      {/* Photo detail sheet — with tab bar in header */}
      <BottomSheet
        open={!!reactionSheet}
        onClose={() => setReactionSheet(null)}
        title={sheetTitle}
        headerChildren={photoSheetHeaderChildren}
        topContent={
          (reactionSheet && reactionSheet !== "voters") ? (
            <motion.div className="w-full flex justify-center px-4">
              {isVideo(reactionSheet) ? (
                <VideoPlayer
                  src={reactionSheet.url}
                  className="max-h-[45dvh] rounded-2xl shadow-2xl border border-white/10"
                  preload="metadata"
                />
              ) : (
                <img
                  src={reactionSheet.url}
                  className="max-h-[45dvh] w-auto h-auto rounded-2xl object-contain shadow-2xl border border-white/10"
                  alt=""
                />
              )}
            </motion.div>
          ) : null
        }
      >
        {renderSheetContent()}
      </BottomSheet>

      <ImageLightbox
        open={!!lightbox}
        src={lightbox?.url}
        alt={lightbox?.filename}
        mediaType={lightbox?.media_type}
        onClose={() => setLightbox(null)}
      />

      {/* Owner-only: share-link bottom sheet (token-protected analytics URL). */}
      {isOwner && (
        <AnalyticsShareSheet
          open={shareSheetOpen}
          onClose={() => setShareSheetOpen(false)}
          albumId={String(analytics.id)}
        />
      )}
    </div>
  );
}
