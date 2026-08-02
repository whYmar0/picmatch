/**
 * utils/media.js — helpers for detecting and rendering video vs image media.
 */

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "avi", "mkv", "ogv"]);

export function isVideoUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url, "http://localhost");
    const pathname = parsed.pathname.toLowerCase();
    // Cloudinary video delivery URLs use `/video/upload/` and commonly omit
    // the original extension from the public URL.
    if (pathname.includes("/video/upload/")) return true;
    const ext = pathname.split(".").pop();
    return VIDEO_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

export function isVideo(photo) {
  if (!photo) return false;
  if (photo.media_type === "video") return true;
  return isVideoUrl(photo.url);
}

export function getMediaType(photo) {
  if (!photo) return "image";
  if (photo.media_type === "video" || isVideoUrl(photo.url)) return "video";
  return "image";
}
