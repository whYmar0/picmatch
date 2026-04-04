/**
 * components/LoadingSpinner.jsx — Компонент загрузки / Loading spinner
 */

import { motion } from "framer-motion";

export default function LoadingSpinner({ fullscreen = false, size = 40 }) {
  const spinner = (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
      className="rounded-full border-4 border-primary-100 dark:border-primary-900 border-t-primary-400"
      style={{ width: size, height: size }}
    />
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-surface-light dark:bg-surface-dark">
        <div className="flex flex-col items-center gap-4">
          {spinner}
          <p className="text-sm text-gray-400 font-medium animate-pulse">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8">
      {spinner}
    </div>
  );
}
