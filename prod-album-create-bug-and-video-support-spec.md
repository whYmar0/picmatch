# Production Bug Spec: Album Creation "Server Error" Toast & Video Support (up to 50MB)

## Overview

Address a critical production bug and implement a requested feature enhancement:
1. **Critical Bug:** In production, after uploading photos and tapping "Create Album", a toast notification pops up saying "Server error" (or HTTP 500/504), even though the backend successfully creates and persists the album in the database.
2. **Feature Request:** Remove the 50-attachment limit per album and add full support for video uploads (up to 50 MB per video file).

---

## Part 1 — Critical Production Bug Analysis & Fix

### Symptoms
- User fills in title, description, adds photos, and clicks "Create Album".
- Axios catches an error and shows `toast.error("Server error")` (or HTTP 504 / 500).
- The user is left on the creation screen thinking it failed.
- However, when navigating to `/dashboard`, the album is present and completely functional with all uploaded photos.
- Backend FastAPI logs show no 500 traceback because the database transaction committed cleanly.

### Root Causes

#### A. Reverse Proxy Timeout (Nginx / Vercel / Cloudflare)
Uploading multiple uncompressed or large photos sequentially to Cloudinary inside the FastAPI endpoint loop (`for idx, f in enumerate(photos): _cloudinary_upload(...)`) takes 15–40 seconds.
- Default Nginx `proxy_read_timeout` is 60s (or 30s in many PaaS/Vercel serverless setups).
- When total upload time exceeds the proxy timeout, the proxy returns `504 Gateway Timeout` or `502 Bad Gateway` to the browser before FastAPI finishes returning the HTTP 201 JSON payload.
- The backend continues executing in the background, completes the DB transaction, and saves the album.
- The frontend receives 504 Gateway Timeout from the proxy and displays `toast.error(err.message)`.

#### B. Nginx / Cloudflare Payload Size Limits
If total payload exceeds `client_max_body_size` (default 1 MB in stock Nginx), Nginx returns `413 Payload Too Large` immediately before the backend process logs anything.

#### C. Async Concurrent Uploads & Batching
Sequential file uploads (`for f in photos: await f.read(); upload()`) block the HTTP worker for too long.

### Required Bug Fixes

#### 1. Backend Fixes (`backend/routers/albums.py` & `backend/cloudinary_utils.py`)
- **Use Concurrent Uploads:** Use `asyncio.gather()` or async task pooling to upload images/videos to Cloudinary concurrently rather than sequentially.
- **Update Cloudinary Resource Type:** Change Cloudinary upload helper to use `resource_type="auto"` so both images and videos are processed natively by Cloudinary without error.
- **Optimize Nginx / Server Configuration Guidance:** Add explicit Nginx `client_max_body_size 100M;` and `proxy_read_timeout 300s;` guidelines in documentation.

#### 2. Frontend Fixes (`frontend/src/pages/CreateAlbum.jsx` & `api/index.js`)
- **Increase Axios Timeout for Album Creation:** Set a custom timeout (`timeout: 120000` = 2 minutes) specifically for `albumsApi.create` requests.
- **Optimistic Redirect / Handling 504 Timeout:** If `albumsApi.create` receives a 504 or network timeout, check if the album was created before displaying a server error toast, or display a clear "Uploading in background..." state.

---

## Part 2 — Unlimited Attachments & Video Support (up to 50MB)

### Requirements

1. **Remove Photo Count Limit:**
   - Remove the 50-item cap in `frontend/src/pages/CreateAlbum.jsx` (`.slice(0, 50)`).
   - Remove `if len(photos) > 50: raise HTTPException(...)` in `backend/routers/albums.py`.

2. **Support Video Formats:**
   - Accept formats: `video/mp4`, `video/webm`, `video/quicktime` (`.mov`), `video/avi`.
   - Set max file size limit: **50 MB** for videos (keep images compressed/limited or uniform 50 MB limit).

3. **Client-side Compression & Skip Video:**
   - Update `compressImage(file)` in `CreateAlbum.jsx` to immediately skip video files (`if (file.type.startsWith("video/")) return resolve(file);`).

4. **Cloudinary & Local Storage for Videos:**
   - In `backend/cloudinary_utils.py`, update `upload_image` / `upload_media`:
     ```python
     response = cloudinary.uploader.upload(
         file_bytes,
         public_id=public_id,
         resource_type="auto",  # Automatically detects image or video
         overwrite=True,
     )
     ```
   - In `backend/routers/albums.py`: update `ALLOWED_TYPES` to include video MIME types. Do not attempt `PIL.Image.open()` on video bytes.

5. **UI & Media Player Integration:**
   - Update `AlbumGallery.jsx`, `VotePage.jsx`, `AlbumCard.jsx`, and `RecentAlbumCard.jsx` to detect video URLs/files (e.g. extension `.mp4`, `.webm`, `.mov` or Cloudinary video path):
     - If video: render `<video src={url} controls playsInline className="..." />` instead of `<img>`.
     - In thumbnails and cards: show a video play icon badge over the cover.

---

## Step-by-Step Implementation Instructions

### Files to Modify

| File | Changes Required |
|---|---|
| `backend/routers/albums.py` | Remove 50 limit, add video MIME types (`ALLOWED_TYPES`), increase `MAX_FILE_SIZE` to 50MB, skip PIL compression for videos, perform parallel Cloudinary uploads (`asyncio.gather`). |
| `backend/cloudinary_utils.py` | Change `resource_type="image"` to `resource_type="auto"` in `upload_image`. |
| `frontend/src/pages/CreateAlbum.jsx` | Remove `.slice(0, 50)` limit, update dropzone accept for videos, skip canvas compression for videos, update file size warning to 50MB. |
| `frontend/src/api/index.js` | Increase timeout for `albumsApi.create` to 120,000 ms (2 minutes). |
| `frontend/src/components/AlbumGallery.jsx` | Add video detection and `<video>` player support in carousel slides and Lightbox. |
| `frontend/src/components/AlbumCard.jsx` | Add video thumbnail badge / video tag preview. |
| `frontend/src/pages/VotePage.jsx` | Add video player support in voting cards. |

---

## Verification & Test Plan

1. **Bug Fix Test:**
   - Upload 10+ photos to create an album.
   - Click "Create Album".
   - Confirm: Request completes successfully, `toast.success("Album created!")` is shown, and browser navigates to `/dashboard` cleanly without any 504 / server error toast.

2. **Unlimited Attachments Test:**
   - Add 60+ images in `CreateAlbum.jsx`.
   - Confirm all 60 files are accepted and uploaded without error.

3. **Video Upload Test (up to 50MB):**
   - Upload an MP4 / WebM video file (e.g., 20 MB video).
   - Click "Create Album".
   - Confirm video is stored on Cloudinary / local storage.
   - Open gallery / vote page — verify `<video>` player renders, plays smoothly with controls.

---

## Constraints

- Do not break existing image optimization (`f_auto,q_auto`).
- Keep existing authentication and authorization logic intact.
- Ensure video files up to 50MB process cleanly without memory leaks on FastAPI server (`io.BytesIO` / streaming).
