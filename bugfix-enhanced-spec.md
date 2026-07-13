# PicMatch v5 — Enhanced Bug Fix Spec

## Overview

Fix four bugs in the `AlbumGallery` photo viewer and related components.
All changes are **frontend-only** (`frontend/src/`). Backend was audited — no issues found.

**Stack:** React 18 + Vite, Framer Motion, TailwindCSS (utility classes), Lucide React icons.

**Priority:** All 4 bugs fixed together in a single batch.

---

## Interview Decisions Summary

| Decision | Choice |
|---|---|
| Priority | Fix all 4 together |
| Testing | Add tests only where easy (Playwright/Vitest) |
| Backend audit | All backend endpoints verified — no issues |
| Bug 2 scope | Fix both `PhotoCommentsList` AND default `PhotoComments` |
| Bug 3 icon sizing | Container wrap + resize heart icons for optical match |
| Bug 3 icon colors | Theme-aware (dark: modifier), pill stays `bg-gray-900` always |
| Bug 3 inactive color | `text-white/40` (was `text-gray-400`) |
| Bug 4 viewMode state | In `AlbumGallery` parent state near `sortKey` |
| Bug 4 persistence | Reset to "list" each gallery open (match AlbumSummary behavior) |
| Bug 4 grid design | Use spec's design exactly |
| Bug 1 approach | `pointerEvents: "none"` on exit ONLY — skip `setSheetExpanded(false)` |

---

## Bug 1 — Page freezes after swipe-down dismiss on non-first photo

### Symptom
When the user swipe-dismisses any photo **other than the first one** (`currentIdx > 0`) in the `AlbumGallery` viewer, the gallery closes visually but the underlying `Dashboard` page becomes completely unresponsive to all touch and click events.

### Root Cause
`AlbumGallery.jsx` wraps everything in a `motion.div` with `style={{ touchAction: "none" }}`. When `AnimatePresence` runs the exit animation (opacity → 0 over 0.22s), this `motion.div` remains mounted and continues to capture ALL pointer events. The page is alive underneath but touch/click events are silently swallowed.

Additionally, the `AlbumGallery` body-lock `useEffect` correctly restores `overflow` and `overscrollBehavior` on cleanup. The `BottomSheet` ref-counted body lock also cleans up correctly due to React's bottom-up unmount order. The only actual blocker is the exit animation's pointer capture.

### Fix

**File:** `frontend/src/components/AlbumGallery.jsx`

**Change 1 — Add `pointerEvents: "none"` to the exit style** (line ~864):

```jsx
// BEFORE:
exit={{ opacity: 0, transition: { duration: 0.22 } }}

// AFTER:
exit={{ opacity: 0, pointerEvents: "none", transition: { duration: 0.22 } }}
```

**No other changes needed for Bug 1.** The `setSheetExpanded(false)` call proposed in the original spec would cause a visual artifact (BottomSheet closing animation overlaying the gallery fade-out) and is unnecessary since React's child-before-parent unmount order ensures clean body lock cleanup.

### Verification
- [ ] Open gallery on album with 3+ photos.
- [ ] Swipe to photo index 1 or 2 (not the first photo).
- [ ] Swipe down to dismiss the gallery.
- [ ] Confirm `Dashboard` page is fully interactive immediately after gallery closes.
- [ ] Repeat with the bottom sheet (`sheetExpanded = true`) open at the time of dismiss.

---

## Bug 2 — Comments invisible on re-entry (count shown, list empty)

### Symptom
When the user opens the comments tab for a photo that has comments, closes the sheet, then re-opens the comments tab for the same photo, the comment list renders empty — but the `commentCount` badge on `PillBar` still shows the correct non-zero number.

### Root Cause
Two components share the same bug:

**A. `PhotoCommentsList`** (line ~184 in `PhotoComments.jsx`) — rendered from `AlbumGallery` at line ~819 **without** an `initialComments` prop. Therefore `initialComments` is `undefined`, not `null`.

The load guard uses strict inequality:
```js
if (initialComments !== null) return;   // undefined !== null → true → skips API call!
```

