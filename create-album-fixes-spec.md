# Create Album Flow Fixes — Specification & Prompt

## Overview

The album creation flow (`CreateAlbum.jsx`) has several critical bugs and UX issues in production, specifically when dealing with video uploads and large files. Your task is to investigate, fix, and thoroughly test these issues until they are completely resolved.

## Issues to Fix

### 1. Video Upload Preview & Per-File Upload Progress
**Symptom:** When a user selects a video, its preview is not visible in the uploaded items grid. Additionally, there is no progress indicator for individual files, leading to a confusing UX during long video uploads.
**Requirement:** 
- Rearchitect the upload flow in `CreateAlbum.jsx`. Instead of keeping files in local state and uploading them all at once in `handleSubmit`, **upload each file immediately** as soon as it is dropped/selected.
- Display a **circular progress indicator** directly on the cover (thumbnail) of each photo/video while it is uploading.
- Ensure that video previews work correctly in the dropzone grid (you may need to capture a frame or use a temporary local object URL correctly).

### 2. "Network Error" Toast on Album Creation
**Symptom:** Clicking "Create Album" with videos often results in a "Network Error" toast, even though the album is sometimes created in the background.
**Cause:** The monolithic `albumsApi.create(formData)` request sends all files in one huge payload. For 50MB videos, this causes proxy/backend timeouts (e.g., Uvicorn or Nginx timeouts) before the response can be sent.
**Requirement:** Moving to the per-file upload approach (as required in Issue 1) will solve this. You may need to create a new backend endpoint (e.g., `POST /api/upload`) to handle single-file uploads that returns an identifier or URL, and then modify the final "Create Album" request to only send metadata and a list of these uploaded file identifiers.

### 3. Black Screen on Video Playback
**Symptom:** When an album containing a video is finally created, the video does not play in the gallery/voting pages and just shows a black screen.
**Requirement:** Investigate the root cause. This could be due to:
- The backend saving the `media_type` incorrectly (e.g., saving it as `image` instead of `video`).
- The frontend rendering an `<img>` tag instead of a `<video>` tag for that specific item.
- Cloudinary URLs being generated incorrectly or lacking necessary transformations.
Fix the logic so that newly uploaded videos play correctly immediately after the album is created.

### 4. Missing Localization
**Symptom:** `CreateAlbum.jsx` contains hardcoded English strings.
**Requirement:** Localize the following strings using the existing `useLang` context (and add them to the translation dictionaries, e.g., `ru` and `en`):
- `"My Summer Shoot 2024"` (placeholder for album title)
- `"Tell voters what this album is about…"` (placeholder for description)
- `"Public access"` and `"Allow voters to see analytics"`
- `"max 50 MB per file"`

### 5. "Create Album" Button UX
**Symptom:** The submit button shows a photo count and doesn't block properly during upload.
**Requirement:**
- **Remove the photo count** from the "Create Album" button text (it should just say the localized equivalent of "Create Album").
- **Block (disable) the button** completely until **all** media files have finished their individual uploads and reached 100% progress.

---

## Testing Protocol

You **MUST** test your changes thoroughly before completing the task. 

1. **Credentials:** Use the credentials provided in `testuser.md` to log into the local frontend (`http://localhost:5173`).
2. **Test Scenario:**
   - Go to "Create Album".
   - Drop a mix of images and at least one video (e.g., a 10MB+ MP4 file).
   - Verify that the circular progress indicator appears on the thumbnails.
   - Verify that the "Create Album" button is disabled during the upload.
   - Verify that the video preview is visible in the grid.
   - Once uploads finish, verify the button becomes enabled.
   - Click "Create Album" and verify that no "Network Error" toast appears.
   - Open the newly created album in the dashboard and verify that the video plays successfully (no black screen).
3. **Language Test:** Switch the app language to Russian and verify that the placeholders and text mentioned in Issue 4 are translated.

**Do not stop iterating until all these tests pass successfully.**
