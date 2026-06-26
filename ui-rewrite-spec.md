# UI Rewrite Specification — Pickmatch v6

> Generated from interview with stakeholder on 2026-06-26
> Target: Comprehensive UI/UX overhaul of the Pickmatch frontend

---

## 1. Custom Heart Icons

### 1.1 Filled Heart SVG
Create a new React component `FilledHeart` using the provided custom SVG path:
```svg
<svg viewBox="0 0 512 456.549" fill="currentColor">
  <path fill-rule="nonzero" d="M463.044 117.283c-10.125-26.729-28.412-47.537-50.269-60.578..."/>
</svg>
```
- Size: accept `size` prop (default 24)
- Color: accept `className` for Tailwind text colors, default gray-400 (`text-gray-400`)
- Fill: `fill="currentColor"`

### 1.2 Broken Heart SVG
Create a new React component `BrokenHeart` using the provided custom SVG path:
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 6.59097L11.8456 6.42726C9.86801 4.33053..."/>
  <path d="M12 6.59097L10.5 8.5L13 11L11 13.5" stroke-linecap="round"/>
</svg>
```
- Size: accept `size` prop (default 24)
- Color: accept `className`, default gray-400
- Same API surface as `FilledHeart`

### 1.3 Replace All Occurrences
Replace the following throughout the codebase:
- `RoundedHeart` → `FilledHeart` (Navbar, notifications, etc.)
- `ThumbsUp` (lucide-react) → `FilledHeart` (PillBar, AnalyticsPage, SwipeButtons, etc.)
- `ThumbsDown` (lucide-react) → `BrokenHeart` (PillBar, AnalyticsPage, SwipeButtons, etc.)
- Both icons should be gray (`text-gray-400`) on AnalyticsPage
- On VotePage SwipeButtons: red for dislike, green for like as before

---

## 2. Navbar Dropdown Menu

### 2.1 Theme Toggle
- When dark theme is active: show text **"Тёмная тема"** (ru) / **"Dark theme"** (en)
- When light theme is active: show text **"Светлая тема"** (ru) / **"Light theme"** (en)
- Add new translation keys: `darkTheme`, `lightTheme`
- Keep the toggle switch UI

### 2.2 Language Toggle
- Label as **"Язык"** (ru) / **"Language"** (en)
- Use existing `language` translation key
- Keep the language badge (RU/EN)

### 2.3 Remove Dividers
- Remove all `<div className="h-px bg-border-light dark:bg-border-dark my-1" />` separator lines
- Menu items should flow without visual dividers

---

## 3. AlbumCard Redesign (`AlbumCard.jsx`)

### 3.1 Photo Area
- Photo fills the top ~2/3 of the card with `object-cover`, no oval mask
- Remove gradient overlay
- Remove photo count badge (top-left)
- Remove privacy badge (top-right "Приватный"/"Публичный")
- Remove hover "Play" icon (the circular play button with SVG)
- Keep hover scale effect (`group-hover:scale-105`)

### 3.2 Bottom Info Area
- Keep title (single line `line-clamp-1`) and time ago
- Action buttons: **all three** (privacy toggle, copy link, delete)
- Buttons should be **larger, centered, side by side** — no `flex-1` spacer
- Remove the spacer div between copy and delete

### 3.3 Removals
- ~~Privacy badge~~ (top-right corner)
- ~~Photo count badge~~ (top-left corner)  
- ~~Gradient overlay~~ (dark gradient on photo)
- ~~Hover play icon~~
- ~~Spacer between copy and delete buttons~~

---

## 4. Recent Section on Dashboard

### 4.1 Section Toggle Button
- Gray clock icon button (`Clock` from lucide-react, `text-gray-400`)
- Positioned **left of** the "+" create button in the "My Albums" header row
- On click: **toggle** visibility of the "Recently Visited" section (show/hide)
- Remove the current small chip button that shows count and scrolls

### 4.2 Recent Cards
- `RecentAlbumCard` should have the **same layout** as the redesigned `AlbumCard`:
  - 2/3 photo, 1/3 info
  - Same card styling, rounded corners, shadow
- "Results" button (`viewAnalytics`) stays as is
- Single-line truncation (`line-clamp-1`) for long titles and descriptions
- Privacy badge **kept** on RecentAlbumCard (don't remove)

---

## 5. Comments Skeleton Loading

### 5.1 New Skeleton Component
Create `CommentSkeleton` in `Skeleton.jsx`:
- 3-4 placeholder rows
- Each row: circle avatar (32px) + 2 text lines (one wide, one narrow)
- Pulse animation (same as existing skeletons)
- Export as named export

### 5.2 Usage in `PhotoComments.jsx`
- Replace `<LoadingSpinner />` with `<CommentSkeleton />` during loading state
- Keep existing LoadingSpinner for other use cases

---

## 6. AnalyticsPage Changes

### 6.1 Like/Dislike Icons
- Replace all `ThumbsUp` → `FilledHeart` (gray `text-gray-400`)
- Replace all `ThumbsDown` → `BrokenHeart` (gray `text-gray-400`)
- Apply in: PhotoListRow, PhotoGridCard, PhotoTabBar, ReactionBadge, sort/filter area

### 6.2 Share Button
- Make it bigger: `w-10 h-10 rounded-2xl` square button
- **No text** — icon only (`Share2`)
- Position unchanged (top-right header area)
- Show checkmark on copy success (keep existing `shareDone` logic)

### 6.3 Remove n/m Counter
- Remove `<span>{filtered.length}/{photos.length}</span>` from sort/filter row
- Keep Sort and Filter buttons themselves

### 6.4 Thumbnail Rounding
- Change from `rounded-2xl` to `rounded-xl` for photo thumbnails in list/grid
- Applies to: `PhotoListRow` thumbnails, `PhotoGridCard` cards

---

## 7. Hero Animation for Photo Click

### 7.1 Requirements
- When user clicks photo in `AlbumCard` → photo smoothly expands from card position to full screen
- Use Framer Motion `layoutId` for shared layout animation
- Install no additional libraries (Framer Motion already available)

### 7.2 Implementation Approach
- Replace the entire `AlbumGallery` component with a new one
- New gallery opens with hero transition from the card thumbnail
- Pass the card photo element's `layoutId` for the animation

---

## 8. New Full-Screen Photo Viewer (replaces AlbumGallery)

### 8.1 Removals (from current AlbumGallery)
- ❌ n/m counter (`{currentIdx + 1} / {photos.length}`)
- ❌ Left/right navigation arrows (`ChevronLeft`, `ChevronRight`)
- ❌ Back/exit arrow (`ArrowLeft`)
- ❌ Header bar with gradient

### 8.2 Image Display
- Image fills full width of screen
- `object-contain` to preserve aspect ratio
- Black background

### 8.3 Swipe Navigation
- Swipe **left** → next photo
- Swipe **right** → previous photo
- Photos scroll like a **carousel** — **no additional transition animation** between photos (instant change)
- Use touch gesture handling (pointer events or a lightweight swipe library)

### 8.4 Swipe Down to Close
- Photo **follows the user's finger** (iOS Photos style)
- Background opacity decreases proportionally with swipe distance
- When released beyond threshold → close and return to dashboard
- When released before threshold → snap back

### 8.5 Bottom Thumbnail Strip
- Thumbnails are **rounded rectangles** (`rounded-2xl`), NOT circles
- Size: similar to current (w-10 h-10 or slightly larger)
- **Tap** on thumbnail → main photo changes **instantly** (no animation)
- **Scrollable** strip for many photos
- Active thumbnail: **auto-scrolls to center** of screen, **slightly larger** (scale ~1.15)
- Inactive thumbnails: opacity-50, hover:opacity-80

### 8.6 Bottom PillBar
- **No border** (remove `border border-white/20`)
- **Larger content** (bigger icons and text)
- Like/Dislike icons → `FilledHeart` / `BrokenHeart`
- **Remove vertical dividers** (`w-px h-4 bg-white/20`)
- **Remove chevron-up expand arrow**
- Both **click** and **swipe up** on the bar open BottomSheet

### 8.7 BottomSheet Interaction
- When BottomSheet opens (via swipe up or click):
  - Photo shifts **up** and **shrinks** proportionally
  - Photo maintains **aspect ratio** (not cropped)
  - As BottomSheet opens further, photo continues shrinking
- When BottomSheet is **fully open**: it overlaps the shrunken photo
- When BottomSheet is **fully closed**: photo returns to original position and size
- Smooth spring animation for all transitions

### 8.8 "Statistics" Rename
- In the AlbumGallery stats tab, rename heading from "All photos" → **"Statistics"** / **"Статистика"**
- Add new translation key: `statistics`
- Add **sort, filter, share buttons** in the same layout/style as AnalyticsPage header

---

## 9. Comment Input Redesign

### 9.1 Pill Shape
- Input field: `rounded-full` (fully rounded ends)
- Keep the send button attached to the right side

### 9.2 Fixed Position
- Input bar should be **fixed** at the bottom of the **visible viewport**
- Remains visible regardless of BottomSheet open state
- Use `position: fixed` with appropriate `bottom` value
- Must work both inside BottomSheet (AlbumGallery, VotePage) and on AnalyticsPage

---

## 10. Comment Real-Time Bug Fix

### 10.1 Problem
In production, when user submits a comment, the frontend does not display it immediately.

### 10.2 Investigation
- Check API response from `commentsApi.create()` — does it return the created comment object?
- Review `handleSubmit` in `PhotoComments.jsx` — the `created` variable is checked, if falsy, `load()` is called instead
- Possible root cause: API returns null/empty in production but works in dev

### 10.3 Fix Strategy
- Ensure `load()` fallback works correctly when `created` is null
- Add error handling with toast notification on failure
- Consider optimistic update: add comment to local state immediately, revert on failure

---

## 11. VotePage Icon Changes

### 11.1 SwipeButtons
- Replace `ThumbsDown` → `BrokenHeart` 
- Replace `ThumbsUp` → `FilledHeart`
- Keep existing colors: red for dislike, green for like

### 11.2 Thumbnail Vote Badges
- Replace `ThumbsUp`/`ThumbsDown` in thumbnail strip vote indicators
- Small heart/broken-heart icons in the green/red circles

### 11.3 ImageLightbox
- Keep `ImageLightbox` component **only for VotePage**
- Do not modify it

---

## 12. Translation Keys to Add

| Key | EN | RU |
|-----|----|----|
| `darkTheme` | Dark theme | Тёмная тема |
| `lightTheme` | Light theme | Светлая тема |
| `language` | Language | Язык |
| `statistics` | Statistics | Статистика |

---

## 13. Component Changes Summary

| Component | Action |
|-----------|--------|
| `RoundedHeart.jsx` | **Delete** — replaced by FilledHeart |
| `FilledHeart.jsx` | **Create** — new filled heart SVG component |
| `BrokenHeart.jsx` | **Create** — new broken heart SVG component |
| `Navbar.jsx` | Modify — menu labels, remove dividers |
| `AlbumCard.jsx` | Modify — photo area, remove badges/overlays, center buttons |
| `RecentAlbumCard.jsx` | Modify — adopt AlbumCard layout, truncation |
| `Dashboard.jsx` | Modify — recent toggle button, new layout |
| `AlbumGallery.jsx` | **Replace entirely** — new full-screen viewer |
| `BottomSheet.jsx` | Modify — support photo shrink/overlap behavior |
| `PhotoComments.jsx` | Modify — skeleton, pill input, fixed position, bug fix |
| `AlbumSummary.jsx` | Modify — heart icons, share button, n/m removal, rounded-xl |
| `SwipeCard.jsx` | Modify — heart/broken heart in SwipeButtons |
| `VotePage.jsx` | Modify — heart icons in buttons and badges |
| `Skeleton.jsx` | Modify — add CommentSkeleton |
| `LangContext.jsx` | Modify — add new translation keys |
| `ImageLightbox.jsx` | **Keep** — unchanged, used only on VotePage |

---

## 14. File List

### Files to Create
- `frontend/src/components/FilledHeart.jsx`
- `frontend/src/components/BrokenHeart.jsx`

### Files to Modify
- `frontend/src/components/RoundedHeart.jsx` (delete or keep as wrapper)
- `frontend/src/components/Navbar.jsx`
- `frontend/src/components/AlbumCard.jsx`
- `frontend/src/components/RecentAlbumCard.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/components/AlbumGallery.jsx` (full rewrite)
- `frontend/src/components/BottomSheet.jsx`
- `frontend/src/components/PhotoComments.jsx`
- `frontend/src/components/AlbumSummary.jsx`
- `frontend/src/components/SwipeCard.jsx`
- `frontend/src/pages/VotePage.jsx`
- `frontend/src/pages/AnalyticsPage.jsx`
- `frontend/src/components/Skeleton.jsx`
- `frontend/src/contexts/LangContext.jsx`

---

## 15. Implementation Order (Recommended)

1. Create `FilledHeart.jsx` and `BrokenHeart.jsx`
2. Update `LangContext.jsx` with new translations
3. Update `Navbar.jsx` (menu items)
4. Update `Skeleton.jsx` (add CommentSkeleton)
5. Redesign `AlbumCard.jsx`
6. Redesign `RecentAlbumCard.jsx`
7. Update `Dashboard.jsx` (recent toggle)
8. Update `PhotoComments.jsx` (skeleton, pill input, fixed position, bug fix)
9. Update `AlbumSummary.jsx` (icons, share, n/m, rounding)
10. Update `AnalyticsPage.jsx` (icons)
11. Rewrite `AlbumGallery.jsx` (full new viewer)
12. Update `BottomSheet.jsx` (photo shrink/overlap)
13. Update `SwipeCard.jsx` + `VotePage.jsx` (heart icons)
14. Remove/replace `RoundedHeart` references
15. Typecheck + test
