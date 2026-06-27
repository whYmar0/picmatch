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
import { useRef, forwardRef, useImperativeHandle, useState } from "react";
import { motion, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { Heart, ImageOff } from "lucide-react";
import BrokenHeart from "./BrokenHeart";

const SWIPE_THRESHOLD = 64;

const SwipeCard = forwardRef(function SwipeCard(
  { photo, isTop, stackIndex, onSwipe, onImageClick },
  ref
) {
  const controls = useAnimation();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const pointerDown = useRef(null);
  const hasDragged = useRef(false);
  const [aspectRatio, setAspectRatio] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);

  const rotate = useTransform(x, [-300, 0, 300], [-22, 0, 22]);
  const likeOpacity = useTransform(x, [15, 80], [0, 1]);
  const nopeOpacity = useTransform(x, [-80, -15], [1, 0]);

  // All cards aligned perfectly (no scale difference)
  const stackScale = 1;

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
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/*
        Dark background so object-contain images look intentional.
        Only this card container is dark — page background stays themed.
        rounded-3xl for a refined card feel.
      */}
      <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-swipe bg-gray-950">

        {imageFailed ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-400">
            <ImageOff size={34} />
            <span className="text-sm">Изображение недоступно</span>
          </div>
        ) : (
          <img
            src={photo.url}
            alt="Фото альбома"
            onLoad={onImageLoad}
            onError={() => setImageFailed(true)}
            className={`w-full h-full ${objectFit} select-none pointer-events-none`}
            draggable={false}
            loading={isTop ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={isTop ? "high" : "low"}
          />
        )}

        {/* LIKE / NOPE stamps — top card only */}
        {isTop && (
          <>
            <motion.div
              style={{ opacity: likeOpacity }}
              className="absolute top-6 left-5 border-[3px] border-green-400 text-green-400
                         font-sans font-bold text-xl tracking-widest rounded-xl
                         px-3 py-1 -rotate-[20deg] select-none bg-black/20"
            >
              НРАВИТСЯ
            </motion.div>
            <motion.div
              style={{ opacity: nopeOpacity }}
              className="absolute top-6 right-5 border-[3px] border-red-400 text-red-400
                         font-sans font-bold text-xl tracking-widest rounded-xl
                         px-3 py-1 rotate-[20deg] select-none bg-black/20"
            >
              ПРОПУСТИТЬ
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
                   transition-colors duration-150 touch-manipulation"
        aria-label="Like"
      >
        <Heart size={21} className="text-white" />
      </motion.button>

    </div>
  );
}
