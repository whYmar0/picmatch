# PicMatch v5 — Dashboard UI/UX Horizontal Sliders (Clarified Spec)

## 1. Overview & Goal

Rewrite `Dashboard.jsx` so that the default dashboard view shows two horizontally scrollable carousels:

1. **My Albums** (Мои Альбомы)
2. **Recent Albums** (Недавно посещённые / Recently Visited)

Each carousel has a **"See all"** affordance. Tapping it opens a full-screen expanded list of those albums with a sticky back button and a smooth Framer Motion page transition.

---

## 2. Interview-Driven Decisions

| Topic | Decision |
|-------|----------|
| **Empty / small album states** | Always show the horizontal carousel, even with 0–2 items. Empty state renders the existing "No albums" message inside the track. |
| **Recent Albums toggle (Clock icon)** | Remove the Clock toggle entirely. Recent Albums becomes a permanent bottom carousel. |
| **Expanded view routing** | Keep expanded views as in-page state only (`activeView` in `Dashboard.jsx`). URL remains `/dashboard`. No new routes or query params. |
| **Card design in carousel vs. grid** | Reuse the exact same `AlbumCard` and `RecentAlbumCard` components everywhere. No separate carousel card design. |
| **Reduced motion** | Respect `prefers-reduced-motion`. Disable snap/scroll animations and simplify Framer Motion transitions when the user prefers reduced motion. |
| **Card click in carousel** | Tapping a card opens the same photo gallery as the current grid (`onPhotoClick`). |
| **"See all" visibility** | Show "See all" only when items overflow the carousel viewport. |
| **Expanded view features** | Expanded full-screen views include both a search bar and sort options (newest, alphabetical, most votes). |
| **Scroll affordance on mobile** | Hide the native scrollbar and add a subtle right-edge fade to indicate more content. |

---

## 3. Dashboard Layout Structure

### 3.1 Home State (Default Dashboard View)

The dashboard is divided into two horizontal tracks.

#### A. My Albums Track

- **Header:** "My Albums" (`t("myAlbums")`) + the existing circular "Create album" `+` button on the right.
- **Carousel container:** `flex overflow-x-auto scrollbar-none snap-x gap-4 py-2 px-1`.
- **Cards:** Render `AlbumCard` components inside the carousel. Each card wrapper has fixed width:
  - `w-[280px] sm:w-[320px] flex-shrink-0 snap-start`
- **Affordance:** A **"See all"** link below the track, aligned to the right. Visible only when the carousel overflows.
- **Empty state:** If `albums.length === 0`, render the existing empty-state card inside the track instead of the carousel.

#### B. Recent Albums Track

- **Header:** "Recently Visited" (`t("recentlyVisited")`).
- **Carousel container:** Same styling as My Albums track.
- **Cards:** Render `RecentAlbumCard` components with the same fixed-width wrapper.
- **Affordance:** A **"See all"** link below the track, visible only on overflow.
- **Visibility:** Always render this section when `recent.length > 0`. (No Clock toggle.)

### 3.2 Expanded Views

Tapping "See all" animates a full-screen view swap. Manage the active view via state in `Dashboard.jsx`:

```js
const [activeView, setActiveView] = useState("home"); // "home" | "my-albums" | "recent-albums"
```

Wrap views in `AnimatePresence` with `mode="wait"`.

#### My Albums Expanded View

- Sticky header with back arrow (`ChevronLeft` or `ArrowLeft`) and title `t("myAlbums")`.
- Full-screen grid of `AlbumCard` components.
- Search bar to filter albums by title.
- Sort dropdown: newest first (default), alphabetical A–Z, most votes.

#### Recent Albums Expanded View

- Sticky header with back arrow and title `t("recentlyVisited")`.
- Full-screen grid of `RecentAlbumCard` components.
- Search bar to filter recent albums by title or creator.
- Sort dropdown: most recent first (default), alphabetical A–Z.

---

## 4. Animation Specifications

### 4.1 Page Transitions (Framer Motion)

When transitioning to an expanded page:

```jsx
initial={{ opacity: 0, scale: 0.95, y: 15 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
exit={{ opacity: 0, scale: 0.95, y: 15 }}
transition={{ type: "spring", stiffness: 300, damping: 28 }}
```

When returning home, reverse the transition.

### 4.2 Reduced Motion

If `window.matchMedia("(prefers-reduced-motion: reduce)").matches` is true:

- Use `transition={{ duration: 0 }}` or very short `duration: 0.15` for page transitions.
- Disable `snap-x` smooth snapping (keep scroll but no snap behavior).
- Do not animate the carousel scroll position.

### 4.3 Scroll Position Restoration

When swapping views, reset scroll to top:

```js
window.scrollTo({ top: 0, behavior: "auto" });
```

---

## 5. Sticky Navigation Header

On both expanded pages:

```html
<div className="sticky top-0 bg-background/85 backdrop-blur-md z-30 py-4 border-b border-border-light dark:border-border-dark flex items-center gap-3">
```

