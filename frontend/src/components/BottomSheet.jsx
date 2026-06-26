/**
 * components/BottomSheet.jsx — iOS-style bottom sheet
 * Slides up from the bottom with a backdrop, draggable to dismiss.
 * Used for: voter list, per-photo reaction drill-down.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { X } from "lucide-react";

export default function BottomSheet({ open, onClose, title, topContent, headerChildren, children, sharedY }) {
  const sheetRef = useRef(null);
  const controls = useAnimation();
  const y = useMotionValue(0);
  const [vh, setVh] = useState(
    typeof window !== "undefined"
      ? (window.visualViewport?.height || window.innerHeight)
      : 800
  );

  // Snap points: 
  // - 0 means fully expanded (95vh height)
  // - defaultOffset means 60vh visible (sheet is translated down by 35vh)
  const defaultOffset = vh * 0.35;
  const dismissOffset = vh * 0.8;

  // Scale top content as we drag. 
  // It stops shrinking once the sheet takes 60% space (y reaches defaultOffset).
  const scale = useTransform(y, [0, defaultOffset, dismissOffset], [0.85, 1, 1]);
  // Fade out top content only when dragging DOWN to dismiss
  const topOpacity = useTransform(y, [defaultOffset, dismissOffset], [1, 0]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => {
      setVh(Math.round(viewport?.height || window.innerHeight));
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    controls.start({ y: defaultOffset, transition: { type: "spring", stiffness: 350, damping: 35 } });
    const handler = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, controls, defaultOffset]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Report y position to parent for photo shrink
  useEffect(() => {
    if (!sharedY) return;
    const unsub = y.on("change", (latest) => {
      sharedY.set(latest);
    });
    return unsub;
  }, [y, sharedY]);

  const handleClose = async () => {
    await controls.start({ y: vh, transition: { duration: 0.25 } });
    onClose();
  };

  const onDragEnd = (_, info) => {
    const velocity = info.velocity.y;
    const currentY = y.get();

    // If swiped down fast, close
    if (velocity > 500) {
      handleClose();
    } else if (currentY > defaultOffset + 100) {
      // Dragged down past threshold, close
      handleClose();
    } else if (currentY < defaultOffset - 80 || velocity < -500) {
      // Dragged up or swiped up, expand fully
      controls.start({ y: 0, transition: { type: "spring", stiffness: 350, damping: 35 } });
    } else {
      // Snap back to default
      controls.start({ y: defaultOffset, transition: { type: "spring", stiffness: 350, damping: 35 } });
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-end overflow-hidden">
          {/* Backdrop (Blur + Dimming) */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="fixed inset-[-50vh] -inset-x-0 bg-black/60 backdrop-blur-xl"
            onClick={onClose}
          />

          {/* Optional: Top content (e.g. image) */}
          {topContent && (
            <motion.div 
              style={{ opacity: topOpacity }}
              className="absolute top-0 left-0 w-full h-[40dvh] flex items-center justify-center p-4 z-10 pointer-events-none"
            >
              <motion.div
                style={{ scale }}
                className="pointer-events-auto max-w-full max-h-full"
              >
                {topContent}
              </motion.div>
            </motion.div>
          )}

          {/* Sheet */}
          <motion.div
            key="sheet"
            ref={sheetRef}
            initial={{ y: vh }}
            animate={controls}
            exit={{ y: vh }}
            style={{ y, height: Math.max(320, vh * 0.95), marginTop: "auto" }}
            drag="y"
            dragConstraints={{ top: 0, bottom: vh }}
            dragElastic={0.1}
            onDragEnd={onDragEnd}
            className="absolute bottom-0 w-full z-20
                       bg-card-light dark:bg-card-dark
                       rounded-t-[2.5rem] shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.32)]
                       flex flex-col"
          >
            {/* Drag handle */}
            <div className="flex-shrink-0 pt-4 pb-2 flex justify-center">
              <div className="w-12 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700" />
            </div>

            {/* Header */}
            <div className="flex-shrink-0 border-b border-border-light dark:border-border-dark">
              <div className="flex items-center justify-between px-6 py-4">
                <h3 className="font-bold text-lg">{title}</h3>
                <button
                  onClick={handleClose}
                  className="w-10 h-10 rounded-2xl flex items-center justify-center
                             text-gray-400 hover:bg-border-light dark:hover:bg-border-dark
                             transition-colors"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              {headerChildren && (
                <div className="px-6 pb-3">{headerChildren}</div>
              )}
            </div>

            {/* Scrollable content */}
            <div className="flex flex-col flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
