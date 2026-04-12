/**
 * components/BottomSheet.jsx — iOS-style bottom sheet
 * Slides up from the bottom with a backdrop, draggable to dismiss.
 * Used for: voter list, per-photo reaction drill-down.
 */
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export default function BottomSheet({ open, onClose, title, topContent, children }) {
  const sheetRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

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

          {/* Optional: Top content (e.g. image) sliding in from top or just fading */}
          {topContent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative flex-1 w-full flex items-center justify-center p-4 z-10 pointer-events-none"
            >
              <div className="pointer-events-auto max-w-full max-h-full">
                {topContent}
              </div>
            </motion.div>
          )}

          {/* Sheet */}
          <motion.div
            key="sheet"
            ref={sheetRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => { if (info.offset.y > 80) onClose(); }}
            className="relative w-full z-10
                       bg-card-light dark:bg-card-dark
                       rounded-t-[2.5rem] shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.32)]
                       max-h-[80dvh] flex flex-col"
          >
            {/* Drag handle */}
            <div className="flex-shrink-0 pt-4 pb-2 flex justify-center">
              <div className="w-12 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700" />
            </div>

            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4
                            border-b border-border-light dark:border-border-dark">
              <h3 className="font-bold text-lg">{title}</h3>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-2xl flex items-center justify-center
                           text-gray-400 hover:bg-border-light dark:hover:bg-border-dark
                           transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
