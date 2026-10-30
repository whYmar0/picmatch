# Swipe performance — investigation report (attempt 2)

Scope: `frontend/src/components/SwipeCard.jsx`, `frontend/src/pages/VotePage.jsx`,
`frontend/src/components/BottomSheet.jsx`, plus the Playwright stress harness.
All performance numbers below come from the **production build** (`vite build` +
`vite preview`), 390×844 viewport, DPR 3, touch, **4× CPU throttling**, and
1200×1600 JPEGs served by the harness.

---

## A. Root cause analysis

| # | Candidate | Verdict | Evidence |
|---|---|---|---|
| 1 | Next card's image is fetched/decoded exactly when the previous card leaves | **Rejected** | Resource timing over 14 swipes: 15 photo requests for 14 swipes — images arrive ~1 s ahead of the swipe that reveals them, never during it. The third card is already `complete` with `naturalWidth = 1200` before it is promoted. |
| 2 | Repeated downloads / repeated decodes of the same URL | **Rejected** | Request count matches card count exactly (one fetch per photo, no re-fetches across 20 swipes in the harness). |
| 3 | Memory leak / DOM accumulation | **Rejected** | JS heap flat at 15 MB across 14 swipes; image element count constant (59). Node count grows +3 per swipe, and the signature diff identifies them precisely: `div.absolute.bottom-[3px].right-[3px]` → `span` → `svg` — i.e. the *vote badge* on the thumbnail that was just voted. That is legitimate UI state, not a leak. |
| 4 | Listener / observer / timer leak | **Rejected** | Audit of `useEffect` cleanups in `SwipeCard` (decode idle callback + timers), `VotePage` (rAF for strip centring, session load), `BottomSheet` (visualViewport `resize`/`orientationchange` only, no `scroll` listener). Everything is cancelled on unmount. |
| 5 | React re-render cascades | **Rejected as the dominant cost** | Release-window CPU profile (10 × 400 ms windows): framer-motion totals ≈ 250 ms, app code ≈ 0 ms. `SwipeCard` is `memo` and receives stable callbacks, so a vote re-renders only the cards whose `stackIndex` changed. |
| 6 | **Native rendering pipeline (paint / raster / decode) is the residual cost** | **Confirmed** | In the 400 ms after each release the profile is dominated by `(program)` — browser-native work outside JS — 7086 ms vs. 2375 ms idle and 324 ms GC across 10 windows. Per-swipe main-thread split at 4× (Performance.getMetrics deltas): script 167–197 ms, style recalc 83–97 ms, layout 13–23 ms, of a ~750–890 ms task total. |
| 7 | **Long Tasks come from garbage collection, not from the release handler** | **Confirmed (GC), inference on cause** | 8 long tasks (50–73 ms) across 20 swipes, irregularly spaced (3–6 swipes apart), never aligned with a particular gesture phase. Heap is flat, so they are not app-side retention; they are consistent with the browser evicting decoded bitmaps for 55 × 1200×1600 photos (~7.7 MB decoded each). |
| 8 | Layer promotion / occluded third card painted every frame | **Tested, no measurable effect** | See the A/B table below. |

### A/B results for the compositing hypothesis

Each row is a full 14-swipe run on the same build via runtime CSS overrides.

| Variant | Release-window FPS | Drag-window FPS | Drag max gap (median) | Script / Style / Layout (ms per swipe) |
|---|---:|---:|---:|---|
| baseline #1 | 44.2 | — | 33 | 193 / 89 / 23 |
| baseline #2 | 50.4 | 52.6 | 33 | 178 / 88 / 22 |
| third card made visible | 50.9 | 49.0 | 50 | 197 / 97 / 14 |
| `will-change: auto` on all cards | 47.0 | 55.3 | 17 | 168 / 83 / 13 |
| `will-change: auto` #2 | 44.9 | 45.4 | 50 | 194 / 90 / 22 |
| both of the above | 42.3 | 39.0 | 50 | 224 / 110 / 28 |
| card images `display:none` (sanity) | 45.7 | 46.1 | — | 262 / 109 / 21 |

The spread **within** one configuration (44.2 vs 50.4 FPS for the identical
baseline) is larger than the difference **between** configurations, and removing
the card images entirely did not raise FPS. Conclusion: on this host the
measurement cannot resolve differences below roughly 20 %, and no layer-policy
variant is a confirmed win. No such change was kept on the strength of these
numbers.

### Was progressive degradation confirmed?

**No.** Across 14 consecutive swipes neither FPS nor per-phase cost trends
upwards (script 167–197 ms, style 83–97 ms, layout 13–23 ms from swipe 1 to 14;
frame gaps stay at 33–50 ms throughout; heap constant). The "it gets worse after
the first few cards" report is therefore *not* reproduced as an accumulating
resource or React problem in this build — the cost per swipe is roughly constant
and is dominated by native raster/GC.

---

## B. Implementation summary

