# PicMatch v5 — Dashboard UI/UX Horizontal Sliders Spec

## Overview

Rewrite the layout of `Dashboard.jsx` to introduce two horizontally scrollable carousels:
1. **My Albums** (Мои Альбомы)
2. **Recent Albums** (Недавние Альбомы) (placed at the bottom)

Under each carousel, there must be a **"See all"** (Показать все) link/button. Clicking it transitions the layout to a full vertical grid/list page of those albums. These dedicated full-screen pages must feature a sticky top-left **"Back"** (Назад) navigation button, and transition in/out with smooth window/page animations using Framer Motion (`AnimatePresence`).

---

## 1. Dashboard Layout Structure

### Home State (Default Dashboard View)
Instead of rendering full grids directly on the dashboard page, divide the screen into two horizontal tracks:

#### A. My Albums Track
- **Header:** "My Albums" (Мои альбомы) title.
- **Carousel container:** A horizontally scrollable container (`flex overflow-x-auto scrollbar-none snap-x gap-4 py-2 px-1`).
- **Cards:** Render `AlbumCard` components inside the carousel. Give each card a fixed width (e.g., `w-[280px] sm:w-[320px] flex-shrink-0 snap-start`) so they align side-by-side.
- **Affordance:** A **"See all"** button/text link placed immediately below the track (aligned to the right or left per clean design aesthetics). Tapping this opens the **All My Albums** full page.

#### B. Recent Albums Track
- **Header:** "Recently Visited" (Недавние) title.
- **Carousel container:** Same horizontally scrollable styling (`flex overflow-x-auto scrollbar-none snap-x gap-4 py-2 px-1`).
- **Cards:** Render `RecentAlbumCard` components with fixed width (e.g., `w-[280px] sm:w-[320px] flex-shrink-0 snap-start`).
- **Affordance:** A **"See all"** button/text link below the track. Tapping this opens the **All Recent Albums** full page.

---

## 2. Expanded Views & Smooth Page Transitions

Tapping "See all" must animate a full-screen view swap. To ensure smooth transitions, manage the active view via state in `Dashboard.jsx` (e.g., `const [activeView, setActiveView] = useState("home"); // "home" | "my-albums" | "recent-albums"`) wrapped inside `AnimatePresence`.

### Animation Specifications (Framer Motion)
When transitioning to an expanded page:
- **Slide & Fade Page transition:**
  - **Enter:** Slides up or scales from a card-like window into a full screen (`initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}`).
  - **Exit:** Reverse the transition (`exit={{ opacity: 0, scale: 0.95, y: 15 }}`).
- **Scroll Position Restoration:** When swapping views, reset scroll to top so the user starts at the peak of the new list.

### Sticky Navigation Header (Back Button)
On both expanded pages (`"my-albums"` and `"recent-albums"`):
- Implement a sticky/fixed header bar:
  ```html
  <div className="sticky top-0 bg-background/85 backdrop-blur-md z-30 py-4 border-b border-border-light dark:border-border-dark flex items-center gap-3">
  ```
- Put a prominent **"Back"** arrow button (using Lucide `ArrowLeft` or `ChevronLeft`) in the top-left corner.
- **Requirement:** This button **MUST** remain fixed/sticky at the top of the viewport so that even if the user scrolls down through dozens of albums, the back arrow is always visible and clickable to immediately return home.

---

## 3. Changes by Component

### File: `frontend/src/pages/Dashboard.jsx`

#### A. State & View Setup
Add state to control which screen is active:
```js
const [activeView, setActiveView] = useState("home"); // "home" | "my-albums" | "recent-albums"
```

#### B. JSX Layout
Wrap the dashboard views with `AnimatePresence` and render conditionally:

