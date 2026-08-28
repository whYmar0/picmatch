/**
 * Navbar.jsx — v3
 *
 * CHANGES v3:
 *  - Avatar crop modal before upload (circular template)
 *  - Avatar now visible on MOBILE too (smaller size)
 *  - "New Album" button removed from navbar (only in Dashboard header on desktop)
 */
import { useRef, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, LayoutDashboard, Camera, Bell, MessageCircle, BarChart2, Sun, Moon, Languages, AtSign } from "lucide-react";
import FilledHeart from "./FilledHeart";
import topBarHeartIcon from "../../Screenshot_20260820_120332_Instagram.png";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";
import { authApi, notificationsApi } from "../api";
import toast from "react-hot-toast";
import AvatarCropModal from "./AvatarCropModal";

// ─── Avatar color map ─────────────────────────────────────────────────────────
const AVATAR_COLORS = {
  purple: { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-600" },
  green: { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-600" },
  yellow: { bg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-600" },
  orange: { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-600" },
  pink: { bg: "bg-pink-100 dark:bg-pink-900/40", text: "text-pink-600" },
  blue: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-600" },
};

// ─── User Avatar (reusable) ────────────────────────────────────────────────────
export function UserAvatar({ user, size = 28, className = "", onClick }) {
  if (!user) return null;
  const initial = user.username?.[0]?.toUpperCase() ?? "?";
  const c = AVATAR_COLORS[user.avatar_color] ?? AVATAR_COLORS.purple;
  return (
    <div
      onClick={onClick}
      title={user.username}
      className={`rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center font-bold
                  ${c.bg} ${c.text}
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
  const { user, logout } = useAuth();
  const { t, lang, setLanguage } = useLang();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const menuRef = useRef(null);

  // Profile menu state
  const [menuOpen, setMenuOpen] = useState(false);
  // Crop modal state
  const [cropSrc, setCropSrc] = useState(null);   // data-url of chosen image
  const [cropping, setCropping] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotifToast, setShowNotifToast] = useState(false);

  // Explicitly close menu on user change to prevent it being open accidentally after login
  useEffect(() => {
    setMenuOpen(false);
  }, [user]);

  useEffect(() => {
    let intervalId;
    let toastTimeoutId;
    if (user) {
      const fetchNotifs = () => {
        notificationsApi.getMine().then((data) => {
          setNotifications(data);
          const unread = data.filter(n => !n.is_read);
          const latestId = unread.length > 0 ? unread[0].id : null;

          // Only show toast if we have new unread notifications that haven't been shown
          if (latestId) {
            setShowNotifToast(true);
            toastTimeoutId = setTimeout(() => setShowNotifToast(false), 5000);
          }
        }).catch(console.error);
      };

      fetchNotifs();
      // Poll notifications every 10 seconds
      intervalId = setInterval(fetchNotifs, 10000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (toastTimeoutId) clearTimeout(toastTimeoutId);
    };
  }, [user]);

  const unreadNotifs = notifications.filter(n => !n.is_read);
  const repliesCount = unreadNotifs.filter(n => n.type === "reply").length;
  const commentsCount = unreadNotifs.filter(n => n.type === "comment").length;
  const votesCount = unreadNotifs.filter(n => n.type === "vote").length;

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

  const handleLogout = () => {
    logout();
    // Navigate to root — HomeRoute will show Landing for unauthenticated users
    navigate("/", { replace: true });
  };

  const handleDeleteAvatar = async () => {
    if (!window.confirm("Remove profile photo?")) return;
    setMenuOpen(false);
    try {
      const updated = await authApi.deleteAvatar();
      localStorage.setItem("pickmatch_user", JSON.stringify(updated));
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
      localStorage.setItem("pickmatch_user", JSON.stringify(updated));
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
              className="flex items-center justify-center"
            >
              <img src="/pickmatch_logo.png" alt="Pickmatch Logo" className="h-8 w-auto object-contain" />
            </motion.div>
            <span className="font-display font-bold text-xl text-gray-900 dark:text-white
                             hover:text-primary-500 transition-colors inline">
              {t("appName")}
            </span>
          </Link>

          {/* Controls */}
          <div className="flex items-center gap-1.5">

            {/* Notifications */}
            {user && (
              <div className="relative">
                <button
                  onClick={() => navigate("/inbox")}
                  className="btn-ghost relative flex items-center justify-center w-11 h-11 rounded-2xl"
                >
                  <span className="relative flex items-center justify-center w-8 h-7">
                    <img
                      src={topBarHeartIcon}
                      alt="Notifications"
                      className="w-8 h-7 object-contain"
                    />
                    {unreadNotifs.length > 0 && (
                      <span className="absolute top-1 right-0 w-[5.5px] h-[5.6px] aspect-square rounded-[50%] bg-[#ff1f46] outline outline-2 outline-card-light dark:outline-card-dark" />
                    )}
                  </span>
                </button>

                {/* Mini notification bubble (TikTok/Instagram style) */}
                <AnimatePresence>
                  {showNotifToast && unreadNotifs.length > 0 && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0 z-50 w-[120px] pointer-events-none">
                      <motion.div
                        style={{ transformOrigin: "60px -5.5px" }}
                        initial={{ opacity: 1, scale: 0.08 }}
                        animate={{
                          opacity: 1,
                          scale: [0.08, 1.08, 1, 1, 0],
                        }}
                        exit={{
                          opacity: 1,
                          scale: 0,
                          transition: { duration: 0.08, ease: "easeIn" },
                        }}
                        transition={{
                          duration: 5,
                          times: [0, 0.08, 0.16, 0.88, 1],
                          ease: ["easeOut", "easeOut", "linear", "easeIn", "easeIn"],
                        }}
                        className="relative w-[120px] origin-top pointer-events-none"
                      >
                        {/* Rounded half-diamond tail at the top-right of the tablet */}
                        <div className="absolute top-[-1px] left-[49px] w-[22px] h-[22px] rounded-[15%] rotate-45 bg-[#ef4444]" />

                        {/* Bubble Content */}
                        <div className="absolute top-0 right-[40px] z-10 w-max h-[46px] bg-[#ef4444] rounded-full py-2 px-3 overflow-hidden flex items-center justify-center shadow-2xl gap-2.5 text-white">
                        {repliesCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <AtSign size={16} strokeWidth={3} className="text-white" />
                            <span className="font-bold text-[14px] leading-none mb-[1px]" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" }}>{repliesCount > 999 ? "999+" : repliesCount}</span>
                          </div>
                        )}
                        {commentsCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <MessageCircle size={16} fill="white" className="text-white" />
                            <span className="font-bold text-[14px] leading-none mb-[1px]" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" }}>{commentsCount > 999 ? "999+" : commentsCount}</span>
                          </div>
                        )}
                        {votesCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <BarChart2 size={17} strokeWidth={3} className="text-white" />
                            <span className="font-bold text-[14px] leading-none mb-[1px]" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" }}>{votesCount}</span>
                          </div>
                        )}

                      </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            )}



            {user ? (
              <>
                <Link to="/dashboard" className="btn-ghost hidden sm:flex text-sm">
                  <LayoutDashboard size={15} /> {t("dashboard")}
                </Link>

                <div className="flex items-center gap-2 pl-2 relative"
                  ref={menuRef}>

                  {/* Avatar Section */}
                  <div className="cursor-pointer relative group"
                    onClick={() => setMenuOpen(!menuOpen)}>
                    {/* Mobile: smaller avatar */}
                    <UserAvatar
                      user={user}
                      size={36}
                      className="sm:hidden border border-border-light dark:border-border-dark"
                    />
                    {/* Desktop: slightly larger avatar */}
                    <UserAvatar
                      user={user}
                      size={40}
                      className="hidden sm:flex border border-border-light dark:border-border-dark"
                    />
                    {/* Small arrow indicator */}
                    <motion.div
                      initial={{ rotate: 0 }}
                      animate={{ rotate: menuOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute -right-1 -bottom-1 bg-white dark:bg-card-dark rounded-full shadow-sm border border-border-light dark:border-border-dark p-0.5 flex items-center justify-center w-4 h-4"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary-500">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
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
                          {/* Username header */}
                          <div className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                            <AtSign size={16} className="text-primary-400" />
                            {user.username}
                          </div>

                          <div className="border-t border-border-light dark:border-border-dark -mx-2 my-1" />

                          {/* Avatar Photo */}
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

                          {/* Theme Toggle */}
                          <button
                            onClick={toggle}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm 
                                       hover:bg-primary-50 dark:hover:bg-primary-900/20 text-gray-700 dark:text-gray-200 transition-colors"
                          >
                            {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-primary-400" />}
                            <span className="flex-1 text-left">{isDark ? t("darkTheme") : t("lightTheme")}</span>
                            <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isDark ? 'bg-primary-400' : 'bg-gray-200 dark:bg-gray-700'}`}>
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isDark ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                            </div>
                          </button>

                          {/* Language Toggle */}
                          <button
                            onClick={() => setLanguage(lang === "en" ? "ru" : "en")}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm 
                                       hover:bg-primary-50 dark:hover:bg-primary-900/20 text-gray-700 dark:text-gray-200 transition-colors"
                          >
                            <Languages size={16} className="text-primary-400" />
                            <span className="flex-1 text-left">{t("language")}</span>
                            <span className="text-[10px] font-bold bg-primary-100 dark:bg-primary-900/60 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-md">
                              {lang.toUpperCase()}
                            </span>
                          </button>

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
              <div className="flex items-center gap-1">
                <Link to="/login" className="btn-ghost text-xs sm:text-sm px-2 py-1.5 sm:px-3 sm:py-2 flex-shrink-0">{t("login")}</Link>
                <Link to="/register" className="btn-primary text-xs sm:text-sm px-2.5 py-1.5 sm:px-3.5 sm:py-2 flex-shrink-0">{t("register")}</Link>
              </div>
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
