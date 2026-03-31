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
  const [copied, setCopied] = useState(false);

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

      const album = await albumsApi.create(formData);
      setCreatedAlbum(album);
      toast.success("Album created! 🎉 / Альбом создан!");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(createdAlbum.invite_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Success state ──────────────────────────────────────────────────────────
  if (createdAlbum) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card p-8 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, delay: 0.1 }}
            className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full
                       flex items-center justify-center mx-auto mb-4 text-3xl"
          >
            🎉
          </motion.div>
          <h2 className="font-display font-bold text-2xl mb-1">{createdAlbum.title}</h2>
          <p className="text-gray-400 text-sm mb-6">
            {createdAlbum.photo_count} {t("photos")} uploaded
          </p>

          <div className="bg-border-light dark:bg-border-dark rounded-2xl p-3 mb-4">
            <p className="text-xs text-gray-400 mb-2">{t("inviteLink")}</p>
            <p className="font-mono text-sm break-all text-gray-700 dark:text-gray-300">
              {createdAlbum.invite_url}
            </p>
          </div>

          <div className="flex gap-3">
            <motion.button
              onClick={handleCopy}
              whileTap={{ scale: 0.95 }}
              className="btn-primary flex-1"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t("copied") : t("copyLink")}
            </motion.button>
            <button
              onClick={() => navigate("/dashboard")}
              className="btn-secondary flex-1"
            >
              {t("myAlbums")}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

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
