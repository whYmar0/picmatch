import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

const TAP_MOVEMENT_PX = 12;
const HOLD_DELAY_MS = 120;
const CONTROLS_HIDE_MS = 2500;
const SCRUB_HIDE_MS = 800;

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
 * ImageLightbox can keep ownership of their dismiss animations. A horizontal
 * gesture that starts in the bottom 25% is consumed locally for scrubbing;
 * upper-area horizontal gestures continue bubbling to the gallery carousel.
 */
export default function VideoPlayer({
  src,
  className = "",
  style,
  muted = false,
  preload = "metadata",
  autoPlay = false,
  loop = false,
  objectFit = "contain",
  stableLayout = false,
  onVerticalSwipe,
  onVerticalSwipeMove,
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const holdTimerRef = useRef(null);
  const controlsTimerRef = useRef(null);
  const scrubTimerRef = useRef(null);
  const touchStartRef = useRef(null);
  const gestureAxisRef = useRef(null);
  const isHoldingRef = useRef(false);
  const isScrubbingRef = useRef(false);
  const touchHandledRef = useRef(false);
  const isMutedRef = useRef(muted);

  const [aspectRatio, setAspectRatio] = useState(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

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

  const clearScrubTimer = () => {
    if (scrubTimerRef.current) {
      window.clearTimeout(scrubTimerRef.current);
      scrubTimerRef.current = null;
    }
  };

  const showControls = (autoHide = true) => {
    clearControlsTimer();
    setControlsVisible(true);
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
    clearScrubTimer();
  }, []);

  useEffect(() => {
    isMutedRef.current = muted;
    setIsMuted(muted);
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

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
    if (Number.isFinite(video.duration)) setDuration(video.duration);
  };

  const syncTime = (event) => {
    const video = event.currentTarget;
    setCurrentTime(video.currentTime || 0);
    if (Number.isFinite(video.duration)) setDuration(video.duration);
  };

  const playVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    const promise = video.play();
    if (promise?.catch) promise.catch(() => setIsPlaying(false));
  };

  const pauseVideo = () => videoRef.current?.pause();

  const togglePlayback = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused || videoRef.current.ended) {
      playVideo();
      hideControls();
    } else {
      pauseVideo();
      showControls(true);
    }
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(duration || 0);
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

  const isInBottomArea = (clientY) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return !!rect && clientY >= rect.top + rect.height * 0.75;
  };

  const scrubToClientX = (clientX) => {
    const video = videoRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!video || !rect || !Number.isFinite(duration) || duration <= 0) return;
    const percentage = clamp((clientX - rect.left) / rect.width, 0, 1);
    const nextTime = percentage * duration;
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;

    const startedOnButton = event.target?.closest?.("button");
    touchHandledRef.current = false;
    gestureAxisRef.current = null;
    isHoldingRef.current = false;
    isScrubbingRef.current = false;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      bottomArea: isInBottomArea(touch.clientY),
    };

    clearHoldTimer();
    if (!startedOnButton) {
      holdTimerRef.current = window.setTimeout(() => {
        isHoldingRef.current = true;
        pauseVideo();
        // Keep the controls visible for the whole hold and briefly after the
        // finger is released, so the pause state is discoverable.
        showControls(true);
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
      isScrubbingRef.current = true;
      setShowTimeline(true);
      clearScrubTimer();
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
      clearScrubTimer();
      scrubTimerRef.current = window.setTimeout(() => {
        setShowTimeline(false);
        scrubTimerRef.current = null;
      }, SCRUB_HIDE_MS);
      return;
    }

    if (wasHolding) {
      event.stopPropagation();
      touchHandledRef.current = true;
      playVideo();
      showControls(true);
      window.setTimeout(() => { touchHandledRef.current = false; }, 400);
      return;
    }

    if (Math.hypot(dx, dy) < TAP_MOVEMENT_PX) {
      event.stopPropagation();
      touchHandledRef.current = true;
      const rect = containerRef.current?.getBoundingClientRect();
      const relX = rect ? (start.x - rect.left) / rect.width : 0.5;
      const relY = rect ? (start.y - rect.top) / rect.height : 0.5;
      if (relX > 0.25 && relX < 0.75 && relY > 0.2 && relY < 0.8) {
        togglePlayback();
      } else {
        showControls(true);
      }
      window.setTimeout(() => { touchHandledRef.current = false; }, 400);
    }
  };

  const handleTouchCancel = () => {
    clearHoldTimer();
    touchStartRef.current = null;
    gestureAxisRef.current = null;
    isHoldingRef.current = false;
    isScrubbingRef.current = false;
  };

  const handleClick = (event) => {
    if (touchHandledRef.current || event.target?.closest?.("button")) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const relX = rect ? (event.clientX - rect.left) / rect.width : 0.5;
    const relY = rect ? (event.clientY - rect.top) / rect.height : 0.5;
    if (relX > 0.25 && relX < 0.75 && relY > 0.2 && relY < 0.8) togglePlayback();
    else showControls(true);
  };

  const handleSeek = (event) => {
    const nextTime = Number(event.target.value);
    if (!videoRef.current || !Number.isFinite(nextTime)) return;
    videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
    showControls(true);
  };

  const stopSeekPropagation = (event) => {
    event.stopPropagation();
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

  const wrapperStyle = stableLayout
    ? style
    : aspectRatio
      ? {
          aspectRatio: `${aspectRatio}`,
          maxWidth: "100%",
          maxHeight: "100%",
          width: aspectRatio < 1 ? "auto" : "100%",
          height: aspectRatio < 1 ? "100%" : "auto",
          ...style,
        }
      : style;

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center max-w-full max-h-full ${stableLayout ? "w-full h-full" : ""} ${className}`}
      style={{ ...wrapperStyle, touchAction: "none" }}
      data-video-player="true"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      role="group"
      aria-label={isPlaying ? "Playing video" : "Paused video"}
    >
      <video
        ref={videoRef}
        src={src}
        muted={isMuted}
        autoPlay={autoPlay}
        loop={loop}
        playsInline
        preload={preload}
        className="max-w-full max-h-full select-none pointer-events-none"
        style={videoStyle}
        onLoadedMetadata={syncMetadata}
        onDurationChange={syncMetadata}
        onTimeUpdate={syncTime}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        aria-hidden="true"
      />

      <div
        className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-150 ${
          controlsVisible || !isPlaying || showTimeline ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        data-video-controls="true"
        aria-hidden={!controlsVisible && isPlaying && !showTimeline}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <button
              type="button"
              className="w-8 h-8 mb-3 rounded-full border-0 bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-colors outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute video" : "Mute video"}
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              type="button"
              className="w-14 h-14 rounded-full border-0 bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-colors outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              onClick={(event) => {
                event.stopPropagation();
                togglePlayback();
              }}
              aria-label={isPlaying ? "Pause video" : "Play video"}
            >
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
            </button>
          </div>
        </div>

        {showTimeline && (
          <div
            className="px-4 pb-3 pt-2 text-white"
            onClick={stopSeekPropagation}
            onTouchStart={stopSeekPropagation}
            onTouchMove={stopSeekPropagation}
            onTouchEnd={stopSeekPropagation}
          >
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.01"
              value={Math.min(currentTime, duration || 0)}
              onChange={handleSeek}
              className="w-full h-1 accent-white cursor-pointer"
              aria-label="Video progress"
            />
            <div className="flex justify-between text-[11px] font-medium tabular-nums mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
