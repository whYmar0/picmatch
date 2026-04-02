/**
 * components/SwipeCard.jsx
 *
 * CHANGES:
 *  - object-contain (fit) instead of object-cover — no cropping of any ratio
 *  - onImageClick prop: tap the image (not drag) opens full-screen lightbox
 *  - Distinguishes tap vs drag: only fires onClick if total drag < 8px
 *  - Pinch-to-zoom on the card itself (delegated to parent via onTouchStart/Move/End)
 */
import { useRef, useState, forwardRef, useImperativeHandle } from "react";
import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { ThumbsUp, ThumbsDown } from "lucide-react";

const SWIPE_THRESHOLD = 80;

const SwipeCard = forwardRef(function SwipeCard(
  { photo, isTop, stackIndex, onSwipe, onImageClick },
  ref
) {
  const controls   = useAnimation();
  const x          = useMotionValue(0);
  const y          = useMotionValue(0);
  const dragDeltaRef = useRef(0); // track total drag distance to distinguish tap

  const rotate      = useTransform(x, [-300, 0, 300], [-22, 0, 22]);
  const likeOpacity = useTransform(x, [15, 80],  [0, 1]);
  const nopeOpacity = useTransform(x, [-80, -15], [1, 0]);

  const stackScale   = 1 - stackIndex * 0.04;
  const stackY       = stackIndex * 14;
  const stackOpacity = Math.max(0, 1 - stackIndex * 0.18);

  useImperativeHandle(ref, () => ({
    swipeTo: async (isLike) => {
      const dir = isLike ? 700 : -700;
      await controls.start({
        x: dir, rotate: isLike ? 22 : -22, opacity: 0,
        transition: { duration: 0.38, ease: [0.32, 0, 0.67, 0] },
      });
      onSwipe(photo.id, isLike);
    },
  }));

  const handleDragStart = () => { dragDeltaRef.current = 0; };

  const handleDrag = (_, info) => {
    dragDeltaRef.current = Math.max(dragDeltaRef.current,
      Math.abs(info.offset.x) + Math.abs(info.offset.y));
  };

  const handleDragEnd = async (_, info) => {
    const absX = Math.abs(info.offset.x);
    const absV = Math.abs(info.velocity.x);
    if (absX > SWIPE_THRESHOLD || absV > 450) {
      const isLike = info.offset.x > 0 || info.velocity.x > 0;
      await controls.start({
        x: isLike ? 700 : -700, y: y.get() - 40, opacity: 0,
        transition: { duration: 0.32, ease: "easeOut" },
      });
      onSwipe(photo.id, isLike);
    } else {
      controls.start({
        x: 0, y: 0, rotate: 0,
        transition: { type: "spring", stiffness: 450, damping: 32 },
      });
    }
  };

  const handleTap = () => {
    // Only open lightbox if user barely moved (tap, not drag)
    if (dragDeltaRef.current < 8 && onImageClick) {
      onImageClick(photo);
    }
  };

  return (
    <motion.div
      className="swipe-card no-select touch-manipulation"
      style={{
        x: isTop ? x : 0, y: isTop ? y : stackY,
        rotate: isTop ? rotate : 0,
        scale: stackScale, opacity: stackOpacity,
        zIndex: 10 - stackIndex,
        pointerEvents: isTop ? "auto" : "none",
      }}
      animate={isTop ? controls : {
        y: stackY, scale: stackScale, opacity: stackOpacity,
        transition: { type: "spring", stiffness: 280, damping: 28 },
      }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onTap={isTop ? handleTap : undefined}
    >
      <div className="relative w-full h-full rounded-4xl overflow-hidden shadow-swipe
                      bg-gray-100 dark:bg-gray-900">

        {/* Image — object-contain so ALL aspect ratios fit without cropping */}
        <img
          src={photo.url}
          alt={photo.filename}
          className="w-full h-full object-contain select-none pointer-events-none"
          draggable={false}
          loading="eager"
        />

        {/* Subtle vignette at edges */}
        <div className="absolute inset-0 rounded-4xl"
             style={{ boxShadow: "inset 0 0 40px 0 rgba(0,0,0,0.18)" }} />

        {/* Bottom gradient + filename */}
        <div className="absolute inset-x-0 bottom-0 h-24
                        bg-gradient-to-t from-black/70 to-transparent rounded-b-4xl" />
        <p className="absolute bottom-4 left-4 right-4 text-white/80 text-xs truncate">
          {photo.filename}
        </p>

        {/* Tap-to-view hint on first card */}
        {isTop && (
          <div className="absolute top-3 right-3 bg-black/40 text-white/60
                          text-[10px] px-2 py-0.5 rounded-lg">
            tap to view
          </div>
        )}

        {/* LIKE stamp */}
        {isTop && (
          <motion.div style={{ opacity: likeOpacity }}
            className="absolute top-7 left-5 border-[3px] border-green-400 text-green-400
                       font-display font-bold text-2xl tracking-widest rounded-xl
                       px-3 py-0.5 -rotate-[20deg] select-none bg-black/10">
            LIKE
          </motion.div>
        )}

        {/* NOPE stamp */}
        {isTop && (
          <motion.div style={{ opacity: nopeOpacity }}
            className="absolute top-7 right-5 border-[3px] border-red-400 text-red-400
                       font-display font-bold text-2xl tracking-widest rounded-xl
                       px-3 py-0.5 rotate-[20deg] select-none bg-black/10">
            NOPE
          </motion.div>
        )}
      </div>
    </motion.div>
  );
});

export default SwipeCard;

// ─── Equal-size action buttons ────────────────────────────────────────────────
export function SwipeButtons({ onLike, onDislike, disabled }) {
  const btnBase = `
    w-16 h-16 rounded-full flex items-center justify-center
    disabled:opacity-40 disabled:cursor-not-allowed
    transition-colors duration-150 touch-manipulation
  `;
  return (
    <div className="flex items-center justify-center gap-10">
      {/* Dislike — same w/h as Like */}
      <motion.button
        onClick={onDislike} disabled={disabled}
        whileHover={{ scale: disabled ? 1 : 1.1 }}
        whileTap={{ scale: 0.88 }}
        className={`${btnBase} bg-white dark:bg-card-dark
                    border-2 border-red-200 dark:border-red-800 text-red-400
                    shadow-card hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950/20`}
        aria-label="Dislike"
      >
        <ThumbsDown size={22} />
      </motion.button>

      {/* Like — same w/h as Dislike */}
      <motion.button
        onClick={onLike} disabled={disabled}
        whileHover={{ scale: disabled ? 1 : 1.1 }}
        whileTap={{ scale: 0.88 }}
        className={`${btnBase} bg-primary-400 hover:bg-primary-500
                    text-white shadow-orange`}
        aria-label="Like"
      >
        <ThumbsUp size={22} />
      </motion.button>
    </div>
  );
}
