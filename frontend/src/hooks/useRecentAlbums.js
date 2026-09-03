/**
 * hooks/useRecentAlbums.js
 *
 * Stores up to 10 recently visited albums in localStorage, keyed per userId.
 * Shape stored: { id, title, coverUrl, creatorUsername, creator_id, invite_code, is_public, hasAccess, hasVoted, visitedAt }
 */

const MAX = 10;

function storageKey(userId) {
  return `pickmatch_recent_${userId}`;
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
  // Own albums never belong in "Recently visited" — they are shown under
  // "My albums". Recording them only creates stale records that would
  // resurface in Recent once the album is deleted.
  if (albumMeta.creator_id != null && String(albumMeta.creator_id) === String(userId)) return;
  const key = storageKey(userId);
  try {
    const prev = JSON.parse(localStorage.getItem(key) || "[]");
    const filtered = prev.filter((a) => String(a.id) !== String(albumMeta.id));
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
    localStorage.setItem(key, JSON.stringify(prev.filter((a) => String(a.id) !== String(albumId))));
  } catch { /**/ }
}

/**
 * Removes stored recent entries for albums the current user created.
 *
 * Own albums are hidden from the "Recently visited" section (they live under
 * "My albums"), so any such record is stale: after the album is deleted it
 * disappears from the user's album list while its record would resurface in
 * Recent. Used to purge records left behind before recording skipped own
 * albums (and by delete flows on other devices).
 */
export function purgeOwnRecentAlbums(userId, ownUsername) {
  if (!userId) return;
  const key = storageKey(userId);
  try {
    const prev = JSON.parse(localStorage.getItem(key) || "[]");
    const next = prev.filter(
      (a) =>
        !(a.creator_id != null && String(a.creator_id) === String(userId)) &&
        !(ownUsername && a.creatorUsername === ownUsername)
    );
    if (next.length !== prev.length) {
      localStorage.setItem(key, JSON.stringify(next));
    }
  } catch { /**/ }
}
