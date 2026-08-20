/**
 * HeartBurst.jsx — Instagram-style heart burst animation
 *
 * Single-element, transform-only animation (GPU-friendly, no layout thrash):
 *   1. Linear inflate anchored at the heart's BOTTOM edge (grows upward)
 *   2. Strong spring-like rocking wobble (rotate around the bottom anchor)
 *   3. Smooth deflate back to zero while fading out
 *
 * Props:
 *   x: number       — CSS left position (px) of the heart's bottom-center anchor
 *   y: number       — CSS top position (px) of the heart's bottom-center anchor
 *   onComplete: ()  — called once when the animation finishes (for cleanup)
 */
import { useCallback, useRef } from "react";
import { motion } from "framer-motion";
import heartBurstPng from "../assets/heart-burst.png";

export default function HeartBurst({ x, y, onComplete }) {
  const completedRef = useRef(false);

  // Framer-motion may fire onAnimationComplete once per animated value —
  // guard so cleanup (and any parent state) only runs a single time.
  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  }, [onComplete]);

  return (
    <motion.div
      className="absolute pointer-events-none z-50"
      style={{
        left: x,
        top: y,
        // Bottom-center of the heart sits exactly on (x, y)
        transform: "translate(-50%, -100%)",
      }}
    >
      <motion.img
        src={heartBurstPng}
        alt=""
        draggable={false}
        className="w-16 h-16 block select-none pointer-events-none"
        style={{
          transformOrigin: "50% 100%", // inflate/wobble/deflate around the bottom edge
          willChange: "transform, opacity",
        }}
        initial={{ scale: 0, opacity: 0, rotate: 0 }}
        animate={{
          // linear inflate → gentle spring pulse while rocking → deflate to zero
          scale: [0, 1, 1.05, 0.97, 1.02, 1, 0],
          opacity: [0, 1, 1, 1, 1, 1, 0],
          rotate: [0, 0, -24, 18, -12, 6, 0],
        }}
        transition={{
          duration: 1.5,
          times: [0, 0.17, 0.3, 0.47, 0.64, 0.81, 1],
          ease: ["linear", "easeInOut", "easeInOut", "easeInOut", "easeInOut", "easeIn"],
        }}
        onAnimationComplete={handleComplete}
      />
    </motion.div>
  );
}
