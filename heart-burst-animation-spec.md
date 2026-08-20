# Instagram-Style Heart Burst Animation on Vote Swipe — Specification

## Goal

Add a rich, multi-phase heart animation to the voting page (`VotePage.jsx` / `SwipeCard.jsx`). When the user swipes a card to the **right** (like) past the 50% threshold, a custom gradient heart image erupts above the user's finger position with a 3-phase animation sequence lasting ~1.5 seconds total.

The animation closely mirrors Instagram's double-tap heart effect: rapid inflate → radial line burst → spring wobble.

---

## Heart Asset

Use the existing image located at:
```
frontend/file_00000000754c7243ae5503bc43b1bae6.png
```

**Before implementation**, move (or copy) this file to the proper assets directory:
```
frontend/src/assets/heart-burst.png
```

This is a purple-pink gradient heart PNG with transparency. It will be used as an `<img>` element (NOT an SVG icon), rendered at **64×64 CSS pixels** (128×128 at 2x for retina).

---

## Animation Phases (Total duration: ~1.5s)

### Phase 1 — Inflate (0ms → 250ms)
The heart appears at the user's last known finger position (details below) and rapidly scales up from 0 to its full size.

```
scale:   0 → 1.35 → 1.0  (overshoot then settle)
opacity: 0 → 1
```

- Use Framer Motion `animate` with a spring: `{ type: "spring", stiffness: 600, damping: 15, mass: 0.8 }`
- The overshoot to 1.35 is natural from the spring's underdamping.

### Phase 2 — Radial Line Burst (200ms → 550ms, overlapping with end of Phase 1)
At the moment the heart reaches peak scale (~200ms), 8–12 thin lines radiate outward from the heart's center. These lines:
- Are 2px wide, 18–28px long (randomized per line).
- Are evenly distributed around 360° (e.g., 10 lines = 36° apart).
- Shoot outward from radius 32px to radius 55–70px over ~350ms.
- Fade from `opacity: 1` → `0` as they travel outward.
- Color: white (`#FFFFFF`) with a subtle drop-shadow for visibility on any background.

**Implementation:** Create a `<div>` container with `position: absolute` centered on the heart. Each line is a small `<div>` rotated by its angle, animated with `translateY` (outward) and `opacity` (fade). Use CSS `@keyframes` or Framer Motion `animate` for the burst. Stagger each line by 15–25ms for a natural feel.

### Phase 3 — Spring Wobble (400ms → 1500ms)
After settling from Phase 1, the heart does a gentle rocking wobble on its vertical axis:

```
rotate: 0° → -12° → 10° → -6° → 3° → 0°
```

- Use Framer Motion `animate` with keyframes: `{ rotate: [0, -12, 10, -6, 3, 0] }`
- Duration: ~1.1s, ease: `"easeInOut"`
- Simultaneously, a very gentle scale pulse: `scale: [1.0, 1.05, 0.97, 1.02, 1.0]`

### Fade Out (1200ms → 1500ms)
```
opacity: 1 → 0
scale:   1.0 → 0.85
```
- Duration: 300ms, ease: `"easeIn"`
- After fade completes, remove the DOM element entirely.

---

## Trigger Conditions

### When to show the heart
The animation triggers when the user's **rightward swipe** crosses the 50% like-commit threshold. Specifically:

In `SwipeCard.jsx`, the card's `x` motion value drives `likeOpacity` via:
```jsx
const likeOpacity = useTransform(x, [15, 80], [0, 1]);
```

The heart should appear when `likeOpacity` reaches **1.0** (i.e., `x >= 80px`), which corresponds to the moment the "НРАВИТСЯ" stamp is fully visible. **Trigger the animation only once per swipe** — set a ref flag `heartTriggered` that resets when the card snaps back or gets swiped off.

### Where to position the heart
Track the user's last `touchmove` / `pointermove` position (clientX, clientY). Place the heart **60px above** the finger's Y position (so the user's finger doesn't cover it), centered horizontally on the finger's X position.

Convert the client coordinates to the card stack container's coordinate space using `getBoundingClientRect()` on the card stack wrapper in `VotePage.jsx`.

### "Dislike" swipe (left)
Do **NOT** show the heart on left swipes. Only right (like) triggers the animation.

---

## New Component: `HeartBurst.jsx`

Create `frontend/src/components/HeartBurst.jsx`:

```jsx
/**
 * HeartBurst.jsx — Instagram-style heart burst animation
 * 
 * Props:
 *   x: number       — CSS left position (px, relative to parent)
 *   y: number       — CSS top position (px, relative to parent)  
 *   onComplete: ()  — called when animation finishes (for cleanup)
 */
```

### Rendering Structure
```
<div className="absolute pointer-events-none z-50" style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}>
  {/* Burst lines container */}
  <div className="absolute inset-0 flex items-center justify-center">
    {lines.map((line, i) => (
      <motion.div key={i} ... />  // each radial line
    ))}
  </div>
  
  {/* Heart image */}
  <motion.img 
    src={heartBurstPng}
    className="w-16 h-16 select-none pointer-events-none"
    alt=""
    ...animation props...
  />
</div>
```

### Props Interface
```typescript
interface HeartBurstProps {
  x: number;          // horizontal position in parent container coords
  y: number;          // vertical position in parent container coords
  onComplete: () => void;  // cleanup callback after animation ends
}
```

