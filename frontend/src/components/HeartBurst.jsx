/**
 * HeartBurst.jsx — Instagram-style heart burst animation
 *
 * The heart erupts from the finger in one overlapping 1.5s sequence:
 * vertical bubble inflate, aggressive spring wobble, then settle and fade.
 */
import { useCallback, useRef } from "react";
import { motion } from "framer-motion";
import heartBurstPng from "../assets/heart-burst.png";

const HEART_SIZE = 64;
const ANIMATION_DURATION = 1.5;

const burstLines = Array.from({ length: 10 }, (_, index) => ({
  angle: index * 36,
  length: 18 + (index % 3) * 5,
}));

export default function HeartBurst({ x, y, onComplete }) {
  const completedRef = useRef(false);

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
      {/* Radial burst starts beneath the heart and expands outward. */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {burstLines.map(({ angle, length }, index) => (
          <motion.div
            key={angle}
            className="absolute left-1/2 top-1/2 h-[2px] rounded-full bg-white"
            style={{
              width: length,
              transformOrigin: "0 50%",
              rotate: angle,
              x: 0,
              y: "-50%",
              willChange: "transform, opacity",
            }}
            initial={{ x: 0, scaleX: 0, opacity: 1 }}
            animate={{ x: 24 + (index % 3) * 7, scaleX: 1, opacity: 0 }}
            transition={{
              duration: 0.42,
              delay: 0.1 + index * 0.015,
              ease: "easeOut",
            }}
          />
        ))}
      </div>

      {/* Lifecycle movement: opacity and upward eruption. */}
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
        {/* Bubble stretch and spring wobble overlap from the first 100ms. */}
        <motion.img
          src={heartBurstPng}
          alt=""
          draggable={false}
          className="block w-16 h-16 select-none pointer-events-none"
          initial={{ scaleX: 0, scaleY: 0, rotate: 0 }}
          animate={{
            scaleX: [0, 0.85, 1, 0.8],
            scaleY: [0, 1.4, 1, 0.8],
            rotate: [0, -18, 14, -8, 4, 0],
          }}
          transition={{
            scaleX: {
              type: "spring",
              stiffness: 500,
              damping: 12,
              mass: 0.7,
              duration: 1.5,
            },
            scaleY: {
              type: "spring",
              stiffness: 500,
              damping: 12,
              mass: 0.7,
              duration: 1.5,
            },
            rotate: {
              delay: 0.1,
              duration: 1,
              ease: [0.25, 0.1, 0.25, 1],
            },
          }}
          style={{
            transformOrigin: "50% 100%",
            willChange: "transform",
          }}
        />
      </motion.div>
    </div>
  );
}
