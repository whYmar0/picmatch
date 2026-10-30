# DEEP PERFORMANCE INVESTIGATION & OPTIMIZATION — SwipeCard.jsx

## 1. PRIMARY OBJECTIVE

Conduct an in-depth performance investigation of the Pickmatch photo voting page and eliminate all remaining performance bottlenecks, with particular focus on mobile production environments.

Main files to investigate:
- `SwipeCard.jsx` — photo card rendering, gesture handling, and swipe animations.
- `VotePage.jsx` — voting page state management, card stack lifecycle, and voting logic.
- All related hooks, components, utilities, styles, image-loading logic, and animation implementations that may affect card performance.

### The main issue

Despite previous optimization work, the voting page still experiences noticeable micro-stutters on mobile devices in production.

The most problematic scenario is:

1. The user starts swiping a photo card to the left or right.
2. The card follows the finger smoothly.
3. The user releases their finger.
4. A brief micro-stutter occurs exactly when the card's exit animation begins.
5. The first few cards usually swipe smoothly.
6. As more cards are swiped, the micro-stutter becomes progressively more noticeable.

**Your primary objective is to identify the actual root cause of this behavior, eliminate it, and maximize the performance of the entire card-swiping experience.**

Do not settle for superficial optimizations. Investigate the complete lifecycle of a card, from its initial mounting and image loading to gesture handling, animation execution, removal from the DOM, and preparation of the next card.

The final result must provide consistently smooth behavior during long mobile sessions, including on relatively weak devices.

---

## 2. NON-NEGOTIABLE REQUIREMENTS

### 2.1. Preserve the entire visual experience

This is an absolute requirement.

You MUST preserve:
- The existing card design.
- Original photo quality and resolution.
- All animations and transitions.
- Existing animation physics, timing, and easing.
- Shadows, gradients, blur effects, and depth effects.
- Border radii, dimensions, proportions, and positioning.
- Heart animations and other visual feedback.
- Card stacking and depth effects.
- Pinch-to-zoom behavior.
- Image panning behavior.
- All existing interactive effects.

DO NOT:
- Remove animations to improve FPS.
- Reduce image quality or resolution in the main card presentation.
- Replace original images with visibly lower-quality versions.
- Remove shadows, blur, gradients, or other visual effects.
- Simplify the card design.
- Disable existing functionality.
- Change the UX to make performance measurements look better.

**Optimize the implementation, not the visual result.**

Any optimization that could potentially affect visual fidelity must be carefully evaluated before implementation. Reject changes that compromise the original appearance.

### 2.2. Preserve all existing functionality

Do not break:
- Likes and dislikes.
- Swipe thresholds.
- Card exit animations.
- HeartBurst effects.
- Card transitions.
- Pinch-to-zoom.
- Image panning while zoomed in.
- Thumbnail navigation.
- Comment functionality.
- BottomSheet animations.
- Image preloading.
- Voting counters and state.
- API requests and backend integration.
- Error handling.

Do not modify backend APIs or voting business logic unless an actual issue is discovered and the change is strictly necessary.

### 2.3. No blind optimizations

Do not immediately start rewriting components.

Follow this process:

1. Inspect the current implementation.
2. Review the previous optimization report.
3. Identify which previous optimizations have already been implemented.
4. Reproduce the performance issue.
5. Collect profiling data.
6. Identify confirmed root causes.
7. Implement targeted fixes.
8. Measure the results.
9. Run regression and stress tests.

Never treat assumptions as confirmed root causes.

---

## 3. REVIEW THE PREVIOUS OPTIMIZATION WORK

A Markdown document containing the previous optimization analysis by Gemini 3.8 Flash is provided in the project context.

Read and analyze the entire document.

It describes previously identified issues, including:
- React re-renders caused by pinch-to-zoom state updates.
- Cascading VotePage re-renders.
- Excessive Framer Motion instances in the thumbnail list.
- `visualViewport` event handling.
- Pinch-to-zoom and drag gesture conflicts.
- BottomSheet layout animations.
- Full-resolution image decoding during transitions.
- GPU overhead caused by backdrop filters.

Inspect the current source code and determine which recommendations have already been implemented.

Do not blindly repeat previous work or assume that the old report accurately describes the current implementation.

