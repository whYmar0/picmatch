/**
 * HeartBurst.jsx — Instagram-style heart burst animation
 *
 * Three phases (total ~1.5s):
 *   1. Inflate: heart scales 0 → 1.35 → 1 with an underdamped feel
 *   2. Radial line burst: 10 thin white lines shoot outward from the heart edge
 *   3. Spring wobble + gentle scale pulse, then fade out
 *
 * Props:
 *   x: number       — CSS left position (px, relative to parent)
 *   y: number       — CSS top position (px, relative to parent)
 *   onComplete: ()  — called when the animation finishes (for cleanup)
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import heartBurstPng from "../assets/heart-burst.png";

const BURST_LINES = 10;
const INNER_RADIUS = 32;      // heart edge (64×64 heart → radius 32)
const OUTER_RADIUS_MIN = 55;
const OUTER_RADIUS_MAX = 70;
const LINE_MIN_LENGTH = 18;
const LINE_MAX_LENGTH = 28;

export default function HeartBurst({ x, y, onComplete }) {
  // Lines are generated once per mount (per heart) and don't need to re-randomize.
  const lines = useMemo(
    () =>
      Array.from({ length: BURST_LINES }, (_, i) => ({
        angle: (360 / BURST_LINES) * i,
        length: LINE_MIN_LENGTH + Math.random() * (LINE_MAX_LENGTH - LINE_MIN_LENGTH),
        travel: OUTER_RADIUS_MIN + Math.random() * (OUTER_RADIUS_MAX - OUTER_RADIUS_MIN),
        delay: 0.2 + i * 0.015, // ~15ms stagger for a natural radial feel
      })),
    []
  );

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
    >
      {/* Radial line burst — static rotation wrapper + outward translation */}
      <div className="absolute left-1/2 top-1/2 w-0 h-0">
        {lines.map((line, i) => (
          <div key={i} className="absolute" style={{ transform: `rotate(${line.angle}deg)` }}>
            <motion.div
              className="absolute w-[2px] rounded-full bg-white"
              style={{
                height: line.length,
                marginLeft: -1,
                marginTop: -line.length / 2,
                boxShadow: "0 0 3px rgba(0,0,0,0.35)",
                willChange: "transform, opacity",
              }}
              initial={{ opacity: 0, y: -INNER_RADIUS }}
              animate={{ opacity: [0, 1, 0], y: -line.travel }}
              transition={{ duration: 0.35, delay: line.delay, ease: "easeOut" }}
            />
          </div>
        ))}
      </div>

      {/* Heart image — inflate → wobble → fade */}
      <motion.img
        src={heartBurstPng}
        alt=""
        className="w-16 h-16 select-none pointer-events-none"
        draggable={false}
        initial={{ scale: 0, opacity: 0, rotate: 0 }}
        animate={{
          scale: [0, 1.35, 1, 1.05, 0.97, 1.02, 1, 1, 0.85],
          opacity: [0, 1, 1, 1, 1, 1, 1, 1, 0],
          rotate: [0, 0, 0, -12, 10, -6, 3, 0, 0],
        }}
        transition={{
          duration: 1.5,
          times: [0, 0.12, 0.2, 0.27, 0.41, 0.56, 0.71, 0.8, 1],
          ease: [
            "easeOut",
            "easeOut",
            "easeInOut",
            "easeInOut",
            "easeInOut",
            "easeInOut",
            "easeInOut",
            "easeIn",
          ],
        }}
        onAnimationComplete={onComplete}
        style={{ willChange: "transform, opacity" }}
      />
    </div>
  );
}
