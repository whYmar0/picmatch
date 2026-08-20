/**
 * Dashboard.jsx — v5 (Horizontal carousel + expanded views)
 * - Two horizontal carousels: My Albums, Recent Albums
 * - "See all" opens full-screen expanded view with sticky back button
 * - Search + sort in expanded views
 * - Respects prefers-reduced-motion
 * - Preserves gallery mode / depth-zoom integration
 */
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { Plus, ChevronLeft, Search, SlidersHorizontal, ChevronDown, Check } from "lucide-react";
import toast from "react-hot-toast";
import { albumsApi } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";
import AlbumCard from "../components/AlbumCard";
import RecentAlbumCard from "../components/RecentAlbumCard";
import AlbumGallery from "../components/AlbumGallery";
import BottomSheet from "../components/BottomSheet";
import { DashboardSkeleton } from "../components/Skeleton";
import { getRecentAlbums } from "../hooks/useRecentAlbums.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useCarouselOverflow(data) {
  const [node, setNode] = useState(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    if (!node) return;
    const check = () => setOverflows(node.scrollWidth > node.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(node);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [node, data]);

  return [setNode, node, overflows];
}

function useDebounce(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function useScrollLeft(node, data) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!node) return;
    const handler = () => {
      setScrolled(node.scrollLeft > 0);
    };
    handler();
    node.addEventListener('scroll', handler, { passive: true });
    return () => node.removeEventListener('scroll', handler);
  }, [node, data]);
  return scrolled;
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
  const [mySortOpen, setMySortOpen] = useState(false);
  const [recentSearch, setRecentSearch] = useState("");
  const [recentSort, setRecentSort] = useState("recent");
  const [recentSortOpen, setRecentSortOpen] = useState(false);

  // Recently visited — filtered to exclude albums the user owns
  const recentAll = user ? getRecentAlbums(user.id) : [];
  const ownIds = useMemo(() => new Set(albums.map((a) => a.id)), [albums]);
  const recent = useMemo(() => recentAll.filter((a) => !ownIds.has(a.id)), [recentAll, ownIds]);

  // Carousel overflow detection (must come after `recent` is defined)
  const [myCarouselRef, myCarouselNode, myOverflows] = useCarouselOverflow(albums);
  const [recentCarouselRef, recentCarouselNode, recentOverflows] = useCarouselOverflow(recent);

  // Carousel scroll position — left fade appears only when scrolled away from start
  const myScrolledLeft = useScrollLeft(myCarouselNode, albums);
  const recentScrolledLeft = useScrollLeft(recentCarouselNode, recent);

  // Page depth-zoom motion values (preserved from v4)
  const dragProgressMV = useMotionValue(0);
  const baseScaleMV = useMotionValue(1);
  const pageScaleMV = useTransform(
    [baseScaleMV, dragProgressMV],
    ([base, drag]) => base + (1 - base) * drag
  );
  const closeProgressAnimRef = useRef(null);

  useEffect(() => {
    animate(baseScaleMV, galleryAlbum ? 0.94 : 1, {
      duration: 0.42,
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
    closeProgressAnimRef.current?.stop();
    closeProgressAnimRef.current = null;
    dragProgressMV.set(0);
    setGalleryKey((k) => k + 1);
    setGalleryAlbum({ album: album, photoId: photo?.id });
  }, [dragProgressMV]);

  const handleGalleryClose = useCallback(() => {
    closeProgressAnimRef.current?.stop();
    closeProgressAnimRef.current = animate(dragProgressMV, 1, {
      duration: 0.3,
      ease: [0.32, 0.72, 0, 1],
      onComplete: () => {
        closeProgressAnimRef.current = null;
        dragProgressMV.set(0);
      },
    });
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

  if (loading) {
    return <DashboardSkeleton />;
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
        {activeView === "home" && (
            <div className="space-y-3">
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
                  <div className="flex min-h-[160px] items-center justify-center px-6 text-center">
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
                        flex overflow-x-auto gap-4 py-5 pl-4 scrollbar-none
                        ${myOverflows ? "mask-fade-edges" : ""}
                      `}
                      data-scrolled-left={myOverflows ? myScrolledLeft : undefined}
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
                      <div className="flex justify-end mt-1 px-4">
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
                  <div className="flex items-center justify-between mb-1.5 px-4">
                    <h2 className="font-semibold text-xl text-gray-800 dark:text-gray-200">
                      {t("recentlyVisited")}
                    </h2>
                  </div>
                  <div
                    ref={recentCarouselRef}
                    role="region"
                    aria-label={t("recentlyVisited")}                      aria-roledescription="carousel"
                      className={`
                      flex overflow-x-auto gap-4 py-5 pl-4 scrollbar-none
                      ${recentOverflows ? "mask-fade-edges" : ""}
                    `}
                    data-scrolled-left={recentOverflows ? recentScrolledLeft : undefined}
                  >
                    {recent.map((album, i) => (
                      <div
                        key={album.id} className="w-[180px] sm:w-[210px] flex-shrink-0"
                      >
                        <RecentAlbumCard album={album} index={i} />
                      </div>
                    ))}
                  </div>                    {recentOverflows && (
                    <div className="flex justify-end mt-1 px-4">
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
            </div>
          )}

          {activeView === "my-albums" && (
            <div className="min-h-screen">
              <div className="sticky top-0 bg-surface-light/90 dark:bg-surface-dark/90 backdrop-blur-md z-30 py-1 px-3 flex items-center gap-3">
                <button
                  onClick={() => setActiveView("home")}
                  className="p-2 rounded-2xl hover:bg-border-light dark:hover:bg-border-dark transition-colors text-gray-600 dark:text-gray-300"
                  aria-label="Back"
                >
                  <ChevronLeft size={24} />
                </button>
                <h1 className="font-display font-bold text-2xl">{t("myAlbums")}</h1>
              </div>

              <div className="mt-2 mb-6 flex flex-wrap items-center gap-3 px-4">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={mySearch}
                    onChange={(e) => setMySearch(e.target.value)}
                    placeholder={t("searchAlbums")}
                    className="input-field pl-9 pr-4 py-2.5 text-sm w-full rounded-full"
                  />
                </div>
                <button
                  onClick={() => setMySortOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-medium text-sm whitespace-nowrap
                             bg-border-light dark:bg-border-dark
                             hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                >
                  <SlidersHorizontal size={15} />
                  {mySort === "newest" ? t("sortNewest") : mySort === "alphabetical" ? t("sortAlphabetical") : t("sortMostVotes")}
                </button>
              </div>

              {filteredMyAlbums.length === 0 ? (
                <div className="text-center py-16 px-3">
                  <p className="text-gray-400 text-sm">{t("noSearchResults")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 pb-20 px-4">
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
            </div>
          )}

          {activeView === "recent-albums" && (
            <div className="min-h-screen">
              <div className="sticky top-0 bg-surface-light/90 dark:bg-surface-dark/90 backdrop-blur-md z-30 py-1 px-1 flex items-center gap-3">
                <button
                  onClick={() => setActiveView("home")}
                  className="p-2 rounded-2xl hover:bg-border-light dark:hover:bg-border-dark transition-colors text-gray-600 dark:text-gray-300"
                  aria-label="Back"
                >
                  <ChevronLeft size={24} />
                </button>
                <h1 className="font-display font-bold text-2xl">{t("recentlyVisited")}</h1>
              </div>

              <div className="mt-2 mb-6 flex flex-wrap items-center gap-3 px-4">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={recentSearch}
                    onChange={(e) => setRecentSearch(e.target.value)}
                    placeholder={t("searchAlbums")}
                    className="input-field pl-9 pr-4 py-2.5 text-sm w-full rounded-full"
                  />
                </div>
                <button
                  onClick={() => setRecentSortOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-medium text-sm whitespace-nowrap
                             bg-border-light dark:bg-border-dark
                             hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                >
                  <SlidersHorizontal size={15} />
                  {recentSort === "recent" ? t("sortMostRecent") : t("sortAlphabetical")}
                </button>
              </div>

              {filteredRecent.length === 0 ? (
                <div className="text-center py-16 px-3">
                  <p className="text-gray-400 text-sm">{t("noSearchResults")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 pb-20 px-4">
                  {filteredRecent.map((album, i) => (
                    <RecentAlbumCard key={album.id} album={album} index={i} />
                  ))}
                </div>
              )}
            </div>
          )}
      </motion.div>

      {/* Sort BottomSheets — sit outside scaled wrapper so fixed positioning works */}
      <BottomSheet open={mySortOpen} onClose={() => setMySortOpen(false)} title={t("sort")}>
        <div className="w-full h-px bg-border-light dark:bg-border-dark mb-4" />
        {[
          { key: "newest", label: t("sortNewest") },
          { key: "alphabetical", label: t("sortAlphabetical") },
          { key: "mostVotes", label: t("sortMostVotes") },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setMySort(key); setMySortOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl
                        text-sm font-medium transition-colors mb-2
                        ${mySort === key
                          ? "bg-primary-50 dark:bg-primary-900/20 text-primary-500"
                          : "hover:bg-border-light dark:hover:bg-border-dark"}`}
          >
            {label}
            {mySort === key && <Check size={16} className="text-primary-400" />}
          </button>
        ))}
      </BottomSheet>

      <BottomSheet open={recentSortOpen} onClose={() => setRecentSortOpen(false)} title={t("sort")}>
        <div className="w-full h-px bg-border-light dark:bg-border-dark mb-4" />
        {[
          { key: "recent", label: t("sortMostRecent") },
          { key: "alphabetical", label: t("sortAlphabetical") },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setRecentSort(key); setRecentSortOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl
                        text-sm font-medium transition-colors mb-2
                        ${recentSort === key
                          ? "bg-primary-50 dark:bg-primary-900/20 text-primary-500"
                          : "hover:bg-border-light dark:hover:bg-border-dark"}`}
          >
            {label}
            {recentSort === key && <Check size={16} className="text-primary-400" />}
          </button>
        ))}
      </BottomSheet>

      {/* Gallery mode — sits outside the scaled wrapper, full size */}
      <AnimatePresence>
        {galleryAlbum && (
          <motion.div
            key={galleryKey}
            className="contents"
            exit={{ opacity: 1, transition: { duration: 0.3 } }}
          >
            <AlbumGallery
              album={galleryAlbum.album}
              startPhotoId={galleryAlbum.photoId}
              onClose={handleGalleryClose}
              dragProgressMV={dragProgressMV}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