---

## Integration Points

### `SwipeCard.jsx` Changes

1. **Add a new prop:** `onLikeThresholdCrossed?: (fingerPos: {x: number, y: number}) => void`
   - Called the first time `x.get() >= 80` during a drag.
   - Passes the current pointer/touch position in **viewport coordinates**.

2. **Track finger position:** In the existing drag logic, store the latest pointer position:
   ```jsx
   const lastPointerPos = useRef({ x: 0, y: 0 });
   
   // In handlePointerDown or via onDrag:
   // Update lastPointerPos.current on every drag frame
   ```

3. **Threshold detection:** Subscribe to the `x` motion value:
   ```jsx
   const heartFired = useRef(false);
   
   useEffect(() => {
     const unsubscribe = x.on("change", (latest) => {
       if (latest >= 80 && !heartFired.current && isTop) {
         heartFired.current = true;
         onLikeThresholdCrossed?.(lastPointerPos.current);
       }
       if (latest < 40) {
         heartFired.current = false;  // reset when dragged back
       }
     });
     return unsubscribe;
   }, [x, isTop, onLikeThresholdCrossed]);
   ```

### `VotePage.jsx` Changes

1. **State for active hearts:**
   ```jsx
   const [hearts, setHearts] = useState([]);
   // Each entry: { id: string, x: number, y: number }
   const cardStackRef = useRef(null);  // ref on the card stack container div
   ```

2. **Handler:**
   ```jsx
   const handleLikeThreshold = useCallback((fingerPos) => {
     const rect = cardStackRef.current?.getBoundingClientRect();
     if (!rect) return;
     const localX = fingerPos.x - rect.left;
     const localY = fingerPos.y - rect.top - 60; // 60px above finger
     const id = `heart-${Date.now()}-${Math.random()}`;
     setHearts(prev => [...prev, { id, x: localX, y: localY }]);
   }, []);
   
   const removeHeart = useCallback((id) => {
     setHearts(prev => prev.filter(h => h.id !== id));
   }, []);
   ```

3. **Render hearts inside the card stack container:**
   ```jsx
   <div ref={cardStackRef} className="relative w-full max-w-[430px] ...">
     {/* existing cards */}
     
     {/* Heart burst effects */}
     {hearts.map(h => (
       <HeartBurst key={h.id} x={h.x} y={h.y} onComplete={() => removeHeart(h.id)} />
     ))}
   </div>
   ```

4. **Pass the callback to SwipeCard:**
   ```jsx
   <SwipeCard
     ...
     onLikeThresholdCrossed={handleLikeThreshold}
   />
   ```

---

## Files to Create / Modify

| File | Action | Key Change |
|---|---|---|
| `frontend/src/assets/heart-burst.png` | **[NEW]** (move from `frontend/file_00000000754c7243ae5503bc43b1bae6.png`) | Heart image asset in proper location |
| `frontend/src/components/HeartBurst.jsx` | **[NEW]** | Self-contained 3-phase animation component |
| `frontend/src/components/SwipeCard.jsx` | **[MODIFY]** | Add `onLikeThresholdCrossed` prop, finger tracking, threshold detection |
| `frontend/src/pages/VotePage.jsx` | **[MODIFY]** | Manage heart state array, pass callback, render `<HeartBurst>` overlays |

---

## Performance Requirements

- The animation must run at 60fps on mid-range Android devices.
- Use `will-change: transform, opacity` on animated elements.
- Use `pointer-events: none` on the entire `HeartBurst` container so it never intercepts touches.
- Remove DOM nodes after animation completes (via `onComplete` callback) — do not accumulate invisible elements.
- The heart image should be imported statically (`import heartPng from "../assets/heart-burst.png"`) so Vite includes it in the bundle and it's instantly available (no network fetch on first trigger).

---

## Constraints

- **No new npm packages.** Use only React, Framer Motion, and CSS.
- Do **NOT** alter the existing swipe-to-dismiss or snap-back mechanics in `SwipeCard.jsx`.
- The НРАВИТСЯ / НЕ НРАВИТСЯ text stamps remain as-is; the heart is an **additional** visual effect layered on top.
- The heart animation must NOT block or delay the card's swipe-off animation — they run concurrently.
- Backend changes are NOT required.

---

## Self-Test Protocol

Start the frontend dev server and log in with credentials from `testuser.md`:

| # | Scenario | Expected |
|---|---|---|
| 1 | Slowly drag a card right past ~50% | Heart appears above finger, inflates with overshoot, burst lines shoot out, wobbles, fades. Total ~1.5s. |
| 2 | Drag right past threshold then drag back left | Heart fires once. If card snaps back, no second heart on the next drag right until threshold is re-crossed. |
| 3 | Fast flick right | Heart still appears briefly even during rapid swipe-off. |
| 4 | Drag left (dislike) | No heart animation at all. |
| 5 | Tap the Like button (not swipe) | The button triggers `swipeTo(true)` which animates `x` to 700. Heart should fire as `x` crosses 80. |
| 6 | Multiple rapid swipes | No stale heart elements accumulate in DOM. Each cleans up after ~1.5s. |
| 7 | Performance on throttled CPU (Chrome DevTools → 4x slowdown) | Animation stays smooth, no jank. |

**Do not stop iterating until all 7 scenarios pass flawlessly.**
