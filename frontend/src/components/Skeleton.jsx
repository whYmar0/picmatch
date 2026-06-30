/**
 * Skeleton.jsx — Skeleton loading placeholders
 * Pulse animation for content that is loading.
 */
import { motion } from "framer-motion";

function SkeletonBox({ className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 0.8, 0.5] }}
      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
      className={`bg-border-light dark:bg-border-dark rounded-2xl ${className}`}
    />
  );
}

export function AlbumCardSkeleton() {
  return (
    <div className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card overflow-hidden flex flex-col w-full min-w-0">
      <SkeletonBox className="w-full aspect-[4/3] rounded-none" />
      <div className="flex flex-col gap-2 p-3.5">
        <SkeletonBox className="h-4 w-2/3" />
        <SkeletonBox className="h-2.5 w-1/3" />
        <div className="flex items-center justify-center gap-3 pt-1">
          <SkeletonBox className="h-9 w-9 rounded-xl" />
          <SkeletonBox className="h-9 w-9 rounded-xl" />
          <SkeletonBox className="h-9 w-9 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function AlbumGridSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <AlbumCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <SkeletonBox className="h-8 w-8 rounded-full" />
        <SkeletonBox className="h-4 w-32" />
      </div>
      <SkeletonBox className="h-8 w-48" />
      <SkeletonBox className="h-4 w-64" />
      <SkeletonBox className="h-32 w-full rounded-3xl" />
      <div className="flex gap-2">
        <SkeletonBox className="h-10 w-24" />
        <SkeletonBox className="h-10 w-24" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonBox className="h-12 w-12 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <SkeletonBox className="h-4 w-3/4" />
              <SkeletonBox className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VotePageSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-surface-light dark:bg-surface-dark flex flex-col items-center px-4 pt-6">
      <div className="w-full max-w-[360px] space-y-4">
        <div className="flex items-center gap-3">
          <SkeletonBox className="h-11 w-11 rounded-full" />
          <SkeletonBox className="h-8 w-32" />
        </div>
        <SkeletonBox className="h-7 w-48" />
        <SkeletonBox className="h-4 w-full" />
      </div>
      <div className="flex gap-2 py-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBox key={i} className="h-20 w-20 rounded-2xl flex-shrink-0" />
        ))}
      </div>
      <SkeletonBox className="w-full max-w-[430px] aspect-[3/4] rounded-3xl mt-2" />
      <div className="flex gap-6 mt-6">
        <SkeletonBox className="h-16 w-16 rounded-full" />
        <SkeletonBox className="h-16 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function CommentSkeleton({ count = 4 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <SkeletonBox className="h-8 w-8 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBox className="h-3.5 w-2/3" />
            <SkeletonBox className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default SkeletonBox;
