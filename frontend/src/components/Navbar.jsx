/**
 * components/Navbar.jsx
 *
 * FIXES:
 *  - Language button now shows the CURRENT active language (EN / RU),
 *    not the target language. Clicking it switches to the other.
 *  - Unified nav: any logged-in user sees Dashboard + New Album.
 *  - No role-based conditional rendering.
 */
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sun, Moon, LogOut, LayoutDashboard, Plus } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";

export default function Navbar() {
  const { isDark, toggle } = useTheme();
  const { user, logout }   = useAuth();
  const { t, lang, setLanguage } = useLang();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/"); };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="sticky top-0 z-50 bg-card-light/80 dark:bg-card-dark/80 backdrop-blur-xl
                 border-b border-border-light dark:border-border-dark"
    >
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 no-select flex-shrink-0">
          <motion.div
            whileHover={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 0.4 }}
            className="w-8 h-8 bg-primary-400 rounded-xl flex items-center justify-center shadow-orange"
          >
            <span className="text-white text-sm">📸</span>
          </motion.div>
          <span className="font-display font-bold text-xl text-gray-900 dark:text-white
                           hover:text-primary-500 transition-colors">
            {t("appName")}
          </span>
        </Link>

        {/* Controls */}
        <div className="flex items-center gap-1.5">

          {/* Language button — shows CURRENT lang, click to switch */}
          <button
            onClick={() => setLanguage(lang === "en" ? "ru" : "en")}
            className="btn-ghost text-xs font-bold w-9 h-9 rounded-xl tracking-wider"
            title={lang === "en" ? "Switch to Russian" : "Переключить на английский"}
          >
            {lang.toUpperCase()}
          </button>

          {/* Theme toggle */}
          <motion.button
            onClick={toggle}
            whileTap={{ scale: 0.9 }}
            className="btn-ghost w-9 h-9 rounded-xl"
          >
            <motion.div
              key={isDark ? "sun" : "moon"}
              initial={{ rotate: -20, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ duration: 0.18 }}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </motion.div>
          </motion.button>

          {user ? (
            <>
              <Link to="/dashboard" className="btn-ghost hidden sm:flex text-sm">
                <LayoutDashboard size={15} /> {t("dashboard")}
              </Link>
              <Link to="/create" className="btn-primary text-sm px-3 py-2 hidden sm:flex">
                <Plus size={15} /> {t("createAlbum")}
              </Link>

              <div className="flex items-center gap-1 pl-2
                              border-l border-border-light dark:border-border-dark">
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block truncate max-w-[80px]">
                  @{user.username}
                </span>
                <button
                  onClick={handleLogout}
                  className="btn-ghost w-9 h-9 rounded-xl text-red-400"
                  title={t("logout")}
                >
                  <LogOut size={15} />
                </button>
              </div>
            </>
          ) : (
            <>
              <Link to="/login"    className="btn-ghost text-sm px-3 py-2">{t("login")}</Link>
              <Link to="/register" className="btn-primary text-sm px-3 py-2">{t("register")}</Link>
            </>
          )}
        </div>
      </div>
    </motion.header>
  );
}
