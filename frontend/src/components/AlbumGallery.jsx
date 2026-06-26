/**
 * AlbumGallery.jsx — v7 Full-screen photo viewer
 *
 * CHANGES v6 → v7:
 *  - Stacked BottomSheet architecture:
 *      Primary sheet (statistics/comments) has hideHeader=true so no X/title.
 *      Tapping Sort or Filter inside the primary sheet opens an INDEPENDENT
 *      secondary sheet at z-60, which slides up over the primary without
 *      capturing its drag state.
 *      Closing the secondary never touches the primary's drag position or
 *      its visual state.
 *  - Sort and Filter buttons now mirror the AnalyticsPage toolbar styling.
 *  - Sort/filter logic (sortKey, selectedVoters) lifted to AlbumGallery so
 *    the secondary sheets can mutate them directly while the primary sheet
 *    observes the same data.
 *  - Primary sheet's Escape handler skips when a secondary is open, so
 *    pressing Escape dismisses only the topmost layer.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";
import {
  MessageCircle, BarChart2, SlidersHorizontal, Filter, Share2, Check,
  List, LayoutGrid,
} from "lucide-react";
import { albumsApi, commentsApi } from "../api";
import { useLang } from "../contexts/LangContext";
import BottomSheet from "./BottomSheet";
import PhotoComments from "./PhotoComments";
import FilledHeart from "./FilledHeart";
import BrokenHeart from "./BrokenHeart";

// ─── PillBar (unchanged) ────────────────────────────────────────────────────
function PillBar({ likeCount, dislikeCount, commentCount, onExpand, onSwipeUp }) {
  const dragStartY = useRef(0);

  const handlePointerDown = (e) => {
    dragStartY.current = e.clientY ?? e.touches?.[0]?.clientY;
  };

  const handlePointerUp = (e) => {
    const endY = e.clientY ?? e.changedTouches?.[0]?.clientY;
    if (dragStartY.current - endY > 40) {
      onSwipeUp?.();
    }
  };

  return (
    <motion.button
      onClick={onExpand}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      whileTap={{ scale: 0.96 }}
      className="flex items-center gap-5 px-6 py-3 rounded-full
                 bg-white/10 backdrop-blur-xl
                 text-white shadow-lg cursor-pointer"
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <FilledHeart size={16} className="text-green-400" />
        {likeCount}
      </span>
      <span className="flex items-center gap-2 text-sm font-semibold">
        <BrokenHeart size={16} className="text-red-400" />
        {dislikeCount}
      </span>
      <span className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle size={16} className="text-blue-400" />
        {commentCount}
      </span>
    </motion.button>
  );
}

// ─── Thumbnail Strip (unchanged) ───────────────────────────────────────────
function ThumbStrip({ photos, currentIdx, onSelect }) {
  const stripRef = useRef(null);

  useEffect(() => {
    if (!stripRef.current) return;
    const strip = stripRef.current;
    const thumbWidth = 44; // w-11 = 44px
    const gap = 8; // gap-2 = 8px
    const containerWidth = strip.clientWidth;
    const activeCenter = currentIdx * (thumbWidth + gap) + thumbWidth / 2;
    const scrollTo = activeCenter - containerWidth / 2;
    strip.scrollTo({ left: Math.max(0, scrollTo), behavior: "smooth" });
  }, [currentIdx]);

  return (
    <div
      ref={stripRef}
      className="flex items-center gap-2 overflow-x-auto px-4 py-2"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      <div className="flex gap-2 items-center min-w-max mx-auto">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => onSelect(i)}
            className={`flex-shrink-0 w-11 h-11 rounded-2xl overflow-hidden transition-all duration-150
                       ${i === currentIdx
                         ? "ring-2 ring-white ring-offset-1 ring-offset-black scale-115"
                         : "opacity-50 hover:opacity-80"}`}
          >
            <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Statistics Tab content (header + photo list) ───────────────────────────
//
// Renders the "Full Album Statistics" view inside the primary BottomSheet.
// Buttons here IDENTICALLY mirror the AnalyticsPage toolbar styling
// (AlbumSummary.jsx):
//   - Sort button: SlidersHorizontal + t("sort")
//   - Filter button: Filter + t("filterBy") with active-count badge
//   - Share button: w-10 h-10 rounded-2xl square icon
//
// Tapping Sort / Filter triggers the secondary BottomSheets — state and
// handlers are owned by the parent (AlbumGallery) so the secondary sheet
// can mutate the same data this tab observes.
function StatisticsTab({
  analytics,
  photos,
  currentPhotoId,
  onJump,
  selectedVotersSize,
  onOpenSort,
  onOpenFilter,
  onShare,
  shareDone,
}) {
  const { t } = useLang();
  if (!analytics) return <p className="text-center text-gray-400 py-8 text-sm">Loading stats...</p>;

  return (
    <div className="space-y-4">
      {/* Toolbar — IDENTICAL buttons to AnalyticsPage / AlbumSummary */}
      <div className="flex items-center gap-3">
        <button onClick={onOpenSort}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-medium text-sm
                     bg-border-light dark:bg-border-dark
                     hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
          <SlidersHorizontal size={15} /> {t("sort")}
        </button>
        <button onClick={onOpenFilter}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-medium text-sm
                      transition-colors
                      ${selectedVotersSize > 0
                        ? "bg-primary-400 text-white"
                        : "bg-border-light dark:bg-border-dark hover:bg-primary-50 dark:hover:bg-primary-900/20"}`}>
          <Filter size={15} /> {t("filterBy")}
          {selectedVotersSize > 0 && (
            <span className="bg-white/30 text-white text-xs font-bold px-1.5 rounded-md">
              {selectedVotersSize}
            </span>
          )}
        </button>
        <button onClick={onShare}
          className="ml-auto w-10 h-10 rounded-2xl flex items-center justify-center
                     bg-border-light dark:bg-border-dark text-gray-400
                     hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
          {shareDone ? <Check size={15} /> : <Share2 size={15} />}
        </button>
      </div>

      {/* Sub-header */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="font-semibold">{t("statistics")}</span>
        <span>{analytics.total_votes} {t("totalVotes")}</span>
      </div>

      {/* Photo list */}
      {photos.length === 0 && (
        <p className="text-center text-gray-400 py-8 text-sm">{t("noVotes")}</p>
      )}
      <div className="space-y-1">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => onJump(photo.id)}
            className={`w-full flex items-center gap-3 py-2 px-2 rounded-xl transition-colors
                       ${String(photo.id) === String(currentPhotoId)
                         ? "bg-primary-50 dark:bg-primary-900/20"
                         : "hover:bg-border-light dark:hover:bg-border-dark"}`}
          >
            <span className="w-5 text-center text-xs font-bold text-gray-400 flex-shrink-0">
              #{i + 1}
            </span>
            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0
                            bg-border-light dark:bg-border-dark">
              <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="h-1.5 bg-border-light dark:bg-border-dark rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary-400 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${photo.like_percentage || 0}%` }}
                  transition={{ delay: i * 0.03 + 0.2, duration: 0.4 }}
                />
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                <span className="text-green-500 flex items-center gap-0.5">
                  <FilledHeart size={9} /> {photo.like_count}
                </span>
                <span className="text-red-400 flex items-center gap-0.5">
                  <BrokenHeart size={9} /> {photo.dislike_count}
                </span>
                <span className="ml-auto">
                  {photo.total_votes > 0 ? `${photo.like_percentage}%` : "—"}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Secondary SortSheet (independent layered sheet) ─────────────────────────
