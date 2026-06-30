# Picmatch Bugfix & Enhancement Spec

**Date:** 2026-06-30
**Status:** Draft — ready for implementation

---

## Table of Contents

1. [🐛 — Comment Submission Not Showing on Frontend](#1--comment-submission-not-showing-on-frontend)
2. [🔄 — Page Height Jumps on Scroll (Android Chrome)](#2--page-height-jumps-on-scroll-android-chrome)
3. [🎨 — Random Avatar Colors at Registration](#3--random-avatar-colors-at-registration)
4. [🌓 — Theme Toggle Text Reversed](#4--theme-toggle-text-reversed)
5. [📧 — Email Verification Removed from Registration](#5--email-verification-removed-from-registration)

---

## 1. 🐛 — Comment Submission Not Showing on Frontend

### User Report

> В продакшне при нажатии на «отправить комментарий» фронтэнд не показывает новый комментарий, но бэкенд его отправляет (его бывает видно после обновления страницы).

- ❌ **On all albums** (both public and private)
- ❌ **No visual change at all** — no skeleton flash, no comment appearing, no input clearing
- ✅ **Backend creates the comment** — visible after page refresh

### Root Cause Analysis

**File:** `backend/routers/comments.py` — `create_comment()` endpoint (lines ~176–221)

The bug is a **SQLAlchemy `MissingGreenlet` exception** occurring on the backend *after* the comment is successfully saved but *before* the response is returned.

#### Detailed Sequence

1. `db.add(comment)` adds the comment to the session.
2. `await db.flush()` emits the INSERT and populates the primary key (`comment.id` is now set).
3. Notification-creation code runs — accessing `comment.id` is fine here because the session hasn't committed yet.
4. `await db.commit()` **saves the transaction AND expires all ORM objects in the session** (default SQLAlchemy behavior for `commit()`).
5. After commit, the code tries to reload the comment:
   ```python
   result = await db.execute(
       select(Comment).options(...)
       .where(Comment.id == _s(comment.id))  # ← CRASH
   )
   ```
   Accessing `comment.id` on the **expired** object triggers an implicit **synchronous lazy-load refresh**. Because the session is an `AsyncSession`, this raises a **`MissingGreenlet`** exception (`sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been called; can't call await_only() here`).

6. This returns an **HTTP 500** to the frontend.
7. In `PhotoComments.jsx`, `handleSubmit` catches the error in the empty `catch { /**/ }` block — all UI updates (`setText("")`, optimistic `setComments`, `load()`) are skipped.
8. The user sees **no visual change**. But the comment was already saved by `db.commit()` in step 4, so it appears after a hard refresh.

### Fix

**In `backend/routers/comments.py`:**

Capture `comment.id` into a local variable **after `flush()` but before `commit()`**, then use the captured variable after `commit()`.

```python
comment = Comment(...)
db.add(comment)
await db.flush()

# Capture ID before commit (to avoid MissingGreenlet on expired object)
new_comment_id = _s(comment.id)

# ... notification creation (uses comment.id — still OK, before commit) ...
await db.commit()

# Reload with relationships — use captured ID
result = await db.execute(
    select(Comment).options(...)
    .where(Comment.id == new_comment_id)
)
```

#### Additional Frontend Improvement

While not strictly required for the fix, the `handleSubmit` in `PhotoComments.jsx` should **not call `load()` unconditionally after optimistic update**. The current pattern of "optimistic + immediate reload" is redundant and can cause a brief skeleton flash. Instead:

- Remove the `load()` call from `handleSubmit` — the optimistic update is sufficient.
- Add error handling inside the `catch` block (display toast) instead of silently swallowing errors.

---

## 2. 🔄 — Page Height Jumps on Scroll (Android Chrome)

### User Report

> Исправь баг из-за которых возникают скачки высоты страницы (при скроллинге). Высота страницы должна быть постоянной и зависеть от разрешения устройства.

- ❌ **Android Chrome** — address bar hides/shows during scroll, causing `100vh` to change
- ❌ **Page «дёргается» (jumps)** when scrolling, especially when address bar hides

### Root Cause

**`min-h-screen` and `min-h-[100vh]` use the **viewport height** (`vh`) unit**, which on mobile browsers **changes dynamically** when the address bar (chrome) appears/disappears.

- When address bar is visible: `100vh` ≈ visible area **minus** address bar height.
- When address bar hides: `100vh` = full screen height.
- As the user scrolls down and the address bar collapses, `100vh` increases → the page height grows → the content "jumps" down.
- This creates a jarring **height jump** on every scroll.

### Fix

#### 1. Migrate to `100dvh` (Dynamic Viewport Height)

`100dvh` represents the **maximum** possible viewport height (excluding the address bar), so it stays **stable** regardless of the address bar state.

Affected files and classes to update:

| File | CSS Class/Property | Replace With |
|---|---|---|
| `frontend/src/App.jsx` | `min-h-screen` | `min-h-[100dvh]` |
| `frontend/src/pages/Landing.jsx` | `min-h-screen` | `min-h-[100dvh]` |
| `frontend/src/pages/VotePage.jsx` | `h-[100dvh]` | `h-[100dvh]` (already correct) |
| `frontend/src/pages/VotePage.jsx` | `min-h-screen` | `min-h-[100dvh]` |
| `frontend/src/index.css` | `html`, `body` | Ensure `min-height: 100dvh` |

#### 2. Also Fix Remaining Pages Using `min-h-screen`

Check and standardize all page-level containers:

| Page File | Current Class | Fix |
|---|---|---|
| `Login.jsx` | `min-h-[100dvh]` | ✅ Already correct |
| `Register.jsx` | `min-h-[100dvh]` | ✅ Already correct |
| `ForgotPassword.jsx` | `min-h-[100dvh]` | ✅ Already correct |
| `ResetPassword.jsx` | `min-h-[100dvh]` | ✅ Already correct |
| `VerifyEmail.jsx` | `min-h-[100dvh]` | ✅ Already correct |
| `Skeleton.jsx` | `min-h-screen` | `min-h-[100dvh]` |
| `Landing.jsx` | `min-h-screen` | `min-h-[100dvh]` |
| `App.jsx` | `min-h-screen` | `min-h-[100dvh]` |

#### 3. Additional `overscroll-behavior` Fix

For `AlbumsGallery.jsx`, the `overscroll-behavior: contain` on the wrapper element is already set in the latest git diff. Ensure this is properly applied to prevent the Chrome pull-to-refresh gesture from interfering.

---

## 3. 🎨 — Random Avatar Colors at Registration

### User Report

> Пусть у каждого пользователя будет при регистрации рандомный цвет аватарки — зелёный, жёлтый, оранжевый, розовый, фиолетовый, синий (в той же цветовой гамме, в какой сейчас фиолетовый).

### Design Decisions

- **When:** Color assigned **once at registration**, persisted in DB forever.
- **Where:** Only shown when `avatar_url` is null (user hasn't uploaded a photo). If user uploads a photo, the color fallback is hidden.
- **Palette:** 6 muted/pastel colors matching the existing primary purple tone (#9966CC → #7545A3).
- **Storage:** New column `avatar_color` on `User` model. Existing users get `NULL` (no color), and the `UserAvatar` component should handle this gracefully (fall back to current purple).
- **Migration:** Required — add `avatar_color` column (nullable String).

### Color Palette

The existing purple uses: `bg-primary-100` light / `dark:bg-primary-900/40` / `text-primary-600`.

Each color follows the same pattern using Tailwind's built-in color scales. The key hex values match the saturation level of `primary-600` (#7545A3 ≈ muted, ≈30% saturation).

| Name | Tailwind Light BG | Tailwind Dark BG | Tailwind Text |
|---|---|---|---|
| `purple` | `bg-purple-100` | `dark:bg-purple-900/40` | `text-purple-600` |
| `green` | `bg-green-100` | `dark:bg-green-900/40` | `text-green-600` |
| `yellow` | `bg-yellow-100` | `dark:bg-yellow-900/40` | `text-yellow-600` |
| `orange` | `bg-orange-100` | `dark:bg-orange-900/40` | `text-orange-600` |
| `pink` | `bg-pink-100` | `dark:bg-pink-900/40` | `text-pink-600` |
| `blue` | `bg-blue-100` | `dark:bg-blue-900/40` | `text-blue-600` |

### Implementation Plan

#### Backend

1. **`backend/models.py`** — Add `avatar_color` column to `User`:
   ```python
   avatar_color = Column(String(20), nullable=True)
   ```

2. **`backend/schemas.py`** — Add `avatar_color` to `UserOut`:
   ```python
   avatar_color: Optional[str] = None
   ```

3. **`backend/routers/auth_router.py`** — In `register()`, after creating user:
   ```python
   import random
   AVATAR_COLORS = ["purple", "green", "yellow", "orange", "pink", "blue"]
   user.avatar_color = random.choice(AVATAR_COLORS)
   ```

4. **`backend/migrate_auth.py`** or a new migration script — Add the column:
   ```python
   # SQLite-compatible migration
   try:
       await conn.execute(text("ALTER TABLE users ADD COLUMN avatar_color VARCHAR(20)"))
   except Exception as e:
       print(f"Skipped avatar_color: {e}")
   ```

#### Frontend

5. **`frontend/src/components/Navbar.jsx`** — Update `UserAvatar` component:
   - Create a color map from color name → Tailwind classes
   - Use `user.avatar_color` (or fall back to `purple`) to pick the background/text classes
   - Apply conditionally only when `avatar_url` is null

6. **`frontend/src/api/index.js`** — Ensure `avatar_color` is handled in user data (should flow through automatically from `UserOut`).

### Color Map (Frontend)

```javascript
const AVATAR_COLORS = {
  purple: { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-600" },
  green:  { bg: "bg-green-100 dark:bg-green-900/40",   text: "text-green-600" },
  yellow: { bg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-600" },
  orange: { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-600" },
  pink:   { bg: "bg-pink-100 dark:bg-pink-900/40",     text: "text-pink-600" },
  blue:   { bg: "bg-blue-100 dark:bg-blue-900/40",     text: "text-blue-600" },
};
```

---

## 4. 🌓 — Theme Toggle Text Reversed

### User Report

> Сейчас тумблер light theme и dark theme работает так что при светлой теме отображается dark, а при темной light. Сделай тексты наоборот.

### Current Behavior

In `frontend/src/components/Navbar.jsx` (line ~343):
```jsx
<span className="flex-1 text-left">
  {isDark ? t("lightTheme") : t("darkTheme")}
</span>
```

- When `isDark = true` → shows "Light theme" (the label for what user will switch **to**)
- When `isDark = false` → shows "Dark theme" (the label for what user will switch **to**)

This is the **current state → target state** pattern, which shows what you'll switch **to**.

### User's Request

Swap to show the **current** theme:

- When `isDark = true` → show "Dark theme" (current theme)
- When `isDark = false` → show "Light theme" (current theme)

### Fix

In `frontend/src/components/Navbar.jsx`, change:
```jsx
{isDark ? t("lightTheme") : t("darkTheme")}
```
to:
```jsx
{isDark ? t("darkTheme") : t("lightTheme")}
```

Also update the icon:
```jsx
// Current: isDark → Sun, !isDark → Moon
{isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-primary-400" />}

// Should stay as-is (Sun icon for dark mode = "switch to light", Moon icon for light mode = "switch to dark")
// This is the toggle ACTION icon, not the state descriptor — fine to keep.
```

**Note:** Only the **text label** needs to change. The Sun/Moon icons represent the **action** (what you switch to) and should stay as-is.

---

## 5. 📧 — Email Verification Removed from Registration

### User Report

> Критический баг в регистрации: пользователя не просят подтвердить почту. Раньше у меня было подтверждение через SMTP Resend, теперь оно пропало.

### Background

The registration endpoint (`POST /auth/register`) currently **skips email verification entirely** — every new user is created with `is_verified=True`. The `verify-email` and `resend-verification` endpoints exist in the backend, but the registration flow doesn't call them.

### Required Behavior

| Aspect | Decision |
|---|---|
| Login without verification | ❌ **Blocked** — 403 "Email not verified" |
| Post-registration redirect | ➡️ **Redirect to `/verify-email?email=...`** |
| Token at registration | ✅ **Return token** (so user is authenticated but can't do restricted actions) |
| Existing users | ✅ **Stay as-is** (keep `is_verified=True`) |
| Resend cooldown | 60 seconds (already implemented in `VerifyEmail.jsx`) |

### Implementation Plan

#### Backend (`backend/routers/auth_router.py`)

**1. Modify `register()` endpoint (lines ~75–119)**

Current behavior:
```python
user.is_verified = True
user.verification_code = None
user.verification_code_expires_at = None
```

New behavior:
```python
# Generate verification code
code = generate_verification_code()
expires_at = get_now() + timedelta(minutes=15)

# Create user with is_verified=False
user = User(
    email=user_data.email,
    username=user_data.username,
    hashed_password=hash_password(user_data.password),
    role=UserRole.CREATOR,
    is_verified=False,
    verification_code=code,
    verification_code_expires_at=expires_at,
)
db.add(user)
await db.flush()

# Send verification email (background task)
from email_utils import send_verification_email
# Add background_tasks parameter to the endpoint
background_tasks.add_task(send_verification_email, user.email, code)

await db.commit()
```

**Important:** The `register` endpoint currently does NOT accept `BackgroundTasks`. Need to add it:
```python
async def register(
    user_data: UserRegister,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
```

**2. Update response to indicate verification is required:**

Change registration response to include `requires_verification: true`:
```python
return {
    "access_token": create_access_token(user.id, user.role.value),
    "token_type": "bearer",
    "user": UserOut.model_validate(user),
    "message": "Account created. Please check your email for verification code.",
    "requires_verification": True,
}
```

**3. Handle re-registration case:**

Currently, if a user re-registers with the same email (unverified), the code reuses the existing user and sets `is_verified=True`. After fix:
- If user exists and is unverified → update their details, re-send verification code, keep `is_verified=False`.

**4. Login check already exists:**

The login endpoint (`POST /auth/login`) already checks `is_verified`:
```python
if not user.is_verified:
    raise HTTPException(status_code=403, detail="Email not verified. Please verify your email first.")
```
This should remain as-is.

**5. Verify-email & Resend endpoints:**

The `/auth/verify-email` and `/auth/resend-verification` endpoints already exist and are functional. No changes needed.

#### Frontend

**1. `frontend/src/pages/Register.jsx`**

Modify `handleSubmit` to redirect to `/verify-email` after successful registration:
```javascript
const handleSubmit = async (e) => {
    e.preventDefault();
    // ...
    try {
      const res = await register({ ...payload, role: "creator" }, remember);
      toast.success(res.message || "Аккаунт создан. Проверьте почту для подтверждения.");
      navigate(`/verify-email?email=${encodeURIComponent(form.email)}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
};
```

**2. `frontend/src/contexts/AuthContext.jsx`**

The `register` function currently sets the user in storage. If we want to still return a token (so user is authenticated), keep as-is. If we want to NOT authenticate until verification, remove the `authStorage.setSession` call.

Per the user's decision: **Return token, but block login**. So the register function should still set the token and user:
```javascript
const register = useCallback(async (formData, remember = true) => {
    const data = await authApi.register(formData);
    // Still set session so user is "logged in" but will be blocked on subsequent logins
    if (data.access_token && data.user) {
      authStorage.setSession(data.access_token, data.user, remember);
      setUser(data.user);
    }
    return data;
}, []);
```

The login endpoint will block re-login, but the user stays authenticated from registration.

**3. `VerifyEmail.jsx`** — Already exists and works. No changes needed.

### Migration

Existing users have `is_verified=True`. Since the user chose "оставить как есть", **no migration script is needed** for existing users. The `register` endpoint was hot-patching to set `is_verified=True`, which functionally made all users verified. After the fix, only **new** users will go through verification.

---

## Implementation Order

| Priority | Task | Risk | Dependencies |
|---|---|---|---|
| **P0** | 5. Email Verification | 🔴 Critical — blocks users from using the app | None |
| **P0** | 1. Comment Bug | 🔴 Critical — broken core feature | None |
| **P1** | 3. Avatar Colors | 🟡 Medium | DB migration |
| **P2** | 2. Page Height Jumps | 🟡 Medium | None |
| **P2** | 4. Theme Toggle | 🟢 Low | None |

### Recommended Execution Plan

1. Fix comment bug (backend: `comments.py` + frontend: `PhotoComments.jsx`)
2. Fix email verification (backend: `auth_router.py` + frontend: `Register.jsx`)
3. Fix theme toggle (frontend: `Navbar.jsx`)
4. Fix avatar colors (backend: migration + model + schema + auth_router; frontend: Navbar.jsx `UserAvatar`)
5. Fix page height jumps (frontend: CSS changes in multiple files)

---

## Files to Modify (Summary)

| File | Changes |
|---|---|
| `backend/routers/comments.py` | Capture `comment.id` before `commit()` to fix MissingGreenlet |
| `backend/routers/auth_router.py` | Add `BackgroundTasks`, generate verification code, set `is_verified=False`, send email |
| `backend/models.py` | Add `avatar_color` column to User |
| `backend/schemas.py` | Add `avatar_color` to UserOut |
| `backend/migrate_auth.py` | Add migration for `avatar_color` column |
| `frontend/src/components/PhotoComments.jsx` | Remove `load()` from `handleSubmit`, add error toast |
| `frontend/src/components/Navbar.jsx` | Fix theme toggle text; add avatar color support in `UserAvatar` |
| `frontend/src/pages/Register.jsx` | Redirect to `/verify-email` after registration |
| `frontend/src/pages/Landing.jsx` | `min-h-screen` → `min-h-[100dvh]` |
| `frontend/src/components/Skeleton.jsx` | `min-h-screen` → `min-h-[100dvh]` |
| `frontend/src/App.jsx` | `min-h-screen` → `min-h-[100dvh]` |

---

## Testing Plan

### Unit / Integration Tests
1. **Comment creation** — Submit comment via API, verify 201 response with valid `CommentOut`
2. **User registration** — Verify `is_verified=False`, `verification_code` is set, email is "sent" (logged)
3. **Login with unverified email** — Verify 403 error
4. **Email verification** — Submit correct code → `is_verified=True`; submit wrong code → error

### Manual Testing
1. **Comment flow** — Open album, submit comment via BottomSheet, verify it appears immediately
2. **Registration flow** — Register new user, verify redirect to `/verify-email`, check email in console, enter code, verify login works
3. **Avatar colors** — Register several users, verify each gets a different random color
4. **Scroll stability** — On Android Chrome, scroll through albums, verify no height jumps
5. **Theme toggle** — Click theme toggle, verify text matches current theme state
