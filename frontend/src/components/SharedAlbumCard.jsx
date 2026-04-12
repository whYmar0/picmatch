/**
 * SharedAlbumCard.jsx — Card for albums shared with the current user
 * Read-only: shows "View Results" if can_view_stats, else just the invite link
 */
import { motion } from "framer-motion";
import { Link }   from "react-router-dom";
import { BarChart2, Image, Share2 } from "lucide-react";
import { useLang } from "../contexts/LangContext";

export default function SharedAlbumCard({ album, index }) {
  const { t } = useLang();
  const previewPhotos = (album.photos || []).slice(0, 3);
  const extra = Math.max(0, (album.photo_count || 0) - previewPhotos.length);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3 }}
      className="bg-card-light dark:bg-card-dark rounded-3xl shadow-card
                 hover:shadow-card-hover transition-shadow flex flex-col gap-3 p-4
                 overflow-hidden w-full min-w-0"
    >
      {/* Shared-by badge */}
      <div className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
        <Share2 size={11} className="text-primary-400 flex-shrink-0" />
        <span className="truncate">{t("sharedBy")} {album.creator?.username}</span>
      </div>

      {/* Thumbnails */}
      <div className="relative h-24 rounded-2xl overflow-hidden bg-border-light dark:bg-border-dark">
        {previewPhotos.length > 0 ? (
          <div className="flex h-full gap-0.5">
            {previewPhotos.map((photo, i) => (
              <div key={photo.id}
                className={`h-full overflow-hidden ${i === 0 ? "flex-[2]" : "flex-1"}`}>
                <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
            {extra > 0 && (
              <div className="absolute right-0 top-0 bottom-0 w-8
                              bg-black/50 flex items-center justify-center">
                <span className="text-white text-xs font-bold">+{extra}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Image size={22} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}
        <span className="absolute top-1.5 left-1.5 bg-black/50 text-white
                         text-[10px] font-semibold px-1.5 py-0.5 rounded-md">
          {album.photo_count ?? 0} {t("photos")}
        </span>
      </div>

      {/* Title */}
      <div className="min-w-0">
        <h3 className="font-semibold text-sm truncate">{album.title}</h3>
      </div>

      {/* Action */}
      {album.can_view_stats && (
        <Link to={`/analytics/${album.id}`}
          className="btn-primary text-xs py-2 justify-center">
          <BarChart2 size={13} /> {t("viewAnalytics")}
        </Link>
      )}
    </motion.div>
  );
}
