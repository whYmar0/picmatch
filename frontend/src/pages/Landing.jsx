/**
 * Landing.jsx — v5.3
 *
 * FIX: Cards were being clipped/cropped at the bottom.
 *
 * Root cause: `contain: layout` forces the browser to create a new layout
 * containment context and clips any content (including CSS-transformed children)
 * that overflows. Combined with `overflow: clip`, rotated cards that extended
 * beyond the container boundaries were hard-cut.
 *
 * Solution:
 *  1. Removed `contain: layout` and `overflow: clip` entirely.
 *  2. The outer section has `overflow-x-hidden` on the page root — that's enough
 *     to prevent horizontal scroll without clipping rotated cards vertically.
 *  3. Container height increased and uses enough padding so rotated corners
 *     don't reach the edge.
 *  4. MockCards use `position: absolute` centered via `left/top 50%` + translate
 *     so rotation happens around their true visual center, not a corner.
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, Share2, Trophy, ArrowRight } from "lucide-react";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";

/**
 * MockCard — centered via translate(-50%, -50%) so CSS rotate()
 * spins around the card's visual center, preventing corner clipping.
 */
function MockCard({ rotate = 0, zIndex = 1 }) {
  return (
    <div
      className="rounded-3xl shadow-swipe
                 bg-gradient-to-br from-primary-200 to-primary-400
                 flex items-center justify-center"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: "clamp(140px, 30vw, 200px)",
        height: "clamp(186px, 40vw, 266px)",
        transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
        zIndex,
      }}
    >
      <span style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>📸</span>
    </div>
  );
}

function Step({ icon: Icon, title, desc, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.36 }}
      className="bg-card-light dark:bg-card-dark rounded-3xl p-6 text-center shadow-card"
    >
      <div className="w-11 h-11 bg-primary-100 dark:bg-primary-900/30 rounded-2xl
                      flex items-center justify-center mx-auto mb-4">
        <Icon size={20} className="text-primary-500" />
      </div>
      <h3 className="font-semibold text-base mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
    </motion.div>
  );
}

export default function Landing() {
  const { t } = useLang();
  const { user } = useAuth();

  return (
    <div className="min-h-screen overflow-x-hidden">
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-20
                          grid lg:grid-cols-2 gap-10 items-center">

        {/* ── Text column ── */}
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42 }}
            className="font-display font-bold text-5xl lg:text-6xl leading-tight mb-5"
          >
            {t("heroTitle").split(" ").map((word, i) =>
              word.includes("best") || word.includes("лучшее")
                ? <span key={i} className="text-gradient">{word} </span>
                : <span key={i}>{word} </span>
            )}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.42 }}
            className="text-base text-gray-500 dark:text-gray-400 mb-8 max-w-md leading-relaxed"
          >
            {t("heroSubtitle")}
          </motion.p>

          {/* Single CTA — second button removed */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.42 }}
          >
            <Link
              to={user ? "/dashboard" : "/register"}
              className="btn-primary text-base px-8 py-3.5 inline-flex"
            >
              {t("getStarted")} <ArrowRight size={17} />
            </Link>
          </motion.div>
        </div>

        {/* ── Card stack column ──
            KEY CHANGES vs v5.2:
            - No `overflow: clip` — was cutting the bottom/sides of rotated cards
            - No `contain: layout` — was clipping transformed children
            - No `isolation: isolate` — not needed
            - Height increased to give rotated corners room to breathe
            - Cards centered via left/top 50% + translate so rotation
              is always around the card center, not a corner
        */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="relative flex items-center justify-center"
          style={{
            /* Extra height = card height + max rotation overhang (~30px each side) */
            height: "clamp(260px, 55vw, 360px)",
            /* No overflow clipping here — page root handles horizontal scroll */
          }}
        >
          {/* Back card */}
          <MockCard rotate={-12} zIndex={1} />

          {/* Middle card */}
          <MockCard rotate={-3} zIndex={2} />

          {/* Front card — floats up and down */}
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 3,
            }}
          >
            {/* Inline div so the float animation doesn't fight with the centering */}
            <div
              className="rounded-3xl shadow-swipe
                         bg-gradient-to-br from-primary-200 to-primary-400
                         flex items-center justify-center"
              style={{
                width: "clamp(140px, 30vw, 200px)",
                height: "clamp(186px, 40vw, 266px)",
                transform: "rotate(2deg)",
              }}
            >
              <span style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>📸</span>
            </div>
          </motion.div>

          {/* Floating LIKE chip */}
          <motion.div
            animate={{ x: [0, 5, 0], y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }}
            className="absolute top-4 right-4 z-20
                       bg-card-light dark:bg-card-dark
                       rounded-2xl px-3 py-1.5 shadow-card"
          >
            <span className="text-sm font-semibold text-green-500">👍 LIKE</span>
          </motion.div>

          {/* Floating NOPE chip */}
          <motion.div
            animate={{ x: [0, -5, 0], y: [0, 4, 0] }}
            transition={{ repeat: Infinity, duration: 2.1, ease: "easeInOut" }}
            className="absolute bottom-4 left-4 z-20
                       bg-card-light dark:bg-card-dark
                       rounded-2xl px-3 py-1.5 shadow-card"
          >
            <span className="text-sm font-semibold text-red-400">✕ NOPE</span>
          </motion.div>
        </motion.div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="max-w-5xl mx-auto px-4 pb-24">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="font-display font-bold text-3xl text-center mb-10"
        >
          {t("howItWorks")}
        </motion.h2>
        <div className="grid sm:grid-cols-3 gap-5">
          <Step icon={Upload} title={t("step1Title")} desc={t("step1Desc")} index={0} />
          <Step icon={Share2} title={t("step2Title")} desc={t("step2Desc")} index={1} />
          <Step icon={Trophy} title={t("step3Title")} desc={t("step3Desc")} index={2} />
        </div>
      </section>
    </div>
  );
}