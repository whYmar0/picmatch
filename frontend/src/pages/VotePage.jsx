/**
 * VotePage.jsx — v5.1
 *
 * BLACK SCREEN FIX:
 *  Root cause: `stackKey` bump triggered full remount of AnimatePresence + SwipeCards.
 *  During the remount frame, `stackPhotos` briefly returned [] because React had
 *  unmounted all children, causing the bg-black card container to show as a black screen.
 *  Also: if getMyVotes() threw, the catch was silent and currentPhotoId might not get set.
 *
 *  Fix:
 *   1. Removed stackKey mechanism entirely.
 *   2. On thumbnail jump: call topCardRef.current.resetPosition() to reset animation
 *      state on the existing card, no remount needed.
 *   3. Added resetPosition() to SwipeCard's useImperativeHandle.
 *   4. getMyVotes is wrapped in its own try/catch that never blocks currentPhotoId.
 *   5. Added an explicit "no photos" guard that shows a friendly message.
 *
 * LARGER CARDS:
 *  Card container now uses max-h-[58vh] with auto aspect-ratio so images fill more
 *  of the viewport height on mobile.
 */
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate }  from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast                       from "react-hot-toast";
import { albumsApi, votesApi }     from "../api";
import { useLang }                 from "../contexts/LangContext";
import SwipeCard, { SwipeButtons } from "../components/SwipeCard";
import ImageLightbox               from "../components/ImageLightbox";
import LoadingSpinner              from "../components/LoadingSpinner";
import { ThumbsUp, ThumbsDown }   from "lucide-react";

const STACK_SIZE = 3;
const DESC_LIMIT = 100;

