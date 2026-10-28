# Comment System Bugs — Investigation & Fix Specification

## Overview

The comment system has two critical bugs that need to be investigated, root-caused, and fixed:

1. **Wrong grouping:** The algorithm incorrectly classifies some comments/replies, causing replies to appear as top-level comments or top-level comments to be hidden.
2. **Missing notifications:** Some replies do not generate a notification to the person being replied to.

---

## Correct Data Model (Source of Truth)

The database schema is correct and must NOT be changed.

```
Comment {
  id         UUID
  photo_id   UUID (FK → Photo)
  user_id    UUID (FK → User)
  text       TEXT
  parent_id  UUID | NULL   ← NULL = top-level comment, non-NULL = reply to that comment
  created_at TIMESTAMP
}
```

**Rules:**
- `parent_id IS NULL` → **top-level comment** (root of a thread).
- `parent_id IS NOT NULL` → **reply**. It always belongs to the thread whose root has `id == parent_id`.
- Replies are flat (max depth = 1 meaningful level in the UI). A "reply to a reply" stores the **root** comment's `id` as `parent_id`, not the reply's id (see Frontend Bug 1 below).
- A thread = one root comment + all its direct replies (where `replies[*].parent_id == root.id`).

---

## Bug 1 — Frontend: Wrong parent_id when replying to a reply

### Location
`frontend/src/components/PhotoComments.jsx`, `CommentInput.handleSubmit` (line ~190).

### Current (broken) code
```jsx
parent_id: replyTarget?.id ?? null,
```

### Problem
When a user clicks "Reply" on a **reply** (a comment that already has `parent_id !== null`), the frontend sends that reply's `id` as the new `parent_id`. The backend stores this as a reply to a reply — creating depth-2 nesting. The backend's `get_comments` query only fetches top-level (`parent_id IS NULL`) and their direct replies via `selectinload(Comment.replies)`. Any comment at depth 3+ is **silently dropped** from the response and never displayed.

### Fix
Before sending the request, resolve the root comment id:
```jsx
// In CommentInput.handleSubmit:
// replyTarget can be any comment (top-level or reply).
// Always post as a reply to the ROOT of the thread.
const rootId = replyTarget?.parent_id ?? replyTarget?.id ?? null;

const created = await commentsApi.create({
  photo_id: photoId,
  text: text.trim(),
  parent_id: rootId,   // ← always the root, never a reply's id
});
```

The `replyTarget` object has a `parent_id` field (returned by the API). If `parent_id` is non-null, the target is itself a reply → use `parent_id` (which IS the root). If `parent_id` is null, the target is the root → use `id`.

Also update `onCommentCreated` call:
```jsx
onCommentCreated(created, rootId);
```

And update `PhotoCommentsList.handleCommentCreated` (line ~270) — it already uses `parentId` correctly to append to the right root comment.

### Related: reply trigger from CommentItem
In `CommentItem` (line ~110), `onReply(comment, rootComment)` is called. The `rootComment` argument is only passed when `depth > 0`. Fix `CommentInput` as described above and this will resolve automatically, since `replyTarget.parent_id` will always be correctly set.

---

## Bug 2 — Backend: Notification not sent for all reply scenarios

### Location
`backend/routers/comments.py`, `create_comment` function, lines ~339–375.

### Current (broken) code
```python
if body.parent_id:
    # ... only notifies if the text STARTS WITH @username matching the parent's author
    is_reply_to_parent = bool(
        parent
        and parent_uid != uid
        and parent_username
        and mentioned_username
        and mentioned_username.casefold() == parent_username.casefold()
    )
    if is_reply_to_parent:
        db.add(Notification(..., type=NotificationType.REPLY, user_id=parent_uid, ...))
else:
    # only notifies the album owner
    if album_creator_id and album_creator_id != uid:
        db.add(Notification(..., type=NotificationType.COMMENT, user_id=album_creator_id, ...))
```

### Problems found

**Problem A — Reply notification requires matching @mention:** The system only sends a `REPLY` notification if the text starts with `@parent_author_username`. If the user types a reply without the mention (e.g., just "haha"), **no notification is sent at all** even though someone replied to their comment. This is the primary cause of missing notifications.

**Problem B — Root comment author not notified when a stranger replies:** When user B replies to user A's comment (in a public album), user A should receive a `REPLY` notification. Currently this happens only if B typed `@A`. If A is also the album owner, they get a `COMMENT` notification instead (wrong type). If A is NOT the album owner, they get nothing.

**Problem C — Album owner double-notified or not notified:** When the album owner themselves replies to a voter's comment, no notification is sent. When someone replies to the album owner's comment, the owner gets a `COMMENT` type notification (incorrect — it should be `REPLY`).

**Problem D — No notification when the album owner replies to a voter's comment:** The voter who wrote the root comment should receive a notification when the album owner replies. Currently there is no code path that sends this.

### Correct notification logic

Replace the entire notification block (lines 339–375) with the following algorithm:

