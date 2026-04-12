/**
 * Navbar.jsx — v3
 *
 * CHANGES v3:
 *  - Avatar crop modal before upload (circular template)
 *  - Avatar now visible on MOBILE too (smaller size)
 *  - "New Album" button removed from navbar (only in Dashboard header on desktop)
 */
import { useRef, useState, useEffect } from "react";
import { Link, useNavigate }  from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, LogOut, LayoutDashboard, Camera } from "lucide-react";
import { useTheme }           from "../contexts/ThemeContext";
import { useAuth }            from "../contexts/AuthContext";
import { useLang }            from "../contexts/LangContext";
import { authApi }            from "../api";
import toast                  from "react-hot-toast";
import AvatarCropModal        from "./AvatarCropModal";

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
  const { user, logout }   = useAuth();
  const { t, lang, setLanguage } = useLang();
  const navigate  = useNavigate();
  const fileRef   = useRef(null);
  const menuRef   = useRef(null);

  // Profile menu state
  const [menuOpen, setMenuOpen] = useState(false);
  // Crop modal state
  const [cropSrc,  setCropSrc]  = useState(null);   // data-url of chosen image
  const [cropping, setCropping] = useState(false);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleLogout = () => { logout(); navigate("/"); };

  const handleDeleteAvatar = async () => {
    if (!window.confirm("Remove profile photo?")) return;
    setMenuOpen(false);
    try {
      const updated = await authApi.deleteAvatar();
      localStorage.setItem("picmatch_user", JSON.stringify(updated));
      toast.success("Avatar removed.");
      window.location.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Step 1: user picks a file → open crop modal
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be picked again later
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropSrc(ev.target.result);
      setCropping(true);
      setMenuOpen(false);
    };
    reader.readAsDataURL(file);
  };

  // Step 2: user confirms crop → upload cropped Blob
  const handleCropConfirm = async (croppedFile) => {
    setCropping(false);
    setCropSrc(null);
    try {
      const updated = await authApi.uploadAvatar(croppedFile);
      localStorage.setItem("picmatch_user", JSON.stringify(updated));
      toast.success("Avatar updated!");
      window.location.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCropCancel = () => {
    setCropping(false);
    setCropSrc(null);
  };

  return (
    <>
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

                <div className="flex items-center gap-2 pl-2
                                border-l border-border-light dark:border-border-dark relative"
                     ref={menuRef}>
                  
                  {/* Avatar Section */}
                  <div className="cursor-pointer relative group"
                       onClick={() => setMenuOpen(!menuOpen)}>
                    {/* Mobile: smaller avatar */}
                    <UserAvatar
                      user={user}
                      size={32}
                      className="sm:hidden border border-border-light dark:border-border-dark"
                    />
                    {/* Desktop: slightly larger avatar */}
                    <UserAvatar
                      user={user}
                      size={36}
                      className="hidden sm:flex border border-border-light dark:border-border-dark"
                    />
                    {/* Small arrow indicator */}
                    <motion.div 
                      animate={{ rotate: menuOpen ? 180 : 0 }}
                      className="absolute -right-1 -bottom-1 bg-white dark:bg-card-dark rounded-full shadow-sm border border-border-light dark:border-border-dark p-0.5"
                    >
                      <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-primary-400 rotate-45 mb-1 ml-0.5" />
                    </motion.div>
                  </div>

                  {/* Dropdown Menu */}
                  <AnimatePresence>
                    {menuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute top-full right-0 mt-2 w-48 bg-card-light dark:bg-card-dark 
                                   rounded-2xl shadow-xl border border-border-light dark:border-border-dark 
                                   overflow-hidden z-[100]"
                      >
                        <div className="p-2 space-y-1">
                          <button
                            onClick={() => fileRef.current?.click()}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm 
                                       hover:bg-primary-50 dark:hover:bg-primary-900/20 text-gray-700 dark:text-gray-200 transition-colors"
                          >
                            <Camera size={16} className="text-primary-400" />
                            {user.avatar_url ? "Update Photo" : "Add Photo"}
                          </button>
                          
                          {user.avatar_url && (
                            <button
                              onClick={handleDeleteAvatar}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm 
                                         hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 transition-colors"
                            >
                              <div className="w-4 h-4 flex items-center justify-center">
                                <div className="w-3.5 h-0.5 bg-current rounded-full" />
                              </div>
                              Remove Photo
                            </button>
                          )}
                          
                          <div className="h-px bg-border-light dark:bg-border-dark my-1" />
                          
                          <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm 
                                       hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 transition-colors"
                          >
                            <LogOut size={16} />
                            {t("logout")}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  {/* Username — desktop only (hidden when menu is open to avoid crowding) */}
                  {!menuOpen && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block
                                     truncate max-w-[72px]">
                      {user.username}
                    </span>
                  )}
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

      {/* Avatar Crop Modal */}
      {cropping && (
        <AvatarCropModal
          src={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </>
  );
}
