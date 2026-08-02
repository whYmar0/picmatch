/**
 * components/ImageLightbox.jsx
 * Full-screen image overlay (WhatsApp / Telegram style).
 * Features:
 *   - Framer Motion fade+scale entrance
 *   - Pinch-to-zoom via native touch events (no external lib)
 *   - Double-tap to toggle zoom
 *   - Swipe down ≥ 80 px to close
 *   - Tap backdrop to close
 */
import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { X, ZoomIn } from "lucide-react";
import { isVideoUrl } from "../utils/media";
import VideoPlayer from "./VideoPlayer";

// ─── Pinch-zoom hook ──────────────────────────────────────────────────────────
function usePinchZoom({ minScale = 1, maxScale = 5 } = {}) {
  const [scale, setScale]         = useState(1);
  const [origin, setOrigin]       = useState({ x: 0, y: 0 });
  const scaleRef                  = useRef(1);
  const lastDist                  = useRef(null);
  const lastTap                   = useRef(0);

  const getDistance = (t1, t2) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const getMidpoint = (t1, t2) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  });

  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      lastDist.current = getDistance(e.touches[0], e.touches[1]);
      const mid = getMidpoint(e.touches[0], e.touches[1]);
      setOrigin(mid);
    }
    // Double-tap to toggle zoom
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 280) {
        const newScale = scaleRef.current > 1.5 ? 1 : 2.5;
        scaleRef.current = newScale;
        setScale(newScale);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      if (lastDist.current) {
        const ratio    = dist / lastDist.current;
        const newScale = Math.min(maxScale, Math.max(minScale, scaleRef.current * ratio));
        scaleRef.current = newScale;
        setScale(newScale);
      }
      lastDist.current = dist;
    }
  }, [maxScale, minScale]);

  const onTouchEnd = useCallback((e) => {
    if (e.touches.length < 2) lastDist.current = null;
    // Snap back to 1 if almost no zoom
    if (scaleRef.current < 1.05) {
      scaleRef.current = 1;
      setScale(1);
    }
  }, []);

  const reset = useCallback(() => {
    scaleRef.current = 1;
    setScale(1);
    setOrigin({ x: 0, y: 0 });
  }, []);

  return { scale, origin, onTouchStart, onTouchMove, onTouchEnd, reset };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ImageLightbox({ open, src, alt, onClose, mediaType }) {
  const { scale, origin, onTouchStart, onTouchMove, onTouchEnd, reset } = usePinchZoom();
  const dragStartY = useRef(null);
  const imgRef     = useRef(null);
  const videoDragY = useMotionValue(0);
  const videoScale = useTransform(videoDragY, [0, 240], [1, 0.82]);

  const videoMedia = mediaType === "video" || isVideoUrl(src);

  // Reset zoom when opening
  useEffect(() => { if (open) reset(); }, [open, reset]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // Swipe-down to close on the container
  const handlePointerDown = (e) => {
    if (e.pointerType === "mouse" || e.touches?.length === 1) {
      dragStartY.current = e.clientY ?? e.touches?.[0]?.clientY;
    }
  };
  const handlePointerUp = (e) => {
    const endY = e.clientY ?? e.changedTouches?.[0]?.clientY;
    if (dragStartY.current !== null && scale <= 1.05) {
      const dy = endY - dragStartY.current;
      if (dy > 80) onClose();
    }
    dragStartY.current = null;
  };

  const handleVideoVerticalSwipeMove = (dy) => {
    videoDragY.set(Math.max(0, dy));
  };

  const handleVideoVerticalSwipe = (dy) => {
    if (dy > 80) {
      onClose();
      return;
    }
    animate(videoDragY, 0, {
      type: "spring",
      stiffness: 400,
      damping: 30,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
          onPointerDown={videoMedia ? undefined : handlePointerDown}
          onPointerUp={videoMedia ? undefined : handlePointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={(e) => { if (e.target === e.currentTarget && scale <= 1.05) onClose(); }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full
                       bg-black/60 text-white flex items-center justify-center
                       hover:bg-black/80 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          {/* Zoom indicator */}
          {scale > 1.1 && (
            <div className="absolute top-4 left-4 z-10 bg-black/50 text-white
                            text-xs px-2 py-1 rounded-lg flex items-center gap-1">
              <ZoomIn size={12} /> {Math.round(scale * 10) / 10}×
            </div>
          )}

          {/* Hint */}
          {scale <= 1.05 && (
            <p className="absolute bottom-6 left-0 right-0 text-center
                          text-white/40 text-xs pointer-events-none">
              Pinch to zoom · Double-tap to zoom · Swipe down to close
            </p>
          )}            {/* Image / Video */}
          <motion.div
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1,    opacity: 1 }}
            exit={{ scale: 0.88,    opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="w-full h-full flex items-center justify-center"
            style={{ touchAction: "none", y: videoMedia ? videoDragY : 0 }}
          >
            {videoMedia ? (
              <motion.div
                className="w-full h-full flex items-center justify-center"
                style={{ scale: videoMedia ? videoScale : 1 }}
              >
                <VideoPlayer
                  src={src}
                  className="max-w-full max-h-full"
                  preload="auto"
                  autoPlay
                  loop
                  onVerticalSwipeMove={handleVideoVerticalSwipeMove}
                  onVerticalSwipe={handleVideoVerticalSwipe}
                />
              </motion.div>
            ) : (
              <img
                ref={imgRef}
                src={src}
                alt={alt}
                draggable={false}
                loading="eager"
                fetchpriority="high"
                decoding="sync"
                className="max-w-full max-h-full object-contain select-none pointer-events-none"
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: `${origin.x}px ${origin.y}px`,
                  transition: scale === 1 ? "transform 0.22s ease" : "none",
                  willChange: "transform",
                }}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