**B. Default `PhotoComments`** (line ~254) — used by `AlbumSummary.jsx`. Has `initialComments = null` as default parameter, but could still receive `undefined` from a caller. Same `!== null` guard exists at line ~260.

In both cases: `undefined !== null` evaluates to `true`, so the API fetch is skipped. The `comments` state initializes as `initialComments ?? []` which is `[]`. The component renders "No comments yet."

The `commentsCount` in `PillBar` works because it's populated by a separate `useEffect` in `AlbumGallery` (lines ~506-517) that calls `commentsApi.getForPhoto()` independently.

### Fix

**File:** `frontend/src/components/PhotoComments.jsx`

**Change 1 — `PhotoCommentsList`: fix load guard** (line ~201):
```js
// BEFORE:
if (initialComments !== null) return;

// AFTER:
if (initialComments != null) return;   // loose != covers both null and undefined
```

**Change 2 — `PhotoCommentsList`: fix loading initial state** (line ~189):
```js
// BEFORE:
const [loading, setLoading] = useState(initialComments === null);

// AFTER:
const [loading, setLoading] = useState(initialComments == null);  // true for undefined too
```

**Change 3 — Default `PhotoComments`: fix load guard** (line ~260):
```js
// BEFORE:
if (initialComments !== null) return;

// AFTER:
if (initialComments != null) return;
```

**Change 4 — Default `PhotoComments`: fix loading initial state** (line ~256):
```js
// BEFORE:
const [loading, setLoading] = useState(initialComments === null);

// AFTER:
const [loading, setLoading] = useState(initialComments == null);
```

### Verification
- [ ] Open comments tab for a photo that has comments.
- [ ] Close the sheet.
- [ ] Re-open the comments tab for the same photo.
- [ ] Confirm the comment list is populated (not empty).
- [ ] Confirm the skeleton loader is shown briefly during the API fetch.
- [ ] Repeat test via `AlbumSummary` photo detail sheet (exercises default `PhotoComments`).

---

## Bug 3 — Icon size/color inconsistency in PillBar

### Symptom
In the photo viewer's bottom pill bar, the three icons — `FilledHeart`, `BrokenHeart`, and `MessageCircle` — appear at visually different heights. The heart icons look smaller than the `MessageCircle` icon, and the inactive color (`text-gray-400`) appears too dark against the `bg-gray-900` pill background.

### Root Cause
`FilledHeart` and `BrokenHeart` use a non-square SVG viewBox (`0 0 512 456.549`). At `size={22}`, their rendered height is `22 × (456.549 / 512) ≈ 19.6px` — visually shorter than `MessageCircle` at `size={22}` (square, 22×22px). No bounding-box wrapper equalizes heights.

`MessageCircle` from Lucide uses default `strokeWidth={2}`, making it visually heavier than the filled heart icons at equivalent size.

### Fix

**File:** `frontend/src/components/AlbumGallery.jsx` — `PillBar` component (lines ~62-73).

- Wrap each icon in a fixed `22×22` flex container
- Resize heart icons to `size={20}` to optically match `MessageCircle`
- Set `MessageCircle` to `size={20}` with `strokeWidth={1.75}` for visual weight balance
- Replace `text-gray-400` with theme-aware `text-white/40 dark:text-white/40` for inactive state
- Keep `bg-gray-900` pill background always dark (confirmed decision)

```jsx
// AFTER:
<span className="flex items-center gap-2.5 text-base font-semibold">
  <span className="flex items-center justify-center w-[22px] h-[22px]">
    <FilledHeart size={20} className={likeCount > 0 ? "text-white" : "text-white/40"} />
  </span>
  {likeCount}
</span>
<span className="flex items-center gap-2.5 text-base font-semibold">
  <span className="flex items-center justify-center w-[22px] h-[22px]">
    <BrokenHeart size={20} className={dislikeCount > 0 ? "text-white" : "text-white/40"} />
  </span>
  {dislikeCount}
</span>
<span className="flex items-center gap-2.5 text-base font-semibold">
  <span className="flex items-center justify-center w-[22px] h-[22px]">
    <MessageCircle
      size={20}
      strokeWidth={1.75}
      className={commentCount > 0 ? "text-white" : "text-white/40"}
    />
  </span>
  {commentCount}
</span>
```