Create a table:

| Optimization | Already implemented? | Current implementation | Remaining issues |
|---|---|---|---|
| Pinch state managed through refs / MotionValues | Yes / No | ... | ... |
| Memoized thumbnail components | Yes / No | ... | ... |
| HeartBurst state isolation | Yes / No | ... | ... |
| visualViewport optimization | Yes / No | ... | ... |
| Image loading optimization | Yes / No | ... | ... |
| BottomSheet optimization | Yes / No | ... | ... |

Add any other relevant optimizations discovered during the audit.

---

## 4. INVESTIGATE CUMULATIVE PERFORMANCE DEGRADATION

This is one of the most important parts of the task.

The fact that the lag becomes progressively worse after multiple swipes may indicate resource accumulation, memory retention, or increasing execution costs.

Investigate the following areas.

### 4.1. Memory leaks and resource accumulation

Determine whether any resources accumulate as the user continues swiping.

Inspect:
- JS heap growth after each swipe.
- DOM elements belonging to previously removed cards.
- References to unmounted React components.
- Event listeners that are never removed.
- MotionValue subscriptions that remain active.
- Unfinished requestAnimationFrame callbacks.
- Unreleased setTimeout / setInterval timers.
- Observers that are not properly disconnected.
- Retained image elements, Blob objects, or ImageBitmap instances.
- Canvas and other graphics resources.
- Old card references retained in closures, refs, or arrays.
- Repeated creation of expensive objects during rendering.
- Detached DOM nodes.
- Unreleased animation controls and subscriptions.

Pay particular attention to cleanup logic in:
- `useEffect`.
- `useLayoutEffect`.
- `useMotionValueEvent`.
- `animate()` and `controls.start()`.
- `useAnimationControls`.
- `addEventListener` / `removeEventListener`.
- `IntersectionObserver`.
- `ResizeObserver`.
- `MutationObserver`.
- `requestAnimationFrame` / `cancelAnimationFrame`.

Verify that removing a card actually releases all resources associated with it.

Do not assume that heap growth alone proves a memory leak. Compare memory usage after garbage collection and distinguish normal caching from retained unreachable objects.

### 4.2. Framer Motion animation lifecycle

Investigate the complete lifecycle of the card exit animation.

Focus specifically on the sequence between:

- Finger release.
- `onDragEnd`.
- Swipe direction and threshold calculation.
- `controls.start()` / `animate()`.
- Animation completion.
- Card removal from the DOM.
- Next card appearance.

Check whether:

1. Multiple animations are running on the same element.
2. Previous MotionValues remain active after a card is removed.
3. `controls.start()` is called more than once.
4. React re-renders occur unnecessarily during finger release.
5. `onDragEnd`, `onAnimationComplete`, and parent state updates trigger competing updates.
6. Expensive synchronous work runs immediately before the exit animation starts.
7. MotionValues, animation controls, or callbacks are recreated unnecessarily.
8. Layout measurements are triggered during the transition.
9. Updating the card array causes unnecessary reconstruction of the component tree.
10. Incorrect React keys cause unexpected component reuse or remounting.

Determine whether expensive operations are executed synchronously inside the gesture-release handler.

If an issue is found, optimize the animation lifecycle without changing its visual appearance, timing, physics, or behavior.

### 4.3. Image loading, decoding, and memory

Investigate the complete image lifecycle.

Pay particular attention to why performance may deteriorate as more cards are processed.

Inspect:
- Image decoding during swipe animations.
- Next-image decoding occurring exactly when the previous card is removed.
- Use of `HTMLImageElement.decode()`.
- `loading="lazy"` and `fetchPriority`.
- Repeated network requests for already-loaded images.
- Repeated decoding of identical image URLs.
- Multiple instances of the same image in the DOM.
- Previous images retained in the DOM.
- Original images used where thumbnails would be sufficient.
- Source image dimensions and decoded image memory consumption.
- Browser image cache behavior.
- GPU workload spikes when switching images.
- WebP / AVIF / JPEG decoding.
- CSS `background-image` versus `<img>` behavior, where relevant.

Determine whether decoding the next photo overlaps with the current card's exit animation.

**Do not solve this by reducing the quality or resolution of the main card images.**

