/**
 * SwipeCard.jsx — v5.2
 *
 * CHANGES (vs v5.1):
 *  - stackY = 0 for ALL cards (no staircase/ladder offset)
 *    Cards stack exactly on top of each other — depth shown only via scale
 *  - Scale difference between cards is slightly more visible (0.05 per level)
 *    so the user can feel depth without positional offset
 *  - Card fills its container (absolute inset-0) — container in VotePage
 *    controls the 3:4 aspect ratio and maximum size
 *  - Font: uses inherited font (font-sans from the site theme) — no override
 */
import { useRef, forwardRef, useImperativeHandle, useState, useEffect } from "react";
import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { ImageOff } from "lucide-react";
import BrokenHeart from "./BrokenHeart";
import FilledHeart from "./FilledHeart";
import { isVideo } from "../utils/media";
import VideoPlayer from "./VideoPlayer";

const SWIPE_THRESHOLD = 64;
const PINCH_MAX_SCALE = 4;
const PINCH_RESET_MS = 280;

function touchDistance(touches) {
  return Math.hypot(
    touches[1].clientX - touches[0].clientX,
    touches[1].clientY - touches[0].clientY
  );
}

function touchMidpoint(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

const SwipeCard = forwardRef(function SwipeCard(
  { photo, isTop, stackIndex, onSwipe, onImageClick, enablePinchZoom = false, videoScrubBottomRatio = 0.25, blurredVideoBackdrop = false },
  ref
) {
  const controls = useAnimation();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const pointerDown = useRef(null);
  const hasDragged = useRef(false);
  const pinchRef = useRef({ active: false });
  const pinchResetTimerRef = useRef(null);
  const pinchTransformRef = useRef({ scale: 1, x: 0, y: 0 });
  const pinchImageRef = useRef(null);
  const [pinchTransform, setPinchTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [pinchActive, setPinchActive] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);

  const rotate = useTransform(x, [-300, 0, 300], [-22, 0, 22]);
  const likeOpacity = useTransform(x, [15, 80], [0, 1]);
  const nopeOpacity = useTransform(x, [-80, -15], [1, 0]);

  // All cards aligned perfectly (no scale difference)
  const stackScale = 1;
  const pinchEnabled = enablePinchZoom && !isVideo(photo);

  useEffect(() => () => {
    window.clearTimeout(pinchResetTimerRef.current);
  }, []);

  const setPinchState = (next) => {
    pinchTransformRef.current = next;
    setPinchTransform(next);
  };

  const finishPinch = () => {
    pinchRef.current = { active: false };
    setPinchState({ scale: 1, x: 0, y: 0 });
    window.clearTimeout(pinchResetTimerRef.current);
    pinchResetTimerRef.current = window.setTimeout(() => {
      setPinchActive(false);
      pinchResetTimerRef.current = null;
    }, PINCH_RESET_MS);
  };

  const handlePinchStartCapture = (event) => {
    if (!pinchEnabled || event.touches.length !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    controls.stop();
    x.set(0);
    y.set(0);
    pointerDown.current = null;
    hasDragged.current = true;
    const midpoint = touchMidpoint(event.touches);
    const imageRect = pinchImageRef.current?.getBoundingClientRect();
    const imageCenter = imageRect
      ? { x: imageRect.left + imageRect.width / 2, y: imageRect.top + imageRect.height / 2 }
      : midpoint;
    const startTransform = pinchTransformRef.current;
    const startScale = startTransform.scale || 1;
    pinchRef.current = {
      active: true,
      startDistance: touchDistance(event.touches),
      startMidpoint: midpoint,
      startTransform,
      startLocalPoint: {
        x: (midpoint.x - imageCenter.x) / startScale,
        y: (midpoint.y - imageCenter.y) / startScale,
      },
    };
    window.clearTimeout(pinchResetTimerRef.current);
    setPinchActive(true);
  };

  const handlePinchMoveCapture = (event) => {
    if (!pinchEnabled || !pinchRef.current.active || event.touches.length !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    const pinch = pinchRef.current;
    const distanceRatio = touchDistance(event.touches) / pinch.startDistance;
    const scale = Math.max(1, Math.min(PINCH_MAX_SCALE, pinch.startTransform.scale * distanceRatio));
    const midpoint = touchMidpoint(event.touches);
    const scaleCompensation = (pinch.startTransform.scale || 1) - scale;
    setPinchState({
      scale,
      x: pinch.startTransform.x + midpoint.x - pinch.startMidpoint.x + pinch.startLocalPoint.x * scaleCompensation,
      y: pinch.startTransform.y + midpoint.y - pinch.startMidpoint.y + pinch.startLocalPoint.y * scaleCompensation,
    });
  };

  const handlePinchEndCapture = (event) => {
    if (!pinchEnabled || !pinchRef.current.active) return;
    event.stopPropagation();
    if (event.touches.length < 2) finishPinch();
  };

  useImperativeHandle(ref, () => ({
    swipeTo: async (isLike) => {
      const dir = isLike ? 700 : -700;
      await controls.start({
        x: dir, rotate: isLike ? 22 : -22, opacity: 0,
        transition: { duration: 0.24, ease: [0.32, 0, 0.67, 0] },
      });
      onSwipe(photo.id, isLike);
    },
    resetPosition: () => {
      x.set(0);
      y.set(0);
      controls.set({ x: 0, y: 0, rotate: 0, opacity: 1 });
    },
  }));

  const handlePointerDown = (e) => {
    if (!isTop) return;
    pointerDown.current = { x: e.clientX, y: e.clientY };
    hasDragged.current = false;
  };

  const handlePointerUp = (e) => {
    if (!isTop || !pointerDown.current) return;
    if (e.target?.closest?.("[data-video-player]")) {
      pointerDown.current = null;
      return;
    }
    const dx = Math.abs(e.clientX - pointerDown.current.x);
    const dy = Math.abs(e.clientY - pointerDown.current.y);
    if (dx < 8 && dy < 8 && !hasDragged.current && onImageClick) {
      onImageClick(photo);
    }
    pointerDown.current = null;
  };

  const handleDragStart = () => { hasDragged.current = true; };

  const handleDragEnd = async (_, info) => {
    const absX = Math.abs(info.offset.x);
    const absV = Math.abs(info.velocity.x);
    if (absX > SWIPE_THRESHOLD || absV > 450) {
      const isLike = info.offset.x > 0 || info.velocity.x > 0;
      await controls.start({
        x: isLike ? 700 : -700, y: y.get() - 40, opacity: 0,
        transition: { duration: 0.22, ease: "easeOut" },
      });
      onSwipe(photo.id, isLike);
    } else {
      controls.start({ x: 0, y: 0, rotate: 0, transition: { type: "spring", stiffness: 280, damping: 25 } });
    }
  };

  const onImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    setAspectRatio(naturalWidth / naturalHeight);
  };

  // Determine object-fit based on ratio
  // Target: 0.75 (3:4). If within [0.6, 1.0], use object-cover.
  const isCloseToAspect = aspectRatio && Math.abs(aspectRatio - 0.75) < 0.22;
  const objectFit = isCloseToAspect ? "object-cover" : "object-contain";

  return (
    <motion.div
      className="absolute inset-0 no-select touch-manipulation"
      style={{
        x: isTop ? x : 0,
        y: isTop ? y : 0,
        rotate: isTop ? rotate : 0,
        scale: stackScale,
        opacity: 1,               // always full opacity
        zIndex: 20 - stackIndex, // top card in front
        pointerEvents: isTop ? "auto" : "none",
        cursor: isTop ? "grab" : "default",
      }}
      animate={isTop ? controls : {
        // Back cards: animate only scale when they come to front
        scale: stackScale,
        transition: { type: "spring", stiffness: 280, damping: 28 },
      }}
      drag={isTop && !pinchActive ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      data-pinch-enabled={pinchEnabled ? "true" : undefined}
    >
      {/*
        Dark background so object-contain images look intentional.
        Only this card container is dark — page background stays themed.
        rounded-3xl for a refined card feel.
      */}
      <div className={`relative w-full h-full rounded-3xl ${pinchActive ? "overflow-visible" : "overflow-hidden"} ${isTop ? "shadow-swipe" : ""} bg-gray-950`}>

        {imageFailed ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-400">
            <ImageOff size={34} />
            <span className="text-sm">Изображение недоступно</span>
          </div>
        ) : isVideo(photo) ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <VideoPlayer
              src={photo.url}
              className="w-full h-full"
              preload="auto"
              autoPlay={isTop}
              loop
              stableLayout={blurredVideoBackdrop}
              scrubBottomRatio={videoScrubBottomRatio}
              blurredBackdrop={blurredVideoBackdrop}
              isolateScrubGesture={blurredVideoBackdrop}
            />
          </div>
        ) : (
          <div
            data-testid={pinchEnabled ? "vote-pinch-image" : undefined}
            className={`relative w-full h-full flex items-center justify-center ${pinchActive ? "z-30" : ""}`}
            onTouchStartCapture={handlePinchStartCapture}
            onTouchMoveCapture={handlePinchMoveCapture}
            onTouchEndCapture={handlePinchEndCapture}
            onTouchCancelCapture={finishPinch}
          >
            <img
              ref={pinchImageRef}
              src={photo.url}
              alt="Фото альбома"
              onLoad={onImageLoad}
              onError={() => setImageFailed(true)}
              className={`w-full h-full ${objectFit} select-none pointer-events-none`}
              draggable={false}
              loading={isTop ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={isTop ? "high" : "low"}
              style={{
                transform: `translate3d(${pinchTransform.x}px, ${pinchTransform.y}px, 0) scale(${pinchTransform.scale})`,
                transformOrigin: "center center",
                transition: pinchActive && !pinchRef.current.active ? `transform ${PINCH_RESET_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none",
                willChange: pinchActive ? "transform" : "auto",
              }}
            />
          </div>
        )}

        {/* LIKE / NOPE stamps — top card only */}
        {isTop && (
          <>
            <motion.div
              style={{ opacity: likeOpacity }}
              className="absolute top-6 left-5 border-[3px] border-green-400 text-green-400
                         font-sans font-bold text-xl tracking-widest rounded-xl
                         px-3 py-1 -rotate-[20deg] select-none whitespace-nowrap bg-black/20"
            >
              НРАВИТСЯ
            </motion.div>
            <motion.div
              style={{ opacity: nopeOpacity }}
              className="absolute top-6 right-5 border-[3px] border-red-400 text-red-400
                         font-sans font-bold text-xl tracking-widest rounded-xl
                         px-3 py-1 rotate-[20deg] select-none whitespace-nowrap bg-black/20"
            >
              НЕ НРАВИТСЯ
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  );
});

export default SwipeCard;

// ─── Action buttons — equal size, site font ────────────────────────────────────
export function SwipeButtons({ onLike, onDislike, disabled }) {
  return (
    <div className="flex items-center justify-center gap-14">

      {/* Dislike */}
      <motion.button
        onClick={onDislike}
        disabled={disabled}
        whileHover={{ scale: disabled ? 1 : 1.1 }}
        whileTap={{ scale: 0.88 }}
        className="w-16 h-16 rounded-full flex items-center justify-center
                   bg-white dark:bg-card-dark shadow-card
                   hover:bg-red-50 dark:hover:bg-red-950/20
                   disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors duration-150 touch-manipulation"
        aria-label="Dislike"
      >
        <BrokenHeart size={28} className="text-gray-500 dark:text-gray-300" />
      </motion.button>

      {/* Like */}
      <motion.button
        onClick={onLike}
        disabled={disabled}
        whileHover={{ scale: disabled ? 1 : 1.1 }}
        whileTap={{ scale: 0.88 }}
        className="w-16 h-16 rounded-full flex items-center justify-center
                   bg-primary-400 hover:bg-primary-500 shadow-orange
                   disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors duration-150 touch-manipulation"        aria-label="Like"
      >
        <FilledHeart size={28} className="text-white" />
      </motion.button>

    </div>
  );
}