### Verification
- [ ] Open any album gallery.
- [ ] Inspect the PillBar — all three icons appear visually equal in height and weight.
- [ ] Inactive icons (count = 0) appear dimmed white, not gray.
- [ ] Active icons (count > 0) appear fully white.

---

## Bug 4 — Sort sheet "Grid" / "List" buttons do nothing in AlbumGallery viewer

### Symptom
Inside the `AlbumGallery` viewer, the statistics bottom sheet has a Sort button that opens `GallerySortSheet`. This sheet shows List and Grid view-mode buttons. Tapping either button closes the sheet but the photo list does not change layout — it always stays in list mode.

### Root Cause
`GallerySortSheet` has its own local `viewMode` state:
```js
function GallerySortSheet({ open, onClose, sortKey, setSortKey }) {
  const [viewMode, setViewMode] = useState("list");  // local only, never passed up
```
This state is local to the sheet and never lifted to the parent `AlbumGallery`. `StatisticsTab` receives no `viewMode` prop and always renders in list mode. The local state also resets every time the sheet unmounts.

By contrast, in `AlbumSummary.jsx` (the working reference), `viewMode` is declared at the parent level (line ~155) and passed into both the sort sheet and the photo list renderer as a controlled prop.

**Decision:** `viewMode` resets to "list" each time the gallery opens (matches `AlbumSummary` behavior). The Grid/List toggle buttons live in the sort sheet (not a separate component).

### Fix

**File:** `frontend/src/components/AlbumGallery.jsx` — five coordinated changes:

**Step 1 — Add `viewMode` state to `AlbumGallery` parent** (near line ~390, alongside `sortKey`):
```js
const [viewMode, setViewMode] = useState("list");
```

**Step 2 — Remove local `viewMode` state from `GallerySortSheet`, accept as props** (line ~275):
```jsx
// BEFORE:
function GallerySortSheet({ open, onClose, sortKey, setSortKey }) {
  const { t } = useLang();
  const [viewMode, setViewMode] = useState("list");  // DELETE this line

// AFTER:
function GallerySortSheet({ open, onClose, sortKey, setSortKey, viewMode, setViewMode }) {
  const { t } = useLang();
  // viewMode and setViewMode come from parent (AlbumGallery)
```

**Step 3 — Pass `viewMode` and `setViewMode` to `GallerySortSheet`** (line ~1001):
```jsx
// BEFORE:
<GallerySortSheet
  open={sortOpen}
  onClose={() => setSortOpen(false)}
  sortKey={sortKey}
  setSortKey={setSortKey}
/>

// AFTER:
<GallerySortSheet
  open={sortOpen}
  onClose={() => setSortOpen(false)}
  sortKey={sortKey}
  setSortKey={setSortKey}
  viewMode={viewMode}
  setViewMode={setViewMode}
/>
```

**Step 4 — Add `viewMode` prop to `StatisticsTab` and implement grid rendering** (line ~173):
```jsx
// BEFORE:
function StatisticsTab({
  analytics, photos, currentPhotoId, onJump,
  selectedVotersSize, onOpenSort, onOpenFilter, onShare, shareDone,
}) {

// AFTER:
function StatisticsTab({
  analytics, photos, currentPhotoId, onJump,
  selectedVotersSize, onOpenSort, onOpenFilter, onShare, shareDone,
  viewMode = "list",
}) {
```

Replace the single `div.space-y-1` photo list block with a conditional that renders grid or list based on `viewMode`:

