# Album Opening Animation Fix — Specification

## Goal
Restore the Framer Motion `layoutId` entrance animation when opening an album. In older versions, clicking an album card in the Dashboard smoothly expanded the album cover into the full-screen gallery. Currently, the animation is broken (likely jumping instantly to the opened state without a smooth transition). You need to track down what broke it, fix it, and verify the fix without breaking existing logic (like the swipe-to-dismiss exit animation).

## Root Cause Investigation Hints
The issue is almost certainly within `frontend/src/components/AlbumGallery.jsx`, specifically where the first photo (the shared element) is rendered.
- Look for the `isSharedElement` branch where `layoutId={`album-cover-${album.id}`}` is applied.
- Pay close attention to the `transition` prop. In recent commits, it may have been changed to something like `transition={isExiting ? { ... } : { duration: 0 }}`. If the entrance transition has `duration: 0`, Framer Motion will snap instantly to the final state, effectively breaking the opening animation.
- Previously, it might have relied on a `spring` transition for both entering and exiting, or specifically checked `!firstPhotoFitDone` to allow the initial FLIP animation to run.

## Requirements
1. **Fix the Entrance Animation**: The album cover must smoothly expand from the Dashboard card to the full-screen gallery view.
2. **Preserve Exit Animation**: The swipe-to-dismiss logic (`dragY`, `isExiting`, `opacity` transitions) must continue to work perfectly. Closing the album should smoothly return the photo to its card on the Dashboard.
3. **Preserve Video Logic**: Both photo and video shared elements must animate correctly.
4. **No Side Effects**: Ensure that swiping left/right in the gallery (carousel) remains smooth and does not trigger unintended layout animations on the first photo after the gallery is fully opened. (This is usually managed by `firstPhotoFitDone`).

## Testing Protocol
You **MUST** personally test the fix by running the dev server (`npm run dev` in frontend, `uvicorn main:app --reload` in backend):
1. Navigate to the Dashboard.
2. Click on an album card.
3. **Verify:** Does the photo smoothly fly from the card into the center of the screen? (If it snaps instantly, the fix is not complete).
4. Swipe down to dismiss the gallery.
5. **Verify:** Does the photo smoothly fly back into the card on the Dashboard?
6. Test this with both an image album and a video album (if available).

Do not mark this task as complete until you have visually confirmed the smooth entrance and exit animations are fully restored.
