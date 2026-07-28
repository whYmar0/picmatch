# Auth Session Inactivity & Cloudinary Image Retention Investigation Spec

## Overview

Investigate and document two potential production risk issues:
1. **Auto-logout after inactivity:** Why users are forced to log in again after a period of inactivity (both in local environment and production implications).
2. **Cloudinary photo retention & URL availability:** Research and verify whether photos uploaded via Cloudinary API could become inaccessible over extended periods (e.g., 1+ month).

---

## Issue 1 — Auto-Logout / Session Inactivity Investigation

### Problem Description
After a period of inactivity in the local project, the user is automatically logged out and redirected to `/login`. If this behavior manifests in production, it creates friction for returning users.

### Root Cause Analysis

#### A. Backend JWT Expiration (`backend/auth.py`)
In `backend/auth.py`:
```python
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
```
- Default expiration is **10,080 minutes (7 days)**.
- Once 7 days elapse from the issue time (`iat`), `decode_token(token)` in `backend/auth.py` raises `JWTError` (token expired).
- Any subsequent request to a protected endpoint returns `HTTP 401 Unauthorized`.

#### B. Frontend Axios 401 Interceptor (`frontend/src/api/index.js`)
In `frontend/src/api/index.js` (lines 50–60):
```javascript
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401 && !url.includes("/auth/")) {
      authStorage.clear();
      const returnTo = window.location.pathname + window.location.search;
      window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
    }
    return Promise.reject(error);
  }
);
```
- When the 7-day token expires, the next API request triggers the 401 interceptor.
- `authStorage.clear()` is called, wiping `pickmatch_token` and `pickmatch_user` from storage.
- The browser is redirected to `/login`.

#### C. Remember Me Storage Difference (`frontend/src/api/index.js`)
- If the user logged in with `remember = false`, `authStorage.setSession` writes credentials to `sessionStorage`. Closing the browser tab or restarting the browser immediately wipes the session, forcing a re-login.
- If `remember = true`, credentials are in `localStorage`, so they survive browser restarts, but expire after `ACCESS_TOKEN_EXPIRE_MINUTES`.

### Recommendations & Solutions for Agent

1. **Configurable Token Expiration for Production:**
   - In `.env.production` / server config, set `ACCESS_TOKEN_EXPIRE_MINUTES=43200` (30 days) or `525600` (1 year) depending on security policy.
2. **Sliding Session / Token Refresh Endpoint (Recommended Upgrade):**
   - Implement a `/api/auth/refresh` endpoint in `backend/routers/auth_router.py`.
   - When a logged-in user visits the site and their token is still valid (or within a grace window), issue a fresh JWT to extend the expiration by another 7/30 days.
   - In `frontend/src/contexts/AuthContext.jsx`, call token refresh on app startup if a valid token exists.

---

## Issue 2 — Long-Term Cloudinary Photo Retention Audit

### Problem Description
Investigate whether photos stored on Cloudinary could "disappear", expire, or become unviewable after 30+ days.

### Audit Findings & Risk Factors

#### A. Asset Access Type (`backend/cloudinary_utils.py`)
In `backend/cloudinary_utils.py`:
```python
response = cloudinary.uploader.upload(
    image_bytes,
    public_id=public_id,
    resource_type="image",
    overwrite=True,
)
```
- By default in Cloudinary, `upload` creates assets with access type **`upload` (Public)**.
- Public Cloudinary URLs (`https://res.cloudinary.com/...`) **do NOT expire** over time unless signed URLs or strict access control restrictions are manually enabled in the Cloudinary Console.

#### B. Risk Factor 1: Overwrite Collisions (`overwrite=True`)
- `overwrite=True` is enabled in `upload_image`.
- If a new upload reuses an existing `public_id` (e.g. non-unique naming, deterministic seed collision, or manual ID override), Cloudinary will silently overwrite and delete the old photo.
- **Verification:** Ensure all `public_id` values generated in `backend/routers/albums.py` use unique UUIDs (`f"picmatch/albums/{album_id}/{uuid4()}"`).

#### C. Risk Factor 2: Cloudinary Free Tier Bandwidth & Credit Limits
- Cloudinary free tier provides **25 Monthly Credits** (~25 GB bandwidth / 25k transformations / 25k assets).
- If monthly bandwidth limits are exceeded, Cloudinary will temporarily return `HTTP 420` or `HTTP 404` for image requests until the next billing cycle reset.
- Images are **not deleted**, but image delivery is blocked during limit overage.

#### D. Risk Factor 3: Cloudinary Security Settings (Restricted Transformations)
- If the Cloudinary dashboard setting *"Restricted media types"* or *"Strict transformations"* is turned on, generated transformation URLs (such as `f_auto,q_auto` in `cloudinary_utils.py`) will return `404 Not Found` unless signed with `sign_url=True`.

#### E. Risk Factor 4: Database Re-initialization in Local Dev
- In local development, if `pickmatch.db` (SQLite) is deleted or re-created, database records pointing to old Cloudinary URLs or local `/uploads/` files are lost. The images may still exist on Cloudinary, but local database references vanish.

### Instructions for Agent

1. **Verify `public_id` Uniqueness:**
   - Audit `backend/routers/albums.py` and `backend/routers/auth_router.py` (avatars) to confirm all uploaded images generate a strictly unique `uuid4()` in the `public_id` path.
2. **Verify `secure_url` Storage in DB:**
   - Confirm that the full HTTPS URL returned by `upload_image` is permanently stored in the `Photo.url` database column.
3. **Document Cloudinary Account Best Practices:**
   - Add recommendations in `README.md` or `.env.example` regarding Cloudinary settings:
     - Keep default "Public" access type for album photos.
     - Monitor monthly credit usage on Cloudinary Dashboard.
     - Do not enable "Strict transformations" without updating `cloudinary_utils.py` to sign URLs.

---

## Action Plan for AI Agent

### Tasks to Perform:
1. **Audit `ACCESS_TOKEN_EXPIRE_MINUTES`:**
   - Verify current value in `backend/auth.py` and `.env.example`.
   - Update `.env.example` to document `ACCESS_TOKEN_EXPIRE_MINUTES=43200` (30 days for production persistence).
2. **Audit Photo Upload Public ID Generation:**
   - Check `backend/routers/albums.py` to guarantee every uploaded photo uses a unique UUID in its Cloudinary `public_id` to prevent accidental overwrites.
3. **Verify Token Expiration Error Handling in Frontend:**
   - Ensure the frontend gracefully notifies the user ("Your session has expired, please log in again") instead of silently failing.

---

## Verification Checklist

- [ ] Check `backend/auth.py` JWT expiration settings.
- [ ] Check `backend/routers/albums.py` photo upload code for unique `public_id` usage.
- [ ] Confirm `remember_me` functionality in `frontend/src/contexts/AuthContext.jsx` and `api/index.js`.
- [ ] Verify no signed URL expiry parameters are used in `cloudinary_utils.py`.
