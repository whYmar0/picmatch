/**
 * pages/VotePage.jsx — Complete voting experience
 *
 * NEW FEATURES:
 *  1. Thumbnail strip — horizontal scroll row above cards; click to jump
 *  2. Progress counter n/m (e.g. "3/12")
 *  3. Expandable album description with "See more / See less"
 *  4. Full-screen lightbox on image tap
 *  5. Buttons directly below cards, both equal size (w-16 h-16)
 *
 * DATA MODEL (rewritten):
 *  - allPhotos  : all album photos (for thumbnail strip + jump)
 *  - votesMap   : { [photoId]: isLike } — grows as user votes
 *  - currentPhotoId: which photo is on top right now
 *  Jump via thumbnail → set currentPhotoId → stack re-renders
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { albumsApi, votesApi } from "../api";
import { useLang } from "../contexts/LangContext";
import SwipeCard, { SwipeButtons } from "../components/SwipeCard";
import ImageLightbox from "../components/ImageLightbox";
import LoadingSpinner from "../components/LoadingSpinner";
import { ThumbsUp, ThumbsDown } from "lucide-react";

// DESC_LIMIT: chars before "See more" appears
const DESC_LIMIT = 90;
const STACK_SIZE = 3;

export default function VotePage() {
  const { inviteCode } = useParams();
  const navigate       = useNavigate();
  const { t }          = useLang();
  const thumbStripRef  = useRef(null);

  // ── Data ──────────────────────────────────────────────────────────────────
  const [album,          setAlbum]          = useState(null);
  const [allPhotos,      setAllPhotos]      = useState([]);   // ALL photos
  const [votesMap,       setVotesMap]       = useState({});   // id → isLike
  const [currentPhotoId, setCurrentPhotoId] = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [finished,       setFinished]       = useState(false);
  const [voting,         setVoting]         = useState(false);
  const [descExpanded,   setDescExpanded]   = useState(false);
  const [lightbox,       setLightbox]       = useState(null); // null | PhotoObj

  const votingRef    = useRef(false);
  const votesMapRef  = useRef({});   // mirrors state for sync access in callbacks
  const allPhotosRef = useRef([]);
  const topCardRef   = useRef(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [albumData, sessionData] = await Promise.all([
          albumsApi.getByInviteCode(inviteCode),
          votesApi.getSession(inviteCode),
        ]);
        if (cancelled) return;

        const photos = albumData.photos || [];
        allPhotosRef.current = photos;
        setAllPhotos(photos);
        setAlbum(albumData);

        // Pre-populate votesMap from existing session votes
        // We only have IDs from session; fetch full votes to get reactions
        let initialVotesMap = {};
        if (sessionData.voted_photo_ids?.length > 0) {
          try {
            const myVotes = await votesApi.getMyVotes(albumData.id);
            myVotes.forEach((v) => {
              initialVotesMap[String(v.photo_id)] = v.is_like;
            });
          } catch { /* non-critical */ }
        }

        votesMapRef.current = initialVotesMap;
        setVotesMap(initialVotesMap);

        // Find first unvoted photo to start at
        const firstUnvoted = photos.find(
          (p) => !(String(p.id) in initialVotesMap)
        );

        if (!firstUnvoted && photos.length > 0) {
          setFinished(true);
        } else if (firstUnvoted) {
          setCurrentPhotoId(String(firstUnvoted.id));
        }
      } catch (err) {
        if (!cancelled) toast.error(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [inviteCode]);

  // Scroll thumbnail strip to keep current photo visible
  useEffect(() => {
    if (!currentPhotoId || !thumbStripRef.current) return;
    const idx = allPhotos.findIndex((p) => String(p.id) === currentPhotoId);
    if (idx < 0) return;
    const strip = thumbStripRef.current;
    const thumbW = 52; // w-12 = 48px + gap-1 = 4px
    strip.scrollTo({ left: Math.max(0, idx * thumbW - strip.clientWidth / 2 + thumbW / 2),
                    behavior: "smooth" });
  }, [currentPhotoId, allPhotos]);

  // ── Vote handler ──────────────────────────────────────────────────────────
  const handleSwipe = useCallback(async (photoId, isLike) => {
    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    const photoIdStr = String(photoId);

    // Optimistic update
    const newMap = { ...votesMapRef.current, [photoIdStr]: isLike };
    votesMapRef.current = newMap;
    setVotesMap(newMap);

    try { await votesApi.castVote(photoId, isLike); }
    catch (err) {
      if (!err.message?.includes("timeout")) toast.error(err.message, { duration: 2000 });
    }

    // Advance to next unvoted photo
    const photos = allPhotosRef.current;
    const nextUnvoted = photos.find((p) => !(String(p.id) in newMap));

    if (nextUnvoted) {
      setCurrentPhotoId(String(nextUnvoted.id));
    } else {
      setFinished(true);
    }

    votingRef.current = false;
    setVoting(false);
  }, []);

  // ── Thumbnail click — jump to any photo (re-vote allowed) ─────────────────
  const jumpToPhoto = useCallback((photo) => {
    setCurrentPhotoId(String(photo.id));
  }, []);

  // ── Button swipe ──────────────────────────────────────────────────────────
  const triggerSwipe = useCallback((isLike) => {
    if (votingRef.current) return;
    const card = topCardRef.current;
    if (card?.swipeTo) {
      card.swipeTo(isLike);
    } else {
      const photo = allPhotosRef.current.find((p) => String(p.id) === currentPhotoId);
      if (photo) handleSwipe(photo.id, isLike);
    }
  }, [currentPhotoId, handleSwipe]);

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) return <LoadingSpinner fullscreen />;

  if (!album) return (
    <div className="h-[100dvh] flex items-center justify-center text-center px-6">
      <div>
        <p className="text-5xl mb-4">😕</p>
        <h2 className="font-display font-bold text-2xl mb-2">{t("errorAlbumNotFound")}</h2>
        <button onClick={() => navigate("/")} className="btn-primary mt-4">Go Home</button>
      </div>
    </div>
  );

  if (finished) return (
    <div className="h-[100dvh] flex items-center justify-center px-4">
      <motion.div
        initial={{ scale: 0.82, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        className="card p-10 text-center max-w-xs w-full mx-auto"
      >
        <motion.span animate={{ y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
          className="text-6xl block mb-4">🎉</motion.span>
        <h2 className="font-display font-bold text-2xl mb-2">{t("allDone")}</h2>
        <p className="text-gray-400 text-sm mb-6">{t("allDoneSubtitle")}</p>
        <button onClick={() => navigate("/")} className="btn-primary w-full">
          {t("viewResults")}
        </button>
      </motion.div>
    </div>
  );

  // ── Derived values ────────────────────────────────────────────────────────
  const currentPhoto = allPhotos.find((p) => String(p.id) === currentPhotoId);
  const currentIdx   = allPhotos.findIndex((p) => String(p.id) === currentPhotoId);
  const total        = allPhotos.length;
  const voteCount    = Object.keys(votesMap).length;
  const progress     = total > 0 ? (voteCount / total) * 100 : 0;

  // Build the visible card stack: current photo + next 2 unvoted
  const stackPhotos = currentPhoto ? (() => {
    const rest = allPhotos
      .filter((p) => !(String(p.id) in votesMap) && String(p.id) !== currentPhotoId)
      .slice(0, STACK_SIZE - 1);
    return [currentPhoto, ...rest];
  })() : [];

  const desc = album.description || "";
  const isDescLong = desc.length > DESC_LIMIT;
  const visibleDesc = isDescLong && !descExpanded
    ? desc.slice(0, DESC_LIMIT) + "…"
    : desc;

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <>
      <div className="h-[100dvh] flex flex-col overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="w-full max-w-lg mx-auto px-4 pt-3 pb-2 flex-shrink-0 space-y-1.5">

          {/* Title row + n/m counter */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-semibold text-base truncate">{album.title}</h2>
              <p className="text-xs text-gray-400">@{album.creator?.username}</p>
            </div>
            {/* n/m counter — replaces "n left" */}
            <span className="badge-orange flex-shrink-0 font-mono font-bold text-sm">
              {Math.min(currentIdx + 1, total)}/{total}
            </span>
          </div>

          {/* Expandable description */}
          {desc && (
            <div className="text-xs text-gray-400 leading-relaxed">
              <span>{visibleDesc}</span>
              {isDescLong && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="ml-1.5 text-primary-500 font-semibold hover:text-primary-600
                             transition-colors"
                >
                  {descExpanded ? t("seeLess") : t("seeMore")}
                </button>
              )}
            </div>
          )}

          {/* Progress bar */}
          <div className="h-1.5 bg-border-light dark:bg-border-dark rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary-400 rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* ── Thumbnail strip ─────────────────────────────────────────────── */}
        <div
          ref={thumbStripRef}
          className="flex-shrink-0 flex gap-1.5 overflow-x-auto px-4 pb-2
                     scrollbar-none"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {allPhotos.map((photo) => {
            const pid       = String(photo.id);
            const isCurrent = pid === currentPhotoId;
            const reaction  = votesMap[pid]; // undefined | true | false
            const hasVote   = pid in votesMap;

            return (
              <motion.button
                key={pid}
                onClick={() => jumpToPhoto(photo)}
                whileTap={{ scale: 0.92 }}
                className={`relative flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden
                            transition-all duration-150
                            ${isCurrent
                              ? "ring-2 ring-primary-400 ring-offset-1 ring-offset-surface-light dark:ring-offset-surface-dark"
                              : "opacity-70 hover:opacity-100"
                            }`}
              >
                <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />

                {/* Vote reaction indicator */}
                {hasVote && (
                  <div className={`absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full
                                   flex items-center justify-center
                                   ${reaction ? "bg-green-500" : "bg-red-400"}`}>
                    {reaction
                      ? <ThumbsUp size={8} className="text-white" />
                      : <ThumbsDown size={8} className="text-white" />
                    }
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* ── Card stack ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center px-5 min-h-0">
          <div className="relative w-full max-w-[320px]" style={{ aspectRatio: "3/4" }}>
            <AnimatePresence mode="sync">
              {[...stackPhotos].reverse().map((photo, revIdx) => {
                const stackIdx = stackPhotos.length - 1 - revIdx;
                const isTop    = stackIdx === 0;
                return (
                  <SwipeCard
                    key={photo.id}
                    ref={isTop ? topCardRef : null}
                    photo={photo}
                    isTop={isTop}
                    stackIndex={stackIdx}
                    onSwipe={handleSwipe}
                    onImageClick={(p) => setLightbox(p)}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Hint ────────────────────────────────────────────────────────── */}
        <p className="text-center text-[11px] text-gray-400 pt-1 pb-1 flex-shrink-0">
          {t("swipeHint")}
        </p>

        {/* ── Buttons — directly below cards, equal size ──────────────────── */}
        <div className="pb-5 pt-1 flex-shrink-0">
          <SwipeButtons
            onLike={()    => triggerSwipe(true)}
            onDislike={()  => triggerSwipe(false)}
            disabled={voting || !currentPhoto}
          />
        </div>
      </div>

      {/* ── Full-screen lightbox ─────────────────────────────────────────── */}
      <ImageLightbox
        open={!!lightbox}
        src={lightbox?.url}
        alt={lightbox?.filename}
        onClose={() => setLightbox(null)}
      />
    </>
  );
}
