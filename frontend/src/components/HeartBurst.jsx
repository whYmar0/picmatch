/**
 * HeartBurst.jsx — living floating heart (per animation-refinement-attempt-2.md)
 *
 * A large flat SVG heart with a bright rotating gradient that floats on an
 * organic, seamless infinite trajectory:
 *   - vertical drift is dominant, horizontal is subtle (≈9% of width)
 *   - subtle scale "breathing" + gentle rotation (≤ ±4°) + faint squash/stretch
 *   - the gradient smoothly rotates (gradientTransform) instead of snapping colors
 *   - every looped parameter starts and ends at the same value → zero visible jumps
 *   - supports prefers-reduced-motion (static heart, no infinite loops)
 *
 * All motion is driven through useMotionValue + animate() (per spec §14), so
 * parent re-renders never restart or freeze the animations (motion values are
 * stable references). Only transform / opacity / gradientTransform animate —
 * GPU-friendly, no layout thrash, no per-frame React state.
 *
 * Props:
 *   x, y         — bottom-center anchor of the heart in parent container coords
 *   size         — heart size in CSS px (default 64); amplitudes scale with it
 *   onComplete   — called once when the animation finishes (for cleanup)
 */
import { useCallback, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from "framer-motion";

const DEFAULT_SIZE = 64;
const LIFETIME = 4.6; // total seconds: appear → hold → fade

// Symmetrical heart: rounded upper lobes, bottom tapers into a defined point.
const HEART_PATH =
  "M50 88 C 28 72, 6 54, 6 34 C 6 20, 16 10, 30 10 " +
  "C 38 10, 47 15, 50 24 C 53 15, 62 10, 70 10 " +
  "C 84 10, 94 20, 94 34 C 94 54, 72 72, 50 88 Z";

export default function HeartBurst({ x, y, size = DEFAULT_SIZE, onComplete }) {
  const completedRef = useRef(false);
  // null on first render → treat as "no preference"; only `true` disables the
  // infinite movement (lifecycle appear/fade still runs so the heart cleans up).
  const reduceMotion = useReducedMotion() === true;
  // Unique gradient ids so multiple hearts on screen never collide
  const gradientId = useRef(`hb-${Math.random().toString(36).slice(2, 8)}`).current;

  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  }, [onComplete]);

  // Amplitudes are relative to the heart size so the trajectory stays
  // proportional on any viewport (spec §16).
  const ampX = size * 0.09; // ≈5–15% of width
  const ampY = size * 0.2;  // ≈15–30% of height

  // ── Motion values (stable refs — immune to parent re-renders) ──────────────
  const lifeOpacity = useMotionValue(0); // appear → hold → fade
  const lifeY = useMotionValue(10);      // appear: settle up
  const lifeScale = useMotionValue(0.9); // appear: grow to normal
  const floatX = useMotionValue(0);
  const floatY = useMotionValue(0);
  const rotate = useMotionValue(0);
  const breath = useMotionValue(0.96);
  const squashX = useMotionValue(1);
  const squashY = useMotionValue(1);
  const gradAngle = useMotionValue(-15);

  // Gradient rotation string for the SVG attribute.
  const gradientTransform = useTransform(gradAngle, (a) => `rotate(${a.toFixed(2)} 0.5 0.5)`);
  // Breathing scale × subtle squash/stretch, folded into one transform.
  const scaleX = useTransform([breath, squashX], ([b, s]) => b * s);
  const scaleY = useTransform([breath, squashY], ([b, s]) => b * s);

  // ── Lifecycle: gradual appearance → long stable float → soft fade-out ──────
  useEffect(() => {
    const controls = [
      animate(lifeOpacity, [0, 1, 1, 0], {
        duration: LIFETIME,
        times: [0, 0.14, 0.86, 1],
        ease: "easeInOut",
        onComplete: handleComplete,
      }),
      // Settle into place slightly after the opacity ramps up (spec §10)
      animate(lifeY, [10, 0], { duration: 1.1, ease: "easeOut" }),
      animate(lifeScale, [0.9, 1], { duration: 1.1, ease: "easeOut" }),
    ];
    // Safety net in case onComplete is not delivered; guard dedupes.
    const safety = setTimeout(handleComplete, LIFETIME * 1000 + 600);
    return () => {
      controls.forEach((c) => c.stop());
      clearTimeout(safety);
    };
  }, [handleComplete]);

  // ── Infinite seamless float loops (skipped under reduced motion) ───────────
  // Each parameter has its own duration/times/phase (spec §12–13) and every
  // keyframe array ends where it starts → no visible jump at the loop restart.
  useEffect(() => {
    if (reduceMotion) return undefined;
    const controls = [
      animate(floatY, [0, -ampY, -ampY * 0.3, ampY * 0.4, 0], {
        duration: 6.2, times: [0, 0.25, 0.55, 0.8, 1], ease: "easeInOut", repeat: Infinity,
      }),
      animate(floatX, [0, ampX, -ampX * 0.8, ampX * 0.5, 0], {
        duration: 5.6, times: [0, 0.3, 0.55, 0.8, 1], ease: "easeInOut", repeat: Infinity,
      }),
      animate(rotate, [0, -4, 3, -2, 0], {
        duration: 4.4, times: [0, 0.3, 0.55, 0.8, 1], ease: "easeInOut", repeat: Infinity,
      }),
      animate(breath, [0.96, 1.03, 0.98, 1.02, 0.96], {
        duration: 3.6, times: [0, 0.25, 0.5, 0.75, 1], ease: "easeInOut", repeat: Infinity,
      }),
      animate(squashX, [1, 0.985, 1.015, 1], {
        duration: 6.2, times: [0, 0.3, 0.7, 1], ease: "easeInOut", repeat: Infinity,
      }),
      animate(squashY, [1, 1.015, 0.985, 1], {
        duration: 6.2, times: [0, 0.3, 0.7, 1], ease: "easeInOut", repeat: Infinity,
      }),
      animate(gradAngle, [-15, 25, -15], {
        duration: 6.8, times: [0, 0.5, 1], ease: "easeInOut", repeat: Infinity,
      }),
    ];
    return () => controls.forEach((c) => c.stop());
  }, [reduceMotion, ampX, ampY, floatX, floatY, rotate, breath, squashX, squashY, gradAngle]);

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{ left: x, top: y, transform: "translate(-50%, -100%)" }}
    >
      {/* Lifecycle: appearance + fade, anchored above the finger */}
      <motion.div
        style={{
          opacity: lifeOpacity,
          y: lifeY,
          scale: lifeScale,
          willChange: "opacity, transform",
        }}
      >
        {/* Organic float: position, tilt, breathing + squash */}
        <motion.div
          style={{
            x: floatX,
            y: floatY,
            rotate,
            scaleX,
            scaleY,
            willChange: "transform",
          }}
        >
          <svg
            viewBox="0 0 100 100"
            className="block"
            style={{
              width: size,
              height: size,
              transformBox: "fill-box",
              transformOrigin: "50% 50%",
              filter: "drop-shadow(0 6px 16px rgba(255, 60, 120, 0.35))",
            }}
            aria-hidden="true"
          >
            <defs>
              {/* Bright orange → hot pink → purple; rotates smoothly instead of
                  snapping colors. Rotate around the gradient center (0.5 0.5). */}
              <motion.linearGradient
                id={`${gradientId}-main`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
                gradientTransform={gradientTransform}
              >
                <stop offset="0%" stopColor="#FF7A00" />
                <stop offset="55%" stopColor="#FF1493" />
                <stop offset="100%" stopColor="#B000FF" />
              </motion.linearGradient>
            </defs>

            <path d={HEART_PATH} fill={`url(#${gradientId}-main)`} />
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}
