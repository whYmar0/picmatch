# Gallery BottomSheet + Analytics UI Spec

## Overview
Two changes to the photo gallery viewer (AlbumGallery.jsx + BottomSheet.jsx):
1. Fix photo behavior when BottomSheet opens — photo should NOT blur, should move up and resize dynamically
2. Redesign analytics statistics list — larger icons, grey numbers, view count instead of vote label

---

## Change 1: Photo Behavior When BottomSheet Opens

### Current Behavior
- Photo wrapper has `scale: photoScale` (0.5→1) and `translateY: combinedTranslateY` (-30vh→0)
- BottomSheet backdrop has `backdrop-blur-xl` which blurs EVERYTHING behind it, excluding the photo
- Photo shrinks to 50% and moves up 30vh as sheet opens — feels like it's being pushed away
- The blur + scale gives a "zoomed out and blurry" effect

### Desired Behavior
- Photo stays **sharp/clear** — no blur on the photo itself
- Photo smoothly moves to the **upper area** of the screen (above the BottomSheet)
- Photo **dynamically resizes** to fit the available space above the sheet, maintaining aspect ratio
- The BottomSheet backdrop blur stays on the dark overlay behind the photo (blurs the black background)
- As the sheet is dragged up, the photo should smoothly shrink and reposition to fill the available space above

### Technical Approach
1. **Z-index restructuring**: The photo carousel must render ABOVE the BottomSheet's backdrop blur layer
   - Current: photo is at z-[90], BottomSheet backdrop is at z-50 inside its own fixed container
   - Problem: BottomSheet's `backdrop-blur-xl` on its overlay blurs everything below it in the stacking context
   - Solution: Move the blurred backdrop OUT of the BottomSheet, or restructure so photo is above the blur

2. **Remove photoScale** (the 0.5→1 shrink): Replace with a more subtle resize that responds to sheet position
   - When sheet is at defaultOffset (35vh): photo at full size
   - When sheet moves up (y→0): photo scales down proportionally to fit the remaining space above
   - Use `useTransform(sheetY, [0, defaultOffset], [photoScaleAtTop, 1])` where `photoScaleAtTop` = (available height above sheet) / (full viewport height)

3. **Remove photoTranslateY** (-30vh push): Replace with positioning that keeps photo centered in the available space
   - Photo should be centered in the area above the sheet, not pushed up by a fixed amount

4. **Backdrop fix**: Change BottomSheet's backdrop from `backdrop-blur-xl` to just `bg-black/60` (no blur), OR move the photo above the blur layer

### Files to Modify
- `frontend/src/components/AlbumGallery.jsx` — photo wrapper transforms, z-index
- `frontend/src/components/BottomSheet.jsx` — backdrop blur (if needed)

---

## Change 2: Analytics Statistics List Redesign

### Current State (StatisticsTab in AlbumGallery.jsx)
- Sub-header: `<span className="font-semibold">{t("statistics")}</span>` — shows "Статистика" label
- Sub-header right: `{analytics.total_votes} {t("totalVotes")}` — shows "X голосов"
- Like icons: `<FilledHeart size={9} />` — too small
- Dislike icons: `<BrokenHeart size={9} strokeWidth={2} />` — too small
- Numbers: currently in colored text (green for likes, red for dislikes), small `text-xs`

### Desired Changes
1. **Remove "Статистика" label** — delete the left side of the sub-header
2. **Replace "X голосов" with view count** — show `analytics.total_votes` with an Eye icon + statistics icon (BarChart2)
   - Display: `<BarChart2 /> total_votes` (right-aligned, no "голосов" text)
3. **Increase like/dislike icons** — change from `size={9}` to `size={14}` or `size={16}`
4. **Make numbers grey** — change from `text-green-500`/`text-red-400` to `text-gray-400` or `text-gray-500`
5. **Make numbers larger** — change from `text-xs` to `text-sm`

### Specific Edits in StatisticsTab

**Sub-header line:**
```jsx
// BEFORE:
<div className="flex items-center justify-between text-xs text-gray-400">
  <span className="font-semibold">{t("statistics")}</span>
  <span>{analytics.total_votes} {t("totalVotes")}</span>
</div>

// AFTER:
<div className="flex items-center justify-end text-sm text-gray-400">
  <span className="flex items-center gap-1.5">
    <BarChart2 size={14} />
    {analytics.total_votes}
  </span>
</div>
```

**Photo list stats row:**
```jsx
// BEFORE:
<div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
  <span className="text-green-500 flex items-center gap-0.5">
    <FilledHeart size={9} /> {photo.like_count}
  </span>
  <span className="text-red-400 flex items-center gap-0.5">
    <BrokenHeart size={9} strokeWidth={2} /> {photo.dislike_count}
  </span>
  <span className="ml-auto">
    {photo.total_votes > 0 ? `${photo.like_percentage}%` : "—"}
  </span>
</div>

// AFTER:
<div className="flex items-center gap-2 mt-0.5 text-sm text-gray-400">
  <span className="flex items-center gap-0.5">
    <FilledHeart size={14} /> {photo.like_count}
  </span>
  <span className="flex items-center gap-0.5">
    <BrokenHeart size={14} strokeWidth={2} /> {photo.dislike_count}
  </span>
  <span className="ml-auto">
    {photo.total_votes > 0 ? `${photo.like_percentage}%` : "—"}
  </span>
</div>
```

### Files to Modify
- `frontend/src/components/AlbumGallery.jsx` — StatisticsTab component only

---

## Change 3: PillBar Comment Count → View Count (Lower Priority)

The PillBar (bottom bar with like/dislike/comment buttons) currently shows:
- Like count with FilledHeart
- Dislike count with BrokenHeart  
- Comment count with MessageCircle

The user mentioned replacing the comment count with view count. This was mentioned in the context of the analytics list but may also apply to the PillBar. Clarify with user if needed.

---

## Implementation Order
1. Analytics UI changes (simpler, self-contained in StatisticsTab)
2. Photo behavior when BottomSheet opens (more complex, touches z-index + transforms)

## Testing
- Open an album, tap a photo to enter gallery mode
- Tap the PillBar to open the BottomSheet
- Verify: photo stays sharp, moves to upper area, resizes dynamically
- Verify: statistics list has larger icons, grey numbers, no "Статистика" label, view count with icon
- Drag the BottomSheet up/down — photo should resize smoothly in response
