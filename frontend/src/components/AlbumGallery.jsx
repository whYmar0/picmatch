/**
 * AlbumGallery.jsx — v11 Touch-driven photo viewer
 *
 * CHANGES v9 → v11 — Complete carousel rewrite:
 *  - Replaced native overflow-x scroll with touch-driven transform carousel.
 *    Each swipe = exactly one photo. No momentum overshoot.
 *  - Framer Motion useMotionValue + animate for 60fps compositor-only drag.
 *  - Centralized touch handling: parent wrapper does axis-locking,
 *    horizontal → offsetX (carousel), vertical → dragY (dismiss).
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
  MessageCircle, BarChart2, SlidersHorizontal, Filter, Share, Check,
  List, LayoutGrid,
} from "lucide-react";
import toast from "react-hot-toast";
import { albumsApi, commentsApi } from "../api";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";
import { isVideo } from "../utils/media";
import BottomSheet from "./BottomSheet";
import { PhotoCommentsList, CommentInput } from "./PhotoComments";
import AnalyticsShareSheet from "./AnalyticsShareSheet";
import FilledHeart from "./FilledHeart";
import BrokenHeart from "./BrokenHeart";
import VideoPlayer from "./VideoPlayer";

// ─── PillBar v8 — no border, larger monochrome icons, ChevronUp affordance ──
function PillBar({
  likeCount,
  dislikeCount,
  commentCount,
  onExpand,
  onSwipeStart,
  onSwipeMove,
  onSwipeEnd,
  onSwipeCancel,
  canViewStats = true,
}) {
  const dragStartY = useRef(0);
  const didDrag = useRef(false);
  const swipeStarted = useRef(false);

  const handlePointerDown = (e) => {
    dragStartY.current = e.clientY ?? e.touches?.[0]?.clientY;
    didDrag.current = false;
    swipeStarted.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    const dy = (e.clientY ?? e.touches?.[0]?.clientY) - dragStartY.current;
    if (dy >= -8) return;
    didDrag.current = true;
    if (!swipeStarted.current) {
      swipeStarted.current = true;
      onSwipeStart?.();
    }
    onSwipeMove?.(-dy);
  };

  const releasePointer = (e) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
    dragStartY.current = 0;
  };

  const handlePointerUp = (e) => {
    const endY = e.clientY ?? e.changedTouches?.[0]?.clientY;
    const distance = Math.max(0, dragStartY.current - endY);
    if (swipeStarted.current) {
      onSwipeEnd?.(distance);
    }
    swipeStarted.current = false;
    releasePointer(e);
  };

  const handlePointerCancel = (e) => {
    if (swipeStarted.current) onSwipeCancel?.();
    swipeStarted.current = false;
    didDrag.current = false;
    releasePointer(e);
  };

  const handleClick = (e) => {
    if (didDrag.current) {
      e.preventDefault();
      didDrag.current = false;
      return;
    }
    onExpand?.();
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.button
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        data-testid="gallery-pill-bar"
        aria-label="Open statistics"
        whileTap={{ scale: 0.96 }}
        className="flex items-center gap-8 px-8 py-4 rounded-full
                   bg-gray-900
                   text-white shadow-lg cursor-pointer"
      >
        {canViewStats && (
          <>
            <span className="flex items-center gap-2.5 text-base font-semibold">
              <span className="flex items-center justify-center w-[22px] h-[22px]">
                <FilledHeart size={22} className="text-white" />
              </span>
              {likeCount}
            </span>
            <span className="flex items-center gap-2.5 text-base font-semibold">
              <span className="flex items-center justify-center w-[22px] h-[22px]">
                <BrokenHeart size={22} className="text-white" />
              </span>
              {dislikeCount}
            </span>
          </>
        )}
        <span className="flex items-center gap-2.5 text-base font-semibold">
          <span className="flex items-center justify-center w-[22px] h-[22px]">
            <MessageCircle
              size={20}
              strokeWidth={1.75}
              className="text-white"
            />
          </span>
          {commentCount}
        </span>
      </motion.button>
    </div>
  );
}

// ─── Thumbnail Strip — driven by the same offsetX as the main carousel ─────
const THUMB_SIZE = 40;
const THUMB_GAP = 8;
const GALLERY_VIDEO_SCALE = 0.94;
const VIDEO_CONTROLS_INSET = 152;

function ThumbItem({ photo, index, activeIdx, onSelect, isDraggingRef }) {
  const scale = useTransform(activeIdx, (v) => (Math.round(v) === index ? 1.15 : 1));
  const ring = useTransform(activeIdx, (v) =>
    Math.round(v) === index ? "0 0 0 2px var(--primary)" : "none"
  );

  const handleClick = () => {
    if (isDraggingRef.current) return;
    onSelect(index);
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      style={{ width: THUMB_SIZE, height: THUMB_SIZE, flexShrink: 0, scale, boxShadow: ring }}
      className="btn-thumb outline-none rounded-xl"
    >
      {isVideo(photo) ? (
        <video
          src={photo.url}
          className="w-full h-full object-cover rounded-xl select-none pointer-events-none"
          preload="metadata"
          muted
          playsInline
        />
      ) : (
        <img
          src={photo.url}
          alt=""
          className="w-full h-full object-cover rounded-xl select-none pointer-events-none"
          loading="lazy"
          draggable={false}
        />
      )}
    </motion.button>
  );
}

function ThumbStrip({
  photos,
  offsetX,
  containerWidthRef,
  onSelect,
  onDragEnd,
  snapAnimRef,
  onSwipeStart,
  onSwipeMove,
  onSwipeEnd,
  onSwipeCancel,
}) {
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const touchStartX = useRef(0);
  const touchStartDragX = useRef(0);
  const touchStartTime = useRef(0);
  const touchStartY = useRef(0);
  // Snapshot of the main photo index at the start of a thumb-strip drag.
  // Clamping the strip against this value keeps the scroll feel identical
  // to the pre-instant-switch version.
  const startMainIdx = useRef(0);
  // Tracks whether an instant main-photo switch already happened during the
  // current thumb-strip drag. When true, the release handler must not also
  // apply a velocity flick on top of the already-applied switch.
  const didSwitchDuringDrag = useRef(false);
  const sheetSwipeActive = useRef(false);
  // Local offset of the thumbnail strip relative to the current photo. It is
  // only used while the user drags the strip; at rest it is always 0.
  const stripDragX = useMotionValue(0);

  const step = THUMB_SIZE + THUMB_GAP;

  // Which thumbnail is in the center of the visible strip?
  const thumbActiveIdx = useTransform([offsetX, stripDragX], ([ox, sdx]) => {
    const W = containerWidthRef.current;
    return -ox / W - (sdx ?? 0) / step;
  });

  // The active thumb is always centered inside the visible strip container.
  const thumbOffsetX = useTransform([offsetX, stripDragX], ([ox, sdx]) => {
    const W = containerWidthRef.current;
    const idx = -ox / W;
    const containerW = containerRef.current?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 400);
    const half = containerW / 2;
    return -(idx * step) + (half - THUMB_SIZE / 2) + (sdx ?? 0);
  });

  const onThumbTouchStart = (e) => {
    snapAnimRef.current?.stop();
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchStartDragX.current = stripDragX.get();
    touchStartTime.current = Date.now();
    const W = containerWidthRef.current;
    startMainIdx.current = Math.round(-offsetX.get() / W);
    didSwitchDuringDrag.current = false;
    isDragging.current = false;
  };

  const onThumbTouchMove = (e) => {
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;
    if (dy < -8 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      e.preventDefault();
      if (!sheetSwipeActive.current) {
        sheetSwipeActive.current = true;
        onSwipeStart?.();
      }
      onSwipeMove?.(-dy);
      isDragging.current = true;
      return;
    }
    if (Math.abs(dx) > 5) isDragging.current = true;
    e.preventDefault();

    // Keep the original scroll feel: clamp the strip against the index that
    // was current when the gesture started.
    const W = containerWidthRef.current;
    const maxDrag = startMainIdx.current * step;
    const minDrag = -(photos.length - 1 - startMainIdx.current) * step;
    const raw = touchStartDragX.current + dx;
    stripDragX.set(Math.max(minDrag, Math.min(maxDrag, raw)));

    // Sync the main photo with whichever thumbnail is currently centered.
    const currentMainIdx = Math.round(-offsetX.get() / W);
    const centeredIdx = Math.max(
      0,
      Math.min(
        currentMainIdx + Math.round(-stripDragX.get() / step),
        photos.length - 1
      )
    );

    if (centeredIdx !== currentMainIdx) {
      offsetX.set(-(centeredIdx * W));
      // Keep the strip visually where the finger left it while recentering on
      // the new active thumbnail. Moving to the next photo shifts the local
      // drag offset by +step; moving to the previous by -step.
      const shift = (centeredIdx - currentMainIdx) * step;
      stripDragX.set(stripDragX.get() + shift);
      // Update the underlying touch tracking to the new reference frame so
      // the next touchmove frame does not snap stripDragX back to the old
      // uncompensated value and trigger a runaway switch loop.
      touchStartDragX.current += shift;
      startMainIdx.current = centeredIdx;
      didSwitchDuringDrag.current = true;
      onDragEnd?.(centeredIdx);
    }
  };

  const resetThumbGesture = () => {
    stripDragX.stop?.();
    stripDragX.set(0);
    if (sheetSwipeActive.current) onSwipeCancel?.();
    sheetSwipeActive.current = false;
    isDragging.current = false;
    didSwitchDuringDrag.current = false;
  };

  const onThumbTouchCancel = () => {
    resetThumbGesture();
  };

  const onThumbTouchEnd = (e) => {
    if (sheetSwipeActive.current) {
      const touch = e.changedTouches?.[0];
      const distance = touch ? Math.max(0, touchStartY.current - touch.clientY) : 0;
      onSwipeEnd?.(distance);
      resetThumbGesture();
      return;
    }
    // Taps are handled by the individual thumb buttons; only drag releases
    // need a snap and a state update here.
    if (!isDragging.current) return;
    const touch = e.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartX.current;
    const dt = Date.now() - touchStartTime.current;
    const velocity = dt > 0 ? dx / dt : 0;

    const W = containerWidthRef.current;
    const currentIdx = Math.round(-offsetX.get() / W);
    // How many thumbnails did the center shift during the drag?
    const shift = Math.round(-stripDragX.get() / step);
    let targetIdx = currentIdx + shift;

    // Fast flick with a short distance still switches one step, but only
    // if the drag itself has not already performed an synchronous switch.
    if (!didSwitchDuringDrag.current && Math.abs(velocity) > 0.8 && targetIdx === currentIdx) {
      targetIdx += velocity < 0 ? 1 : -1;
    }

    targetIdx = Math.max(0, Math.min(targetIdx, photos.length - 1));

    // Switch main photo and re-center the active thumbnail — hard, instant.
    offsetX.set(-(targetIdx * W));
    stripDragX.set(0);

    if (onDragEnd) onDragEnd(targetIdx);
  };

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden" style={{ height: THUMB_SIZE + 12 }}>
      <motion.div
        data-testid="thumb-strip"
        className="absolute top-0 left-0 h-full flex items-center"
        style={{ x: thumbOffsetX, gap: THUMB_GAP, willChange: "transform" }}
        onTouchStart={onThumbTouchStart}
        onTouchMove={onThumbTouchMove}
        onTouchEnd={onThumbTouchEnd}
        onTouchCancel={onThumbTouchCancel}
      >
        {photos.map((photo, i) => (
          <ThumbItem
            key={photo.id}
            photo={photo}
            index={i}
            activeIdx={thumbActiveIdx}
            onSelect={onSelect}
            isDraggingRef={isDragging}
          />
        ))}
      </motion.div>
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
  viewMode = "list",
}) {
  const { t } = useLang();
  if (!analytics) return <p className="text-center text-gray-400 py-8 text-sm">Loading stats...</p>;

  return (
    <div className="space-y-4">      <div className="flex flex-wrap items-center gap-2">
      <button onClick={onOpenSort}
        data-testid="stats-sort"
        className="flex items-center gap-2 px-3 py-2.5 rounded-2xl font-medium text-sm
                     bg-border-light dark:bg-border-dark
                     hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
        <SlidersHorizontal size={15} /> {t("sort")}
      </button>
      <button onClick={onOpenFilter}
        data-testid="stats-filter"
        className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl font-medium text-sm
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
        data-testid="stats-share"
        className="w-10 h-10 rounded-2xl flex items-center justify-center
                     bg-border-light dark:bg-border-dark text-gray-400
                     hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
        aria-label={t("share")}
      >
        {shareDone ? <Check size={15} /> : <Share size={18} strokeWidth={2.2} />}
      </button>
      <div data-testid="stats-views" className="ml-auto flex items-center gap-2 text-sm font-semibold
                        text-gray-600 dark:text-gray-300" aria-label={t("votes")}>
        <BarChart2 size={16} />
        <span className="tabular-nums">{analytics.total_votes}</span>
      </div>
    </div>

      {/* "Statistics" title row removed — total votes count moved into the toolbar above, next to Share */}

      {photos.length === 0 && (
        <p className="text-center text-gray-400 py-8 text-sm">{t("noVotes")}</p>
      )}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => onJump(photo.id)}
              aria-label={`${t("photo") || "Photo"} ${i + 1}`}
              data-testid={`stats-photo-${i}`}
              className={`relative aspect-square !rounded-3xl overflow-hidden
                         bg-border-light dark:bg-border-dark
                         [&_img]:rounded-2xl [&_video]:rounded-2xl
                         ${String(photo.id) === String(currentPhotoId)
                  ? "ring-2 ring-primary-400"
                  : ""}`}
            >
              {isVideo(photo) ? (
                <video src={photo.url} className="w-full h-full object-cover" preload="metadata" muted playsInline />
              ) : (
                <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
              )}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 text-white text-[10px] font-semibold flex justify-between">
                <span>{i + 1}</span>
                <span>{photo.total_votes > 0 ? `${photo.like_percentage}%` : "—"}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => onJump(photo.id)}
              aria-label={`${t("photo") || "Photo"} ${i + 1}`}
              data-testid={`stats-photo-${i}`}
              className={`w-full flex items-center gap-3 py-2 px-2 rounded-xl transition-colors
                       ${String(photo.id) === String(currentPhotoId)
                  ? "bg-primary-50 dark:bg-primary-900/20"
                  : ""}`}
            >
              <span className="w-6 text-center text-sm font-bold text-gray-500 dark:text-gray-400 flex-shrink-0 tabular-nums">
                {i + 1}
              </span>
              <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0
                            bg-border-light dark:bg-border-dark">
                {isVideo(photo) ? (
                  <video src={photo.url} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                ) : (
                  <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="h-1.5 max-w-[95%] bg-border-light dark:bg-border-dark rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${photo.like_percentage || 0}%` }}
                    transition={{ delay: i * 0.03 + 0.2, duration: 0.4 }}
                  />
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-sm font-semibold tabular-nums
                              text-gray-600 dark:text-gray-300">
                  <span className="flex items-center gap-1.5">
                    <FilledHeart size={14} /> {photo.like_count}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <BrokenHeart size={14} strokeWidth={2} /> {photo.dislike_count}
                  </span>
                  <span className="ml-auto mr-4 text-gray-500 dark:text-gray-400 font-normal">
                    {photo.total_votes > 0 ? `${photo.like_percentage}%` : "—"}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Secondary SortSheet ────────────────────────────────────────────────────
function GallerySortSheet({ open, onClose, sortKey, setSortKey, viewMode, setViewMode }) {
  const { t } = useLang();

  return (
    <BottomSheet open={open} onClose={onClose} title={t("sort")} zIndex={60}>
      <div className="flex gap-2 mb-5">
        {[
          { key: "list", icon: <List size={15} />, label: t("listView") },
          { key: "grid", icon: <LayoutGrid size={15} />, label: t("gridView") },
        ].map(({ key, icon, label }) => (
          <button
            key={key}
            data-testid={key === "grid" ? "sort-grid" : "sort-list"}
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
              : ""}`}
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
                      : ""}`}
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
export default function AlbumGallery({
  album,
  onClose,
  startPhotoId,
  dragProgressMV,
  initialAnalytics = null,
  initialTab = "stats",
  manageHistory = true,
  initialCommentId = null,
}) {
  const { t } = useLang();
  const { user } = useAuth();
  const [vh, setVh] = useState(
    typeof window !== "undefined"
      ? (window.visualViewport?.height || window.innerHeight)
      : 800,
  );

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => setVh(Math.round(viewport?.height || window.innerHeight));
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  // ── State ────────────────────────────────────────────────────────────────
  const initialIdx = (() => {
    if (startPhotoId && album.photos?.length) {
      const idx = album.photos.findIndex((p) => String(p.id) === String(startPhotoId));
      return idx >= 0 ? idx : 0;
    }
    return 0;
  })();

  const initialCanViewStats = initialAnalytics?.can_view_stats ??
    (album.is_public !== false ||
      (user && String(user.id) === String(album.creator_id)));
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [currentIdx, setCurrentIdx] = useState(initialIdx);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sheetGestureActive, setSheetGestureActive] = useState(false);
  const [sheetTab, setSheetTab] = useState(
    initialCanViewStats ? initialTab : "comments",
  );
  const tabTrackX = useMotionValue(0);
  const tabAnimationRef = useRef(null);
  const tabViewportRef = useRef(null);
  const tabWidthRef = useRef(0);
  const tabSwipeStartTabRef = useRef(
    initialCanViewStats ? initialTab : "comments",
  );
  const tabGestureActiveRef = useRef(false);
  const galleryHistoryRef = useRef(false);
  const historyLayersRef = useRef({ sheet: false, sort: false, filter: false, share: false });
  const galleryHistoryKeyRef = useRef(null);
  const historyStackRef = useRef([]);
  const pendingHistoryBackRef = useRef(null);
  const sheetCloseAnimRef = useRef(null);
  const galleryCloseStartedRef = useRef(false);

  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState("likes_desc");
  const [viewMode, setViewMode] = useState("list");
  const [selectedVoters, setSelectedVoters] = useState(new Set());
  const [pendingVoters, setPendingVoters] = useState(new Set());
  const [shareDone, setShareDone] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [commentsData, setCommentsData] = useState(null);
  const [isExiting, setIsExiting] = useState(false);
  // Keep the shared-element lifecycle separate from the stats photo fit; all
  // gallery photos use object-contain so the stats sheet cannot obscure them.
  const fetchedPhotoIdRef = useRef(null);
  const fetchedAlbumIdRef = useRef(null);

  // Owner-only token share. The album object can carry the creator as
  // `creator_id`, a nested `creator` (Dashboard's AlbumOut shape), or via the
  // already-loaded analytics payload — check all three so an owner opening
  // their own album is never mistaken for a visitor (which would make the
  // stats Share hand out the voting invite instead of the analytics link).
  const albumCreatorId =
    album?.creator_id ?? album?.creator?.id ?? analytics?.creator_id ?? null;
  const isOwner = !!user && albumCreatorId != null &&
    String(user.id) === String(albumCreatorId);
  const canViewStats = analytics
    ? Boolean(analytics.can_view_stats)
    : (album.is_public !== false || isOwner);

  // ── Carousel refs ────────────────────────────────────────────────────────
  const galleryRef = useRef(null);
  const carouselRef = useRef(null);
  const currentIdxRef = useRef(initialIdx);
  const snapAnimRef = useRef(null);        // in-flight carousel snap animation
  const isExitingRef = useRef(false);      // guards snap onComplete during exit

  // The first photo is always rendered as a shared layout element so the
  // album cover in Dashboard has a FLIP partner whenever the gallery closes.

  // ── Axis-locking touch refs ──────────────────────────────────────────────
  const touchStart = useRef({ x: 0, y: 0, time: 0 });
  // Snapshot absolute track offset at touchStart so an interrupted spring can
  // resume from its current value rather than snapping to "delta-from-zero".
  const touchStartOffsetX = useRef(0);
  const touchStartDragY = useRef(0);
  const gestureAxis = useRef(null);

  // ── Motion values ────────────────────────────────────────────────────────
  // The partial primary sheet leaves exactly half of the visible viewport
  // above its top edge (the panel itself is 75vh tall).
  const defaultOffset = vh * 0.25;
  const dragY = useMotionValue(0);
  const dragYAnimRef = useRef(null);
  // Separate motion value for the progressive swipe that mounts the sheet.
  // It starts below the viewport and follows the finger upward until release.
  const sheetGestureY = useMotionValue(vh);

  // Container width is the single source of truth for pixel-to-index math.
  // It is measured on mount and on resize so the carousel stays correct in
  // landscape/portrait transitions.
  const containerWidthRef = useRef(typeof window !== "undefined" ? window.innerWidth : 400);
  const prevContainerWidthRef = useRef(containerWidthRef.current);

  // Single source of truth for the main carousel and the thumbnail strip.
  // Absolute pixel offset of the photo track. -idx * W == photo idx centered.
  const offsetX = useMotionValue(-initialIdx * containerWidthRef.current);

  useEffect(() => {
    const measure = () => {
      const w = carouselRef.current?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 400);
      const prev = prevContainerWidthRef.current;
      if (w !== prev && prev !== 0) {
        // Width changed — re-snap to the current index with the new width so
        // the visible photo stays centered.
        containerWidthRef.current = w;
        offsetX.set(-(currentIdxRef.current * w));
      } else {
        containerWidthRef.current = w;
      }
      prevContainerWidthRef.current = w;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [offsetX]);

  // BottomSheet shared drag position. The photo stage intentionally reads this
  // value directly so it follows the sheet continuously in both directions.
  const sheetY = useMotionValue(vh);

  useEffect(() => {
    const measure = () => {
      tabWidthRef.current = tabViewportRef.current?.clientWidth || 0;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!manageHistory || galleryHistoryRef.current) return undefined;
    const key = `gallery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    galleryHistoryKeyRef.current = key;
    historyStackRef.current = [{ key, layer: "gallery" }];
    window.history.pushState(
      { ...(window.history.state || {}), albumGallery: true, albumHistoryKey: key },
      "",
      window.location.href,
    );
    galleryHistoryRef.current = true;
    return undefined;
  }, [manageHistory]);


  // The sheet occupies `heightVh` of the viewport. Binding the photo stage to
  // the space left above that sheet prevents the sheet from ever covering the
  // image while keeping the resize on the compositor path.
  const photoStageHeight = useTransform(
    sheetY,
    [0, defaultOffset, vh],
    [vh * 0.25, vh * 0.50, vh],
    { clamp: true },
  );
  const photoScale = useTransform(sheetY, [0, defaultOffset], [1, 1]);
  const photoTranslateY = useTransform(sheetY, [0, defaultOffset], [0, 0]);

  const combinedTranslateY = useTransform(
    [photoTranslateY, dragY],
    ([sheetVal, dragVal]) => sheetVal + dragVal
  );

  const bgOpacity = useTransform(dragY, [0, vh * 0.5], [1, 0]);

  // Photo shrinks as user drags down — visual feedback tied to dragY.
  // Clamped so excessive drag doesn't shrink below 0.78x.
  const photoDragScale = useTransform(dragY, [0, vh * 0.5], [1, 0.78], { clamp: true });

  // Final photo scale = BottomSheet-driven shrink × drag-driven shrink.
  const combinedScale = useTransform(
    [photoScale, photoDragScale],
    ([sheetScale, dragScale]) => sheetScale * dragScale
  );
  const controlsOpacity = useTransform(sheetY, [0, defaultOffset], [0, 1]);
  const controlsPointerEvents = useTransform(
    sheetY,
    (v) => (v < defaultOffset * 0.3 ? "none" : "auto")
  );

  const carouselPointerEvents = sheetExpanded ? "none" : "auto";
  const floatingPillY = useTransform(sheetY, (value) => value);

  const closeGallery = useCallback((fromHistory = false) => {
    // Back, a close button, and a swipe can arrive in the same frame. Only
    // allow one owner to perform the close/unmount sequence.
    if (galleryCloseStartedRef.current) return;
    galleryCloseStartedRef.current = true;
    tabAnimationRef.current?.stop();
    snapAnimRef.current?.stop();
    sheetCloseAnimRef.current?.stop();
    sheetCloseAnimRef.current = null;
    gestureAxis.current = null;
    touchStartOffsetX.current = 0;
    touchStartDragY.current = 0;
    // Use the actual pushed-entry stack, not boolean layer flags. The stack is
    // authoritative after rapid Back/programmatic closes and avoids traversing
    // too far when the sheet was already consumed by popstate.
    const historyEntriesAboveGallery = Math.max(0, historyStackRef.current.length - 1);
    const shouldTraverseGalleryEntry = manageHistory && !fromHistory && galleryHistoryRef.current;
    galleryHistoryRef.current = false;
    setSheetGestureActive(false);
    setSheetExpanded(false);
    setSortOpen(false);
    setFilterOpen(false);
    setShareSheetOpen(false);
    historyLayersRef.current = { sheet: false, sort: false, filter: false, share: false };
    pendingHistoryBackRef.current = null;
    if (!isExitingRef.current) {
      dragYAnimRef.current?.stop();
      dragY.set(0);
      if (dragProgressMV) dragProgressMV.set(0);
      sheetY.set(vh);
      sheetGestureY.set(vh);
    }
    if (shouldTraverseGalleryEntry) {
      // Skip any still-open sheet layer entries in one atomic traversal. A
      // single back() here can strand the browser on an invisible layer after
      // a rapid close/back sequence. Clear the local stack before traversal so
      // a queued popstate cannot calculate another traversal from stale data.
      historyStackRef.current = [];
      // history.go() is asynchronous while a router navigate() pushes
      // synchronously — calling both in the same tick makes the browser pop
      // the freshly pushed destination and strand the user on the old page.
      // Wait for the traversal's popstate, then hand off to onClose.
      const onTraversalComplete = () => {
        window.removeEventListener("popstate", onTraversalComplete);
        onClose();
      };
      window.addEventListener("popstate", onTraversalComplete);
      window.history.go(-(historyEntriesAboveGallery + 1));
    } else {
      onClose();
    }
  }, [onClose, sheetY, sheetGestureY, dragY, dragProgressMV, vh, manageHistory]);

  const pushHistoryLayer = useCallback((layer) => {
    if (!manageHistory || historyLayersRef.current[layer]) return;
    const key = `layer-${layer}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    historyLayersRef.current[layer] = true;
    historyStackRef.current.push({ key, layer });
    window.history.pushState(
      { ...(window.history.state || {}), albumGallery: true, albumLayer: layer, albumHistoryKey: key },
      "",
      window.location.href,
    );
  }, [manageHistory]);

  const closeHistoryLayer = useCallback((layer) => {
    if (!manageHistory || !historyLayersRef.current[layer]) return;
    historyLayersRef.current[layer] = false;
    const stack = historyStackRef.current;
    const top = stack[stack.length - 1];
    if (top?.layer === layer) {
      stack.pop();
    }
    pendingHistoryBackRef.current = {
      expectedKey: stack[stack.length - 1]?.key || galleryHistoryKeyRef.current,
    };
    window.history.back();
  }, [manageHistory]);

  const closeShareSheet = useCallback((fromHistory = false) => {
    if (!fromHistory) closeHistoryLayer("share");
    historyLayersRef.current.share = false;
    setShareSheetOpen(false);
  }, [closeHistoryLayer]);

  const closeSecondarySheet = useCallback((fromHistory = false) => {
    const activeLayer = historyLayersRef.current.sort ? "sort"
      : historyLayersRef.current.filter ? "filter" : null;
    if (!fromHistory && activeLayer) closeHistoryLayer(activeLayer);
    historyLayersRef.current.sort = false;
    historyLayersRef.current.filter = false;
    setSortOpen(false);
    setFilterOpen(false);
  }, [closeHistoryLayer]);

  const closePrimarySheet = useCallback((fromHistory = false) => {
    const hadLayer = historyLayersRef.current.sheet;
    // The primary BottomSheet delegates here so the panel and image follow
    // exactly the same light ease-out motion. Keep one cancellable owner so a
    // second Back can safely hand off to gallery close.
    sheetCloseAnimRef.current?.stop();
    sheetY.stop?.();
    sheetCloseAnimRef.current = animate(sheetY, vh, {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => sheetGestureY.set(latest),
      onComplete: () => {
        sheetY.set(vh);
        sheetGestureY.set(vh);
        sheetCloseAnimRef.current = null;
      },
    });
    if (!fromHistory && hadLayer) {
      closeHistoryLayer("sheet");
    }
    historyLayersRef.current.sheet = false;
    historyLayersRef.current.sort = false;
    historyLayersRef.current.filter = false;
    setSheetGestureActive(false);
    setSheetExpanded(false);
    setSortOpen(false);
    setFilterOpen(false);
  }, [sheetY, sheetGestureY, vh, closeHistoryLayer]);

  const openPrimarySheet = useCallback(() => {
    sheetCloseAnimRef.current?.stop();
    sheetCloseAnimRef.current = null;
    sheetY.stop?.();
    pushHistoryLayer("sheet");
    setSheetExpanded(true);
  }, [sheetY, pushHistoryLayer]);

  const openSortSheet = useCallback(() => {
    pushHistoryLayer("sort");
    setSortOpen(true);
  }, [pushHistoryLayer]);

  // Arriving from a comment notification (?tab=comments&comment=...): open the
  // primary sheet on the comments tab right after the gallery entrance, so the
  // target comment is presented immediately instead of leaving the user staring
  // at a bare photo. Deps are stable after mount (initialTab comes from the URL
  // and openPrimarySheet is a memoized callback), so the effect fires exactly
  // once per mount — the timer is safely cleared on unmount.
  //
  // The sheet opens FULLY expanded (sheetGestureY = 0): the comment list may
  // be taller than the partial snap, and its lower part sits below the screen
  // edge with no internal overflow to scroll into — a target comment down the
  // thread would stay hidden. A full expansion guarantees the highlight lands
  // on a visible comment.
  useEffect(() => {
    if (initialTab !== "comments") return undefined;
    const timer = setTimeout(() => {
      sheetGestureY.set(0);
      openPrimarySheet();
    }, 450);
    return () => clearTimeout(timer);
  }, [initialTab, openPrimarySheet, sheetGestureY]);

  useEffect(() => {
    const handlePopState = (event) => {
      const pending = pendingHistoryBackRef.current;
      if (pending) {
        pendingHistoryBackRef.current = null;
        // Ignore only the exact pop generated by a programmatic close. A
        // newer user Back with another state must still be handled below.
        if (event.state?.albumHistoryKey === pending.expectedKey) return;
      }
      // Each layer has its own history entry. Back therefore consumes exactly
      // the topmost active layer and never needs a forward/push race.
      if (historyLayersRef.current.share) {
        historyStackRef.current.pop();
        closeShareSheet(true);
        return;
      }
      if (historyLayersRef.current.sort || historyLayersRef.current.filter) {
        historyStackRef.current.pop();
        closeSecondarySheet(true);
        return;
      }
      if (historyLayersRef.current.sheet) {
        historyStackRef.current.pop();
        closePrimarySheet(true);
        return;
      }
      if (galleryHistoryRef.current) {
        historyStackRef.current = [];
        closeGallery(true);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [closePrimarySheet, closeSecondarySheet, closeShareSheet, closeGallery]);

  const tabCommittedRef = useRef(
    initialCanViewStats ? initialTab : "comments",
  );

  const animateToTab = useCallback((nextTab) => {
    // The highlight bar belongs to the comments panel; drop it when the user
    // leaves the tab so it never lingers over the stats panel.
    setHighlightBar(null);
    const width = tabViewportRef.current?.clientWidth || tabWidthRef.current;
    if (!canViewStats) {
      tabCommittedRef.current = "comments";
      setSheetTab("comments");
      tabTrackX.set(0);
      return;
    }
    tabCommittedRef.current = nextTab;
    setSheetTab(nextTab);
    tabAnimationRef.current?.stop();
    if (!width) return;
    const target = nextTab === "comments" ? -width : 0;
    // Animate from the current progressive position; never pre-set the target.
    tabAnimationRef.current = animate(tabTrackX, target, {
      duration: 0.3,
      ease: [0.32, 0.72, 0, 1],
      onComplete: () => { tabAnimationRef.current = null; },
    });
  }, [canViewStats, tabTrackX]);

  const handleTabSwipeStart = useCallback(() => {
    tabWidthRef.current = tabViewportRef.current?.clientWidth
      || tabWidthRef.current
      || (typeof window !== "undefined" ? window.innerWidth : 400);
    // The BottomSheet recognizer calls this before the first progressive move.
    // Stop the gallery-owned spring here as well; otherwise a reverse swipe
    // can continue animating the track while a new full-panel gesture starts.
    tabSwipeStartTabRef.current = tabCommittedRef.current;
    tabGestureActiveRef.current = true;
    tabAnimationRef.current?.stop();
    tabAnimationRef.current = null;
  }, []);

  const handleTabSwipeMove = useCallback((dx) => {
    const width = tabWidthRef.current
      || tabViewportRef.current?.clientWidth
      || (typeof window !== "undefined" ? window.innerWidth : 400);
    tabWidthRef.current = width;
    if (!width) return;
    // A new finger position always takes precedence over the previous settle
    // spring, including after an early threshold commit.
    tabAnimationRef.current?.stop();
    tabAnimationRef.current = null;
    const base = tabSwipeStartTabRef.current === "comments" ? -width : 0;
    tabTrackX.set(Math.max(-width, Math.min(0, base + dx)));
  }, [tabTrackX]);

  const handleTabSwipeEnd = useCallback((dx) => {
    const width = tabWidthRef.current
      || tabViewportRef.current?.clientWidth
      || (typeof window !== "undefined" ? window.innerWidth : 400);
    if (!width) return false;
    const currentTab = tabCommittedRef.current;
    // Commit only on release/cancel. The track has followed the finger for
    // the entire gesture, so this threshold decides only the final destination.
    const shouldSwitch = Math.abs(dx) >= Math.max(32, width * 0.08);
    const nextTab = shouldSwitch
      ? (dx < 0 ? "comments" : "stats")
      : currentTab;
    tabCommittedRef.current = nextTab;
    tabGestureActiveRef.current = false;
    setSheetTab(nextTab);
    const target = nextTab === "comments" ? -width : 0;
    tabAnimationRef.current?.stop();
    tabAnimationRef.current = null;
    // The finger-follow phase is progressive; once released, commit the
    // visual track and React tab state atomically so they cannot diverge.
    tabAnimationRef.current = animate(tabTrackX, target, {
      duration: 0.26,
      ease: [0.32, 0.72, 0, 1],
      onComplete: () => { tabAnimationRef.current = null; },
    });
    return true;
  }, [tabTrackX]);

  const handleTabSwipeCancel = useCallback(() => {
    tabGestureActiveRef.current = false;
    const width = tabWidthRef.current
      || tabViewportRef.current?.clientWidth
      || (typeof window !== "undefined" ? window.innerWidth : 400);
    if (!width) return;
    tabAnimationRef.current?.stop();
    tabAnimationRef.current = null;
    tabTrackX.set(tabCommittedRef.current === "comments" ? -width : 0);
  }, [tabTrackX]);

  useEffect(() => {
    const width = tabViewportRef.current?.clientWidth || tabWidthRef.current;
    if (!width) return;
    tabWidthRef.current = width;
    // Without stats access there is no two-panel track — the comments list
    // is the single w-full panel and must stay at x=0. Translating it by
    // -width would push the whole list off-screen (blank comments tab), so
    // never touch the track in that layout.
    if (!canViewStats) {
      tabTrackX.set(0);
      return;
    }
    if (tabGestureActiveRef.current) return;
    // React tab state and the compositor track must never diverge after a
    // click or completed gesture. During a release animation the animation
    // callback is authoritative; do not cancel it from this effect.
    if (tabAnimationRef.current) return;
    tabTrackX.set(tabCommittedRef.current === "comments" ? -width : 0);
    // The BottomSheet content only mounts once the sheet is open, so the
    // viewport width is unavailable on gallery mount. Re-run whenever the
    // sheet opens/closes so a deep-linked tab (e.g. ?tab=comments from a
    // notification) is positioned on first open instead of showing the
    // first panel while the header claims the second is active.
  }, [sheetTab, sheetExpanded, canViewStats, tabTrackX]);

  const handleSheetSwipeStart = useCallback(() => {
    if (sheetExpanded || sheetGestureActive) return;
    sheetCloseAnimRef.current?.stop();
    sheetCloseAnimRef.current = null;
    sheetY.stop?.();
    pushHistoryLayer("sheet");
    snapAnimRef.current?.stop();
    sheetGestureY.set(vh);
    sheetY.set(vh);
    setSheetGestureActive(true);
    setSheetExpanded(true);
  }, [sheetExpanded, sheetGestureActive, sheetGestureY, sheetY, vh, pushHistoryLayer]);

  const handleSheetSwipeMove = useCallback((distance) => {
    if (!sheetGestureActive) return;
    const nextY = Math.max(0, vh - Math.max(0, distance));
    sheetGestureY.set(nextY);
    sheetY.set(nextY);
  }, [sheetGestureActive, sheetGestureY, sheetY, vh]);

  const handleSheetSwipeEnd = useCallback((distance) => {
    if (!sheetGestureActive) return;
    const normalizedDistance = Math.max(0, distance);
    const openThreshold = Math.max(48, vh * 0.12);
    const settle = (targetY, close = false) => {
      animate(sheetGestureY, targetY, {
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (latest) => sheetY.set(latest),
        onComplete: () => {
          sheetY.set(targetY);
          setSheetGestureActive(false);
          if (close) {
            historyLayersRef.current.sheet = false;
            setSheetExpanded(false);
          }
        },
      });
    };

    if (normalizedDistance < openThreshold) {
      settle(vh, true);
      closeHistoryLayer("sheet");
      return;
    }

    // A normal open settles into the existing partial snap. A very long
    // gesture may settle fully expanded, while still following the finger.
    settle(normalizedDistance > vh * 0.42 ? 0 : defaultOffset);
  }, [sheetGestureActive, sheetGestureY, sheetY, vh, defaultOffset, closeHistoryLayer]);

  const handleSheetSwipeCancel = useCallback(() => {
    if (!sheetGestureActive) return;
    animate(sheetGestureY, vh, {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => sheetY.set(latest),
      onComplete: () => {
        sheetY.set(vh);
        setSheetGestureActive(false);
        setSheetExpanded(false);
        closeHistoryLayer("sheet");
      },
    });
  }, [sheetGestureActive, sheetGestureY, sheetY, vh, closeHistoryLayer]);

  // ── Data fetching ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!album?.id) return;
    if (initialAnalytics && String(initialAnalytics.id) === String(album.id)) {
      fetchedAlbumIdRef.current = album.id;
      return;
    }
    if (fetchedAlbumIdRef.current === album.id) return;
    fetchedAlbumIdRef.current = album.id;
    albumsApi.getAnalytics(album.id)
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [album?.id]);

  useEffect(() => {
    if (canViewStats) return;
    tabCommittedRef.current = "comments";
    setSheetTab("comments");
    const width = tabViewportRef.current?.clientWidth || tabWidthRef.current;
    if (width) tabTrackX.set(0);
    setSortOpen(false);
    setFilterOpen(false);
    setSelectedVoters(new Set());
    setPendingVoters(new Set());
  }, [canViewStats, tabTrackX]);

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
    if (fetchedPhotoIdRef.current === currentPhoto.id) return;
    fetchedPhotoIdRef.current = currentPhoto.id;
    commentsApi.getForPhoto(currentPhoto.id)
      .then((data) => {
        setCommentsData(data);
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
    dragYAnimRef.current?.stop();
    dragY.set(0);
    if (!sheetExpanded) {
      sheetGestureY.set(vh);
    } else if (!sheetGestureActive) {
      // BottomSheet owns the open animation on the shared value. Do not set
      // the partial offset here first, otherwise the animation starts and ends
      // at the same position and the first frame can desync from the photo.
      const settledY = sheetGestureY.get();
      if (settledY < vh - 1) sheetY.set(settledY);
    }
  }, [sheetExpanded, sheetGestureActive, sheetY, sheetGestureY, dragY, defaultOffset, vh]);

  // ── Sync ref when state changes from goTo ──────────────────────────────
  useEffect(() => {
    currentIdxRef.current = currentIdx;
  }, [currentIdx]);

  // ── Programmatic navigation ──────────────────────────────────────────────
  const goTo = useCallback((idx, immediate = false) => {
    if (idx < 0 || idx >= photos.length) return;
    snapAnimRef.current?.stop();
    dragYAnimRef.current?.stop();
    const W = containerWidthRef.current;
    const targetOffset = -(idx * W);
    currentIdxRef.current = idx;
    setCurrentIdx(idx);
    // Reset dismiss gesture
    dragY.set(0);
    if (dragProgressMV) dragProgressMV.set(0);
    if (immediate) {
      // A selection made from the open statistics sheet must be visible in
      // the same event, not after a carousel spring finishes.
      offsetX.set(targetOffset);
      return;
    }
    snapAnimRef.current = animate(offsetX, targetOffset, {
      type: "spring", stiffness: 500, damping: 38, mass: 0.6,
      onComplete: () => {
        if (isExitingRef.current) return;
        setCurrentIdx(idx);
      },
    });
  }, [photos.length, offsetX, dragY, dragProgressMV]);

  const jumpToPhoto = useCallback((photoId) => {
    const idx = photos.findIndex((p) => String(p.id) === String(photoId));
    if (idx >= 0) {
      goTo(idx, sheetExpanded);
    }
  }, [photos, goTo, sheetExpanded]);

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

  // Body scroll lock is now managed by Dashboard.jsx based on galleryAlbum state,
  // so it is restored even if Framer Motion's exit animation stalls.

  // ── Unified touch handlers (axis-lock: horizontal → offsetX, vertical → dragY) ──
  const onWrapperTouchStart = useCallback((e) => {
    snapAnimRef.current?.stop();
    dragYAnimRef.current?.stop();
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    // Snapshot dragY and the absolute track offset so an interrupted spring
    // (snap-back Y or carousel snap) can resume from its current value,
    // not from zero — a visible translation jump.
    touchStartDragY.current = dragY.get();
    touchStartOffsetX.current = offsetX.get();
    // Anchor the next snap decision to the visual position of the track, not
    // to a possibly-stale currentIdxRef (e.g. after an spring was interrupted).
    currentIdxRef.current = photos.length > 0
      ? Math.max(0, Math.min(
        Math.round(-offsetX.get() / containerWidthRef.current),
        photos.length - 1
      ))
      : 0;
    gestureAxis.current = null;
  }, [offsetX]);

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
      // Compose dragY from the touchStart offset so we resume from the
      // current (possibly mid-interrupt) value, not from 0.
      const newDragY = touchStartDragY.current + dy;
      dragY.set(newDragY);
      // Drive parent page depth-zoom unzoom (0 = full zoom, 1 = fully unzoomed).
      if (dragProgressMV) {
        const progress = Math.max(0, Math.min(1, newDragY / (vh * 0.5)));
        dragProgressMV.set(progress);
      }
      return;
    }

    if (gestureAxis.current === "x") {
      if (photos.length === 0) return;
      e.preventDefault();
      const W = containerWidthRef.current;
      const raw = touchStartOffsetX.current + dx;
      const minX = -(photos.length - 1) * W;
      const maxX = 0;
      let clamped = raw;
      if (raw > maxX) {
        clamped = maxX + (raw - maxX) * 0.2;
      } else if (raw < minX) {
        clamped = minX + (raw - minX) * 0.2;
      }
      offsetX.set(clamped);
    }
  }, [offsetX, dragY, photos.length]);

  const onWrapperTouchEnd = useCallback((e) => {
    const touch = e.changedTouches?.[0];
    if (!touch) { gestureAxis.current = null; return; }

    if (gestureAxis.current === "y") {
      const currentDrag = dragY.get();
      if (currentDrag > 100) {
        // Dismiss — hand off to Motion's Shared Element Transition while
        // animating the photo the rest of the way down. The SET FLIP-extracts
        // the motion.img using its CURRENT rect (the position the user's
        // finger was at release time) and animates it to the album card's
        // natural rect using the album card's own spring. Continuity is
        // preserved because captured position = last seen position, while
        // dragY continues smoothly to vh so the backdrop/scene fades out
        // without a snap.
        isExitingRef.current = true;
        snapAnimRef.current?.stop();
        dragYAnimRef.current?.stop();
        // Only animate the photo downward if it is not the shared cover photo;
        // when currentIdx === 0, the layoutId FLIP transition back to the
        // album card owns the exit motion. Animating dragY for the shared cover
        // would fight that FLIP and cause the image to fly downward instead of
        // into the card.
        if (currentIdxRef.current !== 0) {
          dragYAnimRef.current = animate(dragY, vh, {
            duration: 0.3,
            ease: [0.32, 0.72, 0, 1],
          });
        }
        // Disable the whole gallery subtree from receiving input during the
        // exit fade. The root motion element stays in the DOM for ~220 ms while
        // AnimatePresence finishes; `inert` ensures it does not block clicks or
        // touches on the underlying Dashboard during that window. We also set
        // pointer-events:none as a fallback for older browsers and aria-hidden
        // for assistive tech.
        setIsExiting(true);
        galleryRef.current?.setAttribute("inert", "");
        closeGallery();      // dragProgressMV progress to 1 is owned by handleGalleryClose
        gestureAxis.current = null;
        return;
      }
      // Snap-back: same principle — one animation drives both.
      dragYAnimRef.current = animate(dragY, 0, {
        type: "spring", stiffness: 400, damping: 30,
        onUpdate: (latest) => {
          if (dragProgressMV) {
            dragProgressMV.set(Math.max(0, Math.min(1, latest / (vh * 0.5))));
          }
        },
        onComplete: () => {
          if (dragProgressMV) dragProgressMV.set(0);
        },
      });
      gestureAxis.current = null;
      return;
    }

    if (gestureAxis.current === "x") {
      if (photos.length === 0) { gestureAxis.current = null; return; }
      const dx = touch.clientX - touchStart.current.x;
      const dt = Date.now() - touchStart.current.time;
      const velocity = dt > 0 ? dx / dt : 0; // px/ms
      const W = containerWidthRef.current;

      // Anchor the snap on the photo that was visible when the gesture started,
      // so an interrupted spring can't leave currentIdxRef out of sync.
      const startIdx = Math.round(-touchStartOffsetX.current / W);
      const dragFraction = -dx / W;               // positive => moving to next photo
      const projectedFraction = dragFraction + (-velocity * 200) / W;

      let targetIdx = startIdx;
      if (projectedFraction > 0.25 || dragFraction > 0.4) {
        targetIdx = startIdx + 1;
      } else if (projectedFraction < -0.25 || dragFraction < -0.4) {
        targetIdx = startIdx - 1;
      }
      targetIdx = Math.max(0, Math.min(targetIdx, photos.length - 1));

      const targetOffset = -(targetIdx * W);
      snapAnimRef.current = animate(offsetX, targetOffset, {
        type: "spring", stiffness: 500, damping: 38, mass: 0.6,
        onComplete: () => {
          if (isExitingRef.current) return;
          currentIdxRef.current = targetIdx;
          setCurrentIdx(targetIdx);
        },
      });

      gestureAxis.current = null;
      return;
    }

    gestureAxis.current = null;
  }, [offsetX, dragY, photos.length, closeGallery]);

  const onWrapperTouchCancel = useCallback(() => {
    snapAnimRef.current?.stop();
    dragYAnimRef.current?.stop();
    tabAnimationRef.current?.stop();
    gestureAxis.current = null;
    touchStart.current = { x: 0, y: 0, time: 0 };
    touchStartOffsetX.current = 0;
    touchStartDragY.current = 0;
    dragY.set(0);
    if (dragProgressMV) dragProgressMV.set(0);
    const width = containerWidthRef.current;
    const safeIdx = Math.max(0, Math.min(
      Math.round(-offsetX.get() / width),
      Math.max(0, photos.length - 1),
    ));
    snapAnimRef.current = animate(offsetX, -(safeIdx * width), {
      type: "spring", stiffness: 500, damping: 38,
      onComplete: () => { snapAnimRef.current = null; },
    });
  }, [dragY, dragProgressMV, offsetX, photos.length]);

  // VideoPlayer owns the touch stream on video slides. These callbacks feed
  // the same dragY/progress values and close threshold as the gallery wrapper,
  // so video dismisses with the identical photo animation.
  const onVideoVerticalSwipeMove = useCallback((dy) => {
    if (isExitingRef.current) return;
    const newDragY = Math.max(0, dy);
    dragY.set(newDragY);
    if (dragProgressMV) {
      dragProgressMV.set(Math.max(0, Math.min(1, newDragY / (vh * 0.5))));
    }
  }, [dragY, dragProgressMV, vh]);

  const onVideoVerticalSwipe = useCallback((dy) => {
    if (isExitingRef.current) return;
    if (dy > 100) {
      isExitingRef.current = true;
      snapAnimRef.current?.stop();
      dragYAnimRef.current?.stop();
      if (currentIdxRef.current !== 0) {
        dragYAnimRef.current = animate(dragY, vh, {
          duration: 0.3,
          ease: [0.32, 0.72, 0, 1],
        });
      }
      setSheetExpanded(false);
      setSortOpen(false);
      setFilterOpen(false);
      setShareSheetOpen(false);
      setIsExiting(true);
      galleryRef.current?.setAttribute("inert", "");
      closeGallery();
      return;
    }

    dragYAnimRef.current = animate(dragY, 0, {
      type: "spring", stiffness: 400, damping: 30,
      onUpdate: (latest) => {
        if (dragProgressMV) {
          dragProgressMV.set(Math.max(0, Math.min(1, latest / (vh * 0.5))));
        }
      },
      onComplete: () => {
        if (dragProgressMV) dragProgressMV.set(0);
      },
    });
  }, [dragY, dragProgressMV, vh, closeGallery]);

  // Called when the user taps a thumbnail. We reuse the main spring so the
  // photo and the thumbnail strip move in lockstep.
  const handleThumbSelect = useCallback((idx) => goTo(idx), [goTo]);

  // Called only after a thumbnail-strip *drag* settles. It updates React
  // state without starting a second animation, because the drag itself has
  // already driven offsetX to the target position.
  const handleThumbDragEnd = useCallback((idx) => {
    currentIdxRef.current = idx;
    setCurrentIdx(idx);
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  // We intentionally do NOT reset dragProgressMV here. The close path needs
  // dragProgressMV to remain at 1.0 throughout the SET (Motion's layoutId
  // FLIP) so that the page scale stays at 1.0 while the album card target
  // rect interpolates from the gallery-photo position. Resetting it now
  // would drop pageScaleMV instantly to baseScaleMV (≈0.94), causing the
  // page to visibly "restart zoom" mid-FLIP.
  //
  // The reset is performed instead in Dashboard.handlePhotoClick BEFORE
  // a new gallery opens, so the next open sequence starts cleanly with
  // pageScaleMV = baseScaleMV = 0.94.
  useEffect(() => {
    // Reset once per gallery mount, not on every render. Resetting during
    // render re-enabled duplicate close callbacks during the exit transition.
    galleryCloseStartedRef.current = false;
    return () => {
      snapAnimRef.current?.stop();
      dragYAnimRef.current?.stop();
      tabAnimationRef.current?.stop();
      sheetCloseAnimRef.current?.stop();
      sheetCloseAnimRef.current = null;
      gestureAxis.current = null;
    };
  }, []);

  // ── Share handler ────────────────────────────────────────────────────────
  // The Share control lives in the statistics sheet, so it always shares a
  // link to VIEW THE STATISTICS — never the voting invite.
  //   Owner:   AnalyticsShareSheet (token-protected /share/<token> URL that
  //            grants analytics access to anyone who opens it after login).
  //   Visitor: public albums are reachable by id for any authenticated user,
  //            so share that stats page; private albums have nothing
  //            shareable here (only the owner can mint tokens).
  const handleShare = async () => {
    if (isOwner) {
      pushHistoryLayer("share");
      setShareSheetOpen(true);
      return;
    }
    const isPublic = album?.is_public !== false && analytics?.is_public !== false;
    const albumId = album?.id ?? analytics?.id;
    if (!isPublic || !albumId) {
      toast.error(t("shareLinkError"));
      return;
    }
    const url = `${window.location.origin}/analytics/${albumId}`;
    if (/Mobi|Android/i.test(navigator.userAgent) && navigator.share) {
      try {
        await navigator.share({ title: t("appName"), url });
        setShareDone(true); setTimeout(() => setShareDone(false), 2000);
        return;
      } catch { /* user cancelled or unsupported — fall through to clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"));
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
      toast.success(t("copied"));
    }
    setShareDone(true);
    setTimeout(() => setShareDone(false), 2000);
  };

  // ── Sort/Filter handlers ─────────────────────────────────────────────────
  const openFilterSheet = () => {    pushHistoryLayer("filter");
    setPendingVoters(new Set(selectedVoters));

    setFilterOpen(true);
  };
  const applyFilter = () => {
    setSelectedVoters(new Set(pendingVoters));
    closeSecondarySheet();
  };
  const clearFilter = () => {
    setPendingVoters(new Set());
    setSelectedVoters(new Set());
    closeSecondarySheet();
  };
  const togglePending = (id) => setPendingVoters((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const voter_summaries = canViewStats ? (analytics?.voter_summaries || []) : [];

  // ── Comment state for split layout (list in scrollable area, input in footer) ──
  const [replyTarget, setReplyTarget] = useState(null);
  // Full-width highlight bar for the notification's target comment. Rendered at
  // the SHEET level (not inside the clipped tab viewport) so it can span the
  // whole sheet width while the comment content itself stays within the gutters.
  const [highlightBar, setHighlightBar] = useState(null);
  const handleHighlight = useCallback((bar) => setHighlightBar(bar), []);
  const replyTriggerRef = useRef({});
  // Wire replyTrigger so PhotoCommentsList can signal CommentInput to start a reply
  replyTriggerRef.current._onReply = (comment, root) => {
    setReplyTarget({
      id: root ? root.id : comment.id,
      author: comment.author
    });
  };
  const listApiRef = useRef(null);
  const handleCommentCreated = useCallback((comment, parentId) => {
    listApiRef.current?.addComment?.(comment, parentId);
  }, []);

  const renderComments = () => {
    if (!currentPhoto) return null;
    return (
      <PhotoCommentsList
        photoId={String(currentPhoto.id)}
        initialComments={commentsData}
        onReplyTrigger={replyTriggerRef.current}
        apiRef={listApiRef}
        albumCreatorId={album.creator_id ? String(album.creator_id) : null}
        highlightCommentId={initialCommentId}
        onHighlight={handleHighlight}
      />
    );
  };

  const renderCommentInput = () => {
    if (!currentPhoto) return null;
    return (
      <CommentInput
        photoId={String(currentPhoto.id)}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        onCommentCreated={handleCommentCreated}
      />
    );
  };

  const secondaryOpen = sortOpen || filterOpen;

  // The wrapper has `initial`/`animate`/`exit` for opacity. AnimatePresence
  // detects the exit and fades the wrapper out over 0.3s rather than
  // unmounting it instantly. During this fade, the motion.img with layoutId
  // is FLIP-extracted to the shared-element layer at the root — it does
  // NOT inherit the wrapper's fading opacity — and Motion animates it from
  // its captured rect (finger release position) to the album card's
  // natural rect using the album-card's own spring. End result: the
  // backdrop + controls fade out smoothly while the photo flies
  // continuously into the album card, with no off-screen excursion and no
  // freeze-frame at the seam.
  //
  // The wrapper also has `touch-action: none` and `overscroll-behavior:
  // contain` so the OS-level pull-to-refresh gesture does NOT fire while
  // the user is dragging the photo. `touch-action: none` tells the browser
  // up-front not to start any default touch handling (no pan, no pinch, no
  // tap-zoom) for this subtree; our onTouchMove handler manages everything.
  // `overscroll-behavior: contain` blocks scroll-chaining to ancestor
  // scroll contexts as a belt-and-suspenders to the body-level suppression.
  return (
    <motion.div
      ref={galleryRef}
      data-testid="album-gallery"
      className="fixed inset-0 z-[90] flex flex-col overflow-hidden"
      style={{
        touchAction: "none",
        overscrollBehavior: "contain",
        pointerEvents: isExiting ? "none" : "auto",
        isolation: "isolate",
      }}
      aria-hidden={isExiting ? "true" : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
    >
      {/* Background overlay — outer tween handles the enter fade; the
          wrapper itself has an exit (opacity → 0 over 0.3s) that covers
          the backdrop's disappear. Inner bg-black layer is style-bound
          to dragY so it is already partially faded at the moment the
          user releases a dismiss drag — so during the exit it finishes
          fading to 0 cleanly without any visual snap. */}
      <motion.div
        className="absolute inset-0 z-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.3 } }}
      >
        <motion.div
          className="absolute inset-0 bg-black"
          style={{ opacity: bgOpacity }}
        />
      </motion.div>

      {/* Photo wrapper — handles all touch gestures (axis-locked) */}
      <motion.div
        data-testid="gallery-touch-layer"
        className="absolute top-0 left-0 right-0 z-10 overflow-hidden"
        style={{
          height: photoStageHeight,
          scale: combinedScale,
          translateY: combinedTranslateY,
          willChange: "height, transform",
        }}
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
          {/* Track — moves via a single absolute offset motion value */}
          <motion.div
            data-testid="carousel-track"
            className="flex h-full"
            style={{ x: offsetX, willChange: "transform" }}
          >
            {photos.map((photo, i) => {
              // Always keep the first photo as a Framer Motion layout element so
              // the album cover in Dashboard has a FLIP partner on close. When
              // opening from a non-first photo, skip the entrance animation so
              // the off-screen shared element does not fly in from the card.
              const isSharedElement = i === 0;
              const isEager = isSharedElement || Math.abs(currentIdx - i) <= 1;
              // Statistics mode must preserve the complete photo from the first
              // frame; the sheet geometry, not object-cover, controls the stage.
              const photoClassName = "max-w-full max-h-full select-none object-contain";
              const photoIsVideo = isVideo(photo);
              const photoProps = {
                src: photo.url,
                alt: "",
                className: `${photoClassName} pointer-events-none`,
                draggable: false,
                loading: isEager ? "eager" : "lazy",
                decoding: "async",
              };
              return (
                <div
                  key={photo.id}
                  data-media-id={photo.id}
                  data-active={i === currentIdx ? "true" : "false"}
                  className="relative flex-shrink-0 w-full h-full flex items-center justify-center py-8"
                >
                  {photo?.url ? (
                    isSharedElement ? (
                      photoIsVideo ? (
                        <motion.div
                          layoutId={`album-cover-${album.id}`}
                          data-testid="gallery-shared-video"
                          data-shared-media={`album-cover-${album.id}`}
                          layout={false}
                          className="absolute inset-0 flex max-w-full max-h-full items-center justify-center"
                          initial={initialIdx === 0 ? { borderRadius: 16 } : false}
                          animate={{ borderRadius: 0 }}        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                        >
                          <VideoPlayer
                            src={photo.url}
                            className={photoClassName}
                            preload="auto"
                            muted
                            autoPlay={i === currentIdx}
                            stableLayout
                            objectFit="contain"
                            bottomInset={sheetExpanded ? 0 : VIDEO_CONTROLS_INSET}
                            style={{
                              transform: `scale(${GALLERY_VIDEO_SCALE})`,
                              transformOrigin: "center center",
                            }}
                            onVerticalSwipeMove={onVideoVerticalSwipeMove}
                            onVerticalSwipe={onVideoVerticalSwipe}
                          />
                        </motion.div>
                      ) : (
                        <motion.img
                          {...photoProps}
                          layoutId={`album-cover-${album.id}`}
                          layout={false}
                          style={{ pointerEvents: "none" }}
                          initial={initialIdx === 0 ? { borderRadius: 16 } : false}
                          animate={{ borderRadius: 0 }}        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                        />
                      )
                    ) : photoIsVideo ? (
                      <VideoPlayer
                        src={photo.url}
                        className={photoClassName}
                        preload="auto"
                        muted
                        autoPlay={i === currentIdx}
                        bottomInset={sheetExpanded ? 0 : VIDEO_CONTROLS_INSET}
                        style={{
                          transform: `scale(${GALLERY_VIDEO_SCALE})`,
                          transformOrigin: "center center",
                        }}
                        onVerticalSwipeMove={onVideoVerticalSwipeMove}
                        onVerticalSwipe={onVideoVerticalSwipe}
                      />
                    ) : (
                      <img {...photoProps} />
                    )
                  ) : (
                    <div className="text-white/40 text-sm">No photo</div>
                  )}
                </div>
              );
            })}
          </motion.div>
        </div>
      </motion.div>

      {/* Bottom controls (ThumbStrip + PillBar) */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 pb-6 z-10"
        style={{ opacity: controlsOpacity, pointerEvents: controlsPointerEvents }}
      >
        {photos.length > 1 && (
          <ThumbStrip
            photos={photos}
            offsetX={offsetX}
            containerWidthRef={containerWidthRef}
            onSelect={handleThumbSelect}
            onDragEnd={handleThumbDragEnd}
            snapAnimRef={snapAnimRef}
            onSwipeStart={handleSheetSwipeStart}
            onSwipeMove={handleSheetSwipeMove}
            onSwipeEnd={handleSheetSwipeEnd}
            onSwipeCancel={handleSheetSwipeCancel}
          />
        )}

        {(!sheetExpanded || sheetGestureActive) && (
          <PillBar
            canViewStats={canViewStats}
            likeCount={likeCount}
            dislikeCount={dislikeCount}
            commentCount={commentsCount}
            onExpand={openPrimarySheet}
            onSwipeStart={handleSheetSwipeStart}
            onSwipeMove={handleSheetSwipeMove}
            onSwipeEnd={handleSheetSwipeEnd}
            onSwipeCancel={handleSheetSwipeCancel}
          />
        )}
      </motion.div>

      {/* PRIMARY BottomSheet */}
      <BottomSheet
        open={sheetExpanded}
        onClose={closePrimarySheet}
        sharedY={sheetY}
        onHorizontalSwipeStart={canViewStats ? handleTabSwipeStart : undefined}
        onHorizontalSwipeMove={canViewStats ? handleTabSwipeMove : undefined}
        onHorizontalSwipeEnd={canViewStats ? handleTabSwipeEnd : undefined}
        onHorizontalSwipeCancel={canViewStats ? handleTabSwipeCancel : undefined}
        partialOffsetVh={0.25}
        backdropBlur={false}
        backdropDim={false}
        heightVh={0.75}
        hideHeader={true}
        closeOnEscape={!secondaryOpen}
        testId="primary-stats-sheet"
        viewportHeight={vh}
        gestureActive={sheetGestureActive}
        gestureY={sheetGestureY}
        linearMotion
        animateOnClose={false}
        footer={sheetTab === "comments" ? renderCommentInput() : null}
        headerChildren={
          canViewStats ? (
            <div role="tablist" aria-label={t("statistics")} className="flex gap-2">
              <button
                role="tab"
                aria-selected={sheetTab === "stats"}
                onClick={() => animateToTab("stats")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition-colors ${sheetTab === "stats"
                  ? "bg-primary-400 text-white"
                  : "bg-border-light dark:bg-border-dark text-gray-500 dark:text-gray-400"
                  }`}
              >
                <BarChart2 size={14} />
                {t("statistics")}
              </button>
              <button
                role="tab"
                aria-selected={sheetTab === "comments"}
                onClick={() => animateToTab("comments")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition-colors ${sheetTab === "comments"
                  ? "bg-primary-400 text-white"
                  : "bg-border-light dark:bg-border-dark text-gray-500 dark:text-gray-400"
                  }`}
              >
                <MessageCircle size={14} />
                {t("Comments")}
              </button>
            </div>
          ) : (
            <h3 className="font-bold text-lg px-0">{t("Comments")}</h3>
          )
        }
      >
        {/* Sheet-level full-width highlight bar: sibling of the tab viewport,
            anchored to the scrollable sheet content so it scrolls with the
            comments, spans the full sheet width, and is never clipped by the
            tab viewport (whose overflow:hidden box matches the padded content
            area — keeping comment text/avatars inside the gutters). */}
        {highlightBar && (
          <div
            key={highlightBar.key}
            className="comment-highlight-bar"
            style={{ top: highlightBar.top, height: highlightBar.height }}
          />
        )}
        <div ref={tabViewportRef} className="overflow-hidden w-full min-h-full">
          <motion.div
            data-testid="stats-comments-tab-track"
            className={canViewStats ? "flex w-[200%] min-h-full" : "flex w-full min-h-full"}
            style={{ x: tabTrackX }}
          >
            {canViewStats && (
              <div className="w-1/2 flex-shrink-0 min-h-full">
                <StatisticsTab
                  analytics={analytics}
                  photos={filtered}
                  currentPhotoId={currentPhoto?.id}
                  onJump={jumpToPhoto}
                  selectedVotersSize={selectedVoters.size}
                  onOpenSort={openSortSheet}
                  onOpenFilter={openFilterSheet}
                  onShare={handleShare}
                  shareDone={shareDone}
                  viewMode={viewMode}
                />
              </div>
            )}
            <div className={`${canViewStats ? "w-1/2 flex-shrink-0" : "w-full"} min-h-full`}>
              {renderComments()}
            </div>
          </motion.div>
        </div>
      </BottomSheet>

      {sheetExpanded && viewMode === "grid" && (
        <motion.div
          className="fixed left-0 right-0 bottom-[75vh] z-[55] flex justify-center pointer-events-none"
          style={{ y: floatingPillY, willChange: "transform" }}
        >
          <div className="pointer-events-auto">
            <PillBar
              canViewStats={canViewStats}
              likeCount={likeCount}
              dislikeCount={dislikeCount}
              commentCount={commentsCount}
              onExpand={openPrimarySheet}
              onSwipeStart={handleSheetSwipeStart}
              onSwipeMove={handleSheetSwipeMove}
              onSwipeEnd={handleSheetSwipeEnd}
              onSwipeCancel={handleSheetSwipeCancel}
            />
          </div>
        </motion.div>
      )}

      {/* SECONDARY SortSheet */}
      <GallerySortSheet
        open={sortOpen}
        onClose={closeSecondarySheet}
        sortKey={sortKey}
        setSortKey={setSortKey}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {/* SECONDARY FilterSheet */}
      <GalleryFilterSheet
        open={filterOpen}
        onClose={closeSecondarySheet}
        voter_summaries={voter_summaries}
        pendingVoters={pendingVoters}
        togglePending={togglePending}
        applyFilter={applyFilter}
        clearFilter={clearFilter}
      />

      {/* Owner-only token share sheet — zIndex=70 layers above the primary
          (50) and Sort/Filter secondary (60) sheets so it always wins the
          stacking order, even if the user taps Share while a Sort sheet is
          open on top. */}
      <AnalyticsShareSheet
        open={shareSheetOpen}
        onClose={closeShareSheet}
        albumId={String(album?.id || "")}
        zIndex={70}
      />
    </motion.div>
  );
}
