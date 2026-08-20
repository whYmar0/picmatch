/**
 * AvatarCropModal.jsx
 * Circular avatar cropper with drag + zoom support.
 * Uses HTML Canvas — no extra dependencies needed.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ZoomIn, ZoomOut, Check } from "lucide-react";

const CANVAS_SIZE = 300; // output square size (px)
const MIN_ZOOM    = 1;
const MAX_ZOOM    = 4;

export default function AvatarCropModal({ src, onConfirm, onCancel }) {
  const canvasRef   = useRef(null);
  const imgRef      = useRef(null);

  // Crop state
  const [zoom,   setZoom]   = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  // Drag state
  const dragging  = useRef(false);
  const lastPos   = useRef({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // ── Load image ──
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = src;
  }, [src]);

  // ── Draw canvas ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !imgSize.w) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Scale image to fit canvas at zoom=1 (cover)
    const scale = Math.max(CANVAS_SIZE / imgSize.w, CANVAS_SIZE / imgSize.h) * zoom;
    const dw = imgSize.w * scale;
    const dh = imgSize.h * scale;

    // Center + offset
    const dx = (CANVAS_SIZE - dw) / 2 + offset.x;
    const dy = (CANVAS_SIZE - dh) / 2 + offset.y;

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();

    // Subtle vignette border
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth   = 2;
    ctx.stroke();
  }, [zoom, offset, imgSize]);

  useEffect(() => { draw(); }, [draw]);

  // ── Drag handlers ──
  const startDrag = (x, y) => {
    dragging.current = true;
    lastPos.current  = { x, y };
    setIsDragging(true);
  };
  const moveDrag = (x, y) => {
    if (!dragging.current) return;
    const dx = x - lastPos.current.x;
    const dy = y - lastPos.current.y;
    lastPos.current = { x, y };
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };
  const endDrag = () => {
    dragging.current = false;
    setIsDragging(false);
  };

  // Mouse
  const onMouseDown = (e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); };
  const onMouseMove = (e) => moveDrag(e.clientX, e.clientY);
  const onMouseUp   = () => endDrag();

  // Touch
  const onTouchStart = (e) => startDrag(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchMove  = (e) => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); };
  const onTouchEnd   = () => endDrag();

  // Wheel zoom
  const onWheel = (e) => {
    e.preventDefault();
    setZoom(prev => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev - e.deltaY * 0.005)));
  };

  // ── Confirm: export canvas as Blob → File ──
  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      onConfirm(file);
    }, "image/jpeg", 0.9);
  };

  if (!src) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="avatar-crop-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[999] flex items-center justify-center px-4"
        style={{ background: "rgba(0,0,0,0.72)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      >
        <motion.div
          key="avatar-crop-modal"
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.88, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card p-6 w-full max-w-sm flex flex-col gap-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg">Adjust avatar</h3>
            <button onClick={onCancel} className="btn-ghost w-9 h-9 rounded-xl text-gray-400">
              <X size={16} />
            </button>
          </div>

          {/* Canvas */}
          <div className="flex justify-center">
            <div
              className="relative rounded-full overflow-hidden shadow-lg"
              style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, cursor: isDragging ? "grabbing" : "grab" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onWheel={onWheel}
            >
              <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                style={{ display: "block", width: CANVAS_SIZE, height: CANVAS_SIZE, borderRadius: "50%" }}
              />
              {/* Circle overlay guide */}
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}
              />
            </div>
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-3 px-1">
            <ZoomOut size={15} className="text-gray-400 flex-shrink-0" />
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-primary-400 h-1.5 rounded-full cursor-pointer"
            />
            <ZoomIn size={15} className="text-gray-400 flex-shrink-0" />
          </div>

          <p className="text-center text-xs text-gray-400">
            Drag to reposition · scroll or slider to zoom
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={onCancel}  className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleConfirm} className="btn-primary flex-1">
              <Check size={15} /> Save avatar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
