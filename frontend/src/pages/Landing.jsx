/**
 * pages/Landing.jsx
 *
 * CHANGES:
 *  - Removed "Find the perfect shot" tagline badge (top)
 *  - Removed "Ready to find your best shot?" CTA section (bottom)
 *  - overflow-x-hidden on hero mock to prevent horizontal scroll
 *  - Hero mock container clips with overflow-hidden
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, Share2, Trophy, ArrowRight } from "lucide-react";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";

function MockCard({ rotate = 0, yOffset = 0, opacity = 1 }) {
  return (
    <div
      className="absolute w-52 h-68 rounded-4xl overflow-hidden shadow-swipe"
      style={{ transform: `rotate(${rotate}deg) translateY(${yOffset}px)`, opacity }}
    >
      <div className="w-full h-full bg-gradient-to-br from-primary-200 to-primary-400
                      flex items-center justify-center">
        <span className="text-5xl">📸</span>
      </div>
    </div>
  );
}

function Step({ icon: Icon, title, desc, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.38 }}
      className="bg-card-light dark:bg-card-dark rounded-3xl p-6 text-center
                 shadow-card"
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

  const heroTarget = user ? "/dashboard" : "/register";

  return (
    <div className="min-h-screen overflow-x-hidden">

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-20
                          grid lg:grid-cols-2 gap-10 items-center">
        {/* Text */}
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="font-display font-bold text-5xl lg:text-6xl leading-tight mb-5"
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
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.45 }}
            className="text-base text-gray-500 dark:text-gray-400 mb-8 max-w-md leading-relaxed"
          >
            {t("heroSubtitle")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.45 }}
            className="flex flex-wrap gap-3"
          >
            <Link to={heroTarget} className="btn-primary text-base px-7 py-3.5">
              {t("getStarted")} <ArrowRight size={17} />
            </Link>
            <a href="#how" className="btn-secondary text-base px-7 py-3.5">
              {t("howItWorks")}
            </a>
          </motion.div>
        </div>

        {/* Mock card stack — overflow-hidden prevents horizontal scroll */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.55 }}
          className="relative h-72 flex items-center justify-center overflow-hidden"
        >
          <MockCard rotate={-8} opacity={0.35} />
          <MockCard rotate={-3} opacity={0.65} />
          <motion.div
            animate={{ y: [0, -9, 0] }}
            transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
            className="relative z-10"
          >
            <MockCard rotate={2} opacity={1} />
          </motion.div>

          {/* Floating chips */}
          <motion.div
            animate={{ x: [0, 5, 0], y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }}
            className="absolute top-6 right-6 bg-card-light dark:bg-card-dark
                       rounded-2xl px-3 py-1.5 shadow-card"
          >
            <span className="text-sm font-semibold text-green-500">👍 LIKE</span>
          </motion.div>
          <motion.div
            animate={{ x: [0, -5, 0], y: [0, 4, 0] }}
            transition={{ repeat: Infinity, duration: 2.1, ease: "easeInOut" }}
            className="absolute bottom-10 left-6 bg-card-light dark:bg-card-dark
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

      {/* ── No bottom CTA section (removed per spec) ── */}
    </div>
  );
}
