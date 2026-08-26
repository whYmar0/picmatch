/**
 * HeartBurst.jsx - compact SVG heart burst animation.
 *
 * The heart appears above the finger, pops into place, swings around its
 * center, and fades out in one overlapping sequence.
 */
import { useCallback, useRef } from "react";
import { motion } from "framer-motion";

const HEART_SIZE = 64;
const ANIMATION_DURATION = 1.5;

const HEART_PATH =
  "M50 88 C28 72 6 54 6 34 C6 20 16 10 30 10 " +
  "C38 10 47 15 50 24 C53 15 62 10 70 10 " +
  "C84 10 94 20 94 34 C94 54 72 72 50 88 Z";

export default function HeartBurst({ x, y, onComplete }) {
  const completedRef = useRef(false);
  const gradientId = useRef(`heart-gradient-${Math.random().toString(36).slice(2, 8)}`).current;

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
        className="relative w-16 h-16"
        initial={{ opacity: 0, y: 0 }}
        animate={{
          opacity: [0, 1, 1, 0],
          y: [0, -60, -60, -80],
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
        }}
        onAnimationComplete={handleComplete}
        style={{ willChange: "transform, opacity" }}
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
            scale: [0, 1.15, 0.95, 1, 0.8],
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
              delay: 0.1,
              duration: 1,
              ease: [0.25, 0.1, 0.25, 1],
            },
          }}
          style={{
            transformOrigin: "50% 50%",
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
              <stop offset="0%" stopColor="#FF7A00" />
              <stop offset="55%" stopColor="#FF1493" />
              <stop offset="100%" stopColor="#B000FF" />
            </linearGradient>
          </defs>
          <path d={HEART_PATH} fill={`url(#${gradientId})`} />
        </motion.svg>
      </motion.div>
    </div>
  );
}
