Recreate the Heart Animation in Framer

Your task is to recreate the heart animation from the provided reference video as accurately as possible.

Do not use a GIF, video, sprite sheet, or pre-recorded animation. The heart must be created as a native HTML/SVG/CSS/Framer Motion element and animated in real time.

1. Main Goal

Create a heart that visually matches the reference:

- large flat heart with no outline;
- bright smooth gradient;
- smooth floating movement;
- subtle scale changes;
- slight rotation/tilting;
- soft organic motion without a mechanical CSS-animation feel;
- seamless infinite loop;
- no visible jumps when the loop restarts.

The animation should feel like a living/floating heart rather than an object simply moving along a predefined path.

---

2. Heart Geometry

Create the heart using an SVG path or another vector-based approach.

Requirements:

- the shape must be symmetrical;
- the two upper lobes should be rounded;
- the bottom should smoothly taper into a defined point;
- no stroke/border;
- use only a gradient fill;
- edges must be perfectly smooth;
- the SVG must scale correctly without losing quality.

Prefer SVG because it allows independent control over transforms, gradients, and scaling.

---

3. Gradient

Color is an important part of the effect.

Use a bright two- or three-color gradient approximately within this range:

- orange/yellow;
- pink;
- magenta;
- purple.

Approximate palette:

#FF7A00
#FF3D5A
#FF1493
#B000FF
#8A2BE2

Do not treat these colors as strict values if slightly different shades produce a closer visual match during testing.

The gradient should not simply switch between colors.

It should smoothly move/rotate together with the heart's changing state.

Important:

- no sudden color jumps;
- no discrete color changes;
- gradient animation should be independent from position;
- preferably animate "gradientTransform", CSS custom properties, or an equivalent mechanism.

---

4. Position

The heart must not move in a straight line.

Create a smooth organic trajectory:

        ↗
     ↗     ↘
   ↑         ↓
     ↖     ↙
        ↓

The actual trajectory should be more complex and natural.

Combine:

translateX
translateY
rotate
scale

Instead of using one large "translateY", use several sinusoidal/Bezier-like components.

Conceptually:

x(t) = baseX + sin(t * frequencyX + phaseX) * amplitudeX

y(t) = baseY + sin(t * frequencyY + phaseY) * amplitudeY

However, do not make the movement mathematically perfect or obviously sinusoidal. Add slight phase and amplitude differences to make the motion feel organic.

---

5. Vertical Movement

Vertical movement should be the dominant movement.

The heart should slowly rise and fall.

Requirements:

- movement starts smoothly;
- no sudden acceleration;
- the heart slightly slows down near the extreme points;
- direction changes gradually;
- use "ease-in-out" or physically similar easing.

Do not use:

linear

for the primary movement.

---

6. Horizontal Movement

Add a subtle horizontal deviation.

The X amplitude should be significantly smaller than the Y amplitude.

Approximately:

X amplitude ≈ 5–15% of the heart width
Y amplitude ≈ 15–30% of the heart height

The X movement should not feel like a separate animation. It should be part of the overall trajectory.

---

7. Scale

The heart should subtly "breathe".

Use small scale variations:

scale ≈ 0.94 → 1.03 → 0.97 → 1.02

Do not make the scaling large.

This is not a traditional heartbeat animation such as:

1 → 1.3 → 1

The scale variation should be subtle and synchronized with the movement.

Add a slight phase offset between position and scale so the motion feels physically natural.

---

8. Rotation

Add a subtle tilt.

Range:

approximately -5° ... +5°

Rotation must be very smooth.

For example:

-2°
+3°
+1°
-4°
0°

Do not allow abrupt rotation.

The rotation should make the heart feel as if it is gently rocking in the air.

---

9. Deformation / Squash & Stretch

If the implementation allows it, add very subtle deformation.

While moving upward:

scaleX slightly decreases
scaleY slightly increases

While moving downward:

scaleX slightly increases
scaleY slightly decreases

Very small amplitude:

scaleX ≈ 0.98–1.02
scaleY ≈ 0.98–1.02

The effect should be almost imperceptible on its own but should improve the feeling of organic motion.

If the deformation makes the animation less visually similar to the reference, remove it.

---

10. Initial Appearance

At the beginning, the heart should appear smoothly.

Use a combination of:

opacity: 0 → 1
scale: slightly smaller → normal
translateY: slightly lower → normal

Opacity and scale should not necessarily start at exactly the same moment.

The object should begin to appear, then slightly rise and settle into its normal state.

Avoid an abrupt:

opacity 0 → 1

within a single short frame.

---

11. Loop

The animation must run infinitely:

repeat: Infinity

But the most important requirement is seamlessness.

When the last frame transitions into the first:

- position must not jump;
- scale must not jump;
- rotation must not jump;
- gradient direction must not suddenly change;
- opacity must not reset visibly;
- the user must not notice where the loop starts.

