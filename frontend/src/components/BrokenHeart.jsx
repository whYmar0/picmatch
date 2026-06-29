/**
 * BrokenHeart.jsx — Custom broken heart icon
 * Replaces lucide-react ThumbsDown
 */
export default function BrokenHeart({ size = 24, className = "text-gray-400", strokeWidth = 2.5 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 6.59097L11.8456 6.42726C9.86801 4.33053 6.59738 4.57698 4.91934 6.94915C3.42999 9.05459 3.78668 12.0335 5.725 13.6776L12 19L18.275 13.6776C20.2133 12.0335 20.57 9.05459 19.0807 6.94915C17.4026 4.57697 14.132 4.33053 12.1544 6.42726L12 6.59097ZM12 6.59097L10.5 8.5L13 11L11 13.5" />
    </svg>
  );
}
