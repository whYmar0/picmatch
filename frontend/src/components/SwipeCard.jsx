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
import { memo, useRef, forwardRef, useImperativeHandle, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ImageBroken, Heart, HeartBreak } from "@phosphor-icons/react";
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
  { photo, isTop, stackIndex, onSwipe, onImageClick, onLikeThresholdCrossed, enablePinchZoom = false, videoScrubBottomRatio = 0.25, blurredVideoBackdrop = false },
  ref
) {
  const pointerDown = useRef(null);
  const pointerAnimationRef = useRef(null);
  const hasDragged = useRef(false);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const heartFired = useRef(false);
  const suppressHeartRef = useRef(false);
  const cardElRef = useRef(null);
  const pinchRef = useRef({ active: false });
  const panRef = useRef(null);
  const pinchResetTimerRef = useRef(null);
  const pinchTransformRef = useRef({ scale: 1, x: 0, y: 0 });
  const pinchImageRef = useRef(null);
  const pinchActiveRef = useRef(false);
  const pinchOccurredRef = useRef(false);
  const pinchCooldownUntilRef = useRef(0);
  const [pinchActive, setPinchActive] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);

  // All cards aligned perfectly (no scale difference)
  const pinchEnabled = enablePinchZoom && !isVideo(photo);

  useEffect(() => () => {
    window.clearTimeout(pinchResetTimerRef.current);
    pointerAnimationRef.current?.cancel();
  }, []);

  const applyPinchTransform = (next, transition = "none") => {
    pinchTransformRef.current = next;
    const image = pinchImageRef.current;
    if (!image) return;
    image.style.transition = transition;
    image.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.scale})`;
  };

  const finishPinch = () => {
    pinchRef.current = { active: false };
    panRef.current = null;
    pinchActiveRef.current = false;
    pinchOccurredRef.current = true;
    pinchCooldownUntilRef.current = Date.now() + 450;
    applyPinchTransform({ scale: 1, x: 0, y: 0 }, `transform ${PINCH_RESET_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`);
    window.clearTimeout(pinchResetTimerRef.current);
    pinchResetTimerRef.current = window.setTimeout(() => {
      pinchOccurredRef.current = false;
      setPinchActive(false);
      pinchResetTimerRef.current = null;
    }, 450);
  };

  const handlePinchStartCapture = (event) => {
    if (!pinchEnabled || event.touches.length !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    pointerDown.current = null;
    hasDragged.current = true;
    pinchActiveRef.current = true;
    pinchOccurredRef.current = true;
    panRef.current = null;
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
    if (pinchImageRef.current) pinchImageRef.current.style.transition = "none";
    setPinchActive(true);
  };

  const handlePinchMoveCapture = (event) => {
    if (!pinchEnabled || !pinchRef.current.active) return;
    if (event.touches.length === 2) {
      event.preventDefault();
      event.stopPropagation();
      const pinch = pinchRef.current;
      const distanceRatio = touchDistance(event.touches) / pinch.startDistance;
      const scale = Math.max(1, Math.min(PINCH_MAX_SCALE, pinch.startTransform.scale * distanceRatio));
      const midpoint = touchMidpoint(event.touches);
      const scaleCompensation = (pinch.startTransform.scale || 1) - scale;
      applyPinchTransform({
        scale,
        x: pinch.startTransform.x + midpoint.x - pinch.startMidpoint.x + pinch.startLocalPoint.x * scaleCompensation,
        y: pinch.startTransform.y + midpoint.y - pinch.startMidpoint.y + pinch.startLocalPoint.y * scaleCompensation,
      });
      return;
    }
    if (event.touches.length === 1 && pinchTransformRef.current.scale > 1.05 && panRef.current) {
      event.preventDefault();
      event.stopPropagation();
      const touch = event.touches[0];
      applyPinchTransform({
        ...pinchTransformRef.current,
        x: panRef.current.transform.x + touch.clientX - panRef.current.x,
        y: panRef.current.transform.y + touch.clientY - panRef.current.y,
      });
    }
  };

  const handlePinchEndCapture = (event) => {
    if (!pinchEnabled || !pinchRef.current.active) return;
    event.stopPropagation();
    if (event.touches.length === 1 && pinchTransformRef.current.scale > 1.05) {
      const touch = event.touches[0];
      panRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        transform: { ...pinchTransformRef.current },
      };
      return;
    }
    if (event.touches.length === 0) finishPinch();
  };

  useImperativeHandle(ref, () => ({
    swipeTo: (isLike) => new Promise((resolve) => {
      const direction = isLike ? 1 : -1;
      const card = cardElRef.current;
      const rect = card?.getBoundingClientRect();
      suppressHeartRef.current = true;
      if (isLike && rect) {
        lastPointerPos.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        onLikeThresholdCrossed?.(lastPointerPos.current);
      }
      animatePointerTransform([
        { transform: "translate3d(0px, 0px, 0px) rotate(0deg)", opacity: 1 },
        { transform: `translate3d(${direction * 900}px, 0px, 0px) rotate(${direction * 22}deg)`, opacity: 0 },
      ], { duration: 240, easing: "cubic-bezier(0.32, 0, 0.67, 0)" }, () => {
        onSwipe(photo.id, isLike);
        suppressHeartRef.current = false;
        resolve();
      });
    }),
    resetPosition: () => {
      heartFired.current = false;
      suppressHeartRef.current = false;
      pointerAnimationRef.current?.cancel();
      pointerAnimationRef.current = null;
      if (cardElRef.current) {
        cardElRef.current.style.transform = "";
        cardElRef.current.style.opacity = "1";
        cardElRef.current.style.transition = "";
      }
    },
  }));

  const animatePointerTransform = (keyframes, options, onFinish) => {
    pointerAnimationRef.current?.cancel();
    const card = cardElRef.current;
    if (!card?.animate) {
      card.style.transform = keyframes.at(-1).transform;
      card.style.opacity = keyframes.at(-1).opacity ?? "1";
      onFinish?.();
      return;
    }
    const animation = card.animate(keyframes, options);
    pointerAnimationRef.current = animation;
    animation.onfinish = () => {
      if (pointerAnimationRef.current !== animation) return;
      const finalFrame = keyframes.at(-1);
      card.style.transform = finalFrame.transform;
      card.style.opacity = finalFrame.opacity ?? "1";
      pointerAnimationRef.current = null;
      animation.cancel();
      // Defer React state-update callback to the next frame so the browser can
      // paint the fly-off position before reconciling the card stack.
      if (onFinish) requestAnimationFrame(onFinish);
    };
  };

  const handlePointerDown = (event) => {
    if (!isTop || event.target?.closest?.("[data-video-player]") || pinchActiveRef.current) return;
    pointerAnimationRef.current?.cancel();
    pointerAnimationRef.current = null;
    const card = cardElRef.current;
    if (card) {
      card.style.opacity = "1";
      card.style.transform = "translate3d(0px, 0px, 0px) rotate(0deg)";
    }
    pointerDown.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocityX: 0,
    };
    lastPointerPos.current = { x: event.clientX, y: event.clientY };
    hasDragged.current = false;
  };

  const handlePointerMove = (event) => {
    const gesture = pointerDown.current;
    if (!isTop || !gesture || gesture.pointerId !== event.pointerId) return;
    if (pinchActiveRef.current || pinchOccurredRef.current || Date.now() < pinchCooldownUntilRef.current) return;

    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const elapsed = Math.max(1, event.timeStamp - gesture.lastTime);
    gesture.velocityX = ((event.clientX - gesture.lastX) / elapsed) * 1000;
    gesture.lastX = event.clientX;
    gesture.lastTime = event.timeStamp;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasDragged.current = true;
    lastPointerPos.current = { x: event.clientX, y: event.clientY };

    const rotation = Math.max(-22, Math.min(22, dx / 14));
    const card = cardElRef.current;
    if (card) card.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${rotation}deg)`;
    if (dx >= 80 && !heartFired.current && !suppressHeartRef.current) {
      heartFired.current = true;
      onLikeThresholdCrossed?.(lastPointerPos.current);
    } else if (dx < 40) {
      heartFired.current = false;
    }
  };

  const handlePointerUp = (event) => {
    const gesture = pointerDown.current;
    if (!isTop || !gesture || gesture.pointerId !== event.pointerId) return;
    pointerDown.current = null;
    if (event.target?.closest?.("[data-video-player]")) return;

    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const isPinchRestricted =
      pinchActiveRef.current
      || pinchOccurredRef.current
      || Date.now() < pinchCooldownUntilRef.current
      || pinchTransformRef.current.scale > 1.05;

    if (isPinchRestricted) {
      pinchOccurredRef.current = false;
      animatePointerTransform([
        { transform: cardElRef.current.style.transform },
        { transform: "translate3d(0px, 0px, 0px) rotate(0deg)" },
      ], { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      return;
    }

    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && !hasDragged.current && onImageClick) {
      cardElRef.current.style.transform = "";
      onImageClick(photo);
      return;
    }

    if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(gesture.velocityX) > 450) {
      const isLike = dx > 0 || gesture.velocityX > 0;
      const direction = isLike ? 1 : -1;
      const rotation = Math.max(-22, Math.min(22, dx / 14));
      animatePointerTransform([
        { transform: cardElRef.current.style.transform, opacity: 1 },
        { transform: `translate3d(${direction * 900}px, ${dy - 40}px, 0) rotate(${direction * 22}deg)`, opacity: 0 },
      ], { duration: 220, easing: "ease-out" }, () => onSwipe(photo.id, isLike));
      return;
    }

    animatePointerTransform([
      { transform: cardElRef.current.style.transform },
      { transform: "translate3d(0px, 0px, 0px) rotate(0deg)" },
    ], { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  };

  const handlePointerCancel = () => {
    if (!pointerDown.current) return;
    pointerDown.current = null;
    const currentTransform = cardElRef.current?.style.transform
      || "translate3d(0px, 0px, 0px) rotate(0deg)";
    animatePointerTransform([
      { transform: currentTransform },
      { transform: "translate3d(0px, 0px, 0px) rotate(0deg)" },
    ], { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
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
    <div
      className="absolute inset-0 no-select touch-manipulation"
      ref={cardElRef}
      style={{
        zIndex: 20 - stackIndex,
        pointerEvents: isTop ? "auto" : "none",
        cursor: isTop ? "grab" : "default",
        touchAction: "pan-y",
        transform: "translate3d(0px, 0px, 0px) rotate(0deg)",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
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
            <ImageBroken size={34} />
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
              loading={stackIndex <= 1 ? "eager" : "lazy"}
              decoding="async"
              fetchpriority={isTop ? "high" : (stackIndex <= 1 ? "auto" : "low")}
              style={{
                transform: `translate3d(${pinchTransformRef.current.x}px, ${pinchTransformRef.current.y}px, 0) scale(${pinchTransformRef.current.scale})`,
                transformOrigin: "center center",
                transition: "none",
                willChange: pinchActive ? "transform" : "auto",
              }}
            />
          </div>
        )}

      </div>
    </div>
  );
});

export default memo(SwipeCard);

// ─── Action buttons — equal size, site font ────────────────────────────────────
export const SwipeButtons = memo(function SwipeButtons({ onLike, onDislike, disabled }) {
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
        <HeartBreak size={28} className="text-gray-500 dark:text-gray-300" />
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
        <Heart size={28} className="text-white" />
      </motion.button>

    </div>
  );
});
