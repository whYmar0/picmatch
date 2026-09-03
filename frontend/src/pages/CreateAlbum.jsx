/**
 * pages/CreateAlbum.jsx — album creation with immediate media uploads
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Upload, X, ArrowLeft, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { albumsApi } from "../api";
import { useLang } from "../contexts/LangContext";

// ─── Client-side image compression ───────────────────────────────────────────
async function compressImage(file) {
  return new Promise((resolve) => {
    // Videos and already-small images should be uploaded unchanged.
    if (file.type.startsWith("video/") || !file.type.startsWith("image/") || file.size < 200 * 1024) {
      resolve(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSize = 1200;
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
            type: "image/jpeg",
            lastModified: Date.now(),
          }));
        },
        "image/jpeg",
        0.75
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

function createId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatVideoDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function CircularProgress({ progress, error }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (Math.max(0, Math.min(progress, 100)) / 100) * circumference;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/35">
      <div className={`relative flex items-center justify-center w-11 h-11 rounded-full ${error ? "bg-red-500" : "bg-black/55"}`}>
        {!error && (
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r={radius} fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="3" />
            <circle
              cx="20"
              cy="20"
              r={radius}
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-[stroke-dashoffset] duration-150"
            />
          </svg>
        )}
        <span className="relative text-[10px] font-bold text-white">
          {error ? "!" : `${Math.round(progress)}%`}
        </span>
      </div>
    </div>
  );
}

export default function CreateAlbum() {
  const { t } = useLang();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const uploadControllers = useRef(new Map());

  const updateFile = useCallback((id, updater) => {
    setFiles((previous) => previous.map((item) => (
      item.id === id
        ? (typeof updater === "function" ? updater(item) : { ...item, ...updater })
        : item
    )));
  }, []);

  const uploadFile = useCallback(async (id, file) => {
    const controller = new AbortController();
    uploadControllers.current.set(id, controller);
    updateFile(id, { status: "uploading", progress: 0, error: null });

    try {
      const prepared = await compressImage(file);
      if (controller.signal.aborted) return;

      updateFile(id, (item) => {
        if (item.previewFile === file && prepared !== file) {
          URL.revokeObjectURL(item.preview);
          return { ...item, file: prepared, previewFile: prepared, preview: URL.createObjectURL(prepared) };
        }
        return { ...item, file: prepared };
      });

      const uploaded = await albumsApi.uploadMedia(
        prepared,
        (progressEvent) => {
          const total = progressEvent.total || prepared.size;
          updateFile(id, { progress: total ? (progressEvent.loaded / total) * 100 : 0 });
        },
        controller.signal
      );
      if (controller.signal.aborted) return;

      updateFile(id, {
        progress: 100,
        status: "done",
        uploadToken: uploaded.upload_token,
        filename: uploaded.filename,
        mediaType: uploaded.media_type,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      updateFile(id, { status: "error", progress: 0, error: error.message });
      toast.error(error.message || t("uploadFailed"));
    } finally {
      uploadControllers.current.delete(id);
    }
  }, [t, updateFile]);

  const addFiles = useCallback((accepted) => {
    accepted.forEach((file) => {
      const id = createId();
      const preview = URL.createObjectURL(file);
      setFiles((previous) => [
        ...previous,
        {
          id,
          file,
          previewFile: file,
          preview,
          progress: 0,
          status: "uploading",
          uploadToken: null,
          error: null,
          duration: null,
        },
      ]);
      void uploadFile(id, file);
    });
  }, [uploadFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: addFiles,
    accept: {
      "image/jpeg": [],
      "image/png": [],
      "image/webp": [],
      "image/gif": [],
      "video/mp4": [],
      "video/webm": [],
      "video/quicktime": [],
      "video/avi": [],
    },
    maxSize: 50 * 1024 * 1024,
    onDropRejected: () => toast.error(t("uploadRejected")),
  });

  const removeFile = async (item) => {
    uploadControllers.current.get(item.id)?.abort();
    uploadControllers.current.delete(item.id);
    if (item.uploadToken) {
      try {
        await albumsApi.deleteUploadedMedia(item.uploadToken);
      } catch {
        // The preview is still removed locally; orphan cleanup is best effort.
      }
    }
    URL.revokeObjectURL(item.preview);
    setFiles((previous) => previous.filter((candidate) => candidate.id !== item.id));
  };

  const retryFile = (item) => {
    void uploadFile(item.id, item.file);
  };

  const allUploadsComplete = files.length > 0 && files.every(
    (item) => item.status === "done" && item.progress >= 100 && item.uploadToken
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error(t("enterAlbumTitle"));
      return;
    }
    if (files.length === 0) {
      toast.error(t("uploadAtLeastOne"));
      return;
    }
    if (!allUploadsComplete) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      if (description.trim()) formData.append("description", description.trim());
      formData.append("is_public", String(isPublic));
      formData.append("uploaded_media", JSON.stringify(files.map((item) => item.uploadToken)));
      await albumsApi.create(formData);
      toast.success(t("albumCreated"));
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => () => {
    uploadControllers.current.forEach((controller) => controller.abort());
    filesRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <button onClick={() => navigate("/dashboard")} className="btn-ghost mb-4 -ml-2 text-sm">
          <ArrowLeft size={16} /> {t("backToAlbums")}
        </button>
        <h1 className="font-display font-bold text-3xl">{t("createAlbum")}</h1>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-5">
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
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("albumTitlePlaceholder")}
              className="input-field"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 block mb-1.5">
              {t("albumDescription")}
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder={t("albumDescriptionPlaceholder")}
              className="input-field resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{t("publicAccess")}</p>
              <p className="text-sm text-gray-500">{t("publicAccessHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPublic((current) => !current)}
              aria-pressed={isPublic}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isPublic ? "bg-primary-500" : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isPublic ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400 block mb-1.5">
            {t("uploadPhotos")} * ({files.length})
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
            <Upload size={32} className={`mx-auto mb-3 ${isDragActive ? "text-primary-400" : "text-gray-300"}`} />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("uploadDrag")}</p>
            <p className="text-xs text-gray-400 mt-1">{t("uploadHint")} · {t("maxFileSize")}</p>
          </div>
        </motion.div>

        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3"
            >
              {files.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative group aspect-square rounded-2xl overflow-hidden bg-border-light dark:bg-border-dark"
                >
                  {(item.mediaType === "video" || item.file.type.startsWith("video/") || /\.(mp4|webm|mov|avi)$/i.test(item.file.name)) ? (
                    <>
                      <video
                        src={item.preview}
                        className="w-full h-full object-cover"
                        preload="metadata"
                        loop
                        muted
                        playsInline
                        onLoadedMetadata={(event) => {
                          const duration = formatVideoDuration(event.currentTarget.duration);
                          if (duration && item.duration !== duration) {
                            updateFile(item.id, { duration });
                          }
                        }}
                      />
                      {item.duration && (
                        <span
                          data-testid="video-duration"
                          className="absolute bottom-1 left-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white"
                        >
                          {item.duration}
                        </span>
                      )}
                    </>
                  ) : (
                    <img
                      src={item.preview}
                      alt={`${t("uploadPhotos")} ${index + 1}`}
                      className="w-full h-full object-cover"
                      decoding="async"
                    />
                  )}

                  {item.status !== "done" && (
                    <CircularProgress progress={item.progress} error={item.status === "error"} />
                  )}
                  {item.status === "error" && (
                    <button
                      type="button"
                      onClick={() => retryFile(item)}
                      className="absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 rounded-lg bg-black/65 px-1 py-1 text-[10px] font-semibold text-white"
                    >
                      <RefreshCw size={11} /> {t("retryUpload")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void removeFile(item)}
                    aria-label={t("removeUpload")}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-lg flex items-center justify-center text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="submit"
          disabled={loading || !allUploadsComplete}
          whileTap={{ scale: 0.98 }}
          className="btn-primary w-full py-4 text-base disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
              />
              {t("creatingAlbum")}
            </>
          ) : (
            <>
              <Upload size={18} />
              {t("createAlbumBtn")}
            </>
          )}
        </motion.button>
      </form>
    </div>
  );
}