Optimize loading, decoding, caching, and preparation timing instead.

Investigate whether pre-decoding the next image before the user releases the current card can eliminate the stutter.

If implemented, ensure that preloading does not create excessive memory consumption or unnecessary background work.

### 4.4. React rendering and cascading updates

Use React Profiler and other suitable tools.

Identify:
- Which components render during each swipe.
- React render duration.
- React commit duration.
- Components rendering without meaningful prop or state changes.
- Unstable object and function references.
- Unnecessary updates to VotePage.
- Multiple state updates caused by a single gesture.
- Expensive synchronous calculations during card transitions.
- Repeated array/object creation.
- Expensive derived data recalculation.

Inspect the existing use of:
- `React.memo`.
- `useMemo`.
- `useCallback`.
- `useRef`.

Do not add memoization everywhere. Apply it only where profiling demonstrates a measurable benefit.

### 4.5. GPU, compositing, and browser rendering pipeline

Do not limit the investigation to JavaScript performance.

Investigate:
- Layout.
- Style recalculation.
- Paint.
- Composite.
- GPU memory.
- Layer promotion.
- Overdraw.
- Rasterization.
- Texture uploads.
- `transform` and `opacity`.
- Expensive `box-shadow`, `filter`, and `backdrop-filter`.
- Repeated creation and destruction of compositing layers.
- Excessive `will-change`.
- Large images uploaded to GPU textures.
- Nested transformations.
- Conflicts between parent and child animations.

Pay particular attention to whether removing a card and displaying the next one causes a sudden GPU or compositor workload spike.

Do not apply `will-change` to every element. Use it selectively and manage the lifecycle of promoted layers.

---

## 5. PRIORITY INVESTIGATION: THE RELEASE-TO-ANIMATION MICRO-STUTTER

This is the highest-priority issue.

Create a dedicated profiling scenario.

1. Open the voting page.
2. Wait until the first image has loaded and decoded.
3. Perform a swipe.
4. Record the exact moment the finger is released.
5. Record when the exit animation starts.
6. Inspect the animation frames.
7. Record when the card is removed from the DOM.
8. Record when the next card becomes visible.
9. Repeat the process 20–30 times.

Collect the following metrics at each stage:

- FPS.
- Frame time.
- Long Tasks.
- JavaScript execution time.
- React render duration.
- React commit duration.
- Layout duration.
- Paint duration.
- Composite duration, if available.
- JS heap size.
- DOM node count.
- Number of active listeners, observers, and animations, where measurable.
- Image decoding duration.
- Time between `pointerup` / `touchend` and the first visible animation frame.

Focus especially on the frames immediately following finger release.

At 60 FPS, the frame budget is approximately 16.67 ms.

Determine exactly which operation exceeds the frame budget and when it happens.

### Compare early and later swipes

Create a comparison table:

| Metric | Swipe 1 | Swipe 5 | Swipe 10 | Swipe 20 | Swipe 30 |
|---|---:|---:|---:|---:|---:|
| JS Heap | | | | | |
| Frame time at release | | | | | |
| React commit | | | | | |
| Layout | | | | | |
| Paint | | | | | |
| DOM nodes | | | | | |
| Long Tasks | | | | | |
| Image decoding time | | | | | |

Never invent measurements.

If a metric cannot be measured with the available tooling, explicitly state that it is unavailable.

---

## 6. AUDIT THE CARD STACK ARCHITECTURE

Inspect how the card stack is implemented.

Determine:
- How many cards are mounted in the DOM simultaneously.
- How the active, next, and subsequent cards are created.
- Which cards are hidden and which are actually unmounted.
- Whether every photo in the album is rendered simultaneously.
- Whether changing the active index causes unnecessary remounting.
- Whether React keys are stable and correct.
- Whether previous cards retain expensive components.
- Whether changing the card index triggers unnecessary rendering across the entire stack.
- Whether multiple elements are synchronously updated during a transition.

Consider limiting the number of simultaneously mounted cards if the current implementation creates an unnecessarily large DOM tree.

However, do not compromise the existing visual stacking effects or transitions.

---

## 7. PROFILE THE PRODUCTION BUILD

All important conclusions must be verified using a production build.

Do not rely exclusively on development-mode measurements.

