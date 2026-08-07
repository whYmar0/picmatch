# Extended Album Statistics (BottomSheet) Rework Specification

## Goal
Rework the UI, animations, and UX of the extended album statistics (the `BottomSheet` in `AlbumGallery.jsx` and its contents). The main focus is to make the background photo dynamically react to the BottomSheet's position, introduce new swipe gestures, fix layout bugs in the stats list, and refine the Grid view.

## Core Requirements

### 1. Dynamic Photo Resizing & Positioning (60/120fps)
**Current State:** When the BottomSheet opens, the active photo blurs and stays in the background.
**New Behavior:** 
- The active photo must **NOT** blur.
- As the BottomSheet slides up, the photo must smoothly and synchronously move up and shrink to fit perfectly into the **remaining vertical space** above the BottomSheet.
- The photo should take up no more than 1/3 of the screen when the BottomSheet is fully expanded. 
- **CRITICAL:** The BottomSheet must **NEVER** overlap or obscure the actual content of the photo. The photo must use `object-contain` and its container's height should dynamically bind to the remaining viewport height (`100vh - sheetHeight`).
- When the BottomSheet is fully closed, the photo smoothly returns to its original full-screen size and center position.
- *Implementation Tip:* Use Framer Motion's `useTransform` to map the BottomSheet's `y` motion value to the photo's `scale`, `y` translation, and container height.

### 2. New Gestures
- **Swipe UP to open:** Users must be able to open the extended statistics (BottomSheet) by swiping UP starting from the bottom controls (`PillBar` / `ThumbStrip`), not just by tapping.
- **Horizontal swipe to switch tabs:** Inside the BottomSheet, swiping horizontally in any free area must switch between the "Statistics" and "Comments" tabs. The transition must be seamless and feel like native scrolling (e.g., using a Framer Motion drag container or AnimatePresence slide effect).
- **Multi-stage swipe down:** If the BottomSheet is fully expanded:
  - A small swipe down should shrink it to its partial/half state.
  - A large/fast swipe down should close it completely.

### 3. Grid Mode & PillBar Changes
- **Square Thumbnails:** When the user switches to the "Grid" view mode inside the statistics, the photo thumbnails must be **rounded squares** (e.g., `rounded-xl` or `rounded-2xl`), not circles.
- **Floating PillBar:** In "Grid" mode, the `PillBar` (which contains likes, dislikes, and comments counts) must **slide up and float above** the top edge of the BottomSheet, rather than disappearing or being hidden behind it.

### 4. Layout & UI Fixes in Statistics List
- **Scroll Cutoff Bug:** Fix the issue where the last photos in a long list are hidden behind the bottom of the screen. Ensure the scrollable list has sufficient `padding-bottom` (considering safe areas and mobile browser UI).
- **Numbering:** Remove the `#` symbol from the photo numbers. Show only the digits (e.g., `1` instead of `#1`).
- **Header Buttons Layout:** Rearrange the top buttons in the stats view:
  - Move the **"Share"** button to be right next to the **"Filter"** button.
  - Move the **"Views"** icon to the far edge (right/left depending on layout).
- **Click to Navigate:** In the full statistics list/grid, clicking on any specific photo must immediately switch the gallery's active background photo to that selection (`currentIdx` updates) and close or minimize the BottomSheet so the user can see it.

---

## Technical Constraints
- Use only existing libraries (Framer Motion, React, TailwindCSS).
- Animations must be highly optimized (use `will-change: transform`, avoid triggering layout thrashing, rely on hardware-accelerated motion values).
- Ensure compatibility with both mobile touch gestures and desktop mouse drags.

## Mandatory Testing Protocol
You **MUST** personally test these features locally before considering the task complete. Start the dev servers and verify:
1. Swipe up on the `PillBar` opens the sheet.
2. The background photo dynamically shrinks and stays visible above the sheet without being overlapped, and does not blur.
3. Swiping left/right in the sheet switches between Stats and Comments seamlessly.
4. Grid mode shows rounded squares and the `PillBar` floats above the sheet.
5. In a long list of photos in the stats, you can scroll all the way down and clearly see the last item.
6. The `#` is gone from photo numbers, and the Share/Filter/Views buttons are correctly aligned.
7. Clicking a photo in the stats switches the gallery to that photo.

**Do not stop iterating until all the above conditions are flawlessly met.**
