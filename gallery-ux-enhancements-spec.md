# Gallery UX Enhancements Spec

**Scope:** `AlbumGallery.jsx` only (Dashboard → "My Albums" → click album cover)
**Date:** 2026-06-27
**Status:** Draft

---

## 1. PillBar Redesign

### Current State
The `PillBar` component in `AlbumGallery.jsx` is a floating pill at the bottom showing:
- Like count with `FilledHeart` (green)
- Dislike count with `BrokenHeart` (red)
- Comment count with `MessageCircle` (blue)
- Clicking it opens the BottomSheet; swiping up also triggers it

### Changes Required

| Aspect | Current | Target |
|--------|---------|--------|
| Icon size | `size={16}` | ~`size={22}` (visually larger) |
| Icon color | Multi-colored (green, red, blue) | Monochrome — white for active/primary, gray for inactive/secondary |
| Padding | `px-6 py-3` | `px-8 py-4` (larger touch target, more breathing room) |
| Content items | 3 (likes, dislikes, comments) | Same 3 items — no new actions added |
| Font size | `text-sm` | `text-base` or slightly larger |

### Icon Color Rules
- All three icons render in **white** (`text-white`) as the primary color
- The counts text also render in white
- The pill background stays `bg-white/10 backdrop-blur-xl`
- If an item has zero count, it can show in a dimmer gray (`text-gray-400`) to indicate emptiness

---

## 2. BottomSheet Swipe-Up from PillBar

### Current State
- Clicking `PillBar` calls `setSheetExpanded(true)` → opens `BottomSheet`
- `PillBar` has a basic `onSwipeUp` handler using `pointerDown`/`pointerUp` delta detection (threshold: 40px)

### Changes Required

#### Swipe-Up Gesture
- **Trigger:** Swipe up on the PillBar (drag finger upward > 40px) opens the BottomSheet
- **Also:** Single tap on PillBar still opens the BottomSheet (existing behavior, keep it)
- The PillBar should have a subtle visual affordance (e.g., small drag handle line above the pill, or chevron-up icon) to hint at swipeability

#### BottomSheet Content
- Same as current: tabbed view with **Statistics** tab and **Comments** tab
- No changes to the sheet's internal content/layout

#### BottomSheet Dismiss
- Swipe down on the sheet to dismiss (standard iOS behavior — already implemented)
- When fully dismissed, photo returns to its original full-size position

---

## 3. Photo Shrinking During BottomSheet Drag

### Current State
Already partially implemented in `AlbumGallery.jsx`:
```js
const sheetY = useMotionValue(0);
const photoScale = useTransform(sheetY, [0, vh * 0.4], [1, 0.7]);
const photoTranslateY = useTransform(sheetY, [0, vh * 0.4], [0, -vh * 0.12]);
```
- Photo scales from 1→0.7 as sheet opens
- Photo translates up slightly
- `sharedY` prop passes sheet's Y position to parent

### Changes Required

| Parameter | Current | Target |
|-----------|---------|--------|
| Min scale | 0.7 (30% shrink) | ~0.5 (50% shrink — "more aggressive") |
| Scale range | `[0, vh*0.4]` → `[1, 0.7]` | `[0, vh*0.5]` → `[1, 0.5]` |
| Translate Y | Up 12% of viewport | Up ~18% of viewport (to stay visible above sheet longer) |
| Fully open coverage | Photo partially visible | Photo **completely covered** by sheet when fully expanded |

#### Animation Mapping
```
Sheet Y position → Photo transform:
  0 (fully expanded)     → scale 0.5, translateY -18vh  (photo hidden behind sheet)
  0.5vh (half open)      → scale ~0.75, translateY ~-9vh
  defaultOffset (peek)   → scale ~0.9, translateY ~-4vh
  dismissOffset (closed) → scale 1.0, translateY 0       (photo at normal position)
```

#### Interaction When Covered
- When the BottomSheet is fully open and covers the shrunk photo, the photo is **locked** (not interactive)
- No tap or swipe gestures pass through to the photo
- Only the sheet's content, drag handle, and backdrop are interactive

---

## 4. Carousel-Style Photo Scrolling