Compare:
- Development.
- Production.
- Production with CPU throttling.

Remember that React Strict Mode in development can affect effect execution and render counts.

Check:
- Production-only issues.
- Differences in animation behavior.
- Build/minification-related behavior.
- Image asset sizes and decoding performance.

Use appropriate tools, including:
- Chrome DevTools Performance.
- Chrome DevTools Memory.
- Performance Monitor.
- React Profiler.
- Performance traces.
- Browser rendering diagnostics.

If a real mobile browser or connected device is available, test on it.

Browser emulation is useful but does not fully reproduce the behavior of real mobile hardware.

---

## 8. IMPLEMENTATION PLAN

After completing the investigation, create a list of confirmed root causes.

Use this table:

| Issue | Evidence | Affected file | Priority | Proposed fix |
|---|---|---|---|---|

For every confirmed issue, explain:
- What exactly happens.
- Why it causes a performance problem.
- Why it may become worse after subsequent swipes.
- How the proposed fix addresses the root cause.
- What potential side effects need to be considered.

Then implement the fixes.

### Fix priority

1. Eliminate the micro-stutter when the user releases a card.
2. Eliminate resource accumulation and confirmed memory leaks.
3. Optimize the Framer Motion animation lifecycle.
4. Eliminate unnecessary React renders.
5. Optimize image loading, decoding, and preparation.
6. Optimize GPU compositing and rendering.
7. Address all other bottlenecks discovered during profiling.

Do not limit your investigation to this list. If profiling reveals another root cause, investigate and fix it.

### Implementation rules

- Do not rewrite the entire `SwipeCard.jsx` without a compelling reason.
- Do not change component public interfaces unnecessarily.
- Do not modify backend APIs.
- Do not change voting business logic.
- Do not introduce new dependencies without a strong technical justification.
- Do not leave temporary hacks or debugging code in the final implementation.
- Do not disable animations to improve FPS.
- Do not artificially increase animation duration to hide stuttering.
- Do not use arbitrary `setTimeout` delays to mask the issue.
- Do not remove functionality to simplify the implementation.

After every logically related group of changes, verify that no regressions have been introduced.

---

## 9. STRESS TESTING

After implementing the fixes, perform comprehensive performance and regression testing.

### 9.1. Test configuration

Primary mobile profile:

- Viewport: 390 × 844.
- DPR: 3.
- Touch enabled.
- CPU throttling: 4x.
- Additional stress profile: 6x CPU throttling.
- Network: Fast 3G / Slow 4G.
- Production build.

Also test multiple viewport sizes and DPR values where possible.

### 9.2. Scenario A — Consecutive swipes

1. Open an album containing at least 50 photos.
2. Perform 30 consecutive swipes.
3. Perform another 20 swipes.
4. Repeat the scenario multiple times.
5. Compare the first, middle, and final swipes.

Expected results:
- No micro-stutter when releasing a card.
- No progressive degradation in animation smoothness.
- No increasing execution time for identical operations.
- No accumulation of DOM elements.
- No uncontrolled JS heap growth.
- No unfinished animations belonging to previous cards.

### 9.3. Scenario B — Rapid swiping

Perform 20 rapid swipes with short intervals.

Verify:
- No conflicting animations.
- Correct handling of repeated gestures.
- No duplicate votes.
- No skipped cards.
- Correct next-card appearance.
- Stable frame performance.

### 9.4. Scenario C — Extended session

Perform at least 100 consecutive interactions, if the test data allows it.

Afterward, inspect:
- JS heap.
- DOM node count.
- Active event listeners and observers.
- Image resource retention.
- Unfinished animations.
- Repeated network requests.
- Overall page responsiveness.

Compare memory measurements after garbage collection. Do not mistake normal memory fluctuations or browser caching for a memory leak.

### 9.5. Scenario D — Gesture combinations

Test:
- Swipe left.
- Swipe right.
- Slow swipe.
- Fast swipe.
- Short swipe below the threshold.
- Swipe followed by card return.
- Pinch-to-zoom.
- Panning while zoomed in.
- Releasing one finger before the other.
- Starting another swipe immediately after the previous animation completes.

No scenario must cause accidental voting, broken gestures, or a frozen card.

### 9.6. Scenario E — High-resolution images