//
// Rendered as a sibling of the primary sheet at z-60. When the user taps
// the Sort button inside the primary sheet, this slides up over the
// primary. Closing it ONLY closes this sheet — the primary remains at its
// current drag position and is fully interactive.
//
// Mirrors AlbumSummary's sort sheet exactly (list/grid toggle + sort options)
// so the appearance and behavior match the AnalyticsPage.
function GallerySortSheet({ open, onClose, sortKey, setSortKey }) {
  const { t } = useLang();
  const [viewMode, setViewMode] = useState("list");

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("sort")}
      zIndex={60}
    >
      {/* List/Grid view toggle — identical to AlbumSummary */}
      <div className="flex gap-2 mb-5">
        {[
          { key: "list", icon: <List size={15} />, label: t("listView") },
          { key: "grid", icon: <LayoutGrid size={15} />, label: t("gridView") },
        ].map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => { setViewMode(key); onClose(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl
                        font-medium text-sm transition-colors
                        ${viewMode === key
                          ? "bg-primary-400 text-white"
                          : "bg-border-light dark:bg-border-dark hover:bg-primary-50 dark:hover:bg-primary-900/20"}`}
          >
            {icon} {label}
          </button>
        ))}
      </div>
      <div className="w-full h-px bg-border-light dark:bg-border-dark mb-4" />
      {/* Sort options — identical to AlbumSummary */}
      {[
        { key: "likes_desc", label: t("sortMostLikes") },
        { key: "dislikes_desc", label: t("sortMostDislikes") },
      ].map(({ key, label }) => (
        <button
          key={key}
          onClick={() => { setSortKey(key); onClose(); }}
          className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl
                      text-sm font-medium transition-colors mb-2
                      ${sortKey === key
                        ? "bg-primary-50 dark:bg-primary-900/20 text-primary-500"
                        : "hover:bg-border-light dark:hover:bg-border-dark"}`}
        >
          {label}
          {sortKey === key && <Check size={16} className="text-primary-400" />}
        </button>
      ))}
    </BottomSheet>
  );
}