```jsx
{viewMode === "grid" ? (
  <div className="grid grid-cols-3 gap-2">
    {photos.map((photo, i) => (
      <button
        key={photo.id}
        onClick={() => onJump(photo.id)}
        className={`relative aspect-square rounded-xl overflow-hidden
                   bg-border-light dark:bg-border-dark
                   ${String(photo.id) === String(currentPhotoId)
                     ? "ring-2 ring-primary-400"
                     : ""}`}
      >
        <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 text-white text-[10px] font-semibold flex justify-between">
          <span>#{i + 1}</span>
          <span>{photo.total_votes > 0 ? `${photo.like_percentage}%` : "—"}</span>
        </div>
      </button>
    ))}
  </div>
) : (
  <div className="space-y-1">
    {/* EXISTING list-mode photo buttons, unchanged */}
  </div>
)}
```

**Step 5 — Pass `viewMode` to `StatisticsTab`** (line ~985):
```jsx
// AFTER adding viewMode={viewMode} to the props
<StatisticsTab
  analytics={analytics}
  photos={filtered}
  currentPhotoId={currentPhoto?.id}
  onJump={jumpToPhoto}
  selectedVotersSize={selectedVoters.size}
  onOpenSort={() => setSortOpen(true)}
  onOpenFilter={openFilterSheet}
  onShare={handleShare}
  shareDone={shareDone}
  viewMode={viewMode}
/>
```

### Verification
- [ ] Open album gallery, expand the statistics bottom sheet.
- [ ] Tap Sort → tap Grid → sheet closes → photo list switches to 3-column grid.
- [ ] Tap Sort → tap List → sheet closes → photo list switches back to list layout.
- [ ] Confirm selected view mode persists while navigating between photos in the gallery.
- [ ] Confirm sort order buttons (Most Likes / Most Dislikes) still work correctly alongside view mode.
- [ ] Close and reopen the gallery → confirm viewMode resets to "list".

---

## Files to Modify

| File | Bugs Fixed |
|---|---|
| `frontend/src/components/AlbumGallery.jsx` | Bug 1, Bug 3, Bug 4 |
| `frontend/src/components/PhotoComments.jsx` | Bug 2 (both components) |

---

## Do NOT Change

- `frontend/src/components/BottomSheet.jsx` — body lock logic is correct as-is. React's unmount order ensures clean cleanup.
- `frontend/src/components/FilledHeart.jsx` — SVG geometry is correct; sizing fix is in the wrapper.
- `frontend/src/components/BrokenHeart.jsx` — SVG geometry is correct; sizing fix is in the wrapper.
- `frontend/src/pages/AnalyticsPage.jsx` — unrelated to any reported bug.
- `frontend/src/pages/Dashboard.jsx` — unrelated to any reported bug.
- `frontend/src/components/AlbumSummary.jsx` — viewMode pattern is the reference, no changes needed.
- Any backend files — all verified, no issues found.

---

## Testing Plan

### Manual Verification (required)
Follow the verification checklists under each bug above.

### Automated Tests (optional — "add only if easy")

**Possible Playwright e2e test for Bug 4:**
```js
// e2e/album-gallery.spec.js
test('grid/list toggle in gallery sort sheet', async ({ page }) => {
  // 1. Login, navigate to dashboard
  // 2. Click album card → gallery opens
  // 3. Expand statistics sheet
  // 4. Click Sort → Grid
  // 5. Assert photo list is now in 3-column grid layout
  // 6. Click Sort → List
  // 7. Assert photo list is back in list layout
});
```

**Possible Vitest unit test for Bug 2:**
```js
// PhotoComments.test.jsx
test('loads comments when initialComments is undefined', async () => {
  // Render PhotoCommentsList without initialComments prop
  // Assert API call is made
  // Assert comments appear
});
```

---

## Backend Audit Results

| Endpoint | Status | Notes |
|---|---|---|
| `GET /comments/photo/{photo_id}` | ✅ OK | Returns consistent data on every call. Visibility rules correct. |
| `GET /albums/{id}/analytics` | ✅ OK | `_build_analytics` correctly aggregates vote data. Privacy gate works. |
| `GET /albums/shared/{token}/analytics` | ✅ OK | Reuses `_build_analytics`, consistent. |

No backend changes needed. All bugs are pure frontend state management / rendering issues.
