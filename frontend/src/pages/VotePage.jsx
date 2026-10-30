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
import { useEffect, useState, useRef, useCallback, useMemo, memo, forwardRef, useImperativeHandle } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { motion, useMotionValue } from "framer-motion";
import toast from "react-hot-toast";
import { albumsApi, votesApi } from "../api";
import { useLang } from "../contexts/LangContext";
import { useAuth } from "../contexts/AuthContext";
import SwipeCard, { SwipeButtons } from "../components/SwipeCard";
import HeartBurst from "../components/HeartBurst";
import { VotePageSkeleton } from "../components/Skeleton";
import { SignIn, ChatCircle, Check, Play, Heart, HeartBreak } from "@phosphor-icons/react";
import BottomSheet from "../components/BottomSheet";
import { PhotoCommentsList, CommentInput } from "../components/PhotoComments";
import { isVideo } from "../utils/media";
import VideoPlayer from "../components/VideoPlayer";

const STACK_SIZE = 3;
const DESC_LIMIT = 100;
const TITLE_LIMIT = 40;
const MAX_ACTIVE_HEARTS = 5;
const COMMENT_SHEET_HEIGHT_VH = 0.75;
const COMMENT_SHEET_PARTIAL_OFFSET_VH = 0.25;

// ── Small reusable avatar ──────────────────────────────────────────────────────
const ThumbButton = memo(function ThumbButton({ photo, isCurrent, hasVote, reaction, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(photo)}
      className={`media-thumbnail relative flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden
                  active:scale-95 transition-transform duration-150
                  ${isCurrent
          ? "ring-2 ring-primary-400 ring-offset-1 ring-offset-surface-light dark:ring-offset-surface-dark scale-105"
          : "hover:scale-105"
        }`}
    >
      {isVideo(photo) && !photo.thumb_url ? (
        <div className="relative w-full h-full">
          <video src={photo.url} className="w-full h-full object-contain bg-gray-950" preload="metadata" muted playsInline />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
              <Play size={12} className="text-white ml-0.5" />
            </div>
          </div>
        </div>
      ) : (
        <div className="relative w-full h-full">
          <img src={photo.thumb_url || photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
          {isVideo(photo) && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                <Play size={12} className="text-white ml-0.5" />
              </div>
            </div>
          )}
        </div>
      )}
      {hasVote && (
        <div className={`absolute bottom-[3px] right-[3px] w-[18px] h-[18px] rounded-full
                         flex items-center justify-center
                         ${reaction ? "bg-green-500" : "bg-red-400"}`}>
          <span className="absolute left-1/2 top-1/2 w-[10px] h-[10px] flex items-center justify-center -translate-x-1/2 -translate-y-[calc(50%-1px)]">
            {reaction
              ? <Heart size={10} className="block text-white" />
              : <HeartBreak size={10} className="block text-white" />
            }
          </span>
        </div>
      )}
    </button>
  );
});

