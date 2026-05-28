/**
 * Dashboard.jsx — v3
 * Added: "Recently Visited" section above own albums
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Image, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { albumsApi } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";
import AlbumCard from "../components/AlbumCard";
import RecentAlbumCard from "../components/RecentAlbumCard";
import LoadingSpinner from "../components/LoadingSpinner";
import { getRecentAlbums } from "../hooks/useRecentAlbums.js";

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);

  // Recently visited — filtered to exclude albums the user owns
  const recentAll = user ? getRecentAlbums(user.id) : [];
  const ownIds = new Set(albums.map((a) => a.id));
  const recent = recentAll.filter((a) => !ownIds.has(a.id));

  useEffect(() => {
    albumsApi.getMyAlbums()
      .then((mine) => setAlbums(mine))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (albumId) => {
    try {
      await albumsApi.delete(albumId);
      setAlbums((prev) => prev.filter((a) => a.id !== albumId));
      toast.success(t("deleteAlbum") + " ✓");
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* ── Recently Visited ── */}
      {recent.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex items-center gap-2 mb-4">
            <Clock size={15} className="text-gray-400" />
            <h2 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {t("recentlyVisited")}
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recent.map((album, i) => (
              <RecentAlbumCard key={album.id} album={album} index={i} />
            ))}
          </div>
        </motion.section>
      )}

      {/* ── My Albums ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div className="min-w-0">
          <h1 className="font-display font-bold text-2xl truncate">{t("myAlbums")}</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {user?.username}
            {albums.length > 0 && ` · ${albums.length}`}
          </p>
        </div>
        {albums.length > 0 && (
          <Link to="/create" className="btn-primary flex-shrink-0 ml-4 px-8.5 py-3 sm:px-5 sm:py-2.5 text-s sm:text-sm">
            <Plus size={16} className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {t("createAlbum")}
          </Link>
        )}
      </motion.div>

      {albums.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-16"
        >
          <div className="w-16 h-16 bg-primary-50 dark:bg-primary-900/20 rounded-full
                          flex items-center justify-center mx-auto mb-4">
            <Image size={28} className="text-primary-300" />
          </div>
          <p className="text-gray-400 text-sm mb-5">{t("noAlbums")}</p>
          <Link to="/create" className="btn-primary inline-flex">
            <Plus size={16} /> {t("createAlbum")}
          </Link>
        </motion.div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {albums.map((album, i) => (
            <AlbumCard key={album.id} album={album} onDelete={handleDelete} index={i} />
          ))}
        </div>
      )}

    </div>
  );
}
