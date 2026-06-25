/**
 * AlbumGallery.jsx — Full-screen photo gallery with expandable bottom sheet
 *
 * Features:
 *   - Black background, photo slideshow
 *   - Bottom pill bar: likes, dislikes, comments count
 *   - Swipe up → bottom sheet with tabs: Album Stats | Comments
 *   - Smooth image shrink as sheet expands
 *   - Click photo in stats to jump to it
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown, MessageCircle, BarChart2, ArrowLeft } from "lucide-react";
import { albumsApi, commentsApi } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";
import BottomSheet from "./BottomSheet";
import PhotoComments from "./PhotoComments";
import RoundedHeart from "./RoundedHeart";

// ─── Pill Bar (collapsed state) ────────────────────────────────────────────
function PillBar({ likeCount, dislikeCount, commentCount, onExpand }) {
  const { t } = useLang();
  return (
    <motion.button
      onClick={onExpand}
      whileTap={{ scale: 0.95 }}
      className="flex items-center gap-4 px-5 py-2.5 rounded-full
                 bg-white/10 backdrop-blur-xl border border-white/20
                 text-white shadow-lg cursor-pointer"
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <ThumbsUp size={14} className="text-green-400" />
        {likeCount}
      </span>
      <span className="w-px h-4 bg-white/20" />
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <ThumbsDown size={14} className="text-red-400" />
        {dislikeCount}
      </span>
      <span className="w-px h-4 bg-white/20" />
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <MessageCircle size={14} className="text-blue-400" />
        {commentCount}
      </span>
      <motion.svg
        width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
        className="ml-1 opacity-70"
        animate={{ y: [0, 3, 0] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
      >
        <path d="m6 9 6 6 6-6" />
      </motion.svg>
    </motion.button>
  );
}

// ─── Photo Navigation ──────────────────────────────────────────────────────
function PhotoNav({ photos, currentIdx, onSelect }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-3"
         style={{ scrollbarWidth: "none" }}>
      {photos.map((photo, i) => (
        <button
          key={photo.id}
          onClick={() => onSelect(i)}
          className={`flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden transition-all duration-200
                     ${i === currentIdx
                       ? "ring-2 ring-white ring-offset-1 ring-offset-black scale-110"
                       : "opacity-50 hover:opacity-80"}`}
        >
          <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

// ─── Main Gallery Component ────────────────────────────────────────────────
export default function AlbumGallery({ album, onClose, startPhotoId }) {
  const { t } = useLang();

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

  // Fetch comment count for the current photo
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

  const handlePrev = useCallback(() => {
    setCurrentIdx((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  }, [photos.length]);

  const handleNext = useCallback(() => {
    setCurrentIdx((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  }, [photos.length]);

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

  // Jump to specific photo
  const jumpToPhoto = useCallback((photoId) => {
    const idx = photos.findIndex((p) => String(p.id) === String(photoId));
    if (idx >= 0) setCurrentIdx(idx);
  }, [photos]);

  // ── Sheet content: Album Stats ──────────────────────────────────────
  const renderStats = () => {
    if (!analytics) return <p className="text-center text-gray-400 py-8 text-sm">No stats available</p>;

    const sortedPhotos = [...photos].sort((a, b) => b.like_count - a.like_count);

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between px-2 pb-3 text-xs text-gray-400">
          <span>{t("analyticsTitle") || "All photos"}</span>
          <span>{analytics.total_votes} {t("totalVotes")}</span>
        </div>
        {sortedPhotos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => jumpToPhoto(photo.id)}
            className={`w-full flex items-center gap-3 py-2 px-2 rounded-xl transition-colors
                       ${String(photo.id) === String(currentPhoto?.id)
                         ? "bg-primary-50 dark:bg-primary-900/20"
                         : "hover:bg-border-light dark:hover:bg-border-dark"}`}
          >
            <span className="w-5 text-center text-xs font-bold text-gray-400 flex-shrink-0">
              #{i + 1}
            </span>
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-border-light dark:bg-border-dark">
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
          </button>
        ))}
      </div>
    );
  };

  // ── Sheet content: Comments ────────────────────────────────────────
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
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-black flex flex-col"
    >
      {/* ─── Header ─── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-2 pb-3
                      bg-gradient-to-b from-black/60 to-transparent">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center
                     text-white hover:bg-white/20 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-white/80 text-sm font-medium">
          {currentIdx + 1} / {photos.length}
        </span>
        <div className="w-9" />
      </div>

      {/* ─── Photo with shrink transform ─── */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {/* Previous arrow */}
        {photos.length > 1 && (
          <button
            onClick={handlePrev}
            className="absolute left-3 z-10 w-9 h-9 rounded-full bg-white/10 backdrop-blur-md
                       flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={currentPhoto?.id || "empty"}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.25 }}
            className="w-full h-full flex items-center justify-center px-12"
          >
            {currentPhoto?.url ? (
              <img
                src={currentPhoto.url}
                alt=""
                className="max-w-full max-h-full object-contain select-none"
                draggable={false}
              />
            ) : (
              <div className="text-white/40 text-sm">No photo</div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Next arrow */}
        {photos.length > 1 && (
          <button
            onClick={handleNext}
            className="absolute right-3 z-10 w-9 h-9 rounded-full bg-white/10 backdrop-blur-md
                       flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      {/* ─── Bottom: Photo nav thumbnails + Pill Bar ─── */}
      <div className="flex flex-col items-center gap-3 pb-6">
        {photos.length > 1 && (
          <PhotoNav photos={photos} currentIdx={currentIdx} onSelect={setCurrentIdx} />
        )}

        {!sheetExpanded && (
          <PillBar
            likeCount={likeCount}
            dislikeCount={dislikeCount}
            commentCount={commentsCount}
            onExpand={() => setSheetExpanded(true)}
          />
        )}
      </div>

      {/* ─── Expandable Bottom Sheet ─── */}
      <BottomSheet
        open={sheetExpanded}
        onClose={() => setSheetExpanded(false)}
        title={sheetTab === "stats" ? (t("analyticsTitle") || "Album Stats") : (t("Comments") || "Comments")}
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
              {t("analyticsTitle") || "Stats"}
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
              {t("Comments") || "Comments"}
            </button>
          </div>
        }
      >
        {sheetTab === "stats" ? renderStats() : renderComments()}
      </BottomSheet>
    </motion.div>
  );
}
