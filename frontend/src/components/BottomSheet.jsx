/**
 * components/BottomSheet.jsx — iOS-style bottom sheet
 * Slides up from the bottom with a backdrop, draggable to dismiss.
 * Used for: voter list, per-photo reaction drill-down, sort/filter sheets in viewer.
 *
 * Stackable via `zIndex` — render multiple BottomSheets as siblings.
 * State isolation is guaranteed because each instance owns its own
 * `useAnimation` controls and motion values.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from "framer-motion";
import { X } from "lucide-react";

// ─── Ref-counted body scroll lock ─────────────────────────────────────────────
// Multiple BottomSheets can stack (e.g. primary + secondary). Per-instance
// locking causes races: the secondary closing unlocks the body even though
// the primary is still open. Track lock holders module-wide instead.
let bodyLockHolders = 0;
function lockBody() {
  bodyLockHolders += 1;
  if (bodyLockHolders === 1) document.body.style.overflow = "hidden";
}
function unlockBody() {
  bodyLockHolders = Math.max(0, bodyLockHolders - 1);
  if (bodyLockHolders === 0) document.body.style.overflow = "";
}

export default function BottomSheet({
  open,
  onClose,
  title,
  topContent,
  headerChildren,
  children,
  footer,
  sharedY,
  onHorizontalSwipe,
  zIndex = 50,
  hideHeader = false,
  closeOnEscape = true,
  backdropBlur = true,
  backdropDim = true,
  heightVh = 0.95,
  testId,
  viewportHeight,
  gestureActive = false,
  gestureY,
}) {
  const sheetRef = useRef(null);
  const horizontalGestureRef = useRef({ x: 0, y: 0 });
  const controls = useAnimation();
  const [vh, setVh] = useState(
    viewportHeight ?? (typeof window !== "undefined"
      ? (window.visualViewport?.height || window.innerHeight)
      : 800)
  );

  // Snap points:
  // - 0 means fully expanded
  // - defaultOffset means the partial/half state
  const defaultOffset = vh * 0.35;
  const dismissOffset = vh * 0.8;
  const partialOffset = defaultOffset;
  // Start at the same partial point used by AlbumGallery's shared motion
  // value, preventing a one-frame photo/sheet overlap on open.
  const y = useMotionValue(defaultOffset);

  // Scale top content as we drag. 
  // It stops shrinking once the sheet takes 60% space (y reaches defaultOffset).
  const scale = useTransform(y, [0, defaultOffset, dismissOffset], [0.85, 1, 1]);
  // Fade out top content only when dragging DOWN to dismiss
  const topOpacity = useTransform(y, [defaultOffset, dismissOffset], [1, 0]);
  // Footer fades out when sheet is dragged toward dismiss
  const footerOpacity = useTransform(y, [defaultOffset, defaultOffset + 100], [1, 0]);

  const handleSheetPointerDown = (event) => {
    horizontalGestureRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleSheetPointerUp = (event) => {
    if (!onHorizontalSwipe) return;
    const { x, y: startY } = horizontalGestureRef.current;
    const dx = event.clientX - x;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      onHorizontalSwipe(dx < 0 ? "next" : "previous");
    }
    horizontalGestureRef.current = { x: 0, y: 0 };
  };

  const handleSheetPointerCancel = () => {
    horizontalGestureRef.current = { x: 0, y: 0 };
  };

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => {
      if (viewportHeight == null) {
        setVh(Math.round(viewport?.height || window.innerHeight));
      }
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
  }, [viewportHeight]);

  useEffect(() => {
    if (viewportHeight != null) setVh(viewportHeight);
  }, [viewportHeight]);

  // Close on Escape key and initialize the sheet at the current progressive
  // gesture position instead of waiting for the gesture to finish.
  useEffect(() => {
    if (!open) return;
    if (gestureActive && gestureY) {
      const current = gestureY.get();
      y.set(current);
      controls.set({ y: current });
    } else {
      const pendingGestureSnap = gestureY?.get();
      const target = Number.isFinite(pendingGestureSnap) && pendingGestureSnap < vh - 1
        ? pendingGestureSnap
        : defaultOffset;
      controls.start({ y: target, transition: { type: "spring", stiffness: 350, damping: 35 } });
    }
    const handler = (e) => { if (e.key === "Escape" && closeOnEscape) handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, controls, defaultOffset, closeOnEscape, gestureActive, gestureY, y, vh]);

  // While the sheet is being opened from the bottom controls, follow the
  // parent's gesture motion value directly. This keeps the panel under the
  // finger instead of mounting it only after release.
  useEffect(() => {
    if (!gestureActive || !gestureY) return undefined;
    const syncGesture = (latest) => {
      y.set(latest);
      controls.set({ y: latest });
    };
    syncGesture(gestureY.get());
    return gestureY.on("change", syncGesture);
  }, [gestureActive, gestureY, controls, y]);

  // Prevent body scroll (ref-counted across all BottomSheet instances)
  useEffect(() => {
    if (open) lockBody();
    return () => { if (open) unlockBody(); };
  }, [open]);

  // Report y position to parent for photo shrink
  useEffect(() => {
    if (!sharedY) return;
    sharedY.set(y.get());
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

    // A fast/large downward gesture closes; a smaller downward gesture from
    // the expanded state returns to the partial snap point.
    if (velocity > 700 || currentY > defaultOffset + vh * 0.25) {
      handleClose();
    } else if (currentY > 35 || velocity > 160) {
      controls.start({ y: partialOffset, transition: { type: "spring", stiffness: 350, damping: 35 } });
    } else {
      controls.start({ y: 0, transition: { type: "spring", stiffness: 350, damping: 35 } });
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 flex flex-col items-center justify-end overflow-hidden"
          style={{ zIndex }}
          data-testid={testId}
        >
          {/* Backdrop (Blur + Dimming) */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            data-testid={testId ? `${testId}-backdrop` : undefined}
            data-dim={backdropDim ? "true" : "false"}
            className={`fixed inset-[-50vh] -inset-x-0 ${backdropDim ? "bg-black/60" : "bg-transparent"} ${backdropBlur ? "backdrop-blur-xl" : ""}`}
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
            data-testid={testId ? `${testId}-panel` : undefined}
            initial={{ y: vh }}
            animate={controls}
            exit={{ y: vh }}
            style={{
              y,
              height: Math.max(320, vh * heightVh),
              marginTop: "auto",
              touchAction: "pan-y",
              willChange: "transform",
            }}
            onPointerDown={handleSheetPointerDown}
            onPointerUp={handleSheetPointerUp}
            onPointerCancel={handleSheetPointerCancel}
            onUpdate={(latest) => {
              if (sharedY && Number.isFinite(latest.y)) sharedY.set(latest.y);
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: vh }}
            // Never allow the fully expanded sheet to stretch above the
            // viewport. Bottom elasticity is retained for a natural dismiss
            // gesture, while the top edge is a hard stop.
            dragElastic={{ top: 0, bottom: 0.1 }}
            onDragEnd={onDragEnd}
            className="absolute bottom-0 w-full z-20
                       bg-card-light dark:bg-card-dark
                       rounded-t-[2.5rem] shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.32)]
                       flex flex-col"
          >
            {/* Drag handle */}
            <div
              data-testid={testId ? `${testId}-handle` : undefined}
              className="flex-shrink-0 pt-4 pb-2 flex justify-center"
            >
              <div className="w-12 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700" />
            </div>

            {/* Header */}
            <div className="flex-shrink-0 border-b border-border-light dark:border-border-dark">
              {!hideHeader && (
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
              )}
              {headerChildren && (
                <div className="px-6 pb-3">{headerChildren}</div>
              )}
            </div>

            {/* Scrollable content */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 pt-5 pb-[calc(max(1.25rem,env(safe-area-inset-bottom))+4rem)]"
              data-testid={testId ? `${testId}-content` : undefined}
            >
              {children}
            </div>
          </motion.div>

          {/* Footer — sibling of sheet, pinned to viewport bottom */}
          {footer && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ opacity: footerOpacity }}
              className="absolute bottom-0 left-0 right-0 z-20
                         bg-card-light dark:bg-card-dark
                         px-4 sm:px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]
                         shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.15)]"
            >
              {footer}
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}
