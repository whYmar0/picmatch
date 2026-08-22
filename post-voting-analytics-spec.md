# Post-Voting Flow & Analytics Access Rework — Specification

## Goal

Rework the post-voting completion screen, unify the analytics viewing experience for voters, and implement proper public/private album access controls with correct localization.

---

## Current State & Architecture

### Components Involved
- `frontend/src/pages/VotePage.jsx` lines **335–357** — "all done" screen shown after voting finishes.
- `frontend/src/pages/AnalyticsPage.jsx` — full-page analytics. Has two modes:
  - **Normal:** loads `albumsApi.getAnalytics()` → renders `AlbumSummary` component.
  - **Locked (private):** renders `LockedCommentSheet` (only user's own comment threads).
- `frontend/src/components/AlbumSummary.jsx` — the main statistics component (list/grid of photos, reactions, voter summaries, sort/filter, comments). Also used inside `AlbumGallery.jsx` BottomSheet.
- `frontend/src/components/AlbumGallery.jsx` — gallery mode with integrated BottomSheet stats (`StatisticsTab`).
- `frontend/src/contexts/LangContext.jsx` — EN (line ~67) and RU (line ~265) translation dictionaries.
- `frontend/src/components/RecentAlbumCard.jsx` — recent albums card (already has `isPrivate` badge logic at line 39).

### Current Behavior After Voting
The "all done" screen (VotePage lines 335–357) shows:
1. A bouncing green checkmark icon with spring animation.
2. "Вы оценили все фото!" / "You've rated all photos!" (`allDone` key).
3. "Спасибо за ваши голоса" / "Thanks for your votes" (`allDoneSubtitle` key).
4. A single "View Results" button that navigates to `/analytics/{albumId}`.

---

## Required Changes

### 1. Simplify Post-Voting Screen

In `VotePage.jsx` lines **335–357**, make these changes:

- **Remove** the text "Спасибо за ваши голоса" / "Thanks for your votes" (`allDoneSubtitle`). Delete the `<p>` element at line 351.
- **Remove ALL animations** from this screen:
  - Remove the `motion.div` wrapper with `initial/animate/transition` (lines 338–342). Replace with a plain `<div>`.
  - Remove the bouncing checkmark `motion.div` with `animate={{ y: [0, -10, 0] }}` (lines 344–348). Replace with a static `<div>`.
- **Add a "Back to Main" button** next to the existing "View Results" button:
  - Text: use the existing `backToAlbums` translation key ("My albums" / "Мои альбомы").
  - Navigation: `navigate("/dashboard")`.
  - Styling: secondary/ghost button style (e.g., `btn-ghost` or `bg-border-light dark:bg-border-dark` with text styling). Place it below the primary "View Results" button with a small gap.

### 2. Unify Analytics View for Voters

When a voter clicks "View Results" after voting, they currently navigate to `/analytics/{albumId}` which renders `AnalyticsPage.jsx`. This already loads `AlbumSummary` for public albums. **No routing change is needed.**

However, the backend must correctly serve analytics data to voters based on the album's `is_public` flag:

#### Public Album (`is_public === true`)
- The voter sees the **full** `AlbumSummary` view — identical to what the owner sees.
- All photos, all reactions from all voters, sorting, filtering, and comments are accessible.
- The album is recorded in "Recent Albums" with `hasAccess: true`.

#### Private Album (`is_public === false`)
- The voter sees **only**:
  - The photos from the album (read-only, no reactions data from other voters).
  - Their **own** comment threads.
  - Stats tab is hidden — only the "Comments" tab is available.
- The `AlbumSummary` component already has a `can_view_stats` prop from the analytics API response. If `can_view_stats === false`:
  - Hide the Statistics tab button entirely.
  - Default to "Comments" tab.
  - In the photo list/grid, hide like/dislike counts and voter names.
- The album appears in "Recent Albums" with `hasAccess: false` and `is_public: false` → `RecentAlbumCard` already renders a privacy badge (line 39: `const isPrivate = album.is_public === false`).

### 3. Localization Fix: "Комментарии" in Private Album BottomSheet

In the `AlbumGallery.jsx` BottomSheet (line ~1326), the "Comments" tab button text uses `t("Comments")`. Verify that the `Comments` key exists in both EN and RU dictionaries in `LangContext.jsx`.

Check all hardcoded instances of the word "Comments" or "Комментарии" in:
- `AlbumGallery.jsx` (BottomSheet tab buttons)
- `AlbumSummary.jsx` (reaction sheet tab buttons)
- `AnalyticsPage.jsx` (LockedCommentSheet)

Replace any hardcoded strings with the `t("Comments")` call. Ensure the RU dictionary has:
```
Comments: "Комментарии"
```
and the EN dictionary has:
```
Comments: "Comments"
```

### 4. Backend: Verify `can_view_stats` Logic

In the backend analytics endpoint (`routers/albums.py` → `getAnalytics` or equivalent), verify that:
- If the requesting user is the **owner** → `can_view_stats: true`.
- If the album is **public** and the user is a voter → `can_view_stats: true`.
- If the album is **private** and the user is NOT the owner → `can_view_stats: false`. In this case, the response should still include `photos` (URLs only), but `reactions` arrays per photo should be empty (or contain only the current user's reactions), and `voter_summaries` should be empty.

If this logic does not exist yet, it needs to be added. The frontend already reads `can_view_stats` in `AlbumSummary.jsx` line 174 and uses it at line 180 to decide which tab to open.

---

## Files to Create / Modify

| File | Action | Key Change |
|---|---|---|
| `frontend/src/pages/VotePage.jsx` | **[MODIFY]** lines 335–357 | Remove subtitle, remove animations, add "Back to Main" button |
| `frontend/src/contexts/LangContext.jsx` | **[MODIFY]** | Verify `Comments` key in both EN/RU. Add `backToMain` key if needed. |
| `frontend/src/components/AlbumSummary.jsx` | **[MODIFY]** | Ensure `can_view_stats === false` hides stats tab, reaction counts, voter names |
| `frontend/src/components/AlbumGallery.jsx` | **[MODIFY]** | Replace any hardcoded "Comments" with `t("Comments")` |
| `backend/routers/albums.py` | **[MODIFY]** (if needed) | Ensure `can_view_stats` is set correctly based on ownership + `is_public` |

---

## Self-Test Protocol

Start both servers, log in using credentials from `testuser.md`.

| # | Scenario | Expected |
|---|---|---|
| 1 | Complete voting on any album | "All done" screen shows with NO animations, NO "thank you" subtitle. Two buttons visible: "View Results" and "My albums". |
| 2 | Click "My albums" button | Navigates to `/dashboard`. |
| 3 | Click "View Results" on a **public** album | Navigates to `/analytics/{id}`. Full `AlbumSummary` is shown with all stats, reactions, voter names, sort/filter. |
| 4 | Click "View Results" on a **private** album | Navigates to `/analytics/{id}`. Only photos and user's own comments are visible. No stats tab. No other voters' reactions. |
| 5 | Check "Recent Albums" on dashboard | The voted album appears. Private albums show a lock/privacy badge. |
| 6 | Switch language to RU | "Comments" tab in BottomSheet shows "Комментарии". All buttons localized. |
| 7 | Switch language to EN | "Comments" tab shows "Comments". "Back to Main" button shows "My albums". |

**Do not stop iterating until all 7 tests pass flawlessly.**
