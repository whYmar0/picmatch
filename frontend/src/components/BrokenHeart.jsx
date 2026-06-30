/**
 * BrokenHeart.jsx — Custom broken heart icon with three rotated slashes.
 *
 * Fill-based (currentColor), so callers theme it via the `className`
 * prop the same way they theme FilledHeart. The `strokeWidth` prop is
 * kept accepted-but-ignored for back-compat with existing callsites
 * (AlbumGallery, AlbumSummary, SwipeCard, VotePage) that still pass it.
 */
export default function BrokenHeart({ size = 24, className = "text-gray-400" }) {
  // Non-square viewBox (512 × 456.549) — MUST match FilledHeart's viewBox
  // and height formula so the two icons render at identical pixel boxes
  // when used at the same `size`. A previous 457 viewBox caused a sub-pixel
  // vertical drift between FilledHeart and BrokenHeart when paired in the
  // same row (e.g. PillBar like/dislike, StatisticsTab per-photo counts).
  const heartH = size * (456.549 / 512);
  return (
    <svg
      width={size}
      height={heartH}
      viewBox="0 0 512 456.549"
      fill="currentColor"
      className={className}
      shapeRendering="geometricPrecision"
      textRendering="geometricPrecision"
      imageRendering="optimizeQuality"
    >
      <g clipPath="url(#picmatch_bh_clip)">
        {/* Heart silhouette */}
        <path d="M463.044 117.283C452.919 90.554 434.632 69.746 412.775 56.705C399.297 48.657 384.432 43.58 369.314 41.897C354.435 40.242 339.296 41.904 325.03 47.304C287.569 61.493 274.429 89.216 258.508 121.332C255.086 128.219 256.544 128.296 252.615 121.41C235.039 90.54 218.829 57.726 182.488 45.685C169.609 41.425 155.934 40.277 142.4 41.84C128.57 43.446 114.854 47.868 102.193 54.67C77.125 68.155 56.31 90.885 46.811 119.586C15.286 214.823 130.19 307.962 217.231 378.504C230.201 389.01 242.594 399.051 254.065 408.755C269.514 395.467 286.421 382.06 304.06 368.068C391.875 298.434 499.351 213.196 463.044 117.283ZM433.871 21.441C463.354 39.03 487.965 66.972 501.534 102.792C548.458 226.765 428.055 322.263 329.663 400.277C306.834 418.387 285.245 435.505 268.585 450.687C260.959 458.165 248.735 458.581 240.616 451.398C226.716 439.075 209.583 425.197 191.304 410.388C94.743 332.128 -32.73 228.808 7.688 106.7C20.644 67.549 48.832 36.658 82.716 18.434C99.939 9.175 118.705 3.147 137.724 0.943C157.061 -1.289 176.707 0.387 195.374 6.562C217.421 13.864 237.975 27.313 254.924 47.833C271.24 29.306 290.294 16.483 310.538 8.815C331.051 1.056 352.668 -1.353 373.821 0.999C394.734 3.323 415.274 10.336 433.871 21.441Z" />
        {/* Three rotated rounded slashes — the "broken" effect */}
        <rect x="233" y="87.5" width="41" height="120" rx="20.5" transform="rotate(-30 233 87.5)" />
        <rect x="300.034" y="136" width="41" height="141" rx="20.5" transform="rotate(45 300.034 136)" />
        <rect x="202" y="229.5" width="41" height="120" rx="20.5" transform="rotate(-30 202 229.5)" />
      </g>
      <defs>
        {/* Project-prefixed id avoids collision with other Figma-style
            clipPath ids in the document; all BrokenHeart instances on a
            page reference the same (identical) clipPath geometry. */}
        <clipPath id="picmatch_bh_clip">
          <rect width="512" height="456.549" />
        </clipPath>
      </defs>
    </svg>
  );
}
