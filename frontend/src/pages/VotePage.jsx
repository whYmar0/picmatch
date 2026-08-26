/**
 * VotePage.jsx — v5.3
 *
 * CHANGES:
 *  1. Header: removed "by <author>" line → replaced with author avatar + username
 *     in large format at the very top of the header
 *  2. Title & description use `font-sans` (site font) — same as rest of site
 *     Title/desc stay within max content width, "See more" smoothly pushes content down
 *  3. Cards: 3:4 aspect ratio, larger size, stacked directly on top of each other
 *     (no staircase/ladder offset — all cards share the same Y position)
 */
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { albumsApi, votesApi } from "../api";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";
import SwipeCard, { SwipeButtons } from "../components/SwipeCard";
import HeartBurst from "../components/HeartBurst";
import { VotePageSkeleton } from "../components/Skeleton";
import { LogIn, MessageCircle, Check, Play } from "lucide-react";
import FilledHeart from "../components/FilledHeart";
import BrokenHeart from "../components/BrokenHeart";
import BottomSheet from "../components/BottomSheet";
import { PhotoCommentsList, CommentInput } from "../components/PhotoComments";
import { isVideo } from "../utils/media";

const STACK_SIZE = 3;
const DESC_LIMIT = 100;
const TITLE_LIMIT = 40;
const MAX_ACTIVE_HEARTS = 5;

// ── Small reusable avatar ──────────────────────────────────────────────────────
function AuthorAvatar({ user, size = 36 }) {
  if (!user) return null;
  const initial = user.username?.[0]?.toUpperCase() ?? "?";
  return (
    <div
      className="rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center
                 bg-primary-100 dark:bg-primary-900/40 text-primary-600 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {user.avatar_url
        ? <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
        : initial
      }
    </div>
  );
}

