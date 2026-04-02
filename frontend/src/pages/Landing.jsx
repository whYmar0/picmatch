/**
 * pages/Landing.jsx
 *
 * FIXED: Mock cards restored to proper card proportions (w-52 h-72 = 3:4 ratio).
 * h-68 was invalid Tailwind (doesn't exist) causing layout collapse.
 * Container uses overflow-hidden so rotated/translated cards don't cause scroll.
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, Share2, Trophy, ArrowRight } from "lucide-react";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";

// Correct proportions: w-52 (208px) × h-72 (288px) → 3:4 ratio, card-shaped not pill
function MockCard({ rotate = 0, opacity = 1 }) {
  return (
    <div
      className="absolute w-52 h-72 rounded-3xl overflow-hidden shadow-swipe
                 bg-gradient-to-br from-primary-200 to-primary-400
                 flex items-center justify-center"
      style={{ transform: `rotate(${rotate}deg)`, opacity }}
    >
      <span className="text-5xl">📸</span>
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
  const { t }    = useLang();
  const { user } = useAuth();

  return (
    <div className="min-h-screen overflow-x-hidden">

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-20
                          grid lg:grid-cols-2 gap-10 items-center">
        {/* Text */}
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

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.42 }}
            className="flex flex-wrap gap-3"
          >
            <Link to={user ? "/dashboard" : "/register"}
              className="btn-primary text-base px-7 py-3.5">
              {t("getStarted")} <ArrowRight size={17} />
            </Link>
            <a href="#how" className="btn-secondary text-base px-7 py-3.5">
              {t("howItWorks")}
            </a>
          </motion.div>
        </div>

        {/* Mock card stack
            - Fixed height h-80 (320px) contains the 288px-tall cards + rotation offset
            - overflow-hidden clips any rotated overflow
            - No absolute positioning outside the container
        */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="relative h-80 flex items-center justify-center overflow-hidden"
        >
          <MockCard rotate={-8} opacity={0.35} />
          <MockCard rotate={-3} opacity={0.65} />
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
            className="relative z-10"
          >
            <MockCard rotate={2} opacity={1} />
          </motion.div>

          {/* Floating chips — positioned inside the overflow-hidden container */}
          <motion.div
            animate={{ x: [0, 5, 0], y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }}
            className="absolute top-4 right-4 bg-card-light dark:bg-card-dark
                       rounded-2xl px-3 py-1.5 shadow-card z-20"
          >
            <span className="text-sm font-semibold text-green-500">👍 LIKE</span>
          </motion.div>
          <motion.div
            animate={{ x: [0, -5, 0], y: [0, 4, 0] }}
            transition={{ repeat: Infinity, duration: 2.1, ease: "easeInOut" }}
            className="absolute bottom-4 left-4 bg-card-light dark:bg-card-dark
                       rounded-2xl px-3 py-1.5 shadow-card z-20"
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