// The strip is memoized on the two pieces of review state it actually uses, so
// a swipe re-renders only the two thumbnails whose ring/badge changed while the
// other 50 keep their previous elements.
const ThumbStrip = memo(function ThumbStrip({ photos, currentPhotoId, votesMap, stripRef, onSelect }) {
  return (
    <div className="relative flex-shrink-0 w-full max-w-[410px] min-w-0 mx-auto">
      {photos.length > 1 && (
        <>
          <div data-testid="thumbnail-edge-fade" className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-surface-light/95 dark:from-surface-dark/95 via-surface-light/65 dark:via-surface-dark/65 to-transparent z-10 pointer-events-none" />
          <div data-testid="thumbnail-edge-fade" className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-surface-light/95 dark:from-surface-dark/95 via-surface-light/65 dark:via-surface-dark/65 to-transparent z-10 pointer-events-none" />
        </>
      )}

      <div
        ref={stripRef}
        className={`relative w-full min-w-0 py-2 px-[3px] flex overflow-x-auto ${
          photos.length <= 1 ? "justify-center" : "justify-start"
        }`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div className={`flex gap-2 items-center min-w-max ${
          photos.length <= 1 ? "justify-center w-full" : ""
        }`}>
          {photos.map((photo) => {
            const pid = String(photo.id);
            return (
              <ThumbButton
                key={pid}
                photo={photo}
                isCurrent={pid === currentPhotoId}
                hasVote={pid in votesMap}
                reaction={votesMap[pid]}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});

const HeartBurstLayer = forwardRef(function HeartBurstLayer(_, ref) {
  const [hearts, setHearts] = useState([]);
  useImperativeHandle(ref, () => ({
    spawn: (x, y) => {
      const id = `heart-${Date.now()}-${Math.random()}`;
      setHearts((previous) => [...previous.slice(-(MAX_ACTIVE_HEARTS - 1)), { id, x, y }]);
    },
  }), []);
  const removeHeart = useCallback((id) => {
    setHearts((previous) => previous.filter((heart) => heart.id !== id));
  }, []);
  return hearts.map((heart) => (
    <HeartBurst key={heart.id} x={heart.x} y={heart.y} onComplete={() => removeHeart(heart.id)} />
  ));
});

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
  const [searchParams] = useSearchParams();
  // „Переголосовать“ (?revote=1) — the voter chose to redo their decisions:
  // previous votes are annulled and the whole album is reviewed from scratch.
  const isRevote = searchParams.get("revote") === "1";
  const { t } = useLang();
  const { user, loading: authLoading } = useAuth();
  const [viewportHeight, setViewportHeight] = useState(() => (
    typeof window !== "undefined"
      ? (window.visualViewport?.height || window.innerHeight)
      : 800
  ));
  const commentSheetY = useMotionValue(viewportHeight);
  const thumbStripRef = useRef(null);
  const heartLayerRef = useRef(null);

  const [album, setAlbum] = useState(null);
  const [allPhotos, setAllPhotos] = useState([]);
  const [votesMap, setVotesMap] = useState({});
  const [currentPhotoId, setCurrentPhotoId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [albumError, setAlbumError] = useState(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [commentSheet, setCommentSheet] = useState(null); // null | photo object
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

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => {
      const nextHeight = Math.round(viewport?.height || window.innerHeight);
      setViewportHeight(nextHeight);
      if (!commentSheet) commentSheetY.set(nextHeight);
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, [commentSheet, commentSheetY]);

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

        // „Переголосовать“ (?revote=1): wipe the previous decisions BEFORE the
        // pass starts so the owner's statistics drop the old votes and only
        // count the new ones the voter casts on this run.
        if (isRevote && user?.id) {
          try {
            await votesApi.deleteMyVotes(albumData.id);
          } catch {
            /* non-fatal — the run continues with the photos already decided */
          }
        }

        // Fire myVotes in parallel with recording visit — no sequential wait
        let myVotesPromise = Promise.resolve([]);
        if (!isRevote && sessionData.voted_photo_ids?.length > 0) {
          myVotesPromise = votesApi.getMyVotes(albumData.id).catch(() => []);
        }

        let map = {};
        const myVotes = await myVotesPromise;
        myVotes.forEach((v) => { map[String(v.photo_id)] = v.is_like; });

        if (user?.id) {
          import("../hooks/useRecentAlbums.js").then(({ recordAlbumVisit }) => {
            recordAlbumVisit(user.id, {
              id: albumData.id,
              title: albumData.title,
              coverUrl: photos[0]?.url ?? null,
              creatorUsername: albumData.creator?.username ?? null,
              creator_id: albumData.creator_id,
              invite_code: albumData.invite_code,
              invite_url: albumData.invite_url,
              is_public: albumData.is_public,
              hasAccess: albumData.is_public !== false,
              hasVoted: Object.keys(map).length > 0,
            });
          });
        }

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
  }, [inviteCode, shouldLoad, user, isRevote, searchParams]);

  // Once the session is complete (every photo decided), refresh the
  // "Recently visited" record so the card shows "Переголосовать" right away
  // instead of "Голосовать" from the pre-vote record.
  useEffect(() => {
    if (!finished || !album || !user?.id) return;
    const photo = album.photos?.[0];
    import("../hooks/useRecentAlbums.js").then(({ recordAlbumVisit }) => {
      recordAlbumVisit(user.id, {
        id: album.id,
        title: album.title,
        coverUrl: photo?.url ?? null,
        creator_id: album.creator_id ?? album.creator?.id,
        creatorUsername: album.creator?.username ?? null,
        invite_code: album.invite_code,
        invite_url: album.invite_url,
        is_public: album.is_public,
        hasAccess: album.is_public !== false,
        hasVoted: true,
      });
    });
  }, [finished, album, user]);

  // Auto-scroll the thumbnail strip. Letting the engine centre the active
  // thumbnail avoids the two forced layouts (strip + thumb rects) that the
  // previous hand-rolled scroll calculation needed on every swipe.
  useEffect(() => {
    if (!currentPhotoId || !thumbStripRef.current) return;
    const strip = thumbStripRef.current;
    const idx = allPhotos.findIndex((p) => String(p.id) === currentPhotoId);
    if (idx < 0) return;

    const frameId = requestAnimationFrame(() => {
      const thumbEl = strip.querySelectorAll(".media-thumbnail")[idx];
      thumbEl?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    });

    return () => cancelAnimationFrame(frameId);
  }, [currentPhotoId, allPhotos]);

  // ── Vote handler ────────────────────────────────────────────────────────────
  const handleSwipe = useCallback((photoId, isLike) => {
    const pid = String(photoId);
    const photos = allPhotosRef.current;
    const curIdx = photos.findIndex((p) => String(p.id) === pid);

    const newMap = { ...votesMapRef.current, [pid]: isLike };
    votesMapRef.current = newMap;
    setVotesMap(newMap);

    // Advance immediately. The API request runs in the background.
    const nextUnvoted =
      photos.slice(curIdx + 1).find((p) => !(String(p.id) in newMap)) ||
      photos.find((p) => !(String(p.id) in newMap));

    if (nextUnvoted) setCurrentPhotoId(String(nextUnvoted.id));
    else setFinished(true);

    votesApi.castVote(photoId, isLike)
      .catch((err) => {
        if (!err.message?.includes("timeout")) toast.error(err.message, { duration: 2000 });
      });
  }, []);

  // ── Thumbnail jump ──────────────────────────────────────────────────────────
  const jumpToPhoto = useCallback((photo) => {
    setCurrentPhotoId(String(photo.id));
    requestAnimationFrame(() => { topCardRef.current?.resetPosition?.(); });
  }, []);

  // ── Button trigger ──────────────────────────────────────────────────────────
  const triggerSwipe = useCallback((isLike) => {
    if (votingRef.current) return;
    const photo = allPhotosRef.current.find((p) => String(p.id) === currentPhotoId);
    if (!photo) return;
    if (topCardRef.current?.swipeTo) {
      votingRef.current = true;
      // Safety: reset the lock if swipeTo's promise never settles
      const safetyTimer = setTimeout(() => { votingRef.current = false; }, 1200);
      topCardRef.current.swipeTo(isLike)
        .then(() => {
          clearTimeout(safetyTimer);
          votingRef.current = false;
        })
        .catch(() => {
          clearTimeout(safetyTimer);
          votingRef.current = false;
        });
    } else {
      handleSwipe(photo.id, isLike);
    }
  }, [currentPhotoId, handleSwipe]);

  const handleLikePress = useCallback(() => triggerSwipe(true), [triggerSwipe]);
  const handleDislikePress = useCallback(() => triggerSwipe(false), [triggerSwipe]);
  const closeCommentSheet = useCallback(() => {
    setCommentSheet(null);
    setReplyTarget(null);
  }, []);
  // Stable element: otherwise the memoised BottomSheet sees a new child on
  // every vote and re-renders even though the sheet is closed.
  const commentSheetHeader = useMemo(
    () => <h3 className="w-full text-center font-bold text-lg px-0">{t("Comments")}</h3>,
    [t]
  );

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
    heartLayerRef.current?.spawn(localX, localY);
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const currentPhoto = allPhotos.find((p) => String(p.id) === currentPhotoId);
  const currentIdx = allPhotos.findIndex((p) => String(p.id) === currentPhotoId);
  const total = allPhotos.length;

  const stackPhotos = useMemo(() => {
    if (!currentPhoto || allPhotos.length === 0) return [];
    const curIdx = allPhotos.findIndex((p) => String(p.id) === currentPhotoId);
    if (curIdx < 0) return [currentPhoto];

    const rest = [];
    // 1. Forward scan from currentIdx + 1 (matches handleSwipe next card sequence)
    for (let i = curIdx + 1; i < allPhotos.length && rest.length < STACK_SIZE - 1; i++) {
      const p = allPhotos[i];
      const pid = String(p.id);
      if (!(pid in votesMap) && pid !== currentPhotoId) {
        rest.push(p);
      }
    }
    // 2. Wrap-around from 0 to curIdx if needed
    if (rest.length < STACK_SIZE - 1) {
      for (let i = 0; i < curIdx && rest.length < STACK_SIZE - 1; i++) {
        const p = allPhotos[i];
        const pid = String(p.id);
        if (!(pid in votesMap) && pid !== currentPhotoId && !rest.some((r) => r.id === p.id)) {
          rest.push(p);
        }
      }
    }
    return [currentPhoto, ...rest];
  }, [currentPhoto, currentPhotoId, allPhotos, votesMap]);

  // Preload the next card's lightweight preview into the browser cache.
  useEffect(() => {
    if (stackPhotos[1]?.url) {
      const image = new Image();
      image.src = stackPhotos[1].thumb_url || stackPhotos[1].url;
    }
  }, [stackPhotos]);

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
            <SignIn size={16} /> Sign in
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
          <Check size={40} weight="bold" className="text-white" />
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
        <div className="w-full max-w-[360px] mx-auto px-[3px] pt-3 pb-1 flex-shrink-0">
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
        <ThumbStrip
          photos={allPhotos}
          currentPhotoId={currentPhotoId}
          votesMap={votesMap}
          stripRef={thumbStripRef}
          onSelect={jumpToPhoto}
        />

        {/* ─── Card stack ────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 w-full max-w-full min-w-0 overflow-visible flex items-center justify-center px-2 sm:px-6 py-2">
          <div
            ref={cardStackRef}
            className="relative w-full max-w-[430px] min-w-0 aspect-[3/4]"
          >
            {/* n/m counter badge — now placed top-right on the cards */}
            <div className="absolute top-3 right-3 z-30 pointer-events-none">
              <span data-testid="vote-photo-counter" className="bg-black/70 border border-white/20 text-white
                               px-2.5 py-1 rounded-full font-mono font-bold text-[13px] shadow-sm">
                {currentIdx >= 0 ? currentIdx + 1 : 0}/{total}
              </span>
            </div>
            {[...stackPhotos].reverse().map((photo, revIdx) => {
                const stackIdx = stackPhotos.length - 1 - revIdx;
                const isTop = stackIdx === 0;
                return (
                  <div
                    key={photo.id}
                    className="absolute inset-0"
                    style={{
                      opacity: 1,
                      pointerEvents: commentSheet ? "none" : (isTop ? "auto" : "none"),
                      zIndex: 20 - stackIdx,
                    }}
                  >
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
                                   bg-black/70 border border-white/20
                                   text-white hover:bg-black/80 transition-all active:scale-90"
                        title={t("Comments")}
                        data-testid="vote-comment-button"
                      >
                        <ChatCircle size={20} />
                      </button>
                    )}
                  </div>
                );
              })}

            {/* Heart burst effects */}
            <HeartBurstLayer ref={heartLayerRef} />
          </div>
        </div>

        {/* Hint */}
        <p className="text-center text-[11px] text-gray-400 py-1 flex-shrink-0 font-sans">
          {t("swipeHint")}
        </p>

        {/* ─── Buttons ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 pb-6 pt-1">
          <SwipeButtons
            onLike={handleLikePress}
            onDislike={handleDislikePress}
            disabled={!currentPhoto}
          />
        </div>
      </div>


      <BottomSheet
        open={!!commentSheet}
        onClose={closeCommentSheet}
        title={t("Comments")}
        sharedY={commentSheetY}
        viewportHeight={viewportHeight}
        heightVh={COMMENT_SHEET_HEIGHT_VH}
        partialOffsetVh={COMMENT_SHEET_PARTIAL_OFFSET_VH}
        resizeTopContentWithSheet
        deferClose
        hideHeader
        backdropBlur
        backdropBlurClass="backdrop-blur-md"
        backdropDim
        backdropDimClass="bg-black/50"
        linearMotion
        testId="vote-comments-sheet"
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
        headerChildren={commentSheetHeader}
        topContent={
          commentSheet ? (
            <div className="w-full h-full min-h-0 flex items-center justify-center">
              {isVideo(commentSheet) ? (
                <VideoPlayer
                  src={commentSheet.url}
                  className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl border border-white/10"
                  preload="auto"
                  muted
                  autoPlay
                  loop
                  objectFit="contain"
                  stableLayout
                />
              ) : (
                <motion.img
                  src={commentSheet.thumb_url || commentSheet.url}
                  className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl border border-white/10"
                  alt=""
                />
              )}
            </div>
          ) : null
        }
      >
        {commentSheet && (
          <PhotoCommentsList
            photoId={String(commentSheet.id)}
            albumCreatorId={album?.creator_id || album?.creator?.id}
            onReplyTrigger={replyTriggerRef.current}
            apiRef={listApiRef}
          />
        )}
      </BottomSheet>
    </>
  );
}