export default function VotePage() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLang();
  const { user, loading: authLoading } = useAuth();
  const thumbStripRef = useRef(null);

  const [album, setAlbum] = useState(null);
  const [allPhotos, setAllPhotos] = useState([]);
  const [votesMap, setVotesMap] = useState({});
  const [currentPhotoId, setCurrentPhotoId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [voting, setVoting] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [albumError, setAlbumError] = useState(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [commentSheet, setCommentSheet] = useState(null); // null | photo object
  const [hearts, setHearts] = useState([]); // active heart burst effects
  // ── Comment split-layout state ────────────────────────────────────────────
  const [replyTarget, setReplyTarget] = useState(null);
  const replyTriggerRef = useRef({});
  const listApiRef = useRef(null);
  replyTriggerRef.current._onReply = (comment, root) => {
    setReplyTarget({
      id: root ? root.id : comment.id,
      author: comment.author
    });
  };
  const handleCommentCreated = useCallback((comment, parentId) => {
    listApiRef.current?.addComment?.(comment, parentId);
  }, []);

  const votingRef = useRef(false);
  const votesMapRef = useRef({});
  const allPhotosRef = useRef([]);
  const topCardRef = useRef(null);
  const cardStackRef = useRef(null); // card stack container for heart coordinate math

  const shouldLoad = !authLoading;

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setAlbumError(null);
      setNeedsAuth(false);
      try {
        let albumData, sessionData;
        try {
          [albumData, sessionData] = await Promise.all([
            albumsApi.getByInviteCode(inviteCode),
            user
              ? votesApi.getSession(inviteCode)
              : Promise.resolve({ voted_photo_ids: [] }),
          ]);
        } catch (err) {
          if (cancelled) return;
          if (
            err.message?.includes("Session expired") ||
            err.message?.includes("401") ||
            err.message?.includes("credentials")
          ) {
            setNeedsAuth(true);
          } else {
            setAlbumError(err.message);
          }
          return;
        }

        if (cancelled) return;

        const photos = albumData.photos || [];
        allPhotosRef.current = photos;
        setAllPhotos(photos);
        setAlbum(albumData);

        // Fire myVotes in parallel with recording visit — no sequential wait
        let myVotesPromise = Promise.resolve([]);
        if (sessionData.voted_photo_ids?.length > 0) {
          myVotesPromise = votesApi.getMyVotes(albumData.id).catch(() => []);
        }

        // Record visit for the "Recently Visited" feature on Dashboard
        if (user?.id) {
          import("../hooks/useRecentAlbums.js").then(({ recordAlbumVisit }) => {
            recordAlbumVisit(user.id, {
              id: albumData.id,
              title: albumData.title,
              coverUrl: photos[0]?.url ?? null,
              creatorUsername: albumData.creator?.username ?? null,
              is_public: albumData.is_public,
              hasAccess: albumData.is_public !== false,
            });
          });
        }

        let map = {};
        const myVotes = await myVotesPromise;
        myVotes.forEach((v) => { map[String(v.photo_id)] = v.is_like; });

        if (cancelled) return;

        votesMapRef.current = map;
        setVotesMap(map);

        if (photos.length === 0) { setFinished(true); return; }

        const first = photos.find((p) => !(String(p.id) in map));
        if (!first) setFinished(true);
        else setCurrentPhotoId(String(first.id));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [inviteCode, shouldLoad, user]);

  // Auto-scroll thumbnail strip
  useEffect(() => {
    if (!currentPhotoId || !thumbStripRef.current) return;
    const idx = allPhotos.findIndex((p) => String(p.id) === currentPhotoId);
    if (idx < 0) return;
    const strip = thumbStripRef.current;
    const thumbW = 68;
    strip.scrollTo({
      left: Math.max(0, idx * thumbW - strip.clientWidth / 2 + thumbW / 2),
      behavior: "smooth",
    });
  }, [currentPhotoId, allPhotos]);

  // ── Vote handler ────────────────────────────────────────────────────────────
  const handleSwipe = useCallback((photoId, isLike) => {
    if (votingRef.current) return;
    votingRef.current = true;
    setVoting(true);
    const safetyTimer = setTimeout(() => {
      votingRef.current = false;
      setVoting(false);
    }, 3000);

    const pid = String(photoId);
    const newMap = { ...votesMapRef.current, [pid]: isLike };
    votesMapRef.current = newMap;
    setVotesMap(newMap);

    // Advance immediately. The API request runs in the background so neither
    // network latency nor the button path delays the next card.
    const photos = allPhotosRef.current;
    const curIdx = photos.findIndex((p) => String(p.id) === pid);
    const nextUnvoted =
      photos.slice(curIdx + 1).find((p) => !(String(p.id) in newMap)) ||
      photos.find((p) => !(String(p.id) in newMap));

    if (nextUnvoted) setCurrentPhotoId(String(nextUnvoted.id));
    else setFinished(true);
    votesApi.castVote(photoId, isLike)
      .catch((err) => {
        if (!err.message?.includes("timeout")) toast.error(err.message, { duration: 2000 });
      })
      .finally(() => {
        clearTimeout(safetyTimer);
        votingRef.current = false;
        setVoting(false);
      });
  }, []);

  // ── Thumbnail jump ──────────────────────────────────────────────────────────
  const jumpToPhoto = useCallback((photo) => {
    const pid = String(photo.id);
    if (pid === currentPhotoId) return;
    setCurrentPhotoId(pid);
    requestAnimationFrame(() => { topCardRef.current?.resetPosition?.(); });
  }, [currentPhotoId]);

  // ── Button trigger ──────────────────────────────────────────────────────────
  const triggerSwipe = useCallback((isLike) => {
    if (votingRef.current) return;
    const photo = allPhotosRef.current.find((p) => String(p.id) === currentPhotoId);
    if (photo) handleSwipe(photo.id, isLike);
  }, [currentPhotoId, handleSwipe]);

  // ── Heart burst ─────────────────────────────────────────────────────────────
  const handleLikeThreshold = useCallback((fingerPos) => {
    const rect = cardStackRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Keep the spawn bounds in sync with HeartBurst's 100×100 size.
    const HEART_SIZE = 100;
    // Clamp the spawn point so the fixed-size heart remains inside the stack.
    const HALF_W = HEART_SIZE / 2 + 2;
    const FULL_H = HEART_SIZE + 6;
    const localX = Math.min(Math.max(fingerPos.x - rect.left, HALF_W), rect.width - HALF_W);
    const localY = Math.min(
      Math.max(fingerPos.y - rect.top - 60, FULL_H), // 60px above the finger
      rect.height - 4
    );
    const id = `heart-${Date.now()}-${Math.random()}`;
    setHearts((prev) => [
      ...prev.slice(-(MAX_ACTIVE_HEARTS - 1)),
      { id, x: localX, y: localY },
    ]);
  }, []);

  const removeHeart = useCallback((id) => {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const currentPhoto = allPhotos.find((p) => String(p.id) === currentPhotoId);
  const currentIdx = allPhotos.findIndex((p) => String(p.id) === currentPhotoId);
  const total = allPhotos.length;

  const stackPhotos = useMemo(() => {
    if (!currentPhoto) return [];
    const rest = allPhotos
      .filter((p) => !(String(p.id) in votesMap) && String(p.id) !== currentPhotoId)
      .slice(0, STACK_SIZE - 1);
    return [currentPhoto, ...rest];
  }, [currentPhoto, allPhotos, votesMap, currentPhotoId]);

  const title = album?.title || "";
  const titleLong = title.length > TITLE_LIMIT;
  const shownTitle = titleLong && !titleExpanded
    ? title.slice(0, TITLE_LIMIT) + "…"
    : title;

  const desc = album?.description || "";
  const descLong = desc.length > DESC_LIMIT;

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (authLoading || loading) return <VotePageSkeleton />;

  if (needsAuth || !user) return (
    <div className="min-h-[calc(100dvh-4rem)] flex items-center justify-center text-center px-6
                    bg-surface-light dark:bg-surface-dark">
      <motion.div
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="card p-10 max-w-[360px] w-full"
      >
        <p className="text-5xl mb-4">🔐</p>
        <h2 className="font-display font-bold text-2xl mb-2">Sign in to vote</h2>
        <p className="text-gray-400 text-sm mb-6">You need an account to vote in this album.</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate("/login", { state: { from: location } })}
            className="btn-primary w-full"
          >
            <LogIn size={16} /> Sign in
          </button>
          <button
            onClick={() => navigate("/register", { state: { from: location } })}
            className="btn-secondary w-full"
          >
            Create account
          </button>
        </div>
      </motion.div>
    </div>
  );

  if (albumError || !album) return (
    <div className="h-[100dvh] flex items-center justify-center text-center px-6
                    bg-surface-light dark:bg-surface-dark">
      <div className="max-w-[360px] w-full">
        <p className="text-5xl mb-4">🔗</p>
        <h2 className="font-display font-bold text-2xl mb-2">{t("errorAlbumNotFound")}</h2>
        {albumError && <p className="text-gray-400 text-sm mb-6">{albumError}</p>}
        <div className="flex justify-center">
          <button onClick={() => navigate("/")} className="btn-primary">Go Home</button>
        </div>
      </div>
    </div>
  );

  if (finished) return (
    <div className="h-[100dvh] flex items-center justify-center px-4
                    bg-surface-light dark:bg-surface-dark">
      <div className="card p-10 text-center max-w-[360px] w-full mx-auto">
        <div className="w-20 h-20 bg-green-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-green">
          <Check size={40} className="text-white" />
        </div>
        <h2 className="font-display font-bold text-2xl mb-6">{t("allDone")}</h2>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate("/dashboard", {
              replace: true,
              state: {
                openGallery: {
                  album,
                  photo: album.photos?.[0],
                  initialTab: album.is_public === false ? "comments" : "stats",
                },
              },
            })}
            className="btn-primary w-full"
          >
            {t("viewResults")}
          </button>
          <button onClick={() => navigate("/dashboard")} className="btn-ghost w-full">
            {t("backToAlbums")}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <>
      <div className="min-h-screen w-full max-w-full min-w-0 flex flex-col overflow-x-hidden overflow-y-auto bg-surface-light dark:bg-surface-dark">

        {/* ─── Header ──────────────────────────────────────────────────────────
            Layout (top to bottom):
              1. Author row: large avatar + username 
              2. Album title (font-sans)
              3. Expandable description 
        */}
        <div className="w-full max-w-[360px] mx-auto px-4 pt-3 pb-1 flex-shrink-0">
          {/* 1. Author avatar + username — large, at the top */}
          <div className="flex items-center gap-3 mb-4">
            <AuthorAvatar user={album.creator} size={44} />
            <span className="font-sans font-bold text-3xl text-gray-800 dark:text-gray-100 leading-[1.1] break-words min-w-0">
              {album.creator?.username}
            </span>
          </div>

          {/* 2. Album title */}
          <div className="mb-1">
            <h2 className="font-sans font-bold text-2xl leading-[1.2] break-words w-full">
              {shownTitle}
              {titleLong && (
                <button
                  onClick={() => setTitleExpanded(!titleExpanded)}
                  className="ml-0 text-primary-500 text-[11px] font-semibold hover:text-primary-600 transition-colors inline-block whitespace-nowrap"
                >
                  {titleExpanded ? t("seeLess") : t("seeMore")}
                </button>
              )}
            </h2>
          </div>

          {/* 3. Expandable description */}
          {desc && (
            <div className="mb-2 mt-1">
              <p className={`font-sans text-sm text-gray-500 dark:text-gray-400 break-words leading-relaxed ${descExpanded ? "" : "line-clamp-2"}`}>
                {desc}
              </p>
              {descLong && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="text-primary-500 text-[11px] font-semibold hover:text-primary-600 transition-colors mt-0 inline-block"
                >
                  {descExpanded ? t("seeLess") : t("seeMore")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ─── Thumbnail strip ─────────────────────────────────────────────── */}
        <div className="relative flex-shrink-0 w-full max-w-[360px] min-w-0 mx-auto">
          {/* Soft edge fades keep the strip visually contained without blurring thumbnails. */}
          <div data-testid="thumbnail-edge-fade" className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-surface-light/40 dark:from-surface-dark/40 to-transparent z-10 pointer-events-none" />
          <div data-testid="thumbnail-edge-fade" className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-surface-light/40 dark:from-surface-dark/40 to-transparent z-10 pointer-events-none" />

          <div
            ref={thumbStripRef}
            className="w-full min-w-0 py-2 px-4 flex justify-start overflow-x-auto"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <div className="flex gap-2 items-center min-w-max">
              {allPhotos.map((photo) => {
                const pid = String(photo.id);
                const isCur = pid === currentPhotoId;
                const reaction = votesMap[pid];
                const hasVote = pid in votesMap;

                return (
                  <motion.button
                    key={pid}
                    onClick={() => jumpToPhoto(photo)}
                    whileTap={{ scale: 0.9 }}
                    className={`media-thumbnail relative flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden
                                transition-all duration-150
                                ${isCur
                        ? "ring-2 ring-primary-400 ring-offset-1 ring-offset-surface-light dark:ring-offset-surface-dark scale-105"
                        : "hover:scale-105"
                      }`}
                  >
                    {isVideo(photo) ? (
                      <div className="relative w-full h-full">
                        <video src={photo.url} className="w-full h-full object-contain bg-gray-950" preload="metadata" muted playsInline />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                            <Play size={12} className="text-white ml-0.5" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    )}
                    {hasVote && (
                      <div className={`absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full
                                       flex items-center justify-center border-2 border-surface-light dark:border-surface-dark
                                       ${reaction ? "bg-green-500" : "bg-red-400"}`}>
                        {reaction
                          ? <FilledHeart size={10} className="text-white" />
                          : <BrokenHeart size={10} strokeWidth={2} className="text-white" />
                        }
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── Card stack ────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 w-full max-w-full min-w-0 overflow-visible flex items-center justify-center px-2 sm:px-6 py-2">
          <div
            ref={cardStackRef}
            className="relative w-full max-w-[430px] min-w-0 aspect-[3/4]"
          >
            {/* n/m counter badge — now placed top-right on the cards */}
            <div className="absolute top-3 right-3 z-30 pointer-events-none">
              <span className="bg-black/75 backdrop-blur-md border border-white/20 text-white
                               px-2.5 py-1 rounded-full font-mono font-bold text-[13px] shadow-sm">
                {currentIdx >= 0 ? currentIdx + 1 : 0}/{total}
              </span>
            </div>
            <AnimatePresence mode="sync">
              {[...stackPhotos].reverse().map((photo, revIdx) => {
                const stackIdx = stackPhotos.length - 1 - revIdx;
                const isTop = stackIdx === 0;
                return (
                  <div key={photo.id} className="absolute inset-0">
                    <SwipeCard
                      ref={isTop ? topCardRef : null}
                      photo={photo}
                      isTop={isTop}
                      stackIndex={stackIdx}
                      onSwipe={handleSwipe}
                      onLikeThresholdCrossed={handleLikeThreshold}
                      enablePinchZoom
                      videoScrubBottomRatio={0.2}
                      blurredVideoBackdrop
                    />
                    {isTop && (
                      <button
                        onClick={() => setCommentSheet(photo)}
                        className="absolute bottom-4 right-4 z-30 p-3 rounded-full
                                   bg-black/60 backdrop-blur-md border border-white/20
                                   text-white hover:bg-black/80 transition-all active:scale-90"
                        title={t("Comments")}
                      >
                        <MessageCircle size={20} />
                      </button>
                    )}
                  </div>
                );
              })}
            </AnimatePresence>

            {/* Heart burst effects */}
            {hearts.map((h) => (
              <HeartBurst key={h.id} x={h.x} y={h.y} onComplete={() => removeHeart(h.id)} />
            ))}
          </div>
        </div>

        {/* Hint */}
        <p className="text-center text-[11px] text-gray-400 py-1 flex-shrink-0 font-sans">
          {t("swipeHint")}
        </p>

        {/* ─── Buttons ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 pb-6 pt-1">
          <SwipeButtons
            onLike={() => triggerSwipe(true)}
            onDislike={() => triggerSwipe(false)}
            disabled={voting || !currentPhoto}
          />
        </div>
      </div>


      <BottomSheet
        open={!!commentSheet}
        onClose={() => { setCommentSheet(null); setReplyTarget(null); }}
        title={t("Comments")}
        footer={
          commentSheet ? (
            <CommentInput
              photoId={String(commentSheet.id)}
              replyTarget={replyTarget}
              onCancelReply={() => setReplyTarget(null)}
              onCommentCreated={handleCommentCreated}
            />
          ) : null
        }
        topContent={
          commentSheet ? (
            <div className="w-full flex justify-center px-4">
              <img
                src={commentSheet.url}
                className="max-h-[40dvh] rounded-2xl object-contain shadow-2xl border border-white/10"
                alt=""
              />
            </div>
          ) : null
        }
      >
        {commentSheet && (
          <PhotoCommentsList
            photoId={String(commentSheet.id)}
            albumCreatorId={album?.creator_id}
            onReplyTrigger={replyTriggerRef.current}
            apiRef={listApiRef}
          />
        )}
      </BottomSheet>
    </>
  );
}
