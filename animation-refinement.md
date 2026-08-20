# Role & Task
You are an expert Front-end & Framer Developer. Create a high-performance React component with framer-motion for Framer that replicates a rhythmic floating & pulsing heart animation.

## 1. Visual & Vector Requirements
* Shape: Render a sharp, scalable SVG Heart inside a dedicated container.
* Gradients: Implement dynamic CSS linear/radial gradients switching between:
  * State A: Warm sunset (#FF9F43 -> #FF3838)
  * State B: Vivid magenta (#F368E0 -> #9B59B6)
* Aspect Ratio: Maintain a locked 1:1 ratio with responsive sizing (size prop: default 120px).

## 2. Animation Sequences (Keyframes & Physics)
Build an infinite loop with Framer Motion variants:
1. Spawn & Float:
   * y: starts at +60px, floats up to 0px.
   * x: gentle drift +15px to 0px.
   * scale: spring pop [0, 1.18, 0.95, 1].
   * rotate: [-10deg, 4deg, -2deg, 0deg].
2. Heartbeat Pulse:
   * Scale pulse rhythm: [1, 1.15, 0.97, 1.08, 1] with times: [0, 0.15, 0.3, 0.45, 1].
   * Duration: 1.2s - 1.6s per cycle.
3. Color Transition:
   * Seamless linear crossfade between gradient tokens on each loop iteration.

## 3. Framer Controls (Property Controls)
Expose standard @framer property controls:
* heartSize: Number control (min: 24, max: 400, default: 120).
* speed: Number control (animation duration multiplier, default: 1).
* primaryColorStart & primaryColorEnd: Color inputs.
* secondaryColorStart & secondaryColorEnd: Color inputs.
* enableGlow: Boolean toggle (adds a soft matching drop-shadow/filter).

## 4. Performance & Optimization Specs
* GPU Acceleration: Animate solely transform (x, y, scale, rotate) and opacity. Never animate width, height, top, or left.
* Rendering Strategy: Apply will-change: transform and transform: translateZ(0) to prevent layout thrashing and repaints.
* Component Cleanup: Ensure cleanup of animation timers/subscriptions when unmounted from the DOM.
* Target: Rock-solid 60/120 FPS on mobile browsers.

## 5. Testing & Verification Checklist
* [ ] Check behavior when browser tab loses and regains focus (no animation desync/queue buildup).
* [ ] Verify seamless loop without visible jumps or stuttering at cycle ends.
* [ ] Test resizing in Framer canvas without visual distortion.
* [ ] Validate contrast and color fidelity on both dark and light canvas backgrounds.