If necessary, use a longer cycle and a closed Bezier/spline trajectory.

---

12. Recommended Animation Structure

Separate the animation into independent parameters:

Heart
 ├── position
 │    ├── x
 │    └── y
 ├── scale
 │    ├── x
 │    └── y
 ├── rotation
 ├── opacity
 └── gradient
      ├── color 1
      ├── color 2
      └── gradient position/angle

Do not control everything with a single animation transition.

Different properties should have slightly different timing/easing.

---

13. Timing

Start with a cycle of approximately:

duration: 5–7 seconds

Then adjust it to match the reference.

Do not use exactly the same duration for every parameter.

For example:

position: 5.5–6.5s
scale: 3–4s
rotation: 4–5s
gradient: 6–8s

Some parameters should have different phases.

This is important because the heart should not look like a single object with "easeInOut" applied to every property simultaneously.

---

14. Framer Implementation

Use Framer's native capabilities.

If the project uses React/Framer Motion, preferably use:

motion.svg
useMotionValue
useTransform
animate
useSpring

Do not create hundreds of DOM elements.

Prefer:

1 SVG
+
1–2 additional wrapper elements

for the entire animation.

Do not use JS animation with a continuous "setInterval" or manually modify the DOM every frame.

Do not use React state for every animation frame.

---

15. Performance

Optimize the animation for mobile devices.

Prioritize:

transform
opacity
SVG transform

Avoid constantly animating:

width
height
top
left
margin
padding
box-shadow
filter

if doing so causes layout/repaint overhead.

Where appropriate, use:

transform: translate3d(...)

and compositor-friendly properties.

Avoid layout thrashing.

---

16. Responsiveness

The heart must work correctly on:

- desktop;
- tablet;
- mobile.

Its size should depend on the container rather than fixed absolute pixel values.

When the viewport changes:

- the trajectory should scale;
- movement amplitude should remain proportional;
- the heart shape must not become distorted.

---

17. Testing

After implementation, thoroughly test the animation.

Test 1 — Visual Accuracy

Compare the result against the reference video.

Check:

- shape;
- size;
- position;
- movement speed;
- amplitude;
- rotation;
- scale changes;
- colors;
- gradient movement speed.

---

Test 2 — Loop Stability

Let the animation run for at least 30–60 seconds.

Verify:

- no jumps;
- no accumulated error;
- no position drift after each cycle;
- no progressive scale changes;
- no gradient desynchronization.

---

Test 3 — Mobile

Test at least:

375 × 812
390 × 844

The animation must not:

- lag;
- flicker;
- disappear;
- unexpectedly change size.

---

Test 4 — Desktop

Test:

1440 × 900
1920 × 1080

Make sure the trajectory remains proportional.

---

Test 5 — Reduced Motion

Support:

prefers-reduced-motion

When reduced motion is enabled:
- disable the infinite movement;
- keep the heart in a static state;
- avoid unnecessary continuous CPU/GPU usage.

---

18. Performance Testing

Check performance using browser DevTools.

Target:

≈ 60 FPS

on a modern mobile device.

Pay particular attention to:

- CPU usage;
- GPU usage;
- dropped frames;
- layout recalculation;
- paint operations;
- memory usage.

If frame drops occur, optimize in this order:

1. number of DOM/SVG elements;
2. number of simultaneously animated properties;
3. filters;
4. expensive SVG operations;
5. unnecessary React re-renders.

---

19. Final Visual Refinement

Do not stop after the first working implementation.

Perform at least 3 refinement iterations.

Iteration 1

Reproduce the overall shape and movement.

Iteration 2

Fine-tune:

- timing;
- trajectory;
- scale;
- rotation;
- gradient.

Iteration 3

Remove all visual artifacts and maximize smoothness and similarity to the reference.

The primary criterion is visual similarity to the reference, not mathematical elegance of the animation.

---

20. Definition of Done

The implementation is complete only when all of the following are satisfied:

- [ ] The heart visually matches the reference.
- [ ] The heart shape is correct.
- [ ] Movement is smooth.
- [ ] The trajectory feels organic.
- [ ] There is subtle X/Y floating motion.
- [ ] There is subtle scale breathing.
- [ ] There is subtle rotation.
- [ ] The gradient changes smoothly.
- [ ] There are no sudden color transitions.
- [ ] The loop is completely seamless.
- [ ] There is no visible jump when the loop restarts.
- [ ] The animation works on mobile.
- [ ] The animation works on desktop.
- [ ] "prefers-reduced-motion" is supported.
- [ ] There are no unnecessary React re-renders.
- [ ] There is no continuous layout thrashing.
- [ ] The animation maintains approximately 60 FPS on target devices.
- [ ] The implementation remains simple and maintainable.

After implementation, independently verify every requirement above and fix all discrepancies before considering the task complete.