- Prominent back arrow button in the top-left corner.
- Header remains sticky while scrolling through the full album list.
- Back button calls `setActiveView("home")`.

---

## 6. Carousel Behavior

### 6.1 Horizontal Scroll

- Container: `flex overflow-x-auto scrollbar-none snap-x gap-4 py-2 px-1`.
- Card wrapper: `w-[280px] sm:w-[320px] flex-shrink-0 snap-start`.
- Scrollbar hidden via `.scrollbar-none` utility.

### 6.2 Overflow Detection for "See all"

Show the "See all" link only when the carousel content width exceeds the container width. Use a ref + ResizeObserver or a simple check on mount/resize:

```js
const containerRef = useRef(null);
const [overflows, setOverflows] = useState(false);

useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  const check = () => setOverflows(el.scrollWidth > el.clientWidth);
  check();
  window.addEventListener("resize", check);
  return () => window.removeEventListener("resize", check);
}, [albums]);
```

### 6.3 Right-Edge Fade Affordance

Add a subtle fade on the right edge of the carousel when it overflows:

```css
.mask-fade-edges {
  mask-image: linear-gradient(to right, black 85%, transparent 100%);
  -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
}
```

Apply conditionally only when the carousel overflows.

---

## 7. Expanded View Features

### 7.1 Search

- Input field with a search icon.
- Filters the displayed albums by title (case-insensitive, localized).
- For Recent Albums, also match against `creatorUsername`.
- Empty search state: "No albums match your search."

### 7.2 Sort

**My Albums expanded view:**

- Newest first (default) — by `created_at` descending.
- Alphabetical A–Z — by `title` ascending.
- Most votes — by total votes descending.

**Recent Albums expanded view:**

- Most recent first (default) — by `visitedAt` descending.
- Alphabetical A–Z — by `title` ascending.

---

## 8. Component Changes

### 8.1 `frontend/src/pages/Dashboard.jsx`

- Add `activeView` state.
- Add `prefersReducedMotion` detection.
- Add overflow detection refs for both carousels.
- Add search and sort state for expanded views.
- Render home view with two horizontal carousels.
- Render expanded views with sticky headers, search, sort, and grids.
- Keep existing `galleryAlbum` / `AlbumGallery` integration intact.
- Remove the `showRecent` state and the Clock toggle button.

### 8.2 `frontend/src/index.css`

Add/confirm:

```css
@layer utilities {
  .scrollbar-none::-webkit-scrollbar {
    display: none;
  }
  .scrollbar-none {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .mask-fade-edges {
    mask-image: linear-gradient(to right, black 85%, transparent 100%);
    -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
  }
}
```

### 8.3 `frontend/src/contexts/LangContext.jsx`

Add new translation keys:

```js
seeAll: "See all",
searchAlbums: "Search albums",
noSearchResults: "No albums match your search",
sortNewest: "Newest",
sortAlphabetical: "A–Z",
sortMostVotes: "Most votes",
sortMostRecent: "Most recent",
```

(Provide Russian equivalents.)

---

## 9. Edge Cases & Behavior

| Scenario | Expected Behavior |
|----------|-------------------|
| 0 albums | Show empty-state card inside My Albums track; hide Recent Albums section if empty. |
| 1–2 albums | Show carousel with the available cards; no "See all" because no overflow. |
| Many albums | Carousel scrolls horizontally; "See all" visible; expanded view supports search/sort. |
| No recent albums | Hide the entire Recent Albums section. |
| Reduced motion enabled | Disable snap and spring animations; keep transitions minimal. |
| Card click in carousel | Open `AlbumGallery` via `onPhotoClick`, same as grid. |
| Back button | Return to home dashboard view; restore scroll position to top of dashboard. |
| Browser back button | Because views are state-only, browser back navigates away from `/dashboard` entirely (acceptable per interview decision). |

---

## 10. Verification Checklist

- [ ] Horizontal scroll works for both My Albums and Recent Albums.
- [ ] "See all" appears only when carousel overflows.
- [ ] Tapping "See all" opens the expanded view with a smooth transition and scrolls to top.
- [ ] Sticky back button remains visible while scrolling the expanded view.
- [ ] Back button returns to the home dashboard view.
- [ ] Search filters albums correctly in both expanded views.
- [ ] Sort options work as specified.
- [ ] Reduced motion disables non-essential animations.
- [ ] Card click in carousel opens the photo gallery.
- [ ] Clock toggle is removed; Recent Albums is always visible when data exists.
- [ ] Empty states render correctly.
- [ ] No visual regressions on mobile or desktop.
- [ ] Existing `AlbumGallery` integration still works.

---

## 11. Open Questions for Further Flesh-Out

1. Should the expanded view grid use the same 2-column layout as the current dashboard, or a denser 3-column grid on desktop?
2. Should the search input be debounced, and what is the desired debounce delay?
3. Should the sort state persist if the user navigates away and returns to the expanded view within the same session?
4. Should the right-edge fade be applied on both left and right edges when the user has scrolled into the middle?
5. Should there be a pull-to-refresh or manual refresh in the expanded views?
