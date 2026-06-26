/**
 * AlbumGallery.jsx — v6 Full-screen photo viewer
 *
 * CHANGES:
 *   - Hero animation (scale+fade from center)
 *   - Swipe left/right for navigation (instant, no transition)
 *   - Swipe down to close (photo follows finger, background fades)
 *   - Thumbnail strip: rounded-2xl, auto-scroll active to center, tap = instant change
 *   - PillBar: no border, FilledHeart/BrokenHeart, no dividers, no chevron, click+swipe-up
 *   - BottomSheet with photo shrink (shared motionValue)
 *   - Statistics tab (renamed from "All photos") with sort/filter/share buttons
 *   - Removed: header bar, n/m counter, nav arrows, back arrow
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";
import {
  MessageCircle, BarChart2, SlidersHorizontal, Filter, Share2, Check, X
} from "lucide-react";
import { albumsApi, commentsApi } from "../api";
import { useLang } from "../contexts/LangContext";
import BottomSheet from "./BottomSheet";
import PhotoComments from "./PhotoComments";
import FilledHeart from "./FilledHeart";
import BrokenHeart from "./BrokenHeart";

// ─── PillBar (redesigned) ──────────────────────────────────────────────────
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

// ─── Thumbnail Strip ───────────────────────────────────────────────────────
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
}  // ─── Statistics Tab (with sort/filter/share) ───────────────────────────────
function StatisticsTab({ analytics, photos, currentPhotoId, onJump, onClose }) {
  const { t } = useLang();
  const [sortKey, setSortKey] = useState("likes_desc");
  const [shareDone, setShareDone] = useState(false);

  if (!analytics) return <p className="text-center text-gray-400 py-8 text-sm">Loading stats...</p>;

  const sorted = useMemo(() => [...photos].sort((a, b) =>
    sortKey === "dislikes_desc"
      ? b.dislike_count - a.dislike_count
      : b.like_count - a.like_count
  ), [photos, sortKey]);

  const handleShare = async () => {
    const url = window.location.href;
    if (/Mobi|Android/i.test(navigator.userAgent) && navigator.share) {
      try { await navigator.share({ title: t("shareTitle"), url }); setShareDone(true); setTimeout(() => setShareDone(false), 2000); return; } catch { /**/ }
    }
    try { await navigator.clipboard.writeText(url); setShareDone(true); setTimeout(() => setShareDone(false), 2000); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
      setShareDone(true); setTimeout(() => setShareDone(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sort + Filter + Share row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSortKey(sortKey === "likes_desc" ? "dislikes_desc" : "likes_desc")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold
                     bg-border-light dark:bg-border-dark text-gray-500 dark:text-gray-400
                     hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
        >
          <SlidersHorizontal size={13} />
          {sortKey === "likes_desc" ? t("sortMostLikes") : t("sortMostDislikes")}
        </button>
        <button
          onClick={handleShare}
          className="w-9 h-9 rounded-2xl flex items-center justify-center
                     bg-border-light dark:bg-border-dark text-gray-400
                     hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
        >
          {shareDone ? <Check size={15} /> : <Share2 size={15} />}
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="font-semibold">{t("statistics")}</span>
        <span>{analytics.total_votes} {t("totalVotes")}</span>
      </div>

      {/* Photo list */}
      <div className="space-y-1">
        {sorted.map((photo, i) => (
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
            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-border-light dark:bg-border-dark">
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

// ─── Main Gallery Component ────────────────────────────────────────────────
export default function AlbumGallery({ album, onClose, startPhotoId }) {
  const { t } = useLang();
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(() => {
    if (startPhotoId && album.photos?.length) {
      const idx = album.photos.findIndex((p) => String(p.id) === String(startPhotoId));
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sheetTab, setSheetTab] = useState("stats");

  // Drag motion values
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const photoControls = useAnimation();

  // BottomSheet shared drag position for photo shrink
  const sheetY = useMotionValue(0);

  // Derived values for photo transform during sheet drag
  const photoScale = useTransform(sheetY, [0, vh * 0.4], [1, 0.7]);
  const photoTranslateY = useTransform(sheetY, [0, vh * 0.4], [0, -vh * 0.12]);

  // Background opacity for swipe-down-to-close
  const bgOpacity = useTransform(dragY, [0, vh * 0.5], [1, 0]);

  useEffect(() => {
    if (!album?.id) return;
    setLoading(true);
    albumsApi.getAnalytics(album.id)
      .then(setAnalytics)
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, [album?.id]);

  const photos = useMemo(() => {
    if (analytics?.photos?.length) return analytics.photos;
    return album.photos || [];
  }, [analytics, album.photos]);

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
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowLeft") handlePrev();
    if (e.key === "ArrowRight") handleNext();
  }, [onClose, handlePrev, handleNext]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Swipe drag handler
  const handleDragEnd = useCallback((_, info) => {
    const absX = Math.abs(info.offset.x);
    const absY = Math.abs(info.offset.y);
    const velX = Math.abs(info.velocity.x);
    const velY = Math.abs(info.velocity.y);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      className="fixed inset-0 z-[90] bg-black flex flex-col overflow-hidden"
    >
      {/* Background (fades on swipe-down) */}
      <motion.div
        className="absolute inset-0 bg-black"
        style={{ opacity: bgOpacity }}
      />

      {/* ─── Main photo area with drag ─── */}
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

      {/* ─── Bottom area: thumbnails + PillBar ─── */}
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

      {/* ─── BottomSheet with shared drag ─── */}
      <BottomSheet
        open={sheetExpanded}
        onClose={() => setSheetExpanded(false)}
        title={sheetTab === "stats" ? t("statistics") : t("Comments")}
        sharedY={sheetY}
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
            photos={photos}
            currentPhotoId={currentPhoto?.id}
            onJump={jumpToPhoto}
            onClose={() => setSheetExpanded(false)}
          />
        ) : renderComments()}
      </BottomSheet>
    </motion.div>
  );
}
