/**
 * pages/AnalyticsPage.jsx
 *
 * Normal mode: loads analytics → AlbumSummary (auto-opens photo comment sheet if ?photo= set)
 * Locked mode: private album + notification → LockedCommentSheet (zero extra requests during animation)
 *
 * Key design: getAnalytics and getThread run IN PARALLEL via async/await.
 * By the time loading = false, ALL data (photo_url + comments) is already in state,
 * so the sheet animation runs with zero concurrent network activity → no stutter.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { ChevronLeft, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { albumsApi, commentsApi } from "../api";
import AlbumSummary from "../components/AlbumSummary";
import PhotoComments from "../components/PhotoComments";
import { AnalyticsSkeleton } from "../components/Skeleton";
import { isVideoUrl } from "../utils/media";

// ─── Locked comment overlay for private-album notification deep-link ──────────
function LockedCommentSheet({ photoId, photoUrl, initialComments, onBack }) {
  const controls = useAnimation();
  const y = useMotionValue(0);
  // Calculate vh once on mount to prevent mobile address bar from triggering resize re-renders and stuttering animations
  const [vh] = useState(typeof window !== "undefined" ? window.innerHeight : 800);

  const defaultOffset = vh * 0.35; // 60vh visible
  const dismissOffset = vh * 0.8;

  const scale = useTransform(y, [0, defaultOffset, dismissOffset], [0.85, 1, 1]);
  // Fade out top content only when dragging DOWN to dismiss
  const topOpacity = useTransform(y, [defaultOffset, dismissOffset], [1, 0]);

  useEffect(() => {
    controls.start({ y: defaultOffset, transition: { type: "spring", stiffness: 350, damping: 35 } });
  }, [controls, defaultOffset]);

  const handleBack = async () => {
    await controls.start({ y: vh, transition: { duration: 0.25 } });
    onBack();
  };

  const onDragEnd = (_, info) => {
    const velocity = info.velocity.y;
    const currentY = y.get();

    if (velocity > 500) {
      handleBack();
    } else if (currentY > defaultOffset + 100) {
      handleBack();
    } else if (currentY < defaultOffset - 80 || velocity < -500) {
      controls.start({ y: 0, transition: { type: "spring", stiffness: 350, damping: 35 } });
    } else {
      controls.start({ y: defaultOffset, transition: { type: "spring", stiffness: 350, damping: 35 } });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-end overflow-hidden">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-xl"
        onClick={onBack}
      />

      {photoUrl && (
        <motion.div
          style={{ opacity: topOpacity }}
          className="absolute top-0 left-0 w-full h-[40dvh] flex items-center justify-center px-6 z-10 pointer-events-none"
        >
          <motion.div
            style={{ scale }}
            className="pointer-events-auto"
          >
            {isVideoUrl(photoUrl) ? (
              <video
                src={photoUrl}
                className="max-h-[38dvh] w-auto h-auto rounded-3xl object-contain shadow-2xl border border-white/10"
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={photoUrl}
                alt=""
                className="max-h-[38dvh] w-auto h-auto rounded-3xl object-contain shadow-2xl border border-white/10"
              />
            )}
          </motion.div>
        </motion.div>
      )}

      {/* Sheet — GPU-composited transform, no layout shifts during slide */}
      <motion.div
        initial={{ y: vh }}
        animate={controls}
        exit={{ y: vh }}
        style={{ y, height: "95dvh", marginTop: "auto", willChange: "transform" }}
        drag="y"
        dragConstraints={{ top: 0, bottom: vh }}
        dragElastic={0.1}
        onDragEnd={onDragEnd}
        className="absolute bottom-0 w-full z-20 flex flex-col overflow-hidden
                   bg-card-light dark:bg-card-dark
                   rounded-t-[2.5rem] shadow-[0_-12px_60px_-15px_rgba(0,0,0,0.5)]"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-4 pb-1 flex-shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0 border-b border-border-light dark:border-border-dark">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ChevronLeft size={22} />
          </button>
          <span className="font-bold text-xl ml-1">Comments</span>
          <div className="ml-auto w-10 h-10 rounded-2xl flex items-center justify-center bg-amber-50 dark:bg-amber-900/20 text-amber-500">
            <Lock size={18} />
          </div>
        </div>

        {/* Pre-loaded comments — no network call during animation */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 min-h-0">
          <PhotoComments
            photoId={String(photoId)}
            albumCreatorId={null}
            initialComments={initialComments}
          />
        </div>
      </motion.div>
    </div>
  );
}


