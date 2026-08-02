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
  MessageCircle, BarChart2, SlidersHorizontal, Filter, Share2, Check,
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

function ThumbStrip({ photos, offsetX, containerWidthRef, onSelect, onDragEnd, snapAnimRef }) {
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const touchStartX = useRef(0);
  const touchStartDragX = useRef(0);
  const touchStartTime = useRef(0);
  // Snapshot of the main photo index at the start of a thumb-strip drag.
  // Clamping the strip against this value keeps the scroll feel identical
  // to the pre-instant-switch version.
  const startMainIdx = useRef(0);
  // Tracks whether an instant main-photo switch already happened during the
  // current thumb-strip drag. When true, the release handler must not also
  // apply a velocity flick on top of the already-applied switch.
  const didSwitchDuringDrag = useRef(false);
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

  const onThumbTouchEnd = (e) => {
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
        <div className="ml-auto flex items-center gap-2 text-sm font-semibold
                        text-gray-600 dark:text-gray-300">
          <BarChart2 size={16} />
          <span className="tabular-nums">{analytics.total_votes}</span>
        </div>
        <button onClick={onShare}
          className="w-10 h-10 rounded-2xl flex items-center justify-center
                     bg-border-light dark:bg-border-dark text-gray-400
                     hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
          {shareDone ? <Check size={15} /> : <Share2 size={15} />}
        </button>
      </div>

      {/* "Statistics" title row removed — total votes count moved into the toolbar above, next to Share */}

      {photos.length === 0 && (
        <p className="text-center text-gray-400 py-8 text-sm">{t("noVotes")}</p>
      )}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => onJump(photo.id)}
              className={`relative aspect-square rounded-xl overflow-hidden
                         bg-border-light dark:bg-border-dark
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
                <span>#{i + 1}</span>
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
            className={`w-full flex items-center gap-3 py-2 px-2 rounded-xl transition-colors
                       ${String(photo.id) === String(currentPhotoId)
                ? "bg-primary-50 dark:bg-primary-900/20"
                : ""}`}
          >
            <span className="w-6 text-center text-sm font-bold text-gray-500 dark:text-gray-400 flex-shrink-0 tabular-nums">
              #{i + 1}
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
export default function AlbumGallery({ album, onClose, startPhotoId, dragProgressMV }) {
  const { t } = useLang();
  const { user } = useAuth();
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // ── State ────────────────────────────────────────────────────────────────
  const initialIdx = (() => {
    if (startPhotoId && album.photos?.length) {
      const idx = album.photos.findIndex((p) => String(p.id) === String(startPhotoId));
      return idx >= 0 ? idx : 0;
    }
    return 0;
  })();

  const [analytics, setAnalytics] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(initialIdx);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sheetTab, setSheetTab] = useState("stats");

  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState("likes_desc");
  const [viewMode, setViewMode] = useState("list");
  const [selectedVoters, setSelectedVoters] = useState(new Set());
  const [pendingVoters, setPendingVoters] = useState(new Set());
  const [shareDone,      setShareDone]      = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [commentsData, setCommentsData] = useState(null);
  const [isExiting, setIsExiting]      = useState(false);
  // The first photo starts as object-cover for the shared-element transition
  // from the album card, then switches to object-contain like the others so
  // gallery navigation looks consistent.
  const [firstPhotoFitDone, setFirstPhotoFitDone] = useState(initialIdx !== 0);
  const fetchedPhotoIdRef = useRef(null);
  const fetchedAlbumIdRef = useRef(null);

  // Owner-only token share — Dashboard opens this gallery from the user's own
  // album cards, so the creator comparison is mostly defensive (in case the
  // wrapper is reused for shared-with-me albums in the future).
  const isOwner = !!user && !!album?.creator_id &&
                  String(user.id) === String(album.creator_id);



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
  const defaultOffset = vh * 0.35;
  const dragY = useMotionValue(0);
  const dragYAnimRef = useRef(null);

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

  // BottomSheet shared drag position
  const sheetY = useMotionValue(defaultOffset);
  const photoScale = useTransform(sheetY, [0, defaultOffset], [0.5, 1]);
  const photoTranslateY = useTransform(sheetY, [0, defaultOffset], [-vh * 0.3, 0]);

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

  // ── Data fetching ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!album?.id) return;
    if (fetchedAlbumIdRef.current === album.id) return;
    fetchedAlbumIdRef.current = album.id;
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
    if (sheetExpanded) {
      dragYAnimRef.current?.stop();
      dragY.set(0);
      sheetY.set(0);
    }
  }, [sheetExpanded, sheetY, dragY]);

  // ── Sync ref when state changes from goTo ──────────────────────────────
  useEffect(() => {
    currentIdxRef.current = currentIdx;
  }, [currentIdx]);

  // ── Programmatic navigation ──────────────────────────────────────────────
  const goTo = useCallback((idx) => {
    if (idx < 0 || idx >= photos.length) return;
    snapAnimRef.current?.stop();
    dragYAnimRef.current?.stop();
    const W = containerWidthRef.current;
    const targetOffset = -(idx * W);
    currentIdxRef.current = idx;
    // Reset dismiss gesture
    dragY.set(0);
    if (dragProgressMV) dragProgressMV.set(0);
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
            type: "spring",
            stiffness: 350,
            damping: 32,
          });
        }
        setSheetExpanded(false);
        setSortOpen(false);
        setFilterOpen(false);
        setShareSheetOpen(false);
        // Disable the whole gallery subtree from receiving input during the
        // exit fade. The root motion element stays in the DOM for ~220 ms while
        // AnimatePresence finishes; `inert` ensures it does not block clicks or
        // touches on the underlying Dashboard during that window. We also set
        // pointer-events:none as a fallback for older browsers and aria-hidden
        // for assistive tech.
        setIsExiting(true);
        galleryRef.current?.setAttribute("inert", "");
        onClose();      // dragProgressMV progress to 1 is owned by handleGalleryClose
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
  }, [offsetX, dragY, photos.length, onClose]);

  const onWrapperTouchCancel = useCallback(() => {
    gestureAxis.current = null;
  }, []);

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
    return () => {
      snapAnimRef.current?.stop();
      dragYAnimRef.current?.stop();
    };
  }, []);

  // After the shared-element open transition settles, the first photo should
  // use object-contain like every other photo so carousel navigation is
  // visually consistent and layout animations do not interfere with dragging.
  useEffect(() => {
    if (initialIdx !== 0) return;
    const timer = setTimeout(() => setFirstPhotoFitDone(true), 500);
    return () => clearTimeout(timer);
  }, [initialIdx]);

  // ── Share handler ────────────────────────────────────────────────────────
  // Owners get the AnalyticsShareSheet flow (token-protected URL that grants
  // analytics access to anyone who opens it after login). Non-owners get the
  // voting invite link so they can pass the album around for more votes.
  // The old behavior — copying `window.location.href` (= `/dashboard`) — was
  // reported as a placeholder that gave recipients a dead URL. Removed.
  const handleShare = async () => {
    if (isOwner) {
      setShareSheetOpen(true);
      return;
    }
    const url = album?.invite_url;
    if (!url) return;
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

  // ── Comment state for split layout (list in scrollable area, input in footer) ──
  const [replyTarget, setReplyTarget] = useState(null);
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
  // detects the exit and fades the wrapper out over 0.22s rather than
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
      style={{ touchAction: "none", overscrollBehavior: "contain", pointerEvents: isExiting ? "none" : "auto" }}
      aria-hidden={isExiting ? "true" : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.22 } }}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
    >
      {/* Background overlay — outer tween handles the enter fade; the
          wrapper itself has an exit (opacity → 0 over 0.22s) that covers
          the backdrop's disappear. Inner bg-black layer is style-bound
          to dragY so it is already partially faded at the moment the
          user releases a dismiss drag — so during the exit it finishes
          fading to 0 cleanly without any visual snap. */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.22 } }}
      >
        <motion.div
          className="absolute inset-0 bg-black"
          style={{ opacity: bgOpacity }}
        />
      </motion.div>

      {/* Photo wrapper — handles all touch gestures (axis-locked) */}
      <motion.div
        data-testid="gallery-touch-layer"
        className="flex-1 relative"
        style={{ scale: combinedScale, translateY: combinedTranslateY }}
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
              const isFirstCover = isSharedElement && !firstPhotoFitDone;
              const photoClassName = `max-w-full max-h-full select-none ${isFirstCover ? "object-cover" : "object-contain"}`;
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
                className="flex-shrink-0 w-full h-full flex items-center justify-center py-8"
              >
                {photo?.url ? (
                  isSharedElement ? (
                    photoIsVideo ? (
                      <motion.div
                        layoutId={`album-cover-${album.id}`}
                        data-testid="gallery-shared-video"
                        data-shared-media={`album-cover-${album.id}`}
                        layout={false}
                        className="relative flex max-w-full max-h-full items-center justify-center"
                        initial={initialIdx === 0 ? { borderRadius: 16 } : false}
                        animate={{ borderRadius: 0 }}
                        transition={
                          isExiting || !firstPhotoFitDone
                            ? { type: "spring", stiffness: 280, damping: 32, mass: 0.95 }
                            : { duration: 0 }
                        }
                      >
                        <VideoPlayer
                          src={photo.url}
                          className={photoClassName}
                          preload="metadata"
                        />
                      </motion.div>
                    ) : (
                      <motion.img
                        {...photoProps}
                        layoutId={`album-cover-${album.id}`}
                        layout={false}
                        onLayoutAnimationComplete={() => setFirstPhotoFitDone(true)}
                        style={{ pointerEvents: "none" }}
                        initial={initialIdx === 0 ? { borderRadius: 16 } : false}
                        animate={{ borderRadius: 0 }}
                        transition={
                          isExiting || !firstPhotoFitDone
                            ? { type: "spring", stiffness: 280, damping: 32, mass: 0.95 }
                            : { duration: 0 }
                        }
                      />
                    )
                  ) : photoIsVideo ? (
                    <VideoPlayer
                      src={photo.url}
                      className={photoClassName}
                      preload="metadata"
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
        className="flex flex-col items-center gap-3 pb-6 flex-shrink-0 z-10"
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
          />
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
        footer={sheetTab === "comments" ? renderCommentInput() : null}
        headerChildren={
          <div className="flex gap-2">
            <button
              onClick={() => setSheetTab("stats")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition-colors ${sheetTab === "stats"
                ? "bg-primary-400 text-white"
                : "bg-border-light dark:bg-border-dark text-gray-500 dark:text-gray-400"
                }`}
            >
              <BarChart2 size={14} />
              {t("statistics")}
            </button>
            <button
              onClick={() => setSheetTab("comments")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold transition-colors ${sheetTab === "comments"
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
            viewMode={viewMode}
          />
        ) : renderComments()}
      </BottomSheet>

      {/* SECONDARY SortSheet */}
      <GallerySortSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        sortKey={sortKey}
        setSortKey={setSortKey}
        viewMode={viewMode}
        setViewMode={setViewMode}
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

      {/* Owner-only token share sheet — zIndex=70 layers above the primary
          (50) and Sort/Filter secondary (60) sheets so it always wins the
          stacking order, even if the user taps Share while a Sort sheet is
          open on top. */}
      <AnalyticsShareSheet
        open={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        albumId={String(album?.id || "")}
        zIndex={70}
      />
    </motion.div>
  );
}
