/**
 * AlbumGallery.jsx — v11 Touch-driven photo viewer
 *
 * CHANGES v9 → v11 — Complete carousel rewrite:
 *  - Replaced native overflow-x scroll with touch-driven transform carousel.
 *    Each swipe = exactly one photo. No momentum overshoot.
 *  - Framer Motion useMotionValue + animate for 60fps compositor-only drag.
 *  - Centralized touch handling: parent wrapper does axis-locking,
 *    horizontal → dragX (carousel), vertical → dragY (dismiss).
 *  - Velocity-aware snap: quick flicks count even with small distance.
 *  - Rubber-band at first/last photo edges.
 *  - ThumbStrip: native overflow-x: auto for responsive finger-follow scrolling.
 *  - BottomSheet interaction lock: pointer-events:none on carousel when sheet open.
 *
 * CHANGES v7 → v8 (preserved):
 *  - PillBar: no border, larger monochrome icons, ChevronUp affordance.
 *  - Stacked BottomSheet architecture with independent secondary sheets.
 *  - Sort/Filter buttons mirror AnalyticsPage toolbar styling.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
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

// ─── PillBar v8 — no border, larger monochrome icons, ChevronUp affordance ──
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
    <div className="flex flex-col items-center gap-1.5">
      <motion.button
        onClick={onExpand}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        whileTap={{ scale: 0.96 }}
        className="flex items-center gap-8 px-8 py-4 rounded-full
                   bg-gray-900
                   text-white shadow-lg cursor-pointer"
      >
        <span className="flex items-center gap-2.5 text-base font-semibold">
          <FilledHeart size={22} className={likeCount > 0 ? "text-white" : "text-gray-400"} />
          {likeCount}
        </span>
        <span className="flex items-center gap-2.5 text-base font-semibold">
          <BrokenHeart size={22} className={dislikeCount > 0 ? "text-white" : "text-gray-400"} />
          {dislikeCount}
        </span>
        <span className="flex items-center gap-2.5 text-base font-semibold">
          <MessageCircle size={22} className={commentCount > 0 ? "text-white" : "text-gray-400"} />
          {commentCount}
        </span>
      </motion.button>
    </div>
  );
}

// ─── Thumbnail Strip — native overflow-x: auto + O(1) index calculation ────
const THUMB_SIZE = 40;
const THUMB_GAP = 8;

function ThumbStrip({ photos, currentIdx, onSelect }) {
  const stripRef = useRef(null);
  const thumbRefs = useRef([]);
  const selectingRef = useRef(false);
  const selectTimer = useRef(null);

  const centerThumb = useCallback((idx) => {
    const strip = stripRef.current;
    const el = thumbRefs.current[idx];
    if (!strip || !el) return;
    selectingRef.current = true;
    clearTimeout(selectTimer.current);
    const target = el.offsetLeft - strip.clientWidth / 2 + el.offsetWidth / 2;
    const max = strip.scrollWidth - strip.clientWidth;
    strip.scrollTo({ left: Math.max(0, Math.min(target, max)), behavior: "smooth" });
    selectTimer.current = setTimeout(() => { selectingRef.current = false; }, 300);
  }, []);

  useEffect(() => {
    centerThumb(currentIdx);
  }, [currentIdx, centerThumb]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const lastIdx = { current: -1 };
    let rafId = null;
    const onScroll = () => {
      if (selectingRef.current) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const idx = Math.round(strip.scrollLeft / (THUMB_SIZE + THUMB_GAP));
        const clamped = Math.max(0, Math.min(idx, photos.length - 1));
        if (clamped !== lastIdx.current) {
          lastIdx.current = clamped;
          onSelect(clamped);
        }
      });
    };
    strip.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      strip.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [photos.length, onSelect]);

  useEffect(() => () => { clearTimeout(selectTimer.current); }, []);

  const pad = `calc(50vw - ${THUMB_SIZE / 2}px)`;

  return (
    <div className="relative w-full">
      <div
        ref={stripRef}
        className="w-full overflow-x-auto relative py-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div
          className="flex items-center w-max"
          style={{ gap: THUMB_GAP, paddingLeft: pad, paddingRight: pad }}
        >
          {photos.map((photo, i) => {
            const active = i === currentIdx;
            return (
              <button
                key={photo.id}
                ref={(el) => { thumbRefs.current[i] = el; }}
                onClick={() => {
                  selectingRef.current = true;
                  clearTimeout(selectTimer.current);
                  onSelect(i);
                  selectTimer.current = setTimeout(() => { selectingRef.current = false; }, 300);
                }}
                style={{ width: THUMB_SIZE, height: THUMB_SIZE, flexShrink: 0 }}
                className={`btn-thumb transition-all duration-150 outline-none
                           ${active
                             ? "ring-[2px] ring-primary-400 ring-offset-1 ring-offset-black scale-[1.15] z-10"
                             : ""}`}
              >
                <img src={photo.url} alt="" className="w-full h-full object-cover rounded-xl select-none pointer-events-none" loading="lazy" draggable={false} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Statistics Tab content (header + photo list) ───────────────────────────
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

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="font-semibold">{t("statistics")}</span>
        <span>{analytics.total_votes} {t("totalVotes")}</span>
      </div>

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
                         : "hover:bg-border-light dark:bg-border-dark"}`}
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
                  <BrokenHeart size={9} strokeWidth={2} /> {photo.dislike_count}
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

// ─── Secondary SortSheet ────────────────────────────────────────────────────
function GallerySortSheet({ open, onClose, sortKey, setSortKey }) {
  const { t } = useLang();
  const [viewMode, setViewMode] = useState("list");

  return (
    <BottomSheet open={open} onClose={onClose} title={t("sort")} zIndex={60}>
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

// ─── Secondary FilterSheet ──────────────────────────────────────────────────
function GalleryFilterSheet({
  open, onClose, voter_summaries, pendingVoters, togglePending, applyFilter, clearFilter,
}) {
  const { t } = useLang();

  return (
    <BottomSheet open={open} onClose={onClose} title={t("filterByVoter")} zIndex={60}>
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
                                  ${selected ? "bg-primary-400" : "bg-border-light dark:bg-border-dark"}`}
                    >
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
  );
}

// ─── Main Gallery Component ─────────────────────────────────────────────────
export default function AlbumGallery({ album, onClose, startPhotoId }) {
  const { t } = useLang();
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // ── State ────────────────────────────────────────────────────────────────
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

  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState("likes_desc");
  const [selectedVoters, setSelectedVoters] = useState(new Set());
  const [pendingVoters, setPendingVoters] = useState(new Set());
  const [shareDone, setShareDone] = useState(false);

  // ── Carousel refs ────────────────────────────────────────────────────────
  const carouselRef = useRef(null);
  const currentIdxRef = useRef(0);
  const snapAnimRef = useRef(null);        // in-flight carousel snap animation

  // ── Axis-locking touch refs ──────────────────────────────────────────────
  const touchStart = useRef({ x: 0, y: 0, time: 0 });
  const gestureAxis = useRef(null);

  // ── Motion values ────────────────────────────────────────────────────────
  const defaultOffset = vh * 0.35;
  const dragY = useMotionValue(0);
  const dragYAnimRef = useRef(null);

  const dragX = useMotionValue(0);       // horizontal drag offset during swipe

  // Track position = -currentIdx * width + dragX
  const carouselX = useTransform(dragX, (x) => {
    const w = carouselRef.current?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 400);
    return -(currentIdxRef.current * w) + x;
  });

  // BottomSheet shared drag position
  const sheetY = useMotionValue(defaultOffset);
  const photoScale = useTransform(sheetY, [0, defaultOffset], [0.5, 1]);
  const photoTranslateY = useTransform(sheetY, [0, defaultOffset], [-vh * 0.3, 0]);

  const combinedTranslateY = useTransform(
    [photoTranslateY, dragY],
    ([sheetVal, dragVal]) => sheetVal + dragVal
  );

  const bgOpacity = useTransform(dragY, [0, vh * 0.5], [1, 0]);
  const controlsOpacity = useTransform(sheetY, [0, defaultOffset], [0, 1]);
  const controlsPointerEvents = useTransform(
    sheetY,
    (v) => (v < defaultOffset * 0.3 ? "none" : "auto")
  );

  const carouselPointerEvents = sheetExpanded ? "none" : "auto";

  // ── Data fetching ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!album?.id) return;
    albumsApi.getAnalytics(album.id)
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [album?.id]);

  const photos = useMemo(() => {
    if (analytics?.photos?.length) return analytics.photos;
    return album.photos || [];
  }, [analytics, album.photos]);

  const sorted = useMemo(
    () => [...photos].sort((a, b) =>
      sortKey === "dislikes_desc"
        ? b.dislike_count - a.dislike_count
        : b.like_count - a.like_count
    ),
    [photos, sortKey]
  );

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
        return { ...photo, reactions: filteredRx, like_count: likes, dislike_count: dislikes, total_votes: filteredRx.length, like_percentage: pct };
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

  // Sync sheetY on open
  useEffect(() => {
    if (sheetExpanded) {
      dragYAnimRef.current?.stop();
      dragY.set(0);
      sheetY.set(0);
    }
  }, [sheetExpanded, sheetY, dragY]);

  // ── Initial position (set ref, transform handles it) ────────────────────
  useEffect(() => {
    if (startPhotoId && currentIdx > 0 && photos.length > 1) {
      currentIdxRef.current = currentIdx;
      // Force dragX to 0 so carouselX recalculates
      dragX.set(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPhotoId, photos.length]);

  // ── Sync ref when state changes from goTo ───────────────────────────────
  useEffect(() => {
    currentIdxRef.current = currentIdx;
    // Reset dragX so carouselX snaps to new position
    dragX.set(0);
  }, [currentIdx, dragX]);

  // ── Programmatic navigation ──────────────────────────────────────────────
  const goTo = useCallback((idx) => {
    if (idx < 0 || idx >= photos.length) return;
    snapAnimRef.current?.stop();
    setCurrentIdx(idx);
    currentIdxRef.current = idx;
    dragX.set(0);
    // Reset dismiss gesture
    dragYAnimRef.current?.stop();
    dragY.set(0);
  }, [photos.length, dragX, dragY]);

  const jumpToPhoto = useCallback((photoId) => {
    const idx = photos.findIndex((p) => String(p.id) === String(photoId));
    if (idx >= 0) goTo(idx);
  }, [photos, goTo]);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (sheetExpanded) return;
    if (e.key === "ArrowLeft" && currentIdx > 0) goTo(currentIdx - 1);
    if (e.key === "ArrowRight" && currentIdx < photos.length - 1) goTo(currentIdx + 1);
  }, [currentIdx, photos.length, goTo, sheetExpanded]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Lock body scroll ─────────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ── Unified touch handlers (axis-lock: horizontal → dragX, vertical → dragY) ──
  const onWrapperTouchStart = useCallback((e) => {
    snapAnimRef.current?.stop();
    dragYAnimRef.current?.stop();
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    gestureAxis.current = null;
  }, []);

  const onWrapperTouchMove = useCallback((e) => {
    const touch = e.touches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Determine axis after ~12px of movement
    if (!gestureAxis.current && (absDx > 12 || absDy > 12)) {
      gestureAxis.current = absDx > absDy ? "x" : "y";
    }

    if (gestureAxis.current === "y") {
      e.preventDefault();
      dragY.set(dy);
      return;
    }

    if (gestureAxis.current === "x") {
      e.preventDefault();
      // Rubber-band at edges
      let clampedDx = dx;
      if ((currentIdxRef.current === 0 && dx > 0) ||
          (currentIdxRef.current === photos.length - 1 && dx < 0)) {
        clampedDx = dx * 0.3;
      }
      dragX.set(clampedDx);
    }
  }, [dragX, dragY, photos.length]);

  const onWrapperTouchEnd = useCallback((e) => {
    const touch = e.changedTouches?.[0];
    if (!touch) { gestureAxis.current = null; return; }

    if (gestureAxis.current === "y") {
      const currentDrag = dragY.get();
      if (currentDrag > 100) {
        onClose();
        gestureAxis.current = null;
        return;
      }
      dragYAnimRef.current = animate(dragY, 0, {
        type: "spring", stiffness: 400, damping: 30,
      });
      gestureAxis.current = null;
      return;
    }

    if (gestureAxis.current === "x") {
      const dx = touch.clientX - touchStart.current.x;
      const dt = Date.now() - touchStart.current.time;
      const velocity = dt > 0 ? dx / dt : 0; // px/ms
      const projectedDx = dx + velocity * 150;

      const containerWidth = carouselRef.current?.clientWidth || window.innerWidth;
      const threshold = containerWidth * 0.3;

      let targetIdx = currentIdxRef.current;
      if (projectedDx < -threshold && targetIdx < photos.length - 1) targetIdx++;
      if (projectedDx > threshold && targetIdx > 0) targetIdx--;

      // Animate dragX to full width, then update index
      if (targetIdx !== currentIdxRef.current) {
        // Animate to edge of current slide, then snap to new index
        const w = containerWidth;
        const targetX = targetIdx > currentIdxRef.current ? -w * 0.5 : w * 0.5;
        snapAnimRef.current = animate(dragX, targetX > 0 ? w : -w, {
          type: "spring", stiffness: 300, damping: 30,
          onComplete: () => {
            setCurrentIdx(targetIdx);
            currentIdxRef.current = targetIdx;
            dragX.set(0);
          },
        });
      } else {
        // Snap back to current position
        snapAnimRef.current = animate(dragX, 0, {
          type: "spring", stiffness: 300, damping: 30,
        });
      }

      gestureAxis.current = null;
      return;
    }

    gestureAxis.current = null;
  }, [dragX, dragY, photos.length, onClose]);

  const onWrapperTouchCancel = useCallback(() => {
    gestureAxis.current = null;
  }, []);

  const handleThumbSelect = useCallback((idx) => goTo(idx), [goTo]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      snapAnimRef.current?.stop();
      dragYAnimRef.current?.stop();
    };
  }, []);

  // ── Share handler ────────────────────────────────────────────────────────
  const handleShare = async () => {
    const url = window.location.href;
    if (/Mobi|Android/i.test(navigator.userAgent) && navigator.share) {
      try {
        await navigator.share({ title: t("shareTitle"), url });
        setShareDone(true); setTimeout(() => setShareDone(false), 2000);
        return;
      } catch { /* fallback */ }
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

  // ── Sort/Filter handlers ─────────────────────────────────────────────────
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

  const renderComments = () => {
    if (!currentPhoto) return null;
    return (
      <PhotoComments
        photoId={String(currentPhoto.id)}
        albumCreatorId={album.creator_id ? String(album.creator_id) : null}
      />
    );
  };

  const secondaryOpen = sortOpen || filterOpen;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      className="fixed inset-0 z-[90] bg-black flex flex-col overflow-hidden"
    >
      {/* Background overlay */}
      <motion.div
        className="absolute inset-0 bg-black"
        style={{ opacity: bgOpacity }}
      />

      {/* Photo wrapper — handles all touch gestures (axis-locked) */}
      <motion.div
        className="flex-1 relative"
        style={{ scale: photoScale, translateY: combinedTranslateY }}
        onTouchStart={onWrapperTouchStart}
        onTouchMove={onWrapperTouchMove}
        onTouchEnd={onWrapperTouchEnd}
        onTouchCancel={onWrapperTouchCancel}
      >
        {/* Carousel — transform-driven, overflow hidden */}
        <div
          ref={carouselRef}
          className="absolute inset-0 overflow-hidden"
          style={{ pointerEvents: carouselPointerEvents }}
        >
          {/* Track — moves via dragX + currentIdx */}
          <motion.div
            className="flex h-full"
            style={{ x: carouselX, willChange: "transform" }}
          >
            {photos.map((photo, i) => (
              <div
                key={photo.id}
                className="flex-shrink-0 w-full h-full flex items-center justify-center py-8"
              >
                {Math.abs(i - currentIdx) <= 2 && photo?.url ? (
                  <img
                    src={photo.url}
                    alt=""
                    className="max-w-full max-h-full object-contain select-none pointer-events-none"
                    draggable={false}
                    loading={i === currentIdx ? "eager" : "lazy"}
                    decoding="async"
                  />
                ) : !photo?.url ? (
                  <div className="text-white/40 text-sm">No photo</div>
                ) : null}
              </div>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Bottom controls (ThumbStrip + PillBar) */}
      <motion.div
        className="flex flex-col items-center gap-3 pb-6 flex-shrink-0 z-10"
        style={{ opacity: controlsOpacity, pointerEvents: controlsPointerEvents }}
      >
        {photos.length > 1 && (
          <ThumbStrip photos={photos} currentIdx={currentIdx} onSelect={handleThumbSelect} />
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
      </motion.div>

      {/* PRIMARY BottomSheet */}
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

      {/* SECONDARY SortSheet */}
      <GallerySortSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        sortKey={sortKey}
        setSortKey={setSortKey}
      />

      {/* SECONDARY FilterSheet */}
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
