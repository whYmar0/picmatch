import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useMediaSource } from "../hooks/useMediaSource";

export const MediaImage = forwardRef(function MediaImage({ src, onError, onLoad, ...props }, ref) {
  const source = useMediaSource(src);
  return <img {...props} ref={ref} src={source.url} referrerPolicy="no-referrer"
    onLoad={event => { source.loaded(); onLoad?.(event); }}
    onError={event => { if (!source.retry()) onError?.(event); }} />;
});

export const MotionMediaImage = motion(MediaImage);

export const MediaVideo = forwardRef(function MediaVideo({ src, onError, onLoadedMetadata, onTimeUpdate, onPlay, onPause, onSourceReset, ...props }, ref) {
  const source = useMediaSource(src);
  const playback = useRef({ time: 0, playing: false });
  const restore = useRef(null);
  const element = useRef(null);
  const resetHandler = useRef(onSourceReset);
  resetHandler.current = onSourceReset;
  const setRef = useCallback(node => {
    element.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  useLayoutEffect(() => {
    playback.current = { time: 0, playing: false };
    restore.current = null;
    const video = element.current;
    resetHandler.current?.();
    return () => {
      if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
    };
  }, [source.identity]);

  // A new session gets a new element: Chromium retains old currentSrc even after load().
  return <video {...props} key={source.identity} ref={setRef} src={source.url}
    onTimeUpdate={event => { playback.current.time = event.currentTarget.currentTime; onTimeUpdate?.(event); }}
    onPlay={event => { playback.current.playing = true; onPlay?.(event); }}
    onPause={event => {
      if (!event.currentTarget.error && !restore.current) playback.current.playing = false;
      onPause?.(event);
    }}
    onLoadedMetadata={event => {
      source.loaded();
      const resume = restore.current;
      if (resume) {
        restore.current = null;
        const video = event.currentTarget;
        video.currentTime = Number.isFinite(video.duration) ? Math.min(resume.time, video.duration) : resume.time;
        if (resume.playing) video.play().catch(() => {});
      }
      onLoadedMetadata?.(event);
    }}
    onError={event => {
      restore.current = { ...playback.current };
      if (!source.retry()) { restore.current = null; onError?.(event); }
    }} />;
});
