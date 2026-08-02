import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const TAP_MOVEMENT_PX = 12;
const CONTROLS_HIDE_MS = 2500;

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * VideoPlayer — custom, touch-friendly video controls.
 *
 * The video itself is pointer-transparent. The overlay receives taps but lets
 * touch events bubble so AlbumGallery/ImageLightbox can keep their axis-lock
 * gestures (vertical dismiss and horizontal navigation).
 */
export default function VideoPlayer({
  src,
  className = "",
  muted = false,
  preload = "metadata",
  autoPlay = false,
}) {
  const videoRef = useRef(null);
  const hideTimerRef = useRef(null);
  const touchStartRef = useRef(null);
  const touchHandledRef = useRef(false);

  const [aspectRatio, setAspectRatio] = useState(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const showControls = (autoHide = true) => {
    clearHideTimer();
    setControlsVisible(true);
    if (autoHide) {
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
        hideTimerRef.current = null;
      }, CONTROLS_HIDE_MS);
    }
  };

  useEffect(() => () => clearHideTimer(), []);

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

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      const playPromise = video.play();
      if (playPromise?.catch) playPromise.catch(() => setIsPlaying(false));
      showControls(true);
    } else {
      video.pause();
      // Keep the paused state visible briefly, then hide the overlay like
      // YouTube-style players do after an interaction.
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

  const handleTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchHandledRef.current = false;
  };

  const handleTouchEnd = (event) => {
    // The center control is a real button and handles its own click. Avoid
    // toggling once here and again from the button's generated click event.
    if (event.target?.closest?.("button")) {
      touchStartRef.current = null;
      return;
    }
    const touch = event.changedTouches?.[0];
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!touch || !start) return;

    const moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y);
    if (moved < TAP_MOVEMENT_PX) {
      touchHandledRef.current = true;
      handleTap();
      window.setTimeout(() => { touchHandledRef.current = false; }, 400);
    }
  };

  const handleTap = () => {
    // Tapping the video surface only opens the controls. Playback is changed
    // explicitly through the play/pause button, never by tapping the video.
    showControls(true);
  };

  const handleClick = () => {
    if (touchHandledRef.current) return;
    handleTap();
  };

  const handleSeek = (event) => {
    const nextTime = Number(event.target.value);
    if (!videoRef.current || !Number.isFinite(nextTime)) return;
    videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
    showControls(true);
  };

  const stopSeekPropagation = (event) => {
    // Scrubbing belongs to the range control, not the gallery carousel.
    event.stopPropagation();
  };


  const videoStyle = {
    aspectRatio: aspectRatio ? `${aspectRatio}` : undefined,
    maxWidth: "100%",
    maxHeight: "100%",
    width: aspectRatio && aspectRatio < 1 ? "auto" : "100%",
    height: aspectRatio && aspectRatio < 1 ? "100%" : "auto",
    objectFit: "contain",
  };

  const wrapperStyle = aspectRatio
    ? {
        aspectRatio: `${aspectRatio}`,
        maxWidth: "100%",
        maxHeight: "100%",
        width: aspectRatio < 1 ? "auto" : "100%",
        height: aspectRatio < 1 ? "100%" : "auto",
      }
    : undefined;

  return (
    <div
      className={`relative flex items-center justify-center max-w-full max-h-full ${className}`}
      style={wrapperStyle}
      data-video-player="true"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="group"
      aria-label={isPlaying ? "Playing video" : "Paused video"}
    >
      <video
        ref={videoRef}
        src={src}
        muted={muted}
        autoPlay={autoPlay}
        playsInline
        preload={preload}
        className="max-w-full max-h-full object-contain select-none pointer-events-none"
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
        className={`absolute inset-0 flex flex-col justify-between bg-black/40 transition-opacity duration-150 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
        data-video-player="true"
        aria-hidden={!controlsVisible}
      >
        <div className="flex-1 flex items-center justify-center pointer-events-none">
          {controlsVisible && (
            <button
              type="button"
              className="pointer-events-auto w-14 h-14 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/90"
              onClick={(event) => {
                event.stopPropagation();
                togglePlayback();
              }}
              aria-label={isPlaying ? "Pause video" : "Play video"}
            >
              {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
            </button>
          )}
        </div>

        {controlsVisible && (
          <div
            className="px-4 pb-3 pt-2 text-white"
            onClick={(event) => event.stopPropagation()}
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
