/**
 * pages/CreateAlbum.jsx — Страница создания альбома
 * Album creation with drag-and-drop photo upload and preview
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Upload, X, GripVertical, Copy, Check, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { albumsApi } from "../api";
import { useLang } from "../contexts/LangContext";

export default function CreateAlbum() {
  const { t } = useLang();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createdAlbum, setCreatedAlbum] = useState(null);
  const [isPublic, setIsPublic] = useState(true);

  // Dropzone setup / Настройка dropzone
  const onDrop = useCallback((accepted) => {
    const newFiles = accepted.map((file) =>
      Object.assign(file, { preview: URL.createObjectURL(file) })
    );
    setFiles((prev) => [...prev, ...newFiles].slice(0, 50));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [], "image/png": [], "image/webp": [] },
    maxSize: 10 * 1024 * 1024,
    onDropRejected: () => toast.error("Some files were rejected (too large or wrong format)"),
  });

  const removeFile = (idx) => {
    setFiles((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[idx].preview);
      updated.splice(idx, 1);
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { toast.error("Please enter a title"); return; }
    if (files.length === 0) { toast.error("Please upload at least one photo"); return; }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("title", title);
      if (description) formData.append("description", description);
      files.forEach((f) => formData.append("photos", f));

      formData.append("is_public", isPublic);
      const album = await albumsApi.create(formData);
      toast.success("Album created! 🎉");
      navigate(`/dashboard`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <button onClick={() => navigate("/dashboard")} className="btn-ghost mb-4 -ml-2 text-sm">
          <ArrowLeft size={16} /> {t("backToAlbums")}
        </button>
        <h1 className="font-display font-bold text-3xl">{t("createAlbum")}</h1>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Album info */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card p-5 space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 block mb-1.5">
              {t("albumTitle")} *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Summer Shoot 2024"
              className="input-field"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 block mb-1.5">
              {t("albumDescription")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Tell voters what this album is about…"
              className="input-field resize-none"
            />
          </div>
          
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Public access</p>
              <p className="text-sm text-gray-500">Allow voters to see analytics</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPublic(!isPublic)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isPublic ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isPublic ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </motion.div>

        {/* Dropzone */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400 block mb-1.5">
            {t("uploadPhotos")} * ({files.length}/50)
          </label>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
              isDragActive
                ? "border-primary-400 bg-primary-50 dark:bg-primary-900/20"
                : "border-border-light dark:border-border-dark hover:border-primary-300"
            }`}
          >
            <input {...getInputProps()} />
            <Upload
              size={32}
              className={`mx-auto mb-3 ${isDragActive ? "text-primary-400" : "text-gray-300"}`}
            />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("uploadDrag")}</p>
            <p className="text-xs text-gray-400 mt-1">{t("uploadHint")}</p>
          </div>
        </motion.div>

        {/* Photo previews */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3"
            >
              {files.map((file, idx) => (
                <motion.div
                  key={file.name + idx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ delay: idx * 0.03 }}
                  className="relative group aspect-square rounded-2xl overflow-hidden bg-border-light dark:bg-border-dark"
                >
                  <img
                    src={file.preview}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-lg
                               flex items-center justify-center text-white
                               opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                  <div className="absolute bottom-0 inset-x-0 bg-black/40 text-white
                                  text-[10px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {file.name}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <motion.button
          type="submit"
          disabled={loading || files.length === 0}
          whileTap={{ scale: 0.98 }}
          className="btn-primary w-full py-4 text-base"
        >
          {loading ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
              />
              Uploading…
            </>
          ) : (
            <>
              <Upload size={18} />
              {t("createAlbumBtn")} ({files.length} {t("photos")})
            </>
          )}
        </motion.button>
      </form>
    </div>
  );
}
