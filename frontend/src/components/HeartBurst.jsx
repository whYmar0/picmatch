/**
 * HeartBurst.jsx - compact SVG heart burst animation.
 *
 * The heart appears above the finger, pops into place, swings around its
 * center, and deflates back in one overlapping sequence.
 */
import { memo, useCallback, useRef } from "react";
import { motion } from "framer-motion";

const HEART_SIZE = 100;
const ANIMATION_DURATION = 1.5;

const HEART_PATH =
  "M50 88 C28 72 6 54 6 34 C6 20 16 10 30 10 " +
  "C38 10 47 15 50 24 C53 15 62 10 70 10 " +
  "C84 10 94 20 94 34 C94 54 72 72 50 88 Z";

const GRADIENTS = [
  {
    stops: ["#FF7A00", "#FF1493", "#B000FF"],
    glow: "rgba(255, 55, 145, 0.32)",
  },
  {
    stops: ["#7C3AED", "#EC4899"],
    glow: "rgba(190, 76, 220, 0.32)",
  },
  {
    stops: ["#22C55E", "#FDE047"],
    glow: "rgba(111, 220, 67, 0.3)",
  },
];

function HeartBurst({ x, y, onComplete }) {
  const completedRef = useRef(false);
  const gradientId = useRef(`heart-gradient-${Math.random().toString(36).slice(2, 8)}`).current;
  const gradient = useRef(GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)]).current;

  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  }, [onComplete]);

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left: x,
        top: y,
        width: HEART_SIZE,
        height: HEART_SIZE,
        transform: "translate(-50%, -50%)",
      }}
    >
      <motion.div
        className="relative w-[100px] h-[100px]"
        initial={{ opacity: 0, y: 0, scale: 1 }}
        animate={{
          opacity: [0, 1, 1, 1],
          y: [0, -60, -60, -60],
          // The outer scale is the final uniform deflate, not a fade.
          scale: [1, 1, 1, 0],
        }}
        transition={{
          opacity: {
            duration: ANIMATION_DURATION,
            times: [0, 0.033, 0.733, 1],
            ease: "linear",
          },
          y: {
            duration: ANIMATION_DURATION,
            times: [0, 0.233, 0.733, 1],
            ease: "easeOut",
          },
          scale: {
            duration: 0.4,
            delay: 1.1,
            ease: "easeIn",
          },
        }}
        onAnimationComplete={handleComplete}
        style={{
          // Deflate toward the bottom tip instead of shrinking toward center.
          transformOrigin: "50% 100%",
          willChange: "transform, opacity",
        }}
      >
        <motion.svg
          viewBox="0 0 100 100"
          width={HEART_SIZE}
          height={HEART_SIZE}
          className="block select-none"
          aria-hidden="true"
          initial={{ scale: 0, rotate: 0 }}
          animate={{
            // Uniform scale keeps the SVG proportions intact during the pop.
            scale: [0, 1.15, 0.95, 1],
            // The swing pivots around the heart's center, not its bottom tip.
            rotate: [0, -18, 14, -8, 4, 0],
          }}
          transition={{
            scale: {
              type: "spring",
              stiffness: 500,
              damping: 12,
              mass: 0.7,
              duration: ANIMATION_DURATION,
            },
            rotate: {
              delay: 0,
              duration: 0.75,
              ease: [0.25, 0.1, 0.25, 1],
            },
          }}
          style={{
            transformOrigin: "50% 50%",
            // Static, low-cost glow; the filter itself is never animated.
            filter: `drop-shadow(0 4px 10px ${gradient.glow})`,
            willChange: "transform",
          }}
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor={gradient.stops[0]} />
              {gradient.stops.length === 3 && (
                <stop offset="55%" stopColor={gradient.stops[1]} />
              )}
              <stop
                offset="100%"
                stopColor={gradient.stops[gradient.stops.length - 1]}
              />
            </linearGradient>
          </defs>
          <path d={HEART_PATH} fill={`url(#${gradientId})`} />
        </motion.svg>
      </motion.div>
    </div>
  );
}

export default memo(HeartBurst, (previous, next) => (
  previous.x === next.x && previous.y === next.y
));
