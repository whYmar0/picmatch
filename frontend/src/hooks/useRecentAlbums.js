/**
 * hooks/useRecentAlbums.js
 *
 * Stores up to 10 recently visited albums in localStorage, keyed per userId.
 * Shape stored: { id, title, coverUrl, creatorUsername, is_public, hasAccess, visitedAt }
 */

const MAX = 10;

function storageKey(userId) {
  return `picmatch_recent_${userId}`;
}

export function getRecentAlbums(userId) {
  if (!userId) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(userId)) || "[]");
    // Sort by visitedAt descending (most recent first)
    return raw.sort((a, b) => new Date(b.visitedAt) - new Date(a.visitedAt));
  } catch {
    return [];
  }
}

export function recordAlbumVisit(userId, albumMeta) {
  if (!userId || !albumMeta?.id) return;
  const key = storageKey(userId);
  try {
    const prev = JSON.parse(localStorage.getItem(key) || "[]");
    const filtered = prev.filter((a) => a.id !== albumMeta.id);
    const next = [
      { ...albumMeta, visitedAt: new Date().toISOString() },
      ...filtered,
    ].slice(0, MAX);
    localStorage.setItem(key, JSON.stringify(next));
  } catch { /**/ }
}

export function removeRecentAlbum(userId, albumId) {
  if (!userId || !albumId) return;
  const key = storageKey(userId);
  try {
    const prev = JSON.parse(localStorage.getItem(key) || "[]");
    localStorage.setItem(key, JSON.stringify(prev.filter((a) => a.id !== albumId)));
  } catch { /**/ }
}
