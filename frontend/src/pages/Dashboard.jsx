/**
 * Dashboard.jsx — v4 (Redesign)
 * - 2-column grid for album cards
 * - Recent albums icon left of create button
 * - Gallery mode with photo click
 */
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { Plus, Image, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { albumsApi } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";
import AlbumCard from "../components/AlbumCard";
import RecentAlbumCard from "../components/RecentAlbumCard";
import AlbumGallery from "../components/AlbumGallery";
import SkeletonBox, { AlbumGridSkeleton } from "../components/Skeleton";
import { getRecentAlbums } from "../hooks/useRecentAlbums.js";

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [galleryAlbum, setGalleryAlbum] = useState(null);
  const [galleryKey, setGalleryKey] = useState(0);
  const [showRecent, setShowRecent] = useState(false);

  // Page depth-zoom: stretches from 1.0 down to 0.94 when gallery opens,
  // and unzooms toward 1.0 as the user drags the photo down (dragProgressMV).
  // baseScaleMV handles the smooth galleryAlbum toggle animation.
  // pageScaleMV = baseScaleMV + (1 - baseScaleMV) * dragProgressMV.
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

  // ─── dragProgressMV lifecycle ────────────────────────────────────────────
  // dragProgressMV is the "page zoom-out" factor driven by the gallery's
  // drag interaction. While the gallery is open, the AlbumGallery owns it
  // and writes to it on every touchmove / dismiss-spring onUpdate.
  //
  // Architectural rule:
  //   • On OPEN  → reset to 0 in handlePhotoClick (BEFORE React commits).
  //   • On CLOSE → DO NOT reset here. If we did, dragProgressMV would jump
  //                from 1.0 → 0 the moment AnimatePresence unmounts the
  //                wrapper, which would in turn drop pageScaleMV from
  //                1.0 → 0.94 (baseScaleMV) instantly — the user sees the
  //                page "restart zoom" mid-FLIP. That was bug #3.
  //   • The Shared Element Transition needs a STABLE target rect on the
  //     AlbumCard side. With dragProgressMV pinned at 1.0 throughout the
  //     dismiss, pageScaleMV collapses to 1.0 (base + (1-base)·1 = 1),
  //     so the album card does not visibly resize while the FLIP runs.
  //   • dragProgressMV is reset only on the next open, in handlePhotoClick.

  // ─── Body scroll lock ─────────────────────────────────────────────────────
  // Manage the lock from the parent so it is released as soon as the user
  // closes the gallery, even if Framer Motion's exit animation stalls and
  // AlbumGallery is not unmounted on time.
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

  // Recently visited — filtered to exclude albums the user owns
  const recentAll = user ? getRecentAlbums(user.id) : [];
  const ownIds = new Set(albums.map((a) => a.id));
  const recent = recentAll.filter((a) => !ownIds.has(a.id));

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
    // Reset dragProgressMV BEFORE React commits the new galleryAlbum state.
    // If we did this in a useEffect, the previous gallery could have already
    // triggered a one-frame reflow with the stale value. By setting it on
    // the same tick as setGalleryAlbum, the open sequence begins cleanly
    // with pageScaleMV = baseScaleMV = 0.94.
    dragProgressMV.set(0);
    setGalleryKey((k) => k + 1);
    setGalleryAlbum({ album: album, photoId: photo?.id });
  }, [dragProgressMV]);

  const handleGalleryClose = useCallback(() => {
    // Pin dragProgressMV at 1.0 BEFORE React commits the galleryAlbum=null
    // update. This collapses
    //   pageScaleMV = baseScaleMV + (1 - baseScaleMV) * dragProgressMV
    // to a constant 1.0 for the entire Shared Element Transition — so the
    // album card's natural rect (the SET's destination) stays stable while
    // baseScaleMV unzooms back toward 1 over its own 0.36s. Without this
    // pin, the destination rect wobbles every frame and the SET path
    // flickers visibly.
    //
    // AlbumGallery.onWrapperTouchEnd (dismiss branch) also calls
    // dragProgressMV.set(1) — this callback is the defensive belt-and-
    // suspenders for any OTHER close path that might be added later.
    dragProgressMV.set(1);
    setGalleryAlbum(null);
  }, [dragProgressMV]);

  if (loading) return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <SkeletonBox className="h-8 w-32" />
      </div>
      <AlbumGridSkeleton count={4} />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Page content — scales down subtly when gallery is open for depth effect,
          and unzooms back toward 1.0 as the user drags the photo down. */}
      <motion.div
        style={{
          scale: pageScaleMV,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        {/* Recently Visited — toggleable */}
        {recent.length > 0 && (
          <AnimatePresence>
            {showRecent && (
              <motion.section
                id="recent-section"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="mb-10"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={15} className="text-gray-400" />
                  <h2 className="font-semibold text-sm text-gray-500 dark:text-gray-400">
                    {t("recentlyVisited")}
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {recent.slice(0, 4).map((album, i) => (
                    <RecentAlbumCard key={album.id} album={album} index={i} />
                  ))}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        )}

        {/* My Albums */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-3">
            <h1 className="font-display font-bold text-2xl truncate">{t("myAlbums")}</h1>
          </div>
          <div className="flex items-center gap-2">
            {recent.length > 0 && (
              <button
                onClick={() => setShowRecent(!showRecent)}
                className={`flex items-center justify-center w-10 h-10 flex-shrink-0 focus:outline-none
                           ${showRecent
                             ? "text-primary-500"
                             : "text-gray-400"}`}
                title={t("recentlyVisited")}
              >
                <Clock size={22} />
              </button>
            )}
            {albums.length > 0 && (
              <Link
                to="/create"
                className="btn-primary flex-shrink-0 w-10 h-10 p-0"
                aria-label={t("createAlbum")}
                title={t("createAlbum")}
              >
                <Plus size={20} strokeWidth={2.5} />
              </Link>
            )}
          </div>
        </motion.div>

        {albums.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <div className="w-16 h-16 bg-primary-50 dark:bg-primary-900/20 rounded-full
                            flex items-center justify-center mx-auto mb-4">
              <Image size={28} className="text-primary-300" />
            </div>
            <p className="text-gray-400 text-sm mb-5">{t("noAlbums")}</p>
            <Link to="/create" className="btn-primary inline-flex">
              <Plus size={16} /> {t("createAlbum")}
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 gap-4 mb-10">
            {albums.map((album, i) => (
              <AlbumCard key={album.id} album={album} onDelete={handleDelete} index={i} onPhotoClick={handlePhotoClick} />
            ))}
          </div>
        )}
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
