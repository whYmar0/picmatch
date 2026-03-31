/**
 * components/SwipeCard.jsx — Tinder-style swipe card
 *
 * BUGFIX: Component now uses forwardRef + useImperativeHandle to correctly
 * expose swipeTo() to the parent. Previously the ref was never forwarded,
 * so topCardRef.current._swipeTo was always undefined and button presses
 * triggered handleSwipe() directly with no animation.
 */

import { useRef, useState, forwardRef, useImperativeHandle } from "react";
import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";

const SWIPE_THRESHOLD = 80; // px — lowered slightly for better mobile feel

const SwipeCard = forwardRef(function SwipeCard(
  { photo, isTop, stackIndex, onSwipe },
  ref          // ← forwarded ref from VotePage
) {
  const controls = useAnimation();
  const x        = useMotionValue(0);
  const y        = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  const rotate       = useTransform(x, [-300, 0, 300], [-22, 0, 22]);
  const likeOpacity  = useTransform(x, [15, 80],  [0, 1]);
  const nopeOpacity  = useTransform(x, [-80, -15], [1, 0]);

  const stackScale   = 1 - stackIndex * 0.04;
  const stackY       = stackIndex * 14;
  const stackOpacity = Math.max(0, 1 - stackIndex * 0.18);

  // ── Programmatic swipe — exposed via ref ────────────────────────────────
  useImperativeHandle(ref, () => ({
    swipeTo: async (isLike) => {
      const dir = isLike ? 700 : -700;
      await controls.start({
        x:        dir,
        rotate:   isLike ? 22 : -22,
        opacity:  0,
        transition: { duration: 0.38, ease: [0.32, 0, 0.67, 0] },
      });
      onSwipe(photo.id, isLike);
    },
  }));

  // ── Drag end — natural swipe gesture ────────────────────────────────────
  const handleDragEnd = async (_, info) => {
    setIsDragging(false);
    const absX = Math.abs(info.offset.x);
    const absV = Math.abs(info.velocity.x);

    if (absX > SWIPE_THRESHOLD || absV > 450) {
      const isLike = info.offset.x > 0 || info.velocity.x > 0;
      await controls.start({
        x:        isLike ? 700 : -700,
        y:        y.get() - 40,
        opacity:  0,
        transition: { duration: 0.32, ease: "easeOut" },
      });
      onSwipe(photo.id, isLike);
    } else {
      // Snap back to center with spring
      controls.start({
        x: 0, y: 0, rotate: 0,
        transition: { type: "spring", stiffness: 450, damping: 32 },
      });
    }
  };

  return (
    <motion.div
      className="swipe-card no-select touch-manipulation"
      style={{
        x:           isTop ? x    : 0,
        y:           isTop ? y    : stackY,
        rotate:      isTop ? rotate : 0,
        scale:       stackScale,
        opacity:     stackOpacity,
        zIndex:      10 - stackIndex,
        pointerEvents: isTop ? "auto" : "none",
      }}
      animate={isTop ? controls : {
        y: stackY, scale: stackScale, opacity: stackOpacity,
        transition: { type: "spring", stiffness: 280, damping: 28 },
      }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
    >
      {/* ── Card shell ── */}
      <div className="relative w-full h-full rounded-4xl overflow-hidden shadow-swipe bg-card-light dark:bg-card-dark">

        {/* Photo — fixed aspect ratio prevents layout jump on load */}
        <img
          src={photo.url}
          alt={photo.filename}
          className="w-full h-full object-cover pointer-events-none select-none"
          draggable={false}
          loading="eager"
        />

        {/* Bottom gradient + label */}
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/65 to-transparent" />
        <p className="absolute bottom-4 left-4 right-12 text-white/80 text-sm truncate">
          {photo.filename}
        </p>

        {/* LIKE stamp */}
        {isTop && (
          <motion.div
            style={{ opacity: likeOpacity }}
            className="absolute top-7 left-5 border-[3px] border-green-400 text-green-400
                       font-display font-bold text-2xl tracking-widest rounded-xl
                       px-3 py-0.5 rotate-[-20deg] select-none"
          >
            LIKE
          </motion.div>
        )}

        {/* NOPE stamp */}
        {isTop && (
          <motion.div
            style={{ opacity: nopeOpacity }}
            className="absolute top-7 right-5 border-[3px] border-red-400 text-red-400
                       font-display font-bold text-2xl tracking-widest rounded-xl
                       px-3 py-0.5 rotate-[20deg] select-none"
          >
            NOPE
          </motion.div>
        )}
      </div>
    </motion.div>
  );
});

export default SwipeCard;

// ─── Action Buttons ────────────────────────────────────────────────────────────

export function SwipeButtons({ onLike, onDislike, disabled }) {
  return (
    <div className="flex items-center justify-center gap-8">
      {/* Dislike */}
      <motion.button
        onClick={onDislike}
        disabled={disabled}
        whileHover={{ scale: disabled ? 1 : 1.12 }}
        whileTap={{ scale: 0.88 }}
        className="w-16 h-16 rounded-full bg-card-light dark:bg-card-dark
                   border-2 border-red-200 dark:border-red-800 text-red-400
                   flex items-center justify-center shadow-card
                   disabled:opacity-40 disabled:cursor-not-allowed
                   hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950/20
                   transition-colors duration-150 touch-manipulation"
        aria-label="Dislike"
      >
        <span className="text-xl leading-none">✕</span>
      </motion.button>

      {/* Like */}
      <motion.button
        onClick={onLike}
        disabled={disabled}
        whileHover={{ scale: disabled ? 1 : 1.12 }}
        whileTap={{ scale: 0.88 }}
        className="w-20 h-20 rounded-full bg-primary-400 hover:bg-primary-500
                   text-white flex items-center justify-center shadow-orange
                   disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors duration-150 touch-manipulation"
        aria-label="Like"
      >
        <span className="text-3xl leading-none">♥</span>
      </motion.button>

      {/* Spacer for visual symmetry */}
      <div className="w-16 h-16" aria-hidden />
    </div>
  );
}
