/**
 * pages/Dashboard.jsx — Дашборд создателя / Creator dashboard
 * Lists all albums with analytics links and management actions
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Image } from "lucide-react";
import toast from "react-hot-toast";
import { albumsApi } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";
import AlbumCard from "../components/AlbumCard";
import LoadingSpinner from "../components/LoadingSpinner";

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    albumsApi.getMyAlbums()
      .then(setAlbums)
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (albumId) => {
    try {
      await albumsApi.delete(albumId);
      setAlbums((prev) => prev.filter((a) => a.id !== albumId));
      toast.success("Album deleted / Альбом удалён");
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="font-display font-bold text-3xl">
            {t("myAlbums")}
          </h1>
          <p className="text-gray-400 mt-0.5">
            @{user?.username} · {albums.length} album{albums.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link to="/create" className="btn-primary">
          <Plus size={18} />
          {t("createAlbum")}
        </Link>
      </motion.div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner />
      ) : albums.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-20"
        >
          <div className="w-20 h-20 bg-primary-50 dark:bg-primary-900/20 rounded-full
                          flex items-center justify-center mx-auto mb-4">
            <Image size={32} className="text-primary-300" />
          </div>
          <p className="text-gray-400 font-medium mb-4">{t("noAlbums")}</p>
          <Link to="/create" className="btn-primary inline-flex">
            <Plus size={18} /> {t("createAlbum")}
          </Link>
        </motion.div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {albums.map((album, i) => (
            <AlbumCard
              key={album.id}
              album={album}
              onDelete={handleDelete}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