Test with albums containing large, high-resolution photographs.

Verify:
- Smooth transitions.
- No decoding-related freezes.
- No reduction in image quality.
- Correct preloading behavior.
- No excessive memory consumption.

---

## 10. AUTOMATED TESTING

If Playwright is already used in the project, extend the existing testing infrastructure.

Add automated tests for:
- Consecutive swipes.
- Correct voting direction.
- No duplicate voting.
- Removal of previous cards.
- No accumulation of DOM elements.
- Correct behavior after many swipes.
- Pinch-to-zoom and voting prevention during multitouch, where the existing test infrastructure supports reliable touch simulation.

Use appropriate browser performance tools and trace recordings for performance measurements.

Do not present successful Playwright functional tests as proof that the micro-stutter has been eliminated.

Automated tests must complement real profiling, not replace it.

If a scenario cannot be reliably automated, perform a manual test and document the limitation.

---

## 11. ACCEPTANCE CRITERIA

The task is complete only when the following requirements are satisfied.

### Performance

- The release-to-animation micro-stutter is eliminated.
- Smoothness does not deteriorate after 5, 10, 20, or 30 consecutive swipes.
- Target performance under 4x CPU throttling is a stable 60 FPS wherever the platform allows it.
- Under heavy conditions, recurring drops below 55 FPS are unacceptable.
- No recurring Long Tasks coincide with the beginning of the exit animation.
- No systematic frame-budget violations occur immediately after finger release.
- Time between finger release and the first visible animation frame is minimal and consistent.

### Memory and resources

- No confirmed memory leaks remain.
- DOM elements do not accumulate indefinitely.
- Event listeners, observers, and animations are properly cleaned up.
- Performance remains stable during extended sessions.
- Images are not unnecessarily downloaded or decoded repeatedly.

### Visuals and functionality

- The card appearance remains unchanged.
- Original image quality is preserved.
- All animations and effects remain intact.
- Pinch-to-zoom works correctly.
- Voting works correctly.
- No visual glitches, jumps, or regressions are introduced.

---

## 12. FINAL REPORT

After completing the work, provide a detailed technical report.

### A. Root Cause Analysis

For every confirmed root cause, provide:
- Root cause.
- Technical explanation.
- Profiling evidence.
- Affected file and code location.
- Implemented fix.

Explicitly state whether the relationship between swipe count and performance degradation was confirmed.

### B. Implementation Summary

List every modified file and briefly explain each change.

### C. Before-and-after performance metrics

Provide a comparison table:

| Metric | Before optimization | After optimization | Improvement |
|---|---:|---:|---:|
| Frame time at release | | | |
| FPS | | | |
| React commit duration | | | |
| JS Heap after GC | | | |
| DOM nodes | | | |
| Long Tasks | | | |
| Image decoding time | | | |

Only include measurements that were actually collected.

### D. Stress test results

Document:
- Which scenarios were tested.
- How many times each scenario was executed.
- Device or emulator used.
- CPU throttling configuration.
- Results.
- Tests that could not be performed and why.

### E. Remaining limitations

If any issues remain, describe them honestly.

Never claim that all performance issues have been eliminated unless the results actually demonstrate this.

---

## 13. FINAL AND MOST IMPORTANT REQUIREMENT

**The objective is not simply to make `SwipeCard.jsx` slightly faster. The objective is to identify and eliminate the actual root cause of the release-to-animation micro-stutter and ensure consistently smooth performance throughout extended mobile sessions.**

Pay particular attention to explaining why the first few cards perform smoothly while subsequent cards progressively become less responsive.

Do not compromise visual quality, reduce image resolution, remove effects, or disable animations to achieve better benchmark results.

Follow this exact workflow:

1. Full codebase audit.
2. Previous optimization review.
3. Issue reproduction.
4. Performance profiling.
5. Root Cause Analysis.
6. Fix implementation plan.
7. Targeted code changes.
8. Regression testing.
9. Stress testing.
10. Before-and-after performance comparison.
11. Final technical report.

**Definition of success: A user must be able to continuously swipe through a large photo album on a mobile device without noticing micro-stutters, delays, freezes, or progressive performance degradation. The visual quality and appearance of Pickmatch must remain exactly as they were before optimization.**