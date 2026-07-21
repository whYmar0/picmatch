/**
 * Dashboard.jsx — v5 (Horizontal carousel + expanded views)
 * - Two horizontal carousels: My Albums, Recent Albums
 * - "See all" opens full-screen expanded view with sticky back button
 * - Search + sort in expanded views
 * - Respects prefers-reduced-motion
 * - Preserves gallery mode / depth-zoom integration
 */
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { Plus, ChevronLeft, Search, SlidersHorizontal, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { albumsApi } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";
import AlbumCard from "../components/AlbumCard";
import RecentAlbumCard from "../components/RecentAlbumCard";
import AlbumGallery from "../components/AlbumGallery";
import SkeletonBox, { AlbumGridSkeleton } from "../components/Skeleton";
import { getRecentAlbums } from "../hooks/useRecentAlbums.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e) => setReduced(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, []);
  return reduced;
}

function useCarouselOverflow(data) {
  const ref = useRef(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflows(el.scrollWidth > el.clientWidth);
  }, [data]);

  return [ref, overflows];
}

function useDebounce(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function parseUTC(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(dateStr)) return new Date(dateStr);
  return new Date(dateStr + "Z");
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [galleryAlbum, setGalleryAlbum] = useState(null);
  const [galleryKey, setGalleryKey] = useState(0);

  // View state
  const [activeView, setActiveView] = useState("home"); // "home" | "my-albums" | "recent-albums"
  const [mySearch, setMySearch] = useState("");
  const [mySort, setMySort] = useState("newest");
  const [recentSearch, setRecentSearch] = useState("");
  const [recentSort, setRecentSort] = useState("recent");

  const prefersReducedMotion = useReducedMotion();

  // Recently visited — filtered to exclude albums the user owns
  const recentAll = user ? getRecentAlbums(user.id) : [];
  const ownIds = useMemo(() => new Set(albums.map((a) => a.id)), [albums]);
  const recent = useMemo(() => recentAll.filter((a) => !ownIds.has(a.id)), [recentAll, ownIds]);

  // Carousel overflow detection (must come after `recent` is defined)
  const [myCarouselRef, myOverflows] = useCarouselOverflow(albums);
  const [recentCarouselRef, recentOverflows] = useCarouselOverflow(recent);

  // Page depth-zoom motion values (preserved from v4)
  const dragProgressMV = useMotionValue(0);
  const baseScaleMV = useMotionValue(1);
  const pageScaleMV = useTransform(
    [baseScaleMV, dragProgressMV],
    ([base, drag]) => base + (1 - base) * drag
  );

  useEffect(() => {
    animate(baseScaleMV, galleryAlbum ? 0.94 : 1, {
      duration: 0.36,
      ease: [0.32, 0.72, 0, 1],
    });
  }, [galleryAlbum, baseScaleMV]);

  // Body scroll lock for gallery
  useEffect(() => {
    if (galleryAlbum) {
      document.body.style.overflow = "hidden";
      document.body.style.overscrollBehavior = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.overscrollBehavior = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.overscrollBehavior = "";
    };
  }, [galleryAlbum]);

  useEffect(() => {
    albumsApi.getMyAlbums()
      .then((mine) => setAlbums(mine))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (albumId) => {
    try {
      await albumsApi.delete(albumId);
      setAlbums((prev) => prev.filter((a) => a.id !== albumId));
      toast.success(t("albumDeleted"));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handlePhotoClick = useCallback((album, photo) => {
    dragProgressMV.set(0);
    setGalleryKey((k) => k + 1);
    setGalleryAlbum({ album: album, photoId: photo?.id });
  }, [dragProgressMV]);

  const handleGalleryClose = useCallback(() => {
    dragProgressMV.set(1);
    setGalleryAlbum(null);
  }, [dragProgressMV]);

  // Debounced search values
  const debouncedMySearch = useDebounce(mySearch, 200);
  const debouncedRecentSearch = useDebounce(recentSearch, 200);

  // Filtered / sorted data for expanded views
  const filteredMyAlbums = useMemo(() => {
    let result = [...albums];
    if (debouncedMySearch.trim()) {
      const q = debouncedMySearch.toLowerCase();
      result = result.filter((a) => a.title?.toLowerCase().includes(q));
    }
    switch (mySort) {
      case "newest":
        result.sort((a, b) => parseUTC(b.created_at) - parseUTC(a.created_at));
        break;
      case "alphabetical":
        result.sort((a, b) => a.title?.localeCompare(b.title));
        break;
      case "mostVotes":
        result.sort((a, b) => (b.total_votes || 0) - (a.total_votes || 0));
        break;
      default:
        break;
    }
    return result;
  }, [albums, debouncedMySearch, mySort]);

  const filteredRecent = useMemo(() => {
    let result = [...recent];
    if (debouncedRecentSearch.trim()) {
      const q = debouncedRecentSearch.toLowerCase();
      result = result.filter(
        (a) =>
          a.title?.toLowerCase().includes(q) ||
          (a.creatorUsername || "").toLowerCase().includes(q)
      );
    }
    switch (recentSort) {
      case "recent":
        result.sort((a, b) => parseUTC(b.visitedAt) - parseUTC(a.visitedAt));
        break;
      case "alphabetical":
        result.sort((a, b) => a.title?.localeCompare(b.title));
        break;
      default:
        break;
    }
    return result;
  }, [recent, debouncedRecentSearch, recentSort]);

  const goToView = (view) => {
    window.scrollTo({ top: 0, behavior: "auto" });
    setActiveView(view);
  };

  const homeTransition = prefersReducedMotion
    ? { duration: 0.15 }
    : { duration: 0.2 };

  const expandedTransition = prefersReducedMotion
    ? { duration: 0.15 }
    : { type: "spring", stiffness: 300, damping: 28 };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-0 py-2">
        <div className="mb-6 px-3">
          <SkeletonBox className="h-8 w-32" />
        </div>
        <AlbumGridSkeleton count={4} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-0 py-8">
      {/* Page content — scales down subtly when gallery is open for depth effect */}
      <motion.div
        style={{
          scale: pageScaleMV,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        <AnimatePresence mode="wait">
          {activeView === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={homeTransition}
              className="space-y-10"
            >
              {/* My Albums */}
              <section>
                <div className="flex items-center justify-between mb-4 px-4">
                  <h1 className="font-display font-bold text-2xl">{t("myAlbums")}</h1>
                  <Link
                    to="/create"
                    className="btn-primary w-10 h-10 p-0 flex items-center justify-center rounded-2xl"
                    aria-label={t("createAlbum")}
                    title={t("createAlbum")}
                  >
                    <Plus size={20} strokeWidth={2.5} />
                  </Link>
                </div>

                {albums.length === 0 ? (
                  <div className="text-center py-10 bg-card-light dark:bg-card-dark rounded-3xl p-6">
                    <p className="text-gray-400 text-sm">{t("noAlbums")}</p>
                  </div>
                ) : (
                  <div>
                    <div
                      ref={myCarouselRef}
                      role="region"
                      aria-label={t("myAlbums")}
                      aria-roledescription="carousel"
                      className={`
                        flex overflow-x-auto gap-4 py-2 pl-1 scrollbar-none
                        ${myOverflows ? "mask-fade-edges" : ""}
                      `}
                    >
                      {albums.map((album, i) => (
                        <div
                          key={album.id}
                          className="w-[180px] sm:w-[210px] flex-shrink-0"
                        >
                          <AlbumCard
                            album={album}
                            onDelete={handleDelete}
                            index={i}
                            onPhotoClick={handlePhotoClick}
                          />
                        </div>
                      ))}
                    </div>
                    {myOverflows && (
                      <div className="flex justify-end mt-2 px-4">
                        <button
                          onClick={() => goToView("my-albums")}
                          className="text-primary-500 hover:text-primary-600 font-semibold text-sm transition-colors"
                        >
                          {t("seeAll")} →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Recent Albums */}
              {recent.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4 px-4">
                    <h2 className="font-semibold text-xl text-gray-800 dark:text-gray-200">
                      {t("recentlyVisited")}
                    </h2>
                  </div>
                  <div
                    ref={recentCarouselRef}
                    role="region"
                    aria-label={t("recentlyVisited")}
                    aria-roledescription="carousel"
                    className={`
                      flex overflow-x-auto gap-4 py-2 pl-1 scrollbar-none
                      ${recentOverflows ? "mask-fade-edges" : ""}
                    `}
                  >
                    {recent.map((album, i) => (
                      <div
                        key={album.id} className="w-[180px] sm:w-[210px] flex-shrink-0"
                      >
                        <RecentAlbumCard album={album} index={i} />
                      </div>
                    ))}
                  </div>                    {recentOverflows && (
                    <div className="flex justify-end mt-2 px-4">
                      <button
                        onClick={() => goToView("recent-albums")}
                        className="text-primary-500 hover:text-primary-600 font-semibold text-sm transition-colors"
                      >
                        {t("seeAll")} →
                      </button>
                    </div>
                  )}
                </section>
              )}
            </motion.div>
          )}

          {activeView === "my-albums" && (
            <motion.div
              key="my-albums"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={expandedTransition}
              className="min-h-screen"
            >
              <div className="sticky top-0 bg-surface-light/90 dark:bg-surface-dark/90 backdrop-blur-md z-30 py-4 px-3 border-b border-border-light dark:border-border-dark flex items-center gap-3">
                <button
                  onClick={() => setActiveView("home")}
                  className="p-2 rounded-2xl hover:bg-border-light dark:hover:bg-border-dark transition-colors text-gray-600 dark:text-gray-300"
                  aria-label="Back"
                >
                  <ChevronLeft size={24} />
                </button>
                <h1 className="font-display font-bold text-2xl">{t("myAlbums")}</h1>
              </div>

              <div className="mt-4 mb-6 flex flex-col sm:flex-row gap-3 px-4">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={mySearch}
                    onChange={(e) => setMySearch(e.target.value)}
                    placeholder={t("searchAlbums")}
                    className="input-field pl-9 pr-4 py-2.5 text-sm w-full"
                  />
                </div>
                <div className="relative">
                  <SlidersHorizontal size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select
                    value={mySort}
                    onChange={(e) => setMySort(e.target.value)}
                    className="input-field pl-9 pr-8 py-2.5 text-sm appearance-none w-full sm:w-44"
                  >
                    <option value="newest">{t("sortNewest")}</option>
                    <option value="alphabetical">{t("sortAlphabetical")}</option>
                    <option value="mostVotes">{t("sortMostVotes")}</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {filteredMyAlbums.length === 0 ? (
                <div className="text-center py-16 px-3">
                  <p className="text-gray-400 text-sm">{t("noSearchResults")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-20 px-4">
                  {filteredMyAlbums.map((album, i) => (
                    <AlbumCard
                      key={album.id}
                      album={album}
                      onDelete={handleDelete}
                      index={i}
                      onPhotoClick={handlePhotoClick}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeView === "recent-albums" && (
            <motion.div
              key="recent-albums"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={expandedTransition}
              className="min-h-screen"
            >
              <div className="sticky top-0 bg-surface-light/90 dark:bg-surface-dark/90 backdrop-blur-md z-30 py-4 px-1 border-b border-border-light dark:border-border-dark flex items-center gap-3">
                <button
                  onClick={() => setActiveView("home")}
                  className="p-2 rounded-2xl hover:bg-border-light dark:hover:bg-border-dark transition-colors text-gray-600 dark:text-gray-300"
                  aria-label="Back"
                >
                  <ChevronLeft size={24} />
                </button>
                <h1 className="font-display font-bold text-2xl">{t("recentlyVisited")}</h1>
              </div>

              <div className="mt-4 mb-6 flex flex-col sm:flex-row gap-3 px-4">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={recentSearch}
                    onChange={(e) => setRecentSearch(e.target.value)}
                    placeholder={t("searchAlbums")}
                    className="input-field pl-9 pr-4 py-2.5 text-sm w-full"
                  />
                </div>
                <div className="relative">
                  <SlidersHorizontal size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select
                    value={recentSort}
                    onChange={(e) => setRecentSort(e.target.value)}
                    className="input-field pl-9 pr-8 py-2.5 text-sm appearance-none w-full sm:w-44"
                  >
                    <option value="recent">{t("sortMostRecent")}</option>
                    <option value="alphabetical">{t("sortAlphabetical")}</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {filteredRecent.length === 0 ? (
                <div className="text-center py-16 px-3">
                  <p className="text-gray-400 text-sm">{t("noSearchResults")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-20 px-4">
                  {filteredRecent.map((album, i) => (
                    <RecentAlbumCard key={album.id} album={album} index={i} />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Gallery mode — sits outside the scaled wrapper, full size */}
      <AnimatePresence>
        {galleryAlbum && (
          <AlbumGallery
            key={galleryKey}
            album={galleryAlbum.album}
            startPhotoId={galleryAlbum.photoId}
            onClose={handleGalleryClose}
            dragProgressMV={dragProgressMV}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
