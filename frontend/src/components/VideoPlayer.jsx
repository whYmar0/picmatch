import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

const TAP_MOVEMENT_PX = 12;
// Leave enough time for a normal tap to complete before treating it as a hold.
const HOLD_DELAY_MS = 250;
const CONTROLS_HIDE_MS = 2500;

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * VideoPlayer — custom, touch-friendly video controls.
 *
 * Vertical gestures are forwarded to the parent so AlbumGallery and
 * ImageLightbox can keep ownership of their dismiss animations. Horizontal
 * gestures that start in the configured bottom scrub zone are consumed locally
 * for scrubbing; upper-area gestures continue bubbling to the gallery carousel
 * or voting card.
 */
export default function VideoPlayer({
  src,
  className = "",
  style,
  muted = false,
  preload = "metadata",
  autoPlay = false,
  loop = true,
  objectFit = "contain",
  stableLayout = false,
  scrubBottomRatio = 0.25,
  blurredBackdrop = false,
  isolateScrubGesture = false,
  bottomInset = 0,
  onVerticalSwipe,
  onVerticalSwipeMove,
}) {
  const containerRef = useRef(null);
  const mediaFrameRef = useRef(null);
  const videoRef = useRef(null);
  const backgroundVideoRef = useRef(null);
  const pointerScrubRef = useRef(false);
  const animationFrameRef = useRef(null);
  const endProgressLockRef = useRef(false);
  const endProgressSeekPendingRef = useRef(false);
  const holdTimerRef = useRef(null);
  const controlsTimerRef = useRef(null);
  const touchStartRef = useRef(null);
  const gestureAxisRef = useRef(null);
  const isHoldingRef = useRef(false);
  const suppressControlsRef = useRef(false);
  const isScrubbingRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  const touchHandledRef = useRef(false);
  const pointerTapStartRef = useRef(null);
  const isMutedRef = useRef(muted);
  const backgroundPlaybackRequestRef = useRef(0);

  const [aspectRatio, setAspectRatio] = useState(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [showPlaybackControl, setShowPlaybackControl] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPercent, setScrubPercent] = useState(0);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const clearControlsTimer = () => {
    if (controlsTimerRef.current) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
  };

  const showControls = (autoHide = true, showPlayback = true) => {
    clearControlsTimer();
    setControlsVisible(true);
    setShowPlaybackControl(showPlayback);
    if (autoHide) {
      controlsTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
        controlsTimerRef.current = null;
      }, CONTROLS_HIDE_MS);
    }
  };

  const hideControls = () => {
    clearControlsTimer();
    setControlsVisible(false);
  };

  useEffect(() => () => {
    clearHoldTimer();
    clearControlsTimer();
    backgroundPlaybackRequestRef.current += 1;
    backgroundVideoRef.current?.pause();
  }, []);

  useEffect(() => {
    isMutedRef.current = muted;
    setIsMuted(muted);
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Keep the progress indicator smooth between the video's coarser timeupdate events.
  useEffect(() => {
    if (!isPlaying) return undefined;

    let cancelled = false;
    const updateProgress = () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && !isScrubbingRef.current && Number.isFinite(video.duration) && video.duration > 0) {
        const nextTime = video.currentTime || 0;
        if (endProgressLockRef.current) {
          if (endProgressSeekPendingRef.current) {
            if (nextTime >= video.duration - 0.2) endProgressSeekPendingRef.current = false;
          } else if (nextTime < video.duration * 0.2) {
            // The loop has genuinely started after reaching the end.
            endProgressLockRef.current = false;
          }
          if (endProgressLockRef.current) {
            setCurrentTime(video.duration);
            setProgressPercent(100);
            animationFrameRef.current = window.requestAnimationFrame(updateProgress);
            return;
          }
        }
        setCurrentTime(nextTime);
        setProgressPercent(clamp((nextTime / video.duration) * 100, 0, 100));
      }
      animationFrameRef.current = window.requestAnimationFrame(updateProgress);
    };

    animationFrameRef.current = window.requestAnimationFrame(updateProgress);
    return () => {
      cancelled = true;
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying]);

  // The HTML autoPlay attribute is not enough when a carousel slide becomes
  // active while it remains mounted. Explicitly start/stop the active player.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    video.muted = isMutedRef.current;
    if (!autoPlay) {
      video.pause();
      return undefined;
    }

    let cancelled = false;
    const startPlayback = () => {
      if (cancelled) return;
      const promise = video.play();
      if (promise?.catch) {
        promise.catch(() => {
          if (cancelled) return;
          // Autoplay with sound is commonly blocked. Fall back to muted
          // playback so opening the video still works, while the mute button
          // lets the user enable sound after the gesture.
          if (!video.muted) {
            video.muted = true;
            isMutedRef.current = true;
            setIsMuted(true);
            const mutedPromise = video.play();
            mutedPromise?.catch?.(() => setIsPlaying(false));
          } else {
            setIsPlaying(false);
          }
        });
      }
    };

    if (video.readyState >= 2) startPlayback();
    else video.addEventListener("loadeddata", startPlayback, { once: true });

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", startPlayback);
      if (!autoPlay) video.pause();
    };
  }, [autoPlay, src]);

  const syncMetadata = (event) => {
    const video = event.currentTarget;
    if (video.videoWidth && video.videoHeight) {
      setAspectRatio(video.videoWidth / video.videoHeight);
    }
    if (Number.isFinite(video.duration)) {
      setDuration(video.duration);
      setProgressPercent(clamp((video.currentTime / video.duration) * 100, 0, 100));
    }
    syncBackgroundTime(video.currentTime);
  };

  const syncTime = (event) => {
    const video = event.currentTarget;
    const nextTime = video.currentTime || 0;
    syncBackgroundTime(nextTime);
    if (isScrubbingRef.current) return;
    if (Number.isFinite(video.duration)) {
      setDuration(video.duration);
      if (endProgressLockRef.current) {
        if (endProgressSeekPendingRef.current) {
          if (nextTime >= video.duration - 0.2) endProgressSeekPendingRef.current = false;
        } else if (nextTime < video.duration * 0.2) {
          endProgressLockRef.current = false;
        }
        if (endProgressLockRef.current) {
          setCurrentTime(video.duration);
          setProgressPercent(100);
          return;
        }
      }
      setCurrentTime(nextTime);
      setProgressPercent(clamp((nextTime / video.duration) * 100, 0, 100));
    } else {
      setCurrentTime(nextTime);
    }
  };

  // The blurred layer is a rendering mirror, not an independent player. A
  // play() promise may resolve after a long-press has already paused the main
  // video, so every request gets a generation that is invalidated on pause.
  const playBackgroundVideo = () => {
    const backgroundVideo = backgroundVideoRef.current;
    const video = videoRef.current;
    if (
      !backgroundVideo ||
      !video ||
      video.paused ||
      video.ended
    ) return;

    const requestId = ++backgroundPlaybackRequestRef.current;
    syncBackgroundTime(video.currentTime, true);
    const promise = backgroundVideo.play();
    promise?.then?.(() => {
      // An old play() promise may resolve after a newer release/play request.
      // It must not pause the media belonging to that newer request.
      if (requestId !== backgroundPlaybackRequestRef.current) return;
      if (videoRef.current?.paused || videoRef.current?.ended) {
        backgroundVideo.pause();
        return;
      }
      // A seek can become available only after play has opened the media
      // pipeline. Align once more after the promise resolves so a delayed
      // backdrop never resumes from an old frame.
      syncBackgroundTime(video.currentTime, true);
    }).catch?.(() => {});
  };

  const pauseBackgroundVideo = () => {
    backgroundPlaybackRequestRef.current += 1;
    backgroundVideoRef.current?.pause();
  };

  const syncBackgroundTime = (time, force = false) => {
    const backgroundVideo = backgroundVideoRef.current;
    if (!backgroundVideo || !Number.isFinite(time)) return;
    try {
      if (force || Math.abs(backgroundVideo.currentTime - time) > 0.08) {
        backgroundVideo.currentTime = time;
      }
    } catch {
      // The background can still be loading metadata; the next timeupdate will sync it.
    }
  };

  const playVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    const promise = video.play();
    promise?.catch?.(() => setIsPlaying(false));
    if (blurredBackdrop) playBackgroundVideo();
  };

  const pauseVideo = () => {
    // Pause the mirror first so a pending backdrop play cannot outlive a hold.
    if (blurredBackdrop) pauseBackgroundVideo();
    const video = videoRef.current;
    video?.pause();
    syncBackgroundTime(video?.currentTime, true);
  };

  const togglePlayback = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused || videoRef.current.ended) {
      suppressControlsRef.current = false;
      playVideo();
      hideControls();
    } else {
      // A regular tap pauses the video and keeps the playback/audio controls
      // visible. Only the long-press path suppresses controls while paused.
      suppressControlsRef.current = false;
      pauseVideo();
      showControls(true, true);
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
    if (blurredBackdrop) playBackgroundVideo();
  };
  const handlePause = () => {
    setIsPlaying(false);
    if (blurredBackdrop) pauseBackgroundVideo();
  };
  const handleEnded = () => {
    endProgressLockRef.current = false;
    endProgressSeekPendingRef.current = false;
    setIsPlaying(false);
    if (blurredBackdrop) pauseBackgroundVideo();
    setCurrentTime(duration || 0);
    setProgressPercent(100);
    showControls(true);
  };

  const toggleMute = (event) => {
    event.stopPropagation();
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) videoRef.current.muted = nextMuted;
    // Mute/unmute is intentionally independent from playback. In particular,
    // changing audio state while paused must never call play().
    showControls(true);
  };

  const getMediaRect = () => mediaFrameRef.current?.getBoundingClientRect()
    || containerRef.current?.getBoundingClientRect();

  const isInBottomArea = (clientY) => {
    const rect = getMediaRect();
    return !!rect && clientY >= rect.top + rect.height * (1 - scrubBottomRatio);
  };

  // The whole video surface toggles playback on a tap.
  const isInPlaybackTapArea = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    return !!rect && rect.width > 0 && rect.height > 0;
  };

  const beginScrubbing = () => {
    if (isScrubbingRef.current) return;
    const video = videoRef.current;
    wasPlayingBeforeScrubRef.current = !!video && !video.paused && !video.ended;
    isScrubbingRef.current = true;
    suppressControlsRef.current = true;
    setIsScrubbing(true);
    hideControls();
    // Keep the video frozen at the selected frame for the entire drag. This
    // prevents loop from jumping back to 0 while the thumb is held at the end.
    if (wasPlayingBeforeScrubRef.current) pauseVideo();
  };

  const finishScrubbing = () => {
    const shouldResume = wasPlayingBeforeScrubRef.current;
    wasPlayingBeforeScrubRef.current = false;
    isScrubbingRef.current = false;
    suppressControlsRef.current = false;
    setIsScrubbing(false);
    if (shouldResume) playVideo();
  };

  const scrubToClientX = (clientX) => {
    const video = videoRef.current;
    const rect = getMediaRect();
    const mediaDuration = video?.duration > 0 ? video.duration : duration;
    if (!video || !rect || !Number.isFinite(mediaDuration) || mediaDuration <= 0) return;
    const percentage = clamp((clientX - rect.left) / rect.width, 0, 1);
    // Seeking exactly to duration fires `ended`; with loop enabled the browser
    // immediately resets currentTime to 0. Keep the media just before the last
    // frame while presenting a stable 100% progress value to the user.
    const atEnd = percentage >= 1;
    const nextTime = atEnd
      ? Math.max(0, mediaDuration - 0.05)
      : percentage * mediaDuration;
    endProgressLockRef.current = atEnd;
    endProgressSeekPendingRef.current = atEnd;
    video.currentTime = nextTime;
    syncBackgroundTime(nextTime);
    setCurrentTime(percentage >= 1 ? duration : nextTime);
    setProgressPercent(percentage * 100);
    setScrubPercent(percentage * 100);
  };

  const handleTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;

    const startedOnButton = event.target?.closest?.("button");
    const startedOnTimeline = event.target?.closest?.('[data-video-timeline="true"]');
    touchHandledRef.current = false;
    gestureAxisRef.current = null;
    isHoldingRef.current = false;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      bottomArea: isInBottomArea(touch.clientY),
      timeline: !!startedOnTimeline,
    };

    clearHoldTimer();
    if (!isScrubbingRef.current) suppressControlsRef.current = false;
    if (!startedOnButton && !startedOnTimeline && !isScrubbingRef.current) {
      holdTimerRef.current = window.setTimeout(() => {
        isHoldingRef.current = true;
        suppressControlsRef.current = true;
        pauseVideo();
        // Holding the video pauses playback silently. Do not reveal the
        // pause/play or mute controls while the finger is held down.
        hideControls();
      }, HOLD_DELAY_MS);
    }
  };

  const handleTouchMove = (event) => {
    const touch = event.touches?.[0];
    const start = touchStartRef.current;
    if (!touch || !start) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!gestureAxisRef.current && (absDx > TAP_MOVEMENT_PX || absDy > TAP_MOVEMENT_PX)) {
      gestureAxisRef.current = absDx > absDy ? "x" : "y";
      clearHoldTimer();
      isHoldingRef.current = false;
    }

    if (gestureAxisRef.current === "y") {
      event.stopPropagation();
      onVerticalSwipeMove?.(dy);
      return;
    }

    if (gestureAxisRef.current === "x" && start.bottomArea) {
      event.preventDefault();
      event.stopPropagation();
      beginScrubbing();
      scrubToClientX(touch.clientX);
    }
  };

  const handleTouchEnd = (event) => {
    const touch = event.changedTouches?.[0];
    const start = touchStartRef.current;
    const endedOnButton = event.target?.closest?.("button");
    clearHoldTimer();
    if (!touch || !start) return;
    if (endedOnButton) {
      touchStartRef.current = null;
      gestureAxisRef.current = null;
      isHoldingRef.current = false;
      isScrubbingRef.current = false;
      return;
    }

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const axis = gestureAxisRef.current;
    const wasHolding = isHoldingRef.current;
    const wasScrubbing = isScrubbingRef.current;
    const startedOnTimeline = start.timeline;

    touchStartRef.current = null;
    gestureAxisRef.current = null;
    isHoldingRef.current = false;
    isScrubbingRef.current = false;

    if (axis === "y") {
      event.stopPropagation();
      onVerticalSwipe?.(dy);
      return;
    }

    if (wasScrubbing) {
      event.preventDefault();
      event.stopPropagation();
      finishScrubbing();
      return;
    }

    if (wasHolding) {
      event.stopPropagation();
      touchHandledRef.current = true;
      suppressControlsRef.current = false;
      playVideo();
      hideControls();
      window.setTimeout(() => { touchHandledRef.current = false; }, 400);
      return;
    }

    if (startedOnTimeline) return;

    if (Math.hypot(dx, dy) < TAP_MOVEMENT_PX) {
      event.stopPropagation();
      touchHandledRef.current = true;
      if (isInPlaybackTapArea(start.x, start.y)) {
        togglePlayback();
      } else {
        showControls(true, false);
      }
      window.setTimeout(() => { touchHandledRef.current = false; }, 400);
    }
  };

  const handleTouchCancel = () => {
    clearHoldTimer();
    touchStartRef.current = null;
    gestureAxisRef.current = null;
    isHoldingRef.current = false;
    suppressControlsRef.current = false;
    isScrubbingRef.current = false;
    wasPlayingBeforeScrubRef.current = false;
    setIsScrubbing(false);
    pointerScrubRef.current = false;
  };

  // Framer Motion's parent card listens for pointerdown to start the voting
  // drag. Claim the bottom scrub zone before that listener sees the gesture.
  const handlePointerDownCapture = (event) => {
    const isBottomScrub = isolateScrubGesture && isInBottomArea(event.clientY);
    pointerScrubRef.current = isBottomScrub;
    const startedOnTimeline = event.target?.closest?.('[data-video-timeline="true"]');
    if (!isBottomScrub && !startedOnTimeline && !event.target?.closest?.("button")) {
      pointerTapStartRef.current = { x: event.clientX, y: event.clientY, pointerType: event.pointerType };
    } else {
      pointerTapStartRef.current = null;
    }
    if (isBottomScrub) event.stopPropagation();
  };

  const handlePointerMoveCapture = (event) => {
    if (pointerScrubRef.current) event.stopPropagation();
  };

  const handlePointerUpCapture = (event) => {
    if (pointerScrubRef.current) event.stopPropagation();
    pointerScrubRef.current = false;

    const start = pointerTapStartRef.current;
    pointerTapStartRef.current = null;
    if (!start || start.pointerType !== "touch" || event.target?.closest?.("button")) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= TAP_MOVEMENT_PX) return;

    // TouchEvent normally handles this first. The deferred fallback covers
    // browsers where a parent gallery gesture prevents touchend from reaching
    // this component, while touchHandledRef prevents a double toggle.
    window.setTimeout(() => {
      if (touchHandledRef.current) return;
      touchHandledRef.current = true;
      togglePlayback();
      window.setTimeout(() => { touchHandledRef.current = false; }, 400);
    }, 0);
  };

  const handleClick = (event) => {
    if (touchHandledRef.current || event.target?.closest?.("button") || event.target?.closest?.('[data-video-timeline="true"]')) return;
    if (isInPlaybackTapArea(event.clientX, event.clientY)) togglePlayback();
    else showControls(true, false);
  };

  const handleSeek = (event) => {
    const requestedTime = Number(event.target.value);
    if (!videoRef.current || !Number.isFinite(requestedTime)) return;
    const atEnd = duration > 0 && requestedTime >= duration;
    const nextTime = atEnd ? Math.max(0, duration - 0.05) : requestedTime;
    endProgressLockRef.current = atEnd;
    endProgressSeekPendingRef.current = atEnd;
    videoRef.current.currentTime = nextTime;
    syncBackgroundTime(nextTime);
    setCurrentTime(atEnd ? duration : nextTime);
    const nextPercent = atEnd || duration <= 0
      ? (atEnd ? 100 : 0)
      : clamp((nextTime / duration) * 100, 0, 100);
    setProgressPercent(nextPercent);
    setScrubPercent(nextPercent);
    beginScrubbing();
    showControls(true);
  };

  const stopSeekPropagation = (event) => {
    event.stopPropagation();
  };

  const handleTimelinePointerDown = (event) => {
    event.stopPropagation();
    beginScrubbing();
  };

  const handleTimelinePointerUp = (event) => {
    event.stopPropagation();
    finishScrubbing();
  };

  const videoStyle = stableLayout
    ? {
        width: "100%",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit,
      }
    : {
        aspectRatio: aspectRatio ? `${aspectRatio}` : undefined,
        maxWidth: "100%",
        maxHeight: "100%",
        width: aspectRatio && aspectRatio < 1 ? "auto" : "100%",
        height: aspectRatio && aspectRatio < 1 ? "100%" : "auto",
        objectFit,
      };

  const bottomInsetStyle = bottomInset > 0
    ? {
        height: `max(0px, calc(100% - ${bottomInset}px))`,
        alignSelf: "flex-start",
      }
    : {};

  const wrapperStyle = stableLayout
    ? { ...style, ...bottomInsetStyle }
    : aspectRatio
      ? {
          aspectRatio: `${aspectRatio}`,
          maxWidth: "100%",
          maxHeight: "100%",
          width: aspectRatio < 1 ? "auto" : "100%",
          height: aspectRatio < 1 ? "100%" : "auto",
          ...style,
          ...bottomInsetStyle,
        }
      : { ...style, ...bottomInsetStyle };

  const mediaFrameStyle = stableLayout && aspectRatio
    ? {
        position: "relative",
        aspectRatio: `${aspectRatio}`,
        width: aspectRatio >= 1 ? "100%" : "auto",
        height: aspectRatio >= 1 ? "auto" : "100%",
        maxWidth: "100%",
        maxHeight: "100%",
      }
    : {
        position: "relative",
        width: "100%",
        height: "100%",
      };

  const controlsShown = controlsVisible || (!isPlaying && !suppressControlsRef.current);

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center max-w-full max-h-full ${stableLayout ? "w-full h-full" : ""} ${className}`}
      style={{ ...wrapperStyle, touchAction: "none" }}
      data-video-player="true"
      onClick={handleClick}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={handlePointerUpCapture}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      role="group"
      aria-label={isPlaying ? "Playing video" : "Paused video"}
    >
      {blurredBackdrop && (
        <video
          ref={backgroundVideoRef}
          src={src}
          muted
          autoPlay={false}
          loop
          playsInline
          preload={preload}
          className="absolute inset-0 w-full h-full max-w-none max-h-none object-cover scale-110 blur-2xl opacity-60 pointer-events-none select-none"
          style={{ zIndex: 0 }}
          data-video-backdrop="true"
          onLoadedMetadata={() => syncBackgroundTime(videoRef.current?.currentTime || 0)}
          onCanPlay={() => {
            if (!videoRef.current?.paused) playBackgroundVideo();
          }}
          aria-hidden="true"
        />
      )}
      <div
        ref={mediaFrameRef}
        className="relative z-10 flex max-w-full max-h-full items-center justify-center"
        style={mediaFrameStyle}
        data-video-frame="true"
      >
      <video
        ref={videoRef}
        src={src}
        muted={isMuted}
        autoPlay={autoPlay}
        loop={loop}
        playsInline
        preload={preload}
        className="relative z-10 max-w-full max-h-full select-none pointer-events-none"
        style={videoStyle}
        onLoadedMetadata={syncMetadata}
        onCanPlay={() => {
          if (blurredBackdrop && !videoRef.current?.paused) playBackgroundVideo();
        }}
        onDurationChange={syncMetadata}
        onTimeUpdate={syncTime}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        data-video-main="true"
        aria-hidden="true"
      />

          <div
            className={`absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center ${
              controlsShown ? "visible pointer-events-auto" : "invisible pointer-events-none"
            }`}
            data-video-controls="true"
            style={{ background: "transparent", opacity: 1, mixBlendMode: "normal" }}
          >
            <button
              type="button"
              className="group relative isolate overflow-hidden w-8 h-8 mb-3 rounded-full border-0 bg-transparent text-white flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute video" : "Mute video"}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-black/50 backdrop-blur-sm transition-colors group-hover:bg-black/70"
              />
              {isMuted
                ? <VolumeX size={16} className="relative z-10" />
                : <Volume2 size={16} className="relative z-10" />}
            </button>
            {showPlaybackControl && (
              <button
                type="button"
                className="group relative isolate overflow-hidden w-14 h-14 rounded-full border-0 bg-transparent text-white flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                onClick={(event) => {
                  event.stopPropagation();
                  togglePlayback();
                }}
                aria-label={isPlaying ? "Pause video" : "Play video"}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-black/50 backdrop-blur-sm transition-colors group-hover:bg-black/70"
                />
                {isPlaying
                  ? <Pause size={24} fill="currentColor" className="relative z-10" />
                  : <Play size={24} fill="currentColor" className="relative z-10 ml-0.5" />}
              </button>
            )}
          </div>

          <div
            className="absolute inset-x-0 bottom-0 z-20 h-10 px-0 text-white"
            data-video-timeline="true"
            onClick={stopSeekPropagation}
            onPointerDown={handleTimelinePointerDown}
            onPointerUp={handleTimelinePointerUp}
          >
              {isScrubbing && (
                <span
                  className="absolute bottom-4 -translate-x-1/2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums text-white pointer-events-none"
                  style={{ left: `${scrubPercent}%` }}
                  data-video-scrub-time="true"
                >
                  {formatTime(currentTime)}
                </span>
              )}
              <div
                className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-gray-700/90"
                data-video-timeline-track="true"
              >
                <div
                  className="absolute inset-0 origin-left rounded-full bg-gray-300"
                  style={{
                    transform: `scaleX(${progressPercent / 100})`,
                    transformOrigin: "left center",
                    transition: isScrubbing ? "none" : "transform 80ms linear",
                  }}
                  data-video-timeline-progress="true"
                />
              </div>
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.01"
                value={Math.min(currentTime, duration || 0)}
                onChange={handleSeek}
                className="absolute inset-x-0 inset-y-0 h-10 w-full cursor-pointer appearance-none bg-transparent opacity-0"
                aria-label="Video progress"
              />
          </div>
        </div>
    </div>
  );
}
