/**
 * components/Navbar.jsx — Навигационная панель / Navigation bar
 * Адаптивная, с переключением темы и языка
 * Responsive, with theme toggle and language switcher
 */

import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sun, Moon, LogOut, LayoutDashboard, Plus } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";

export default function Navbar() {
  const { isDark, toggle } = useTheme();
  const { user, logout, isCreator } = useAuth();
  const { t, lang, setLanguage } = useLang();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="sticky top-0 z-50 bg-card-light/80 dark:bg-card-dark/80 backdrop-blur-xl
                 border-b border-border-light dark:border-border-dark"
    >
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group no-select">
          <motion.div
            whileHover={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 0.4 }}
            className="w-8 h-8 bg-primary-400 rounded-xl flex items-center justify-center shadow-orange"
          >
            <span className="text-white text-base">📸</span>
          </motion.div>
          <span className="font-display font-bold text-xl text-gray-900 dark:text-white group-hover:text-primary-500 transition-colors">
            {t("appName")}
          </span>
        </Link>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <button
            onClick={() => setLanguage(lang === "en" ? "ru" : "en")}
            className="btn-ghost text-sm font-semibold w-10 h-10 rounded-xl"
            title="Switch language / Переключить язык"
          >
            {lang === "en" ? "RU" : "EN"}
          </button>

          {/* Theme toggle */}
          <motion.button
            onClick={toggle}
            whileTap={{ scale: 0.9 }}
            className="btn-ghost w-10 h-10 rounded-xl"
            title={isDark ? "Switch to light" : "Switch to dark"}
          >
            <motion.div
              key={isDark ? "moon" : "sun"}
              initial={{ rotate: -30, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </motion.div>
          </motion.button>

          {/* Authenticated nav items */}
          {user ? (
            <>
              {isCreator && (
                <>
                  <Link to="/dashboard" className="btn-ghost hidden sm:flex">
                    <LayoutDashboard size={16} />
                    <span className="text-sm">{t("dashboard")}</span>
                  </Link>
                  <Link to="/create" className="btn-primary text-sm px-4 py-2 hidden sm:flex">
                    <Plus size={16} />
                    <span>{t("createAlbum")}</span>
                  </Link>
                </>
              )}

              <div className="flex items-center gap-1 pl-2 border-l border-border-light dark:border-border-dark">
                <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                  @{user.username}
                </span>
                <button onClick={handleLogout} className="btn-ghost w-10 h-10 rounded-xl text-red-400">
                  <LogOut size={16} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="btn-ghost text-sm px-4 py-2">
                {t("login")}
              </Link>
              <Link to="/register" className="btn-primary text-sm px-4 py-2">
                {t("register")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </motion.header>
  );
}