| File | Change | Status |
|---|---|---|
| `SwipeCard.jsx` | Pre-decode the next card (`decode()` immediately for the second card, idle-callback for the third), so no decode lands in the commit that removes the previous card. | Kept — functional test passes; effect within measurement noise. |
| `SwipeCard.jsx` | Third card is `visibility: hidden` (it is exactly occluded) and only the top two cards are layer-promoted (`will-change`), instead of promoting whichever card happens to be on top at that moment. | Kept on first principles (occluded content is not painted, layer churn happens on promotion instead of mid-swipe); **not** justified by FPS numbers. |
| `BottomSheet.jsx` | `memo(...)` around the sheet: it stays mounted while closed, so without it every vote re-rendered its ~200-node tree (and its motion values). | Kept — deterministic removal of render work. |
| `VotePage.jsx` | `ThumbStrip` memo keyed on `currentPhotoId` + `votesMap` (reverted the earlier "deferred view" indirection, which added a second render pass for the same result). | Kept — one render pass instead of two per vote. |
| `e2e/vote-performance-stress.spec.js` | Photo size configurable (`VOTE_PERF_PHOTO_W/H`) and throttling rates configurable (`VOTE_PERF_RATES`) so the harness can separate decode cost from layout/React cost (Scenario E). | Kept — no assertion was weakened. |

Temporary profiling scaffolding (`.perf-*`, `.release-probe.mjs`,
`.real-swipe-test.mjs`, `.perf-tmp/`, profiling vite config) was deleted; the
tree contains only the changes listed above.

---

## C. Metrics actually collected (current build)

| Metric | Value |
|---|---|
| Release → first animation frame | 5–27 ms (median per run), occasional 26–32 ms |
| Release-window FPS (320 ms after release) | 44–50 |
| Drag-window FPS | 45–55 |
| Max frame gap during drag | 17–50 ms (median across runs) |
| Script per swipe | 167–197 ms |
| Style recalc per swipe | 83–97 ms |
| Layout per swipe | 13–23 ms |
| JS heap after GC | 15 MB, flat |
| DOM nodes | +3 per swipe (vote badge only), stable otherwise |
| Long Tasks (project harness, 20 swipes, 4×) | 8, all 50–73 ms |
| Image decoding time | not available as an isolated metric (only present as `(program)` in the profile) |
| Composite / GPU time | **unavailable** — no GPU trace instrumentation in this environment |
| React commit duration | must be measured with the React DevTools profiler; the production build has no `<Profiler>` hook, so **unavailable** |

Before/after comparison is deliberately omitted for FPS: the baseline I could
re-measure this session was already built from the modified tree, and cross-run
variance (~20 %) is larger than any measured effect. Reporting a "before → after"
FPS delta here would be inventing a result.

---

## D. Stress and functional test results

Device: desktop Chromium (Playwright), 390×844, DPR 3, touch emulation, **not** a
real phone. Network: local (no 3G/4G profile).

| Scenario | Configuration | Result |
|---|---|---|
| Project harness, 20 swipes over 55 photos | 4× CPU, 1200×1600 JPEGs | **FAIL** against the 55 FPS acceptance target: avg 36.1 FPS, min swipe 23.3 FPS, max frame gap 316.6 ms, 43 frames > 50 ms, 8 long tasks. All 20 votes submitted (20/20). |
| Same harness, 6× CPU | — | not run this session (time) |
| Real backend, real album ("Perf 50", 50 photos) | dev server + FastAPI | 5 consecutive swipes (R/L/R/L/R) advanced the counter 17 → 22 exactly once per swipe; server-side `my-votes` confirmed the votes persisted (16 → 21). |
| Sub-threshold drag | 40 px over ~160 ms (~250 px/s, below the 64 px / 450 px·s⁻¹ rules) | snaps back, **no vote** |
| Pinch-to-zoom + staggered release | 2 fingers, 2.5× spread, +120 px horizontal drift, fingers released 50 ms apart | **no false vote** (counter unchanged) |
| Comment sheet | tap comment button on the top card | opens, no error |
| Console/page errors | — | no app exceptions; only the deliberately aborted Google-font requests and the existing `Unable to preventDefault inside passive event listener` warning from the pinch `touchmove` capture handler |

Not performed: 6× CPU run, 100+ swipe extended session, network throttling,
multiple viewports/DPRs, real mobile hardware, pinch on a real touch digitiser.

---

## E. Remaining limitations

1. **The 55 FPS acceptance target is not met** at 4× CPU with 1200×1600 photos.
2. The residual cost is the browser's native pipeline (decode/raster/paint) for a
   full-resolution photo at DPR 3, not the application's JavaScript (≈ 25 ms of
   app/framer JS per 400 ms release window). Removing it would require painting
   fewer pixels for the main card, which the brief explicitly forbids.
3. Long tasks are GC bursts tied to decoded bitmaps of large photos; the app
   cannot control when the browser evicts them.
4. This host is not a clean measurement environment (a user Chrome instance with
   24 processes was running throughout); repeat runs of the same build vary by
   ~20 % in FPS. Any further optimisation work needs an idle host or a real
   device, otherwise changes cannot be distinguished from noise.
5. Metrics marked **unavailable** above were not measured rather than estimated.

### Recommended next step

Re-run the harness on an idle machine or a real mid-range phone before changing
more code. If the stutter persists there, the next experiment should be
`content-visibility`/raster-size analysis of the card image at DPR 3 (e.g.
whether the compositor re-rasters the card when the `shadow-swipe` filter layer
is added on promotion), because that is the only remaining block that profiling
has not been able to resolve here.