```python
# ── Notification logic ────────────────────────────────────────────────────────
# Terminology:
#   actor   = current_user (the one writing the comment)
#   actor_id = uid

try:
    notifications_to_create = []

    if body.parent_id:
        # This is a REPLY. Always notify the root comment's author
        # (the person who started the thread), UNLESS they are the actor.
        root_author_id = _s(parent.user_id) if parent else None

        if root_author_id and root_author_id != uid:
            notifications_to_create.append(Notification(
                user_id=root_author_id,
                actor_id=uid,
                type=NotificationType.REPLY,
                album_id=_s(album.id) if album else None,
                photo_id=_s(body.photo_id),
                comment_id=new_comment_id,
                text=comment.text[:100],
            ))

        # Additionally, if the album owner is NOT the actor AND NOT already
        # notified above (i.e., owner is not the root comment author),
        # notify the owner that a reply happened in their album.
        if (album_creator_id
                and album_creator_id != uid
                and album_creator_id != root_author_id):
            notifications_to_create.append(Notification(
                user_id=album_creator_id,
                actor_id=uid,
                type=NotificationType.COMMENT,   # owner gets "comment" type for reply activity
                album_id=_s(album.id) if album else None,
                photo_id=_s(body.photo_id),
                comment_id=new_comment_id,
                text=comment.text[:100],
            ))

    else:
        # This is a TOP-LEVEL comment. Notify the album owner.
        if album_creator_id and album_creator_id != uid:
            notifications_to_create.append(Notification(
                user_id=album_creator_id,
                actor_id=uid,
                type=NotificationType.COMMENT,
                album_id=_s(album.id) if album else None,
                photo_id=_s(body.photo_id),
                comment_id=new_comment_id,
                text=comment.text[:100],
            ))

    for notif in notifications_to_create:
        db.add(notif)

except Exception:
    logger.exception("Failed to create notifications for comment %s", new_comment_id)
```

### Remove the @mention dependency entirely
The `mention_match` / `mentioned_username` / `is_reply_to_parent` variables are no longer needed. Delete them. Notification is sent based on **structural relationship** (parent_id → parent's author), not on whether the text happens to contain a @mention.

---

## Bug 3 — Backend: `load_author` missing for parent comment in notification path

### Location
`comments.py` line ~342: `parent.author.username` is accessed without eager-loading `Comment.author` for the parent.

### Current code
```python
parent_result = await db.execute(
    select(Comment).where(Comment.id == _s(body.parent_id))
)
parent = parent_result.scalar_one_or_none()
```

`Comment.author` is a relationship — it is NOT loaded here. Accessing `parent.author.username` triggers a lazy load that fails with `MissingGreenlet` on an async session (or silently returns None).

### Fix
Eagerly load author when fetching the parent:
```python
parent_result = await db.execute(
    select(Comment)
    .options(selectinload(Comment.author))
    .where(Comment.id == _s(body.parent_id))
)
parent = parent_result.scalar_one_or_none()
```

---

## Summary of All Changes

| # | File | Lines | Change |
|---|---|---|---|
| 1 | `frontend/src/components/PhotoComments.jsx` | ~190 | Fix `parent_id` to always resolve to root comment id |
| 2 | `frontend/src/components/PhotoComments.jsx` | ~195 | Pass `rootId` (not `replyTarget?.id`) to `onCommentCreated` |
| 3 | `backend/routers/comments.py` | ~309–313 | Add `selectinload(Comment.author)` when loading parent comment |
| 4 | `backend/routers/comments.py` | ~339–375 | Replace mention-dependent notification logic with structural logic |

---

## Testing Protocol

Use credentials from `testuser.md`. Start both servers.

**Test 1 — Basic reply notification**
1. Log in as user A (owner). Log in as user B (voter) in a different browser/incognito.
2. User B posts a comment on any photo in user A's album.
3. **Verify:** User A receives a notification of type "comment".
4. User A replies to user B's comment (no @mention in the text).
5. **Verify:** User B receives a notification of type "reply". The notification appears in their notification feed.

**Test 2 — Reply without @mention works**
1. User B posts a comment. User A replies with text "thanks!" (no @B).
2. **Verify:** User B still receives the reply notification.

**Test 3 — Reply to a reply stays in the same thread**
1. User B posts a comment. User A replies. User B clicks "Reply" on **user A's reply** (depth-1 item).
2. **Verify:** The new comment is stored with `parent_id = original_root_comment.id` (NOT user A's reply id).
3. **Verify:** The new reply appears under the root comment in the thread, not as a new top-level comment.

**Test 4 — No self-notification**
1. User A replies to their own comment.
2. **Verify:** No notification is generated for user A themselves.

**Test 5 — Owner notification on reply activity**
1. User B and user C both comment. User B replies to user C's comment.
2. **Verify:** User C (root comment author) receives a reply notification. User A (album owner) also receives a comment notification (unless A is C).

Do not mark this task complete until ALL 5 tests pass manually.