### Current State
In `AlbumGallery.jsx`, the photo container uses Framer Motion `drag` in both X and Y:
- **Horizontal drag:** If `|offset.x| > 80` or `|velocity.x| > 500`, switches to next/prev photo via `handleNext()`/`handlePrev()`
- **Vertical drag:** If `offset.y > 100` or `velocity.y > 600`, closes the viewer (`onClose()`)
- Photos **do not** follow the finger — they snap back and then jump to the next photo
- `dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}` with `dragElastic={0.3}`

### Changes Required

#### True Carousel (Filmstrip) Behavior
- Photos must follow the finger **1:1 along the X axis**
- Adjacent photos (next/prev) must be **visible underneath** as the user drags
- This is classic filmstrip/carousel scrolling

#### Implementation Approach
Replace the single-photo drag with a horizontal scroll container:

1. **Layout:** Render all photos side-by-side in a horizontal strip (like a carousel)
2. **Scrolling:** Use a scroll container (`overflow-x: auto` with `scroll-snap-type: x mandatory`) or Framer Motion's `drag="x"` on a container holding all photos
3. **Snap points:** Each photo snaps to center (`scroll-snap-align: center`)
4. **Index tracking:** Track `currentIdx` via scroll position / intersection observer

#### Axis Locking
- **Horizontal swipe:** When the primary axis of the gesture is X (angle < ~30° from horizontal), lock to X-axis only — photo follows finger horizontally, carousel scrolls
- **Vertical swipe (dismiss):** When the primary axis is Y, lock to Y-axis only — photo moves down with finger, slight X drift is acceptable but Y sensitivity is increased
- **Axis detection:** Determine axis lock from the first ~10-15px of movement after pointer down

#### Vertical Dismiss Behavior
- Photo follows finger along Y with **increased sensitivity** (e.g., 1.5x multiplier on Y movement)
- Slight X movement tolerance is acceptable (don't lock rigidly)
- If dragged down past threshold (~100px) or velocity > 600, close the viewer
- Otherwise, spring back to center

#### Animation
- No slide-in/out animation when switching photos during a swipe (the movement IS the animation)
- When snapping to a photo after a swipe, use a smooth spring transition
- The `currentIdx` state updates when the scroll settles on a new photo

---

## 5. Components to Modify

| File | Changes |
|------|---------|
| `frontend/src/components/AlbumGallery.jsx` | PillBar redesign, carousel implementation, photo shrink params, axis locking |
| `frontend/src/components/BottomSheet.jsx` | No changes needed (already supports `sharedY`, drag-to-dismiss, etc.) |

---

## 6. Reference: Existing Comment BottomSheet Pattern

The user noted: "подобная реализация уже есть при просмотре комментариев" (similar implementation already exists when viewing comments).

This refers to the `BottomSheet` in `AlbumGallery.jsx` with `sharedY={sheetY}`:
- Sheet Y position is reported to parent via `sharedY`
- Parent derives `photoScale` and `photoTranslateY` from sheet Y
- Photo smoothly transforms as sheet is dragged
- Pattern: **reuse the same `sharedY` / `useTransform` approach**

---

## 7. Behavioral Summary (User Flows)

### Flow A: Open BottomSheet
1. User sees full-size photo with PillBar at bottom
2. User swipes up on PillBar (or taps it)
3. BottomSheet slides up from bottom
4. Photo shrinks (1.0 → 0.5) and shifts up as sheet opens
5. When sheet is fully expanded, photo is completely hidden behind it
6. User interacts with Statistics/Comments tabs in the sheet

### Flow B: Close BottomSheet
1. User swipes down on the BottomSheet
2. Sheet slides down, photo grows back (0.5 → 1.0) and returns to center
3. When sheet is fully closed, photo is back at normal position
4. PillBar reappears at the bottom

### Flow C: Browse Photos (Carousel)
1. User swipes left on photo → photo follows finger left, next photo revealed on right
2. User releases → snaps to next photo
3. User swipes right → photo follows finger right, previous photo revealed on left
4. User releases → snaps to previous photo

### Flow D: Dismiss Photo Viewer
1. User swipes down on photo (Y-axis dominant)
2. Photo follows finger down with increased Y sensitivity
3. If dragged far enough or fast enough → viewer closes
4. Otherwise → photo springs back to center

### Flow E: Axis Conflict Resolution
1. User starts swiping diagonally
2. After ~10-15px of movement, axis is determined
3. If primarily horizontal → lock to carousel scrolling
4. If primarily vertical → lock to Y-only dismiss gesture