```jsx
return (
  <div className="max-w-5xl mx-auto px-4 py-8 relative">
    <AnimatePresence mode="wait">
      {activeView === "home" && (
        <motion.div
          key="home"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-10"
        >
          {/* 1. MY ALBUMS SECTION */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h1 className="font-display font-bold text-2xl">{t("myAlbums")}</h1>
              <Link to="/create" className="btn-primary w-10 h-10 p-0 flex items-center justify-center rounded-2xl">
                <Plus size={20} strokeWidth={2.5} />
              </Link>
            </div>
            
            {albums.length === 0 ? (
              <div className="text-center py-10 bg-card-light dark:bg-card-dark rounded-3xl p-6">
                <p className="text-gray-400 text-sm">{t("noAlbums")}</p>
              </div>
            ) : (
              <div>
                <div className="flex overflow-x-auto gap-4 py-2 px-1 scrollbar-none snap-x mask-fade-edges">
                  {albums.map((album, i) => (
                    <div key={album.id} className="w-[280px] sm:w-[320px] flex-shrink-0 snap-start">
                      <AlbumCard album={album} onDelete={handleDelete} index={i} onPhotoClick={handlePhotoClick} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-2">
                  <button 
                    onClick={() => { window.scrollTo({ top: 0 }); setActiveView("my-albums"); }}
                    className="text-primary-500 hover:text-primary-600 font-semibold text-sm transition-colors"
                  >
                    {t("seeAll") || "See all"} →
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 2. RECENT ALBUMS SECTION */}
          {recent.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-xl text-gray-800 dark:text-gray-200">
                  {t("recentlyVisited")}
                </h2>
              </div>
              <div className="flex overflow-x-auto gap-4 py-2 px-1 scrollbar-none snap-x mask-fade-edges">
                {recent.map((album, i) => (
                  <div key={album.id} className="w-[280px] sm:w-[320px] flex-shrink-0 snap-start">
                    <RecentAlbumCard album={album} index={i} />
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-2">
                <button 
                  onClick={() => { window.scrollTo({ top: 0 }); setActiveView("recent-albums"); }}
                  className="text-primary-500 hover:text-primary-600 font-semibold text-sm transition-colors"
                >
                  {t("seeAll") || "See all"} →
                </button>
              </div>
            </section>
          )}
        </motion.div>
      )}

      {activeView === "my-albums" && (
        <motion.div
          key="my-albums"
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="min-h-screen"
        >
          {/* Sticky Header with back arrow */}
          <div className="sticky top-0 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md z-30 py-4 mb-6 border-b border-border-light dark:border-border-dark flex items-center gap-4">
            <button 
              onClick={() => setActiveView("home")}
              className="p-2 rounded-2xl hover:bg-border-light dark:hover:bg-border-dark transition-colors text-gray-600 dark:text-gray-300"
              aria-label="Back"
            >
              <ChevronLeft size={24} />
            </button>
            <h1 className="font-display font-bold text-2xl">{t("myAlbums")}</h1>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-20">
            {albums.map((album, i) => (
              <AlbumCard key={album.id} album={album} onDelete={handleDelete} index={i} onPhotoClick={handlePhotoClick} />
            ))}
          </div>
        </motion.div>
      )}

      {activeView === "recent-albums" && (
        <motion.div
          key="recent-albums"
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="min-h-screen"
        >
          {/* Sticky Header with back arrow */}
          <div className="sticky top-0 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md z-30 py-4 mb-6 border-b border-border-light dark:border-border-dark flex items-center gap-4">
            <button 
              onClick={() => setActiveView("home")}
              className="p-2 rounded-2xl hover:bg-border-light dark:hover:bg-border-dark transition-colors text-gray-600 dark:text-gray-300"
              aria-label="Back"
            >
              <ChevronLeft size={24} />
            </button>
            <h1 className="font-display font-bold text-2xl">{t("recentlyVisited")}</h1>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-20">
            {recent.map((album, i) => (
              <RecentAlbumCard key={album.id} album={album} index={i} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);
```

*Note: Adjust class names for `bg-background-light/90` or `bg-card-light` depending on the current global layout color schemes in `index.css`.*

---

## 4. CSS Additions

To make horizontal carousels look premium, hide scrollbars but keep horizontal gestures functional:
Add to `frontend/src/index.css` (or confirm utility class is available):

```css
@layer utilities {
  .scrollbar-none::-webkit-scrollbar {
    display: none;
  }
  .scrollbar-none {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
}
```

---

## 5. Verification Checklist

- [ ] **Horizontal Scroll:** Ensure both "My Albums" and "Recently Visited" sections scroll horizontally when cards exceed the screen width.
- [ ] **See All Action:** Tapping "See all" takes the user to the full list, scroll position resets to the top, and back navigation restores view state.
- [ ] **Transitions:** Verify that page transitions look premium and fluid. The animation must be a smooth zoom/slide.
- [ ] **Sticky Header:** Scroll deep down on either "See all" page. Ensure the header containing the back arrow is always stuck to the top and remains interactive.
