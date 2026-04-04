/**
 * Navbar.jsx — v2
 *
 * CHANGES:
 *  - Removed "@" prefix from username display
 *  - Avatar shown next to username (if avatar_url is set)
 *  - Added avatar upload trigger (click avatar → file input)
 */
import { useRef } from "react";
import { Link, useNavigate }  from "react-router-dom";
import { motion }             from "framer-motion";
import { Sun, Moon, LogOut, LayoutDashboard, Plus, Camera } from "lucide-react";
import { useTheme }           from "../contexts/ThemeContext";
import { useAuth }            from "../contexts/AuthContext";
import { useLang }            from "../contexts/LangContext";
import { authApi }            from "../api";
import toast                  from "react-hot-toast";

// ─── User Avatar (reusable) ────────────────────────────────────────────────────
export function UserAvatar({ user, size = 28, className = "", onClick }) {
  if (!user) return null;
  const initial = user.username?.[0]?.toUpperCase() ?? "?";
  return (
    <div
      onClick={onClick}
      title={user.username}
      className={`rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center
                  bg-primary-100 dark:bg-primary-900/40 text-primary-600 font-bold
                  ${onClick ? "cursor-pointer hover:ring-2 hover:ring-primary-400 transition-all" : ""}
                  ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {user.avatar_url
        ? <img src={user.avatar_url} alt={user.username}
               className="w-full h-full object-cover" />
        : initial
      }
    </div>
  );
}

export default function Navbar() {
  const { isDark, toggle } = useTheme();
  const { user, logout, register } = useAuth();
  const { t, lang, setLanguage }   = useLang();
  const navigate  = useNavigate();
  const fileRef   = useRef(null);

  const handleLogout = () => { logout(); navigate("/"); };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const updated = await authApi.uploadAvatar(file);
      // Update stored user with new avatar_url
      localStorage.setItem("picmatch_user", JSON.stringify(updated));
      toast.success("Avatar updated!");
      // Reload to reflect the new avatar everywhere
      window.location.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

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

          {/* Language */}
          <button
            onClick={() => setLanguage(lang === "en" ? "ru" : "en")}
            className="btn-ghost text-xs font-bold w-9 h-9 rounded-xl tracking-wider"
          >
            {lang.toUpperCase()}
          </button>

          {/* Theme */}
          <motion.button onClick={toggle} whileTap={{ scale: 0.9 }}
            className="btn-ghost w-9 h-9 rounded-xl">
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

              <div className="flex items-center gap-2 pl-2
                              border-l border-border-light dark:border-border-dark">
                {/* Avatar — click to upload */}
                <div className="relative hidden sm:block">
                  <UserAvatar
                    user={user}
                    size={30}
                    onClick={() => fileRef.current?.click()}
                    className="border border-border-light dark:border-border-dark"
                  />
                  {/* Camera icon overlay on hover */}
                  <div className="absolute inset-0 rounded-full flex items-center justify-center
                                  opacity-0 hover:opacity-100 bg-black/40 cursor-pointer transition-opacity"
                       onClick={() => fileRef.current?.click()}>
                    <Camera size={10} className="text-white" />
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>

                {/* Username — NO @ prefix */}
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block
                                 truncate max-w-[72px]">
                  {user.username}
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
