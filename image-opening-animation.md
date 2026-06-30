# Task: Implement Shared Element Transition for Album Cover Preview

Current behavior:

On the **"My Albums"** page there is a grid/list of album cards.

Each album card contains:

- album cover (top ~30% of card)
- album title
- metadata
- action buttons

When the user clicks the album cover, a fullscreen photo viewer/modal opens.

Currently the viewer simply fades in, which feels cheap and disconnected.

---

# Goal

Replace the current transition with a **Shared Element Transition** similar to:

- iOS Photos
- Telegram
- Apple Photos
- Arc Browser
- Linear

The fullscreen image must appear to physically expand from its position inside the album card.

The animation should feel like the image never changes identity—it simply changes its size and position.

No fade replacement.

No duplicate animation.

No instant image swap.

---

# Technical requirements

Use **Motion** (`motion/react`).

Use:

- `layoutId`
- `AnimatePresence`
- `motion.img`
- spring physics

Do NOT manually calculate positions using DOM APIs.

Do NOT use GSAP.

Do NOT use CSS-only transitions.

The transition must rely entirely on Motion Shared Layout Animations.

---

# Animation specification

## Opening

When clicking the cover image:

1. The exact image inside the card begins expanding.
2. It smoothly scales and translates into fullscreen.
3. Border radius gradually changes:

    16px
        ↓
    0px

4. Background overlay fades in independently.

5. Animation duration should feel around

250–350ms

using spring physics.

Suggested spring:

```ts
transition={{
    type: "spring",
    stiffness: 340,
    damping: 32,
    mass: 0.9
}}
```

---

## Closing

Reverse the exact animation.

The fullscreen image should return precisely into its original place inside the card.

No opacity jump.

No flickering.

---

# Image identity

Every album cover must receive a unique

```tsx
layoutId={`album-cover-${album.id}`}
```

The fullscreen preview must reuse the same layoutId.

Motion should interpolate automatically.

---

# Background

The dark backdrop is NOT part of the shared transition.

Animate separately.

Example:

```tsx
<motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
/>
```

---

# Border radius

The image should interpolate:

```
n px
↓

n - 4 px

↓

n - 4 - 4 px

↓

0px
```

instead of instantly becoming rectangular.

---

# Image scaling

The image must preserve:

- aspect ratio
- object-fit: cover

No stretching.

No distortion.

---

# Performance

The animation must maintain 60 FPS.

Avoid:

- layout thrashing
- forced reflow
- getBoundingClientRect()
- manual transforms

Use GPU-accelerated transforms only.

---

# Accessibility

ESC closes preview.

Clicking backdrop closes preview.

Scrolling background should be disabled while preview is open.

---

# Existing behavior

Keep everything else unchanged:

- existing routing
- photo viewer
- zoom functionality (if any)
- swipe gestures (if any)

Only replace the transition.

---

# Deliverables

1. Refactor the current implementation to use Shared Element Transition.
2. Remove obsolete fade animation.
3. Keep the code clean and idiomatic.
4. Reuse existing components where possible.
5. Explain every important architectural change after implementation.