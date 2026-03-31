/**
 * pages/Landing.jsx — Главная страница / Landing page
 * Hero section with animated mockup and feature steps
 */

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, Share2, Trophy, ArrowRight } from "lucide-react";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";

// ─── Animated mock swipe card ─────────────────────────────────────────────────
function MockCard({ rotate = 0, offset = 0, opacity = 1 }) {
  return (
    <div
      className="absolute w-56 h-72 rounded-4xl overflow-hidden shadow-swipe"
      style={{ transform: `rotate(${rotate}deg) translateY(${offset}px)`, opacity }}
    >
      <div className="w-full h-full bg-gradient-to-br from-primary-200 to-primary-400
                      flex items-center justify-center">
        <span className="text-6xl">📸</span>
      </div>
    </div>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────
function Step({ icon: Icon, title, desc, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.12, duration: 0.4 }}
      className="card p-6 text-center"
    >
      <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-2xl
                      flex items-center justify-center mx-auto mb-4">
        <Icon size={22} className="text-primary-500" />
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
    </motion.div>
  );
}

export default function Landing() {
  const { t } = useLang();
  const { user } = useAuth();

  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-24 grid lg:grid-cols-2 gap-12 items-center">
        {/* Text */}
        <div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <span className="badge-orange mb-4 inline-flex">
              ✨ {t("tagline")}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="font-display font-bold text-5xl lg:text-6xl leading-tight mb-4"
          >
            {t("heroTitle").split(" ").map((word, i) =>
              word.includes("best") || word.includes("лучшее") ? (
                <span key={i} className="text-gradient">{word} </span>
              ) : (
                <span key={i}>{word} </span>
              )
            )}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-lg text-gray-500 dark:text-gray-400 mb-8 max-w-md leading-relaxed"
          >
            {t("heroSubtitle")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="flex flex-wrap gap-3"
          >
            <Link
              to={user ? (user.role === "creator" ? "/dashboard" : "/") : "/register"}
              className="btn-primary text-base px-8 py-3.5"
            >
              {t("getStarted")} <ArrowRight size={18} />
            </Link>
            <a href="#how" className="btn-secondary text-base px-8 py-3.5">
              {t("howItWorks")}
            </a>
          </motion.div>
        </div>

        {/* Visual mock */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="relative h-80 flex items-center justify-center"
        >
          <MockCard rotate={-8} offset={0} opacity={0.4} />
          <MockCard rotate={-3} offset={0} opacity={0.7} />
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
            className="relative z-10"
          >
            <MockCard rotate={2} offset={0} opacity={1} />
          </motion.div>

          {/* Floating badges */}
          <motion.div
            animate={{ x: [0, 6, 0], y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
            className="absolute top-4 right-4 card px-3 py-2 shadow-orange"
          >
            <span className="text-sm font-semibold text-green-500">👍 LIKE</span>
          </motion.div>
          <motion.div
            animate={{ x: [0, -6, 0], y: [0, 4, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className="absolute bottom-8 left-4 card px-3 py-2"
          >
            <span className="text-sm font-semibold text-red-400">✕ NOPE</span>
          </motion.div>
        </motion.div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="max-w-6xl mx-auto px-4 pb-24">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="font-display font-bold text-3xl text-center mb-10"
        >
          {t("howItWorks")}
        </motion.h2>
        <div className="grid sm:grid-cols-3 gap-5">
          <Step icon={Upload}  title={t("step1Title")} desc={t("step1Desc")} index={0} />
          <Step icon={Share2}  title={t("step2Title")} desc={t("step2Desc")} index={1} />
          <Step icon={Trophy}  title={t("step3Title")} desc={t("step3Desc")} index={2} />
        </div>
      </section>

      {/* ── CTA bottom ── */}
      <section className="bg-primary-50 dark:bg-primary-950/20 border-t border-primary-100 dark:border-primary-900/30">
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-display font-bold text-4xl mb-4"
          >
            Ready to find your best shot?
          </motion.h2>
          <Link to="/register" className="btn-primary text-base px-10 py-4 inline-flex">
            {t("getStarted")} <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
