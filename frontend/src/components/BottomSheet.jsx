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
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { X } from "lucide-react";

const CLOSE_EASE_OUT = [0.22, 1, 0.36, 1];

// ─── Ref-counted body scroll lock ─────────────────────────────────────────────
// Multiple BottomSheets can stack (e.g. primary + secondary). Per-instance
// locking causes races: the secondary closing unlocks the body even though
// the primary is still open. Track lock holders module-wide instead.
let bodyLockHolders = 0;
let previousBodyOverflow = "";
function lockBody() {
  if (bodyLockHolders === 0) previousBodyOverflow = document.body.style.overflow;
  bodyLockHolders += 1;
  document.body.style.overflow = "hidden";
}
function unlockBody() {
  bodyLockHolders = Math.max(0, bodyLockHolders - 1);
  if (bodyLockHolders !== 0) return;

  // Dashboard owns the outer gallery lock. A sheet must not overwrite that
  // lock when it closes; Dashboard restores the page lock when gallery state
  // changes, and restores the prior page value after the gallery unmounts.
  const restoreOverflow = previousBodyOverflow;
  previousBodyOverflow = "";
  if (restoreOverflow !== "hidden") document.body.style.overflow = restoreOverflow;
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
  onHorizontalSwipeStart,
  onHorizontalSwipeMove,
  onHorizontalSwipeEnd,
  onHorizontalSwipeCancel,
  partialOffsetVh = 0.35,
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
  linearMotion = false,
  animateOnClose = true,
}) {
  const sheetRef = useRef(null);
  const horizontalGestureRef = useRef({ x: 0, y: 0, sheetY: 0 });
  const horizontalSwipeActiveRef = useRef(false);
  const horizontalLastDxRef = useRef(0);
  const horizontalLastDyRef = useRef(0);
  const horizontalEndHandledRef = useRef(false);
  const gestureAxisRef = useRef(null);
  const suppressClickRef = useRef(false);
  const horizontalStartYRef = useRef(0);
  const verticalDragAllowedRef = useRef(false);
  const animationRef = useRef(null);
  const closeStartedRef = useRef(false);
  const closeNotifiedRef = useRef(false);
  const [vh, setVh] = useState(
    viewportHeight ?? (typeof window !== "undefined"
      ? (window.visualViewport?.height || window.innerHeight)
      : 800)
  );

  // Snap points:
  // - 0 means fully expanded
  // - defaultOffset means the partial/half state
  const defaultOffset = vh * partialOffsetVh;
  const dismissOffset = vh * 0.8;
  const partialOffset = defaultOffset;
  const internalY = useMotionValue(vh);
  // When supplied, sharedY is the single source of truth for the sheet,
  // photo-stage geometry, and any floating controls outside this component.
  const y = sharedY || internalY;

  const startYAnimation = (target, transition) => {
    animationRef.current?.stop();
    animationRef.current = animate(y, target, transition);
    return animationRef.current;
  };

  // Scale top content as we drag. 
  // It stops shrinking once the sheet takes 60% space (y reaches defaultOffset).
  const scale = useTransform(y, [0, defaultOffset, dismissOffset], [0.85, 1, 1]);
  // Fade out top content only when dragging DOWN to dismiss
  const topOpacity = useTransform(y, [defaultOffset, dismissOffset], [1, 0]);
  // Footer fades out when sheet is dragged toward dismiss
  const footerOpacity = useTransform(y, [defaultOffset, defaultOffset + 100], [1, 0]);

  const hasHorizontalSwipe = Boolean(
    onHorizontalSwipe || onHorizontalSwipeStart || onHorizontalSwipeMove || onHorizontalSwipeEnd
  );
  // Require a deliberate horizontal lead before locking the axis. This keeps
  // diagonal taps and normal vertical sheet/content gestures from switching
  // tabs accidentally.
  const horizontalActivationDistance = 14;
  const horizontalDominanceRatio = 1.2;
  // A short but deliberate horizontal travel should still be visible under
  // the finger, but only a 32px release commits a tab change. The threshold
  // prevents taps/diagonal drags from switching tabs accidentally.
  const horizontalCommitDistance = 32;

  const handleSheetPointerDown = (event) => {
    // A new gesture always owns the panel, even if the previous tab spring or
    // pointer lifecycle ended one frame earlier. This is important when the
    // user reverses direction and immediately swipes from a nested list item.
    animationRef.current?.stop();
    horizontalGestureRef.current = {
      x: event.clientX,
      y: event.clientY,
      sheetY: y.get(),
      axis: null,
      pointerId: event.pointerId,
      time: Date.now(),
    };
    horizontalStartYRef.current = y.get();
    verticalDragAllowedRef.current = Boolean(
      event.target.closest?.("[data-bottom-sheet-handle]")
    );
    gestureAxisRef.current = null;
    horizontalSwipeActiveRef.current = false;
    horizontalLastDxRef.current = 0;
    horizontalLastDyRef.current = 0;
    horizontalEndHandledRef.current = false;
    suppressClickRef.current = false;
  };

  // Listen at the window capture phase instead of relying on React's
  // synthetic capture handlers on the panel. This keeps pointerdown/up intact
  // when the gesture starts on a nested button/list item and also cleans up if
  // the pointer leaves the panel before release.
  useEffect(() => {
    if (!open) return undefined;
    const panel = sheetRef.current;
    if (!panel) return undefined;

    const onPointerDown = (event) => {
      // Interactive footer controls such as the comment input own their
      // pointer stream. They must remain editable/clickable and must not
      // accidentally start the sheet's horizontal tab swipe.
      if (event.target.closest?.("[data-bottom-sheet-no-horizontal-swipe]")) {
        return;
      }
      // The footer is a sibling of the animated panel. Use the shared marker
      // instead of `panel.contains` so every other part of the sheet
      // participates in the horizontal tab gesture without including the
      // backdrop.
      if (event.target.closest?.("[data-bottom-sheet-surface]")) {
        handleSheetPointerDown(event);
      }
    };
    const ownsPointer = (event) => {
      const gesture = horizontalGestureRef.current;
      return gesture.time && gesture.pointerId === event.pointerId;
    };
    const onPointerMove = (event) => {
      if (ownsPointer(event)) handleSheetPointerMove(event);
    };
    const onPointerUp = (event) => {
      if (ownsPointer(event)) handleSheetPointerUp(event);
    };
    const onPointerCancel = (event) => {
      if (ownsPointer(event)) handleSheetPointerCancel(event);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [open, hasHorizontalSwipe, vh, onHorizontalSwipe, onHorizontalSwipeStart, onHorizontalSwipeMove, onHorizontalSwipeEnd, onHorizontalSwipeCancel]);

  const handleSheetPointerMove = (event) => {
    const { x, y: startY, sheetY: startSheetY } = horizontalGestureRef.current;
    const dx = event.clientX - x;
    const dy = event.clientY - startY;
    horizontalLastDxRef.current = dx;
    horizontalLastDyRef.current = dy;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Decide the axis once. A horizontal winner owns the pointer until
    // release, so Framer Motion cannot turn the same gesture into a vertical
    // sheet drag halfway through.
    if (!horizontalGestureRef.current.axis && Math.max(absDx, absDy) >= horizontalActivationDistance) {
      if (hasHorizontalSwipe && absDx > absDy * horizontalDominanceRatio) {
        horizontalGestureRef.current.axis = "x";
        gestureAxisRef.current = "x";
        horizontalSwipeActiveRef.current = true;
        suppressClickRef.current = true;
        animationRef.current?.stop();
        y.stop?.();
        y.set(startSheetY);
        event.preventDefault();
        event.stopPropagation();
        onHorizontalSwipeStart?.();
      } else if (absDy > absDx * horizontalDominanceRatio) {
        horizontalGestureRef.current.axis = "y";
        gestureAxisRef.current = "y";
      }
    }

    if (horizontalGestureRef.current.axis === "x") {
      // Keep the sheet at its original Y throughout a horizontal tab swipe.
      animationRef.current?.stop();
      y.stop?.();
      y.set(startSheetY);
      event.preventDefault();
      event.stopPropagation();

      // This is the only per-frame consumer update. No tab state, logical
      // commit, or snap is performed while the pointer is moving: the track
      // remains exactly under the finger until release/cancel.
      onHorizontalSwipeMove?.(dx);
      return;
    }

    if (horizontalGestureRef.current.axis === "y" && hasHorizontalSwipe) {
      // Only the handle owns vertical sheet movement. The content area remains
      // a native scroll surface; this prevents the panel and list from
      // competing for the same vertical gesture.
      if (verticalDragAllowedRef.current) {
        event.preventDefault();
        y.set(Math.max(0, Math.min(vh, startSheetY + dy)));
      }
    }
  };

  const handleSheetPointerUp = (event) => {
    const { x, y: startY, axis } = horizontalGestureRef.current;
    const dx = event.clientX - x;
    const dy = event.clientY - startY;
    const wasHorizontal = horizontalSwipeActiveRef.current && axis === "x";

    if (axis === "y" && hasHorizontalSwipe) {
      const elapsed = Math.max(1, Date.now() - (horizontalGestureRef.current.time || Date.now()));
      const velocityY = (dy / elapsed) * 1000;
      if (verticalDragAllowedRef.current) onDragEnd?.(event, { velocity: { y: velocityY } });
      horizontalSwipeActiveRef.current = false;
      horizontalLastDxRef.current = 0;
      horizontalLastDyRef.current = 0;
      horizontalGestureRef.current = { x: 0, y: 0, sheetY: 0, axis: null, pointerId: null, time: 0 };
      gestureAxisRef.current = null;
      suppressClickRef.current = false;
      return;
    }

    if (wasHorizontal) {
      const horizontalRelease = Math.abs(dx) >= horizontalCommitDistance
        && Math.abs(dx) > Math.abs(dy) * horizontalDominanceRatio;
      // Release is the only point at which the tab may commit. A short drag
      // always returns to the active tab instead of leaving a partial track.
      if (horizontalRelease && !horizontalEndHandledRef.current) {
        horizontalEndHandledRef.current = true;
        if (onHorizontalSwipeEnd) onHorizontalSwipeEnd(dx);
        else onHorizontalSwipe?.(dx < 0 ? "next" : "previous");
      } else if (!horizontalRelease) {
        onHorizontalSwipeCancel?.();
      }
    }

    horizontalSwipeActiveRef.current = false;
    horizontalLastDxRef.current = 0;
    horizontalLastDyRef.current = 0;
    horizontalEndHandledRef.current = false;
    horizontalGestureRef.current = { x: 0, y: 0, sheetY: 0, axis: null, pointerId: null, time: 0 };
    gestureAxisRef.current = null;
    verticalDragAllowedRef.current = false;
    // Keep this armed for the synthetic click generated after a drag. A new
    // pointerdown clears it when no click is generated by the browser.
    if (!wasHorizontal) suppressClickRef.current = false;
  };

  const handleSheetPointerCancel = (event) => {
    const { axis } = horizontalGestureRef.current;
    const dx = horizontalLastDxRef.current;
    const dy = horizontalLastDyRef.current;
    if (horizontalSwipeActiveRef.current && axis === "x") {
      const horizontalRelease = Math.abs(dx) >= horizontalCommitDistance
        && Math.abs(dx) > Math.abs(dy) * horizontalDominanceRatio;
      if (horizontalRelease && !horizontalEndHandledRef.current) {
        horizontalEndHandledRef.current = true;
        onHorizontalSwipeEnd?.(dx);
      } else if (!horizontalRelease) {
        onHorizontalSwipeCancel?.();
      }
    }
    horizontalSwipeActiveRef.current = false;
    horizontalLastDxRef.current = 0;
    horizontalLastDyRef.current = 0;
    horizontalEndHandledRef.current = false;
    horizontalGestureRef.current = { x: 0, y: 0, sheetY: 0, axis: null, pointerId: null, time: 0 };
    gestureAxisRef.current = null;
    // A native scroll can cancel the pointer stream before release. Restore a
    // stable snap instead of leaving the shared Y at an intermediate value.
    if (axis === "y" && verticalDragAllowedRef.current) {
      onDragEnd?.(event, { velocity: { y: 0 } });
    }
    verticalDragAllowedRef.current = false;
    suppressClickRef.current = false;
  };

  const handleSheetClickCapture = (event) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  const handleVerticalDrag = () => {
    if (gestureAxisRef.current === "y") return;
    animationRef.current?.stop();
    y.set(horizontalStartYRef.current);
  };

  const handleSheetDragEnd = (event, info) => {
    if (gestureAxisRef.current === "x") {
      animationRef.current?.stop();
      y.set(horizontalStartYRef.current);
      gestureAxisRef.current = null;
      return;
    }
    onDragEnd(event, info);
    gestureAxisRef.current = null;
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

  // Reset close guards for each open lifecycle.
  useEffect(() => {
    if (open) {
      closeStartedRef.current = false;
      closeNotifiedRef.current = false;
    }
  }, [open]);

  // Close on Escape key and initialize the sheet at the current progressive
  // gesture position instead of waiting for the gesture to finish.
  useEffect(() => {
    if (!open) {
      animationRef.current?.stop();
      horizontalSwipeActiveRef.current = false;
      horizontalLastDxRef.current = 0;
      horizontalLastDyRef.current = 0;
      horizontalEndHandledRef.current = false;
      gestureAxisRef.current = null;
      suppressClickRef.current = false;
      return;
    }
    if (gestureActive && gestureY) {
      const current = gestureY.get();
      animationRef.current?.stop();
      y.set(current);
    } else {
      const pendingGestureSnap = gestureY?.get();
      const target = Number.isFinite(pendingGestureSnap) && pendingGestureSnap < vh - 1
        ? pendingGestureSnap
        : defaultOffset;
      startYAnimation(
        target,
        linearMotion
          ? { duration: 0.25, ease: CLOSE_EASE_OUT }
          : { type: "spring", stiffness: 350, damping: 35 }
      );
    }
    const handler = (e) => { if (e.key === "Escape" && closeOnEscape) handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, defaultOffset, closeOnEscape, gestureActive, gestureY, y, vh, linearMotion]);

  // While the sheet is being opened from the bottom controls, follow the
  // parent's gesture motion value directly. This keeps the panel under the
  // finger instead of mounting it only after release.
  useEffect(() => {
    if (!gestureActive || !gestureY) return undefined;
    const syncGesture = (latest) => {
      animationRef.current?.stop();
      y.set(latest);
    };
    syncGesture(gestureY.get());
    return gestureY.on("change", syncGesture);
  }, [gestureActive, gestureY, y]);

  // Prevent body scroll (ref-counted across all BottomSheet instances)
  const lockHeldRef = useRef(false);
  useEffect(() => {
    if (open && !lockHeldRef.current) {
      lockBody();
      lockHeldRef.current = true;
    }
    if (!open && lockHeldRef.current) {
      unlockBody();
      lockHeldRef.current = false;
    }
    return () => {
      if (lockHeldRef.current) {
        unlockBody();
        lockHeldRef.current = false;
      }
    };
  }, [open]);

  const handleClose = () => {
    if (closeStartedRef.current) return;
    closeStartedRef.current = true;

    // Start the visual exit, but do not make state closure depend on a
    // MotionValue completion callback. Pointer-driven animations can be
    // cancelled by the browser before Framer Motion invokes onComplete;
    // closing synchronously keeps Back/drag interactions from freezing.
    if (animateOnClose) {
      startYAnimation(vh, linearMotion ? { duration: 0.25, ease: CLOSE_EASE_OUT } : { duration: 0.25 });
    }
    if (!closeNotifiedRef.current) {
      closeNotifiedRef.current = true;
      onClose();
    }
  };

  const onDragEnd = (_, info) => {
    const velocity = info.velocity.y;
    const currentY = y.get();
    const startedExpanded = horizontalStartYRef.current < defaultOffset * 0.5;

    // A fast/large downward gesture closes. When the gesture starts from the
    // fully expanded snap, crossing the partial snap is already an intentional
    // dismiss; requiring another 25vh would make a normal mobile drag appear
    // stuck. Drags that start in partial state retain the larger close zone.
    if (
      velocity > 700
      || currentY > defaultOffset + vh * 0.25
      || (startedExpanded && currentY > defaultOffset)
    ) {
      handleClose();
    } else if (currentY >= defaultOffset - vh * 0.07 || velocity > 140) {
      startYAnimation(partialOffset, { type: "spring", stiffness: 350, damping: 35 });
    } else {
      startYAnimation(0, { type: "spring", stiffness: 350, damping: 35 });
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
            onClick={handleClose}
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
            data-bottom-sheet-surface="true"
            exit={linearMotion
              ? { opacity: 0, transition: { duration: 0.25, ease: CLOSE_EASE_OUT } }
              : { y: vh }}
            style={{
              y,
              height: Math.max(320, vh * heightVh),
              marginTop: "auto",
              // Keep native vertical panning available until the recognizer
              // conclusively locks this pointer stream to X. X then calls
              // preventDefault and holds the sheet at its original Y.
              touchAction: "pan-y",
              willChange: "transform",
              overscrollBehavior: "contain",
            }}
            onClickCapture={handleSheetClickCapture}
            onDrag={handleVerticalDrag}
            drag={hasHorizontalSwipe ? false : "y"}
            onUpdate={(latest) => {
              if (sharedY && Number.isFinite(latest.y)) sharedY.set(latest.y);
            }}
            dragConstraints={{ top: 0, bottom: vh }}
            // Never allow the fully expanded sheet to stretch above the
            // viewport. Bottom elasticity is retained for a natural dismiss
            // gesture, while the top edge is a hard stop.
            dragElastic={{ top: 0, bottom: 0.1 }}
            onDragEnd={handleSheetDragEnd}
            className="absolute bottom-0 w-full z-20 min-h-0
                       bg-card-light dark:bg-card-dark
                       rounded-t-[2.5rem] shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.32)]
                       flex flex-col"
          >
            {/* Drag handle */}
            <div
              data-testid={testId ? `${testId}-handle` : undefined}
              data-bottom-sheet-handle="true"
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
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pt-5 pb-[calc(max(1.25rem,env(safe-area-inset-bottom))+4rem)]"
              style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
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
              data-bottom-sheet-surface="true"
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
