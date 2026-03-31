/**
 * pages/VotePage.jsx — Swipe voting page
 *
 * BUGFIXES:
 *  - topCardRef now correctly calls card.swipeTo() via useImperativeHandle
 *  - currentIndex tracked in a ref (not just state) to avoid stale closure
 *    when handleSwipe is called from async card animation callbacks
 *  - voting lock uses ref + state so fast taps can't double-submit
 *  - vote API failure shows error BUT still advances (UX: don't strand voter)
 *  - Mobile: uses h-[100dvh] to handle iOS Safari bottom bar
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { albumsApi, votesApi } from "../api";
import { useLang } from "../contexts/LangContext";
import SwipeCard, { SwipeButtons } from "../components/SwipeCard";
import LoadingSpinner from "../components/LoadingSpinner";

export default function VotePage() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();

  const [album,        setAlbum]        = useState(null);
  const [photos,       setPhotos]        = useState([]);   // unvoted photos only
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [finished,     setFinished]     = useState(false);
  const [voting,       setVoting]        = useState(false);

  // Ref mirrors currentIndex so async callbacks always see the latest value
  const indexRef  = useRef(0);
  const photosRef = useRef([]);
  const votingRef = useRef(false);        // guards against double-submit
  const topCardRef = useRef(null);        // exposes swipeTo() from SwipeCard

  // ── Load album + resume session ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [albumData, sessionData] = await Promise.all([
          albumsApi.getByInviteCode(inviteCode),
          votesApi.getSession(inviteCode),
        ]);
        if (cancelled) return;

        setAlbum(albumData);

        const votedSet = new Set(sessionData.voted_photo_ids.map(String));
        const unvoted  = (albumData.photos || []).filter(
          (p) => !votedSet.has(String(p.id))
        );

        photosRef.current = unvoted;
        setPhotos(unvoted);
        indexRef.current = 0;
        setCurrentIndex(0);

        if (unvoted.length === 0) setFinished(true);
      } catch (err) {
        if (!cancelled) toast.error(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [inviteCode]);

  // ── Core vote + advance logic ────────────────────────────────────────────
  const handleSwipe = useCallback(async (photoId, isLike) => {
    // Guard: prevent concurrent swipes
    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);

    // Fire the vote — silently advance on network error (UX: don't strand user)
    try {
      await votesApi.castVote(photoId, isLike);
    } catch (err) {
      // Only show error for genuine 4xx/5xx (not just slow network)
      if (err.message && !err.message.includes("timeout")) {
        toast.error(err.message, { duration: 2500 });
      }
    }

    // Advance using ref to avoid stale closure
    const next = indexRef.current + 1;
    indexRef.current = next;

    if (next >= photosRef.current.length) {
      setFinished(true);
    } else {
      setCurrentIndex(next);
    }

    votingRef.current = false;
    setVoting(false);
  }, []); // no deps needed — reads from refs

  // ── Button press: trigger animated swipe on the card ────────────────────
  const triggerSwipe = useCallback((isLike) => {
    if (votingRef.current) return;
    const card = topCardRef.current;
    if (card?.swipeTo) {
      // Card animates away and calls onSwipe → handleSwipe internally
      card.swipeTo(isLike);
    } else {
      // Fallback if ref isn't attached yet
      const photo = photosRef.current[indexRef.current];
      if (photo) handleSwipe(photo.id, isLike);
    }
  }, [handleSwipe]);

  // ── Render guards ────────────────────────────────────────────────────────
  if (loading) return <LoadingSpinner fullscreen />;

  if (!album) return (
    <div className="h-[100dvh] flex items-center justify-center text-center px-6">
      <div>
        <p className="text-5xl mb-4">😕</p>
        <h2 className="font-display font-bold text-2xl mb-2">{t("errorAlbumNotFound")}</h2>
        <button onClick={() => navigate("/")} className="btn-primary mt-4">
          Go Home
        </button>
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
        <motion.span
          animate={{ y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
          className="text-6xl block mb-4"
        >🎉</motion.span>
        <h2 className="font-display font-bold text-2xl mb-2">{t("allDone")}</h2>
        <p className="text-gray-400 text-sm mb-6">{t("allDoneSubtitle")}</p>
        <button onClick={() => navigate("/")} className="btn-primary w-full">
          {t("viewResults")}
        </button>
      </motion.div>
    </div>
  );

  // ── Main UI ──────────────────────────────────────────────────────────────
  const STACK_VISIBLE = 3;
  const visiblePhotos = photos.slice(currentIndex, currentIndex + STACK_VISIBLE);
  const remaining     = photos.length - currentIndex;
  const progress      = photos.length > 0
    ? (currentIndex / photos.length) * 100
    : 0;

  return (
    // h-[100dvh] handles iOS Safari bottom bar (prevents layout shift)
    <div className="h-[100dvh] flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="w-full max-w-lg mx-auto px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <div className="min-w-0">
            <h2 className="font-semibold text-base truncate">{album.title}</h2>
            <p className="text-xs text-gray-400">@{album.creator?.username}</p>
          </div>
          <span className="badge-orange ml-3 flex-shrink-0">
            {remaining} {t("swipeRemaining")}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-border-light dark:bg-border-dark rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary-400 rounded-full"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* ── Card stack — fixed height fills available space ── */}
      <div className="flex-1 flex items-center justify-center px-5 min-h-0">
        {/*
          The container has a fixed aspect ratio so it never jumps when
          images load. max-w keeps it phone-sized on tablets too.
        */}
        <div
          className="relative w-full max-w-[340px]"
          style={{ aspectRatio: "3 / 4" }}
        >
          <AnimatePresence mode="sync">
            {[...visiblePhotos].reverse().map((photo, revIdx) => {
              const stackIdx = visiblePhotos.length - 1 - revIdx;
              const isTop    = stackIdx === 0;
              return (
                <SwipeCard
                  key={photo.id}
                  ref={isTop ? topCardRef : null}
                  photo={photo}
                  isTop={isTop}
                  stackIndex={stackIdx}
                  onSwipe={handleSwipe}
                />
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Hint ── */}
      <p className="text-center text-xs text-gray-400 py-1.5 flex-shrink-0">
        {t("swipeHint")}
      </p>

      {/* ── Buttons ── */}
      <div className="pb-6 pt-1 flex-shrink-0">
        <SwipeButtons
          onLike={()    => triggerSwipe(true)}
          onDislike={()  => triggerSwipe(false)}
          disabled={voting}
        />
      </div>
    </div>
  );
}
