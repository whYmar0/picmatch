/**
 * api/index.js — Centralized API client
 *
 * BUGFIXES:
 *  - 401 interceptor no longer redirects when the failing URL is /auth/*
 *    (prevents infinite redirect loop when login password is wrong)
 *  - detail extraction handles both string and array (FastAPI validation errors)
 *  - All endpoints exported cleanly
 */

import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// ─── Request: attach JWT ──────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("picmatch_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response: unwrap data, extract readable errors ──────────────────────────
api.interceptors.response.use(
  // Success: return just the data body (not the full axios wrapper)
  (response) => response.data,

  (error) => {
    const url = error.config?.url || "";
    const isAuthEndpoint = url.includes("/auth/");

    // Only force-logout on 401 for non-auth endpoints (prevents login redirect loop)
    if (error.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem("picmatch_token");
      localStorage.removeItem("picmatch_user");
      window.location.href = "/login";
      return Promise.reject(new Error("Session expired. Please log in again."));
    }

    // Extract a human-readable message from FastAPI's error shape:
    //   { detail: "string" }                        ← HTTPException
    //   { detail: [{ loc, msg, type }, ...] }       ← Pydantic validation error
    const detail = error.response?.data?.detail;
    let message = "Something went wrong. Please try again.";

    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail) && detail.length > 0) {
      // Join all validation messages with a separator
      message = detail
        .map((e) => {
          const field = e.loc?.slice(1).join(" → ") || "";
          return field ? `${field}: ${e.msg}` : e.msg;
        })
        .join(" · ");
    } else if (error.message) {
      message = error.message;
    }

    return Promise.reject(new Error(message));
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data)  => api.post("/auth/register", data),
  login:    (data)  => api.post("/auth/login", data),
  me:       ()      => api.get("/auth/me"),
};

// ─── Albums ───────────────────────────────────────────────────────────────────
export const albumsApi = {
  create:          (formData) => api.post("/albums/", formData, {
                     headers: { "Content-Type": "multipart/form-data" },
                   }),
  getMyAlbums:     ()           => api.get("/albums/my"),
  getByInviteCode: (code)       => api.get(`/albums/invite/${code}`),
  getAnalytics:    (albumId)    => api.get(`/albums/${albumId}/analytics`),
  delete:          (albumId)    => api.delete(`/albums/${albumId}`),
};

// ─── Votes ────────────────────────────────────────────────────────────────────
export const votesApi = {
  castVote:  (photoId, isLike) => api.post("/votes/", { photo_id: photoId, is_like: isLike }),
  getSession:(inviteCode)      => api.get(`/votes/session/${inviteCode}`),
  getMyVotes:(albumId)         => api.get(`/votes/album/${albumId}/my-votes`),
};

export default api;