// ─── Secondary FilterSheet (independent layered sheet) ──────────────────────
function GalleryFilterSheet({
  open,
  onClose,
  voter_summaries,
  pendingVoters,
  togglePending,
  applyFilter,
  clearFilter,
}) {
  const { t } = useLang();

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("filterByVoter")}
      zIndex={60}
    >
      {voter_summaries.length === 0 ? (
        <p className="text-center text-gray-400 py-8 text-sm">{t("noVoters")}</p>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">{t("selectVoters")}</p>
          <div className="space-y-1 mb-6">
            {voter_summaries.map((v) => {
              const vid = String(v.voter_id);
              const selected = pendingVoters.has(vid);
              return (
                <button
                  key={vid}
                  onClick={() => togglePending(vid)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl
                              text-sm transition-colors
                              ${selected
                                ? "bg-primary-50 dark:bg-primary-900/20"
                                : "hover:bg-border-light dark:hover:bg-border-dark"}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                                  ${selected
                                    ? "bg-primary-400"
                                    : "bg-border-light dark:bg-border-dark"}`}
                    >
                      <span
                        className={`text-xs font-bold ${selected ? "text-white" : "text-primary-500"}`}
                      >
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
            <button onClick={clearFilter} className="flex-1 btn-secondary py-3">
              {t("clearFilter")}
            </button>
            <button onClick={applyFilter} className="flex-1 btn-primary py-3">
              {t("applyFilter")}
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}

// ─── Main Gallery Component ─────────────────────────────────────────────────
export default function AlbumGallery({ album, onClose, startPhotoId }) {
  const { t } = useLang();
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const [analytics, setAnalytics] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(() => {
    if (startPhotoId && album.photos?.length) {
      const idx = album.photos.findIndex((p) => String(p.id) === String(startPhotoId));
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sheetTab, setSheetTab] = useState("stats");

  // Stacked-sheet state lifted to root so secondary sheets can mutate data.
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState("likes_desc");
  const [selectedVoters, setSelectedVoters] = useState(new Set());
  const [pendingVoters, setPendingVoters] = useState(new Set());
  const [shareDone, setShareDone] = useState(false);

  // Drag motion values
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const photoControls = useAnimation();

  // BottomSheet shared drag position for photo shrink (PRIMARY sheet only)
  const sheetY = useMotionValue(0);

  // Derived values for photo transform during sheet drag
  const photoScale = useTransform(sheetY, [0, vh * 0.4], [1, 0.7]);
  const photoTranslateY = useTransform(sheetY, [0, vh * 0.4], [0, -vh * 0.12]);

  const bgOpacity = useTransform(dragY, [0, vh * 0.5], [1, 0]);

  useEffect(() => {
    if (!album?.id) return;
    albumsApi.getAnalytics(album.id)
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [album?.id]);

  // Photo list (prefer analytics, fallback to album)
  const photos = useMemo(() => {
    if (analytics?.photos?.length) return analytics.photos;
    return album.photos || [];
  }, [analytics, album.photos]);

  // Sort
  const sorted = useMemo(
    () => [...photos].sort((a, b) =>
      sortKey === "dislikes_desc"
        ? b.dislike_count - a.dislike_count
        : b.like_count - a.like_count
    ),
    [photos, sortKey]
  );

  // Filter (robust — recomputes counts per photo)
  const filtered = useMemo(() => {
    if (selectedVoters.size === 0) return sorted;
    return sorted
      .map((photo) => {
        const filteredRx = (photo.reactions || []).filter(
          (r) => selectedVoters.has(String(r.voter_id))
        );
        if (filteredRx.length === 0) return null;
        const likes = filteredRx.filter((r) => r.is_like).length;
        const dislikes = filteredRx.length - likes;
        const pct = filteredRx.length > 0
          ? Math.round((likes / filteredRx.length) * 1000) / 10 : 0;
        return {
          ...photo,
          reactions: filteredRx,
          like_count: likes,
          dislike_count: dislikes,
          total_votes: filteredRx.length,
          like_percentage: pct,
        };
      })
      .filter(Boolean);
  }, [sorted, selectedVoters]);

  const currentPhoto = photos[currentIdx];
  const likeCount = currentPhoto?.like_count ?? 0;
  const dislikeCount = currentPhoto?.dislike_count ?? 0;
  const [commentsCount, setCommentsCount] = useState(0);

  useEffect(() => {
    if (!currentPhoto?.id) return;
    commentsApi.getForPhoto(currentPhoto.id)
      .then((data) => {
        let count = data?.length ?? 0;
        if (Array.isArray(data)) {
          count = data.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0);
        }
        setCommentsCount(count);
      })
      .catch(() => setCommentsCount(0));
  }, [currentPhoto?.id]);

  // Navigate with NO transition
  const goTo = useCallback((idx) => {
    setCurrentIdx(idx);
    dragX.set(0);
    dragY.set(0);
  }, [dragX, dragY]);

  const handleNext = useCallback(() => {
    goTo(currentIdx < photos.length - 1 ? currentIdx + 1 : 0);
  }, [currentIdx, photos.length, goTo]);

  const handlePrev = useCallback(() => {
    goTo(currentIdx > 0 ? currentIdx - 1 : photos.length - 1);
  }, [currentIdx, photos.length, goTo]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === "ArrowLeft") handlePrev();
    if (e.key === "ArrowRight") handleNext();
    // Escape is delegated to each BottomSheet via their own closeOnEscape flag.
  }, [handlePrev, handleNext]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleDragEnd = useCallback((_, info) => {
    const absX = Math.abs(info.offset.x);
    const absY = Math.abs(info.offset.y);

    // Swipe down → close
    if (info.offset.y > 100 || info.velocity.y > 600) {
      onClose();
      return;
    }

    // Swipe left → next
    if ((info.offset.x < -80 || info.velocity.x < -500) && absX > absY) {
      handleNext();
      return;
    }

    // Swipe right → prev
    if ((info.offset.x > 80 || info.velocity.x > 500) && absX > absY) {
      handlePrev();
      return;
    }

    // Snap back
    dragX.set(0);
    dragY.set(0);
    photoControls.set({ x: 0, y: 0 });
  }, [onClose, handleNext, handlePrev, photoControls]);

  // Jump to specific photo (from stats)
  const jumpToPhoto = useCallback((photoId) => {
    const idx = photos.findIndex((p) => String(p.id) === String(photoId));
    if (idx >= 0) goTo(idx);
  }, [photos, goTo]);

  const handleShare = async () => {
    const url = window.location.href;
    if (/Mobi|Android/i.test(navigator.userAgent) && navigator.share) {
      try {
        await navigator.share({ title: t("shareTitle"), url });
        setShareDone(true); setTimeout(() => setShareDone(false), 2000);
        return;
      } catch { /* fallback to clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareDone(true); setTimeout(() => setShareDone(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
      setShareDone(true); setTimeout(() => setShareDone(false), 2000);
    }
  };

  // ── Sort/Filter handlers for the secondary sheets ────────────────────────
  const openFilterSheet = () => {
    setPendingVoters(new Set(selectedVoters));
    setFilterOpen(true);
  };
  const applyFilter = () => {
    setSelectedVoters(new Set(pendingVoters));
    setFilterOpen(false);
  };
  const clearFilter = () => {
    setPendingVoters(new Set());
    setSelectedVoters(new Set());
    setFilterOpen(false);
  };
  const togglePending = (id) => setPendingVoters((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const voter_summaries = analytics?.voter_summaries || [];

  // Render comments
  const renderComments = () => {
    if (!currentPhoto) return null;
    return (
      <PhotoComments
        photoId={String(currentPhoto.id)}
        albumCreatorId={album.creator_id ? String(album.creator_id) : null}
      />
    );
  };

  // Primary sheet's Escape handler must skip while any secondary is open so
  // Escape closes only the topmost layer.
  const secondaryOpen = sortOpen || filterOpen;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      className="fixed inset-0 z-[90] bg-black flex flex-col overflow-hidden"
    >
      <motion.div
        className="absolute inset-0 bg-black"
        style={{ opacity: bgOpacity }}
      />

      <motion.div
        className="flex-1 flex items-center justify-center relative"
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.3}
        onDragEnd={handleDragEnd}
        animate={photoControls}
        style={{
          x: dragX,
          y: dragY,
          scale: photoScale,
          translateY: photoTranslateY,
          touchAction: "none",
        }}
      >
        <motion.div
          key={currentPhoto?.id || "empty"}
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="w-full h-full flex items-center justify-center"
        >
          {currentPhoto?.url ? (
            <img
              src={currentPhoto.url}
              alt=""
              className="max-w-full max-h-full object-contain select-none pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="text-white/40 text-sm">No photo</div>
          )}
        </motion.div>
      </motion.div>

      <div className="flex flex-col items-center gap-3 pb-6 flex-shrink-0">
        {photos.length > 1 && (
          <ThumbStrip photos={photos} currentIdx={currentIdx} onSelect={goTo} />
        )}

        {!sheetExpanded && (
          <PillBar
            likeCount={likeCount}
            dislikeCount={dislikeCount}
            commentCount={commentsCount}
            onExpand={() => setSheetExpanded(true)}
            onSwipeUp={() => setSheetExpanded(true)}
          />
        )}
      </div>

      {/* ─── PRIMARY BottomSheet (statistics/comments) ───────────────────────
          hideHeader=true → no X button, no "Statistics"/"Comments" title row.
          Only the in-sheet Stats↔Comments tab bar (headerChildren) is shown.
          Escape is suppressed while a secondary sheet is open so dismissal
          stays isolated. */}
      <BottomSheet
        open={sheetExpanded}
        onClose={() => setSheetExpanded(false)}
        sharedY={sheetY}
        hideHeader={true}
        closeOnEscape={!secondaryOpen}
        headerChildren={
          <div className="flex gap-2">
            <button
              onClick={() => setSheetTab("stats")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition-colors ${
                sheetTab === "stats"
                  ? "bg-primary-400 text-white"
                  : "bg-border-light dark:bg-border-dark text-gray-500 dark:text-gray-400"
              }`}
            >
              <BarChart2 size={14} />
              {t("statistics")}
            </button>
            <button
              onClick={() => setSheetTab("comments")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition-colors ${
                sheetTab === "comments"
                  ? "bg-primary-400 text-white"
                  : "bg-border-light dark:bg-border-dark text-gray-500 dark:text-gray-400"
              }`}
            >
              <MessageCircle size={14} />
              {t("Comments")}
            </button>
          </div>
        }
      >
        {sheetTab === "stats" ? (
          <StatisticsTab
            analytics={analytics}
            photos={filtered}
            currentPhotoId={currentPhoto?.id}
            onJump={jumpToPhoto}
            selectedVotersSize={selectedVoters.size}
            onOpenSort={() => setSortOpen(true)}
            onOpenFilter={openFilterSheet}
            onShare={handleShare}
            shareDone={shareDone}
          />
        ) : renderComments()}
      </BottomSheet>

      {/* ─── SECONDARY SortSheet (independent, z-60) ──────────────────────────
          Slides up over primary; closing it does NOT disturb the primary. */}
      <GallerySortSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        sortKey={sortKey}
        setSortKey={setSortKey}
      />

      {/* ─── SECONDARY FilterSheet (independent, z-60) ─────────────────────── */}
      <GalleryFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        voter_summaries={voter_summaries}
        pendingVoters={pendingVoters}
        togglePending={togglePending}
        applyFilter={applyFilter}
        clearFilter={clearFilter}
      />
    </motion.div>
  );
}
