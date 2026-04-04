/**
 * SwipeCard.jsx — v5.1
 *
 * CHANGES:
 *  - resetPosition() exposed via useImperativeHandle (used by VotePage jump fix)
 *  - Card bg: bg-gray-950 (vs bg-black) — intentional dark but not "broken" looking
 *  - Reliable tap: pointerDown/Up delta tracking, fires onImageClick on true tap
 *  - Removed "tap to view" chip
 *  - Back cards always opacity 1
 *  - zIndex: 20 - stackIndex (prevents overlap)
 *  - object-contain so ALL aspect ratios fit without cropping
 */
import { useRef, forwardRef, useImperativeHandle } from "react";
import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { ThumbsUp, ThumbsDown } from "lucide-react";

const SWIPE_THRESHOLD = 80;

const SwipeCard = forwardRef(function SwipeCard(
  { photo, isTop, stackIndex, onSwipe, onImageClick },
  ref
) {
  const controls       = useAnimation();
  const x              = useMotionValue(0);
  const y              = useMotionValue(0);
  const pointerDown    = useRef(null);
  const hasDragged     = useRef(false);

  const rotate      = useTransform(x, [-300, 0, 300], [-22, 0, 22]);
  const likeOpacity = useTransform(x, [15, 80],  [0, 1]);
  const nopeOpacity = useTransform(x, [-80, -15], [1, 0]);

  const stackScale = 1 - stackIndex * 0.04;
  const stackY     = stackIndex * 14;

  useImperativeHandle(ref, () => ({
    swipeTo: async (isLike) => {
      const dir = isLike ? 700 : -700;
      await controls.start({
        x: dir, rotate: isLike ? 22 : -22, opacity: 0,
        transition: { duration: 0.38, ease: [0.32, 0, 0.67, 0] },
      });
      onSwipe(photo.id, isLike);
    },
    // Called by VotePage when user jumps via thumbnail — resets without remount
    resetPosition: () => {
      x.set(0);
      y.set(0);
      controls.set({ x: 0, y: 0, rotate: 0, opacity: 1 });
    },
  }));

  const handlePointerDown = (e) => {
    if (!isTop) return;
    pointerDown.current = { x: e.clientX, y: e.clientY };
    hasDragged.current  = false;
  };

  const handlePointerUp = (e) => {
    if (!isTop || !pointerDown.current) return;
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

  return (
    <motion.div
      className="absolute inset-0 no-select touch-manipulation"
      style={{
        x:      isTop ? x : 0,
        y:      isTop ? y : stackY,
        rotate: isTop ? rotate : 0,
        scale:  stackScale,
        opacity: 1,               // always full opacity
        zIndex:  20 - stackIndex, // wide range prevents overlap
        pointerEvents: isTop ? "auto" : "none",
        cursor: isTop ? "grab" : "default",
      }}
      animate={isTop ? controls : {
        y: stackY, scale: stackScale,
        transition: { type: "spring", stiffness: 280, damping: 28 },
      }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/*
        bg-gray-950: dark but visibly different from page background,
        so it's clear object-contain is intentional, not a broken state.
        Black background ONLY inside this card container.
      */}
      <div className="relative w-full h-full rounded-4xl overflow-hidden shadow-swipe
                      bg-gray-950">
        <img
          src={photo.url}
          alt={photo.filename}
          className="w-full h-full object-contain select-none pointer-events-none"
          draggable={false}
          loading="eager"
        />

        {/* Bottom gradient + filename */}
        <div className="absolute inset-x-0 bottom-0 h-20
                        bg-gradient-to-t from-black/60 to-transparent rounded-b-4xl" />
        <p className="absolute bottom-3 left-4 right-4 text-white/70 text-xs truncate">
          {photo.filename}
        </p>

        {/* LIKE / NOPE stamps — top card only */}
        {isTop && (
          <>
            <motion.div style={{ opacity: likeOpacity }}
              className="absolute top-7 left-5 border-[3px] border-green-400 text-green-400
                         font-display font-bold text-2xl tracking-widest rounded-xl
                         px-3 py-0.5 -rotate-[20deg] select-none bg-black/20">
              LIKE
            </motion.div>
            <motion.div style={{ opacity: nopeOpacity }}
              className="absolute top-7 right-5 border-[3px] border-red-400 text-red-400
                         font-display font-bold text-2xl tracking-widest rounded-xl
                         px-3 py-0.5 rotate-[20deg] select-none bg-black/20">
              NOPE
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  );
});

export default SwipeCard;

// ─── Equal-size buttons ────────────────────────────────────────────────────────
export function SwipeButtons({ onLike, onDislike, disabled }) {
  return (
    <div className="flex items-center justify-center gap-12">
      <motion.button
        onClick={onDislike} disabled={disabled}
        whileHover={{ scale: disabled ? 1 : 1.1 }}
        whileTap={{ scale: 0.88 }}
        className="w-16 h-16 rounded-full flex items-center justify-center
                   bg-white dark:bg-card-dark shadow-card
                   border-2 border-red-200 dark:border-red-800 text-red-400
                   hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950/20
                   disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors duration-150 touch-manipulation"
        aria-label="Dislike"
      >
        <ThumbsDown size={22} />
      </motion.button>

      <motion.button
        onClick={onLike} disabled={disabled}
        whileHover={{ scale: disabled ? 1 : 1.1 }}
        whileTap={{ scale: 0.88 }}
        className="w-16 h-16 rounded-full flex items-center justify-center
                   bg-primary-400 hover:bg-primary-500 text-white shadow-orange
                   disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors duration-150 touch-manipulation"
        aria-label="Like"
      >
        <ThumbsUp size={22} />
      </motion.button>
    </div>
  );
}