// ─── Main ────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { albumId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [privateMode, setPrivateMode] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [threadComments, setThreadComments] = useState(null);
  const [photoId, setPhotoId] = useState(null);

  // URL params set when navigating from a notification
  const initialPhotoId = searchParams.get("photo");
  const initialCommentId = searchParams.get("comment");
  const initialTab = searchParams.get("tab") || "comments";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // ── Fire thread request in parallel (only if we have a comment id) ─────
      const threadP = initialCommentId
        ? commentsApi.getThread(initialCommentId).catch(() => null)
        : Promise.resolve(null);

      try {
        const data = await albumsApi.getAnalytics(albumId);
        if (cancelled) return;
        setAnalytics(data);

        // Record visit for the "Recently Visited" feature
        const storedUser = JSON.parse(localStorage.getItem("pickmatch_user") || "null");
        if (storedUser?.id) {
          const { recordAlbumVisit } = await import("../hooks/useRecentAlbums.js");
          const coverUrl = data.photos?.[0]?.url ?? null;
          recordAlbumVisit(storedUser.id, {
            id: albumId,
            title: data.title,
            coverUrl,
            creatorUsername: data.creator?.username ?? null,
            is_public: data.is_public,
            hasAccess: true,
          });
        }
      } catch (err) {
        if (cancelled) return;

        const errMsg = String(err?.message || "").toLowerCase();
        const isNotFound = errMsg.includes("not found") || errMsg.includes("404");

        // ── Album deleted ─────────────────────────────────────────────────────
        if (isNotFound) {
          const storedUser = JSON.parse(localStorage.getItem("pickmatch_user") || "null");
          if (storedUser?.id) {
            const { removeRecentAlbum } = await import("../hooks/useRecentAlbums.js");
            removeRecentAlbum(storedUser.id, albumId);
          }
          toast.error("Album not found");
          navigate("/dashboard");
          return;
        }

        // ── No analytics access (403) ─────────────────────────────────────────
        // Notification deep-link (has ?photo= param)
        if (initialPhotoId) {
          const threadData = await threadP;
          if (!cancelled) {
            setPrivateMode(true);
            setPhotoId(initialPhotoId);
            if (threadData) {
              setPhotoUrl(threadData.photo_url ?? null);
              setThreadComments(threadData.thread ?? []);
            }
          }
          return;
        }

        // No notification params — check if user has own comments in this album
        try {
          const myComments = await albumsApi.getMyCommentsInAlbum(albumId);
          if (cancelled) return;

          if (myComments?.has_comments) {
            const threadData = await commentsApi.getThread(myComments.comment_id).catch(() => null);
            if (cancelled) return;

            // Update the stored visit to reflect accurate limited-access state
            const storedUser = JSON.parse(localStorage.getItem("pickmatch_user") || "null");
            if (storedUser?.id) {
              const { recordAlbumVisit } = await import("../hooks/useRecentAlbums.js");
              // Use album title from existing recent entry if available, fall back to generic
              const existing = JSON.parse(localStorage.getItem(`pickmatch_recent_${storedUser.id}`) || "[]");
              const existingEntry = existing.find((a) => a.id === albumId);
              recordAlbumVisit(storedUser.id, {
                id: albumId,
                title: existingEntry?.title ?? "Private album",
                coverUrl: existingEntry?.coverUrl ?? myComments.photo_url,
                creatorUsername: existingEntry?.creatorUsername ?? null,
                is_public: false,
                hasAccess: false,
              });
            }

            setPrivateMode(true);
            setPhotoId(myComments.photo_id);
            setPhotoUrl(myComments.photo_url);
            setThreadComments(threadData?.thread ?? []);
          } else {
            // No comments — silently redirect without error if coming from recently visited
            navigate("/dashboard");
          }
        } catch (innerErr) {
          if (!cancelled) {
            const inner = String(innerErr?.message || "").toLowerCase();
            if (inner.includes("not found")) {
              // Album was deleted while we were checking comments
              const storedUser = JSON.parse(localStorage.getItem("pickmatch_user") || "null");
              if (storedUser?.id) {
                const { removeRecentAlbum } = await import("../hooks/useRecentAlbums.js");
                removeRecentAlbum(storedUser.id, albumId);
              }
            }
            navigate("/dashboard");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [albumId, initialCommentId, initialPhotoId]);

  if (loading) return <AnalyticsSkeleton />;

  if (privateMode) {
    return (
      <AnimatePresence>
        <LockedCommentSheet
          key="locked"
          photoId={photoId ?? initialPhotoId}
          photoUrl={photoUrl}
          initialComments={threadComments}
          onBack={() => navigate(-1)}
        />
      </AnimatePresence>
    );
  }

  return (
    <AlbumSummary
      analytics={analytics}
      onBack={() => navigate("/dashboard")}
      initialPhotoId={initialPhotoId}
      initialTab={initialTab}
    />
  );
}
