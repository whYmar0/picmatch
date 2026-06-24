/**
 * api/index.js — v2 with avatar upload
 */
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

export const authStorage = {
  getToken: () => localStorage.getItem("pickmatch_token") || sessionStorage.getItem("pickmatch_token"),
  getUser: () => localStorage.getItem("pickmatch_user") || sessionStorage.getItem("pickmatch_user"),
  setSession: (token, user, remember = true) => {
    const primary = remember ? localStorage : sessionStorage;
    const secondary = remember ? sessionStorage : localStorage;
    secondary.removeItem("pickmatch_token");
    secondary.removeItem("pickmatch_user");
    primary.setItem("pickmatch_token", token);
    primary.setItem("pickmatch_user", JSON.stringify(user));
  },
  clear: () => {
    localStorage.removeItem("pickmatch_token");
    localStorage.removeItem("pickmatch_user");
    sessionStorage.removeItem("pickmatch_token");
    sessionStorage.removeItem("pickmatch_user");
  },
};

api.interceptors.request.use((config) => {
  const token = authStorage.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const url = error.config?.url || "";
    if (error.response?.status === 401 && !url.includes("/auth/")) {
      authStorage.clear();
      // Don't redirect if the 401 came from the /vote/ page itself —
      // VotePage handles auth-gating with a friendly prompt
      const onVotePage = window.location.pathname.startsWith("/vote/");
      if (!onVotePage) {
        // Preserve current path so user returns after login
        const returnTo = window.location.pathname + window.location.search;
        window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
      }
      return Promise.reject(new Error("Сессия истекла. Войдите снова."));
    }
    const detail = error.response?.data?.detail;
    let message = "Что-то пошло не так. Попробуйте ещё раз.";
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail) && detail.length > 0) {
      message = detail.map((e) => {
        const field = e.loc?.slice(1).join(" → ") || "";
        return field ? `${field}: ${e.msg}` : e.msg;
      }).join(" · ");
    } else if (error.code === "ECONNABORTED") {
      message = "Сервер долго не отвечает. Попробуйте ещё раз.";
    } else if (error.message === "Network Error") {
      message = "Ошибка сети. Проверьте соединение и повторите попытку.";
    } else if (error.message) {
      message = error.message;
    }
    return Promise.reject(new Error(message));
  }
);

export const authApi = {
  register:           (data) => api.post("/auth/register", data),
  login:              (data) => api.post("/auth/login",    data),
  verifyEmail:        (data) => api.post("/auth/verify-email", data),
  resendVerification: (data) => api.post("/auth/resend-verification", data),
  forgotPassword:     (data) => api.post("/auth/forgot-password", data),
  resetPassword:      (data) => api.post("/auth/reset-password", data),
  me:                 ()     => api.get("/auth/me"),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/auth/avatar", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  deleteAvatar: () => api.delete("/auth/avatar"),
};

export const albumsApi = {
  create:          (formData) => api.post("/albums/", formData, {
                     headers: { "Content-Type": "multipart/form-data" },
                   }),
  getMyAlbums:     ()        => api.get("/albums/my"),
  getByInviteCode: (code)    => api.get(`/albums/invite/${code}`),
  getAnalytics:    (albumId) => api.get(`/albums/${albumId}/analytics`),
  delete:          (albumId) => api.delete(`/albums/${albumId}`),
  updatePrivacy:   (albumId, isPublic) => {
    const form = new FormData();
    form.append("is_public", isPublic);
    return api.patch(`/albums/${albumId}/privacy`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  getMyCommentsInAlbum: (albumId) => api.get(`/albums/${albumId}/my-comments`),
};

export const votesApi = {
  castVote:  (photoId, isLike) => api.post("/votes/", { photo_id: photoId, is_like: isLike }),
  getSession:(inviteCode)      => api.get(`/votes/session/${inviteCode}`),
  getMyVotes:(albumId)         => api.get(`/votes/album/${albumId}/my-votes`),
};

export const sharedApi = {
  shareAlbum:  (albumId, body)           => api.post(`/shared/albums/${albumId}/share`, body),
  listShares:  (albumId)                 => api.get(`/shared/albums/${albumId}/shares`),
  revokeShare: (albumId, accessId)       => api.delete(`/shared/albums/${albumId}/shares/${accessId}`),
  sharedWithMe: ()                       => api.get("/shared/with-me"),
};

export const commentsApi = {
  getForPhoto: (photoId)   => api.get(`/comments/photo/${photoId}`),
  getThread:   (commentId) => api.get(`/comments/thread/${commentId}`),
  create:      (body)      => api.post("/comments/", body),
  delete:      (commentId) => api.delete(`/comments/${commentId}`),
  toggleLike:  (commentId) => api.post(`/comments/${commentId}/like`),
};

export const notificationsApi = {
  getMine: () => api.get("/notifications/"),
  markAllRead: () => api.post("/notifications/read"),
};

export default api;
