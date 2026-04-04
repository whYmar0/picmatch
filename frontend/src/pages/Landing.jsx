/**
 * Landing.jsx — v5.2
 *
 * FIXES:
 *  - Card overflow: replaced overflow-hidden with overflow-clip (CSS transforms can
 *    bypass overflow:hidden in Safari; overflow:clip does not have this issue).
 *    Also added isolation: isolate and contain: layout on the container.
 *  - Removed the second "New Album" / hero CTA button below the subtitle.
 *    Only one button remains: "Get started" → /register or /dashboard.
 *  - MockCard opacity always 1 (removed fading).
 *  - Cards use clamp() for responsive proportional sizing.
 */
import { Link }    from "react-router-dom";
import { motion }  from "framer-motion";
import { Upload, Share2, Trophy, ArrowRight } from "lucide-react";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";

function MockCard({ rotate = 0 }) {
  return (
    <div
      className="absolute rounded-3xl shadow-swipe
                 bg-gradient-to-br from-primary-200 to-primary-400
                 flex items-center justify-center"
      style={{
        width:  "clamp(130px, 32vw, 196px)",
        height: "clamp(174px, 42.7vw, 261px)",
        transform: `rotate(${rotate}deg)`,
        opacity: 1,
      }}
    >
      <span style={{ fontSize: "clamp(1.8rem, 5vw, 2.8rem)" }}>📸</span>
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

          {/*
            Single CTA button only.
            The second "New Album" / "How it works" button has been removed per spec.
          */}
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

        {/* ── Card stack column ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="relative flex items-center justify-center"
          style={{
            height: "clamp(200px, 50vw, 310px)",
            // overflow:clip works where overflow:hidden fails with CSS transforms
            overflow: "clip",
            // isolate + contain prevent cards from bleeding out of this column
            isolation: "isolate",
            contain: "layout",
          }}
        >
          <MockCard rotate={-8} />
          <MockCard rotate={-3} />
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
            className="relative z-10"
          >
            <MockCard rotate={2} />
          </motion.div>

          {/* Floating LIKE / NOPE chips */}
          <motion.div
            animate={{ x: [0, 5, 0], y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }}
            className="absolute top-3 right-3 bg-card-light dark:bg-card-dark
                       rounded-2xl px-3 py-1.5 shadow-card z-20"
          >
            <span className="text-sm font-semibold text-green-500">👍 LIKE</span>
          </motion.div>
          <motion.div
            animate={{ x: [0, -5, 0], y: [0, 4, 0] }}
            transition={{ repeat: Infinity, duration: 2.1, ease: "easeInOut" }}
            className="absolute bottom-3 left-3 bg-card-light dark:bg-card-dark
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