export default function VotePage() {
  const { inviteCode } = useParams();
  const navigate       = useNavigate();
  const { t }          = useLang();
  const thumbStripRef  = useRef(null);

  const [album,          setAlbum]          = useState(null);
  const [allPhotos,      setAllPhotos]      = useState([]);
  const [votesMap,       setVotesMap]       = useState({});
  const [currentPhotoId, setCurrentPhotoId] = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [finished,       setFinished]       = useState(false);
  const [voting,         setVoting]         = useState(false);
  const [descExpanded,   setDescExpanded]   = useState(false);
  const [lightbox,       setLightbox]       = useState(null);
  // Error state for album-not-found
  const [albumError,     setAlbumError]     = useState(null);

  const votingRef    = useRef(false);
  const votesMapRef  = useRef({});
  const allPhotosRef = useRef([]);
  const topCardRef   = useRef(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setAlbumError(null);
      try {
        // Step 1: fetch album — if this fails, show error, don't show black screen
        let albumData, sessionData;
        try {
          [albumData, sessionData] = await Promise.all([
            albumsApi.getByInviteCode(inviteCode),
            votesApi.getSession(inviteCode),
          ]);
        } catch (err) {
          if (!cancelled) setAlbumError(err.message);
          return;
        }

        if (cancelled) return;

        const photos = albumData.photos || [];
        allPhotosRef.current = photos;
        setAllPhotos(photos);
        setAlbum(albumData);

        // Step 2: fetch existing votes — isolated try/catch, NEVER blocks rendering
        let map = {};
        try {
          if (sessionData.voted_photo_ids?.length > 0) {
            const myVotes = await votesApi.getMyVotes(albumData.id);
            myVotes.forEach((v) => { map[String(v.photo_id)] = v.is_like; });
          }
        } catch {
          // Non-critical: if this fails, we just start from photo 0 with no prior votes
        }

        if (cancelled) return;

        votesMapRef.current = map;
        setVotesMap(map);

        if (photos.length === 0) {
          // Album exists but has no photos — show finished state
          setFinished(true);
          return;
        }

        const first = photos.find((p) => !(String(p.id) in map));
        if (!first) {
          // All photos already voted on
          setFinished(true);
        } else {
          setCurrentPhotoId(String(first.id));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [inviteCode]);

  // Auto-scroll thumbnail strip
  useEffect(() => {
    if (!currentPhotoId || !thumbStripRef.current) return;
    const idx   = allPhotos.findIndex((p) => String(p.id) === currentPhotoId);
    if (idx < 0) return;
    const strip = thumbStripRef.current;
    const thumbW = 68; // w-16 (64px) + gap (4px)
    strip.scrollTo({
      left: Math.max(0, idx * thumbW - strip.clientWidth / 2 + thumbW / 2),
      behavior: "smooth",
    });
  }, [currentPhotoId, allPhotos]);

  // ── Vote handler ────────────────────────────────────────────────────────────
  const handleSwipe = useCallback(async (photoId, isLike) => {
    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    // Safety unlock after 3s regardless of outcome
    const safetyTimer = setTimeout(() => {
      votingRef.current = false;
      setVoting(false);
    }, 3000);

    const pid    = String(photoId);
    const newMap = { ...votesMapRef.current, [pid]: isLike };
    votesMapRef.current = newMap;
    setVotesMap(newMap);

    try { await votesApi.castVote(photoId, isLike); }
    catch (err) {
      if (!err.message?.includes("timeout")) toast.error(err.message, { duration: 2000 });
    }

    // Next unvoted AFTER current position, then wrap
    const photos = allPhotosRef.current;
    const curIdx = photos.findIndex((p) => String(p.id) === pid);
    const nextUnvoted =
      photos.slice(curIdx + 1).find((p) => !(String(p.id) in newMap)) ||
      photos.find((p) => !(String(p.id) in newMap));

    clearTimeout(safetyTimer);
    votingRef.current = false;
    setVoting(false);

    if (nextUnvoted) {
      setCurrentPhotoId(String(nextUnvoted.id));
    } else {
      setFinished(true);
    }
  }, []);

  // ── Thumbnail jump — NO remount, just reset card position ──────────────────
  const jumpToPhoto = useCallback((photo) => {
    const pid = String(photo.id);
    if (pid === currentPhotoId) return;
    setCurrentPhotoId(pid);
    // Reset the top card's animation state instead of remounting
    // This prevents the black flash that occurred with stackKey remounts
    requestAnimationFrame(() => {
      topCardRef.current?.resetPosition?.();
    });
  }, [currentPhotoId]);

  // ── Button trigger ──────────────────────────────────────────────────────────
  const triggerSwipe = useCallback((isLike) => {
    if (votingRef.current) return;
    if (topCardRef.current?.swipeTo) {
      topCardRef.current.swipeTo(isLike);
    } else {
      const photo = allPhotosRef.current.find((p) => String(p.id) === currentPhotoId);
      if (photo) handleSwipe(photo.id, isLike);
    }
  }, [currentPhotoId, handleSwipe]);

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (loading) return <LoadingSpinner fullscreen />;

  // Album not found / access denied — friendly error, not black screen
  if (albumError || !album) return (
    <div className="h-[100dvh] flex items-center justify-center text-center px-6
                    bg-surface-light dark:bg-surface-dark">
      <div>
        <p className="text-5xl mb-4">🔗</p>
        <h2 className="font-display font-bold text-2xl mb-2">{t("errorAlbumNotFound")}</h2>
        {albumError && <p className="text-gray-400 text-sm mb-4">{albumError}</p>}
        <button onClick={() => navigate("/")} className="btn-primary mt-2">
          Go Home
        </button>
      </div>
    </div>
  );

  if (finished) return (
    <div className="h-[100dvh] flex items-center justify-center px-4
                    bg-surface-light dark:bg-surface-dark">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
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

  // ── Derived ─────────────────────────────────────────────────────────────────
  const currentPhoto = allPhotos.find((p) => String(p.id) === currentPhotoId);
  const currentIdx   = allPhotos.findIndex((p) => String(p.id) === currentPhotoId);
  const total        = allPhotos.length;
  const progress     = total > 0 ? (Object.keys(votesMap).length / total) * 100 : 0;

  const stackPhotos = useMemo(() => {
    if (!currentPhoto) return [];
    const rest = allPhotos
      .filter((p) => !(String(p.id) in votesMap) && String(p.id) !== currentPhotoId)
      .slice(0, STACK_SIZE - 1);
    return [currentPhoto, ...rest];
  }, [currentPhoto, allPhotos, votesMap, currentPhotoId]);

  const desc     = album.description || "";
  const descLong = desc.length > DESC_LIMIT;
  const shownDesc = descLong && !descExpanded ? desc.slice(0, DESC_LIMIT) + "…" : desc;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="h-[100dvh] flex flex-col overflow-hidden bg-surface-light dark:bg-surface-dark">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <motion.div layout className="w-full max-w-[380px] mx-auto px-4 pt-3 flex-shrink-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="font-display font-bold text-xl leading-tight truncate flex-1">
              {album.title}
            </h2>
            <span className="badge-orange flex-shrink-0 font-mono font-bold text-sm mt-0.5">
              {currentIdx + 1}/{total}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-1">by {album.creator?.username}</p>

          <AnimatePresence initial={false}>
            {desc && (
              <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="overflow-hidden">
                <motion.div layout>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    {shownDesc}
                    {descLong && (
                      <button
                        onClick={() => setDescExpanded(!descExpanded)}
                        className="ml-1.5 text-primary-500 font-semibold hover:text-primary-600 transition-colors"
                      >
                        {descExpanded ? t("seeLess") : t("seeMore")}
                      </button>
                    )}
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Progress bar */}
          <div className="h-1.5 bg-border-light dark:bg-border-dark rounded-full overflow-hidden mt-2 mb-2">
            <motion.div
              className="h-full bg-primary-400 rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>
        </motion.div>

        {/* ── Thumbnail strip ─────────────────────────────────────────────── */}
        <div
          ref={thumbStripRef}
          className="flex-shrink-0 w-full max-w-[380px] mx-auto pb-2 px-4"
          style={{ overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <div className="flex gap-1">
            {allPhotos.map((photo) => {
              const pid     = String(photo.id);
              const isCur   = pid === currentPhotoId;
              const reaction = votesMap[pid];
              const hasVote  = pid in votesMap;

              return (
                <motion.button
                  key={pid}
                  onClick={() => jumpToPhoto(photo)}
                  whileTap={{ scale: 0.9 }}
                  className={`relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden
                              transition-all duration-150
                              ${isCur
                                ? "ring-2 ring-primary-400 ring-offset-1 ring-offset-surface-light dark:ring-offset-surface-dark scale-105"
                                : "opacity-75 hover:opacity-100 hover:scale-105"
                              }`}
                >
                  <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
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
        </div>

        {/* ── Card stack ─────────────────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center px-4 min-h-0">
          {/*
            Card sizing: fills available height up to a max.
            w-full with max-w keeps it centred.
            aspectRatio 3/4 gives portrait framing.
            No stackKey here — jumping resets the card via resetPosition() instead.
          */}
          <div
            className="relative w-full"
            style={{
              maxWidth: "340px",
              height: "min(58vh, 480px)",
            }}
          >
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

        {/* Hint */}
        <p className="text-center text-[11px] text-gray-400 py-1 flex-shrink-0">
          {t("swipeHint")}
        </p>

        {/* ── Buttons ──────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 pb-6 pt-1">
          <SwipeButtons
            onLike={()   => triggerSwipe(true)}
            onDislike={() => triggerSwipe(false)}
            disabled={voting || !currentPhoto}
          />
        </div>
      </div>

      <ImageLightbox
        open={!!lightbox}
        src={lightbox?.url}
        alt={lightbox?.filename}
        onClose={() => setLightbox(null)}
      />
    </>
  );
}
