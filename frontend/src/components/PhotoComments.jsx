import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SendHorizontal, X } from "lucide-react";
import toast from "react-hot-toast";
import { commentsApi } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { CommentSkeleton } from "./Skeleton";
import { UserAvatar } from "./Navbar";
import { useLang } from "../contexts/LangContext";

// ─── Single comment row ───────────────────────────────────────────────────────
function CommentItem({ comment, onDelete, onReply, depth = 0, isAlbumOwner = false, rootComment = null }) {
  const { user } = useAuth();
  const { lang } = useLang();
  const [showReplies, setShowReplies] = useState(true);
  const isOwn = user && String(user.id) === String(comment.author?.id);
  const canDelete = isOwn || isAlbumOwner;

  const dateString = comment.created_at.endsWith("Z") ? comment.created_at : comment.created_at + "Z";
  const s = Math.max(0, (Date.now() - new Date(dateString).getTime()) / 1000);

  let dateFormatted = "";
  if (s < 60) {
    dateFormatted = lang === "ru" ? "только что" : "just now";
  } else if (s < 3600) {
    dateFormatted = `${Math.floor(s / 60)} ${lang === "ru" ? "мин." : "min"}`;
  } else if (s < 86400) {
    dateFormatted = `${Math.floor(s / 3600)} ${lang === "ru" ? "ч." : "h"}`;
  } else {
    dateFormatted = `${Math.floor(s / 86400)} ${lang === "ru" ? "дн." : "d"}`;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={depth > 0 ? "ml-[38px] mt-3" : "mt-4 first:mt-2"}
    >
      <div className="flex items-start gap-2.5">
        <UserAvatar user={comment.author} size={32} className="mt-0.5 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-[14px] leading-snug break-words">
            <span className="font-bold text-gray-900 dark:text-gray-100 mr-2">{comment.author?.username}</span>
            <span className="text-gray-800 dark:text-gray-200">{comment.text}</span>
          </p>

          <div className="flex items-center gap-3 mt-1.5 font-sans text-[11px] font-medium text-gray-400 dark:text-gray-500">
            <span>{dateFormatted}</span>

            {depth < 2 && (
              <button
                onClick={() => onReply(comment, rootComment)}
                className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {lang === "ru" ? "Ответить" : "Reply"}
              </button>
            )}

            {canDelete && (
              <button
                onClick={() => onDelete(comment.id)}
                className="text-red-400/80 hover:text-red-500 transition-colors"
              >
                {lang === "ru" ? "Удалить" : "Delete"}
              </button>
            )}
          </div>

          {(comment.replies?.length ?? 0) > 0 && (
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400 font-bold group"
            >
              <div className="w-6 h-[1px] bg-gray-300 dark:bg-gray-600 group-hover:bg-gray-400 transition-colors" />
              {showReplies
                ? (lang === "ru" ? "Скрыть ответы" : "Hide replies")
                : (lang === "ru"
                  ? `Показать ответы: ${comment.replies.length}`
                  : `View ${comment.replies.length} more replies`)}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showReplies && comment.replies?.map((reply) => (
          <CommentItem key={reply.id} comment={reply} depth={depth + 1}
            onDelete={onDelete} onReply={onReply}
            isAlbumOwner={isAlbumOwner} rootComment={rootComment || comment} />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PhotoComments({ photoId, albumCreatorId, initialComments = null }) {
  const { user } = useAuth();
  const { lang, t } = useLang();
  const isAlbumOwner = !!(user && albumCreatorId && String(user.id) === String(albumCreatorId));
  // If initialComments is provided (pre-fetched from outside), use them and skip the first fetch.
  // After submit/delete we still refresh via load().
  const [comments, setComments] = useState(() => initialComments ?? []);
  const [loading, setLoading] = useState(initialComments === null); // skip spinner if pre-loaded
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  const startReply = (targetComment, rootComment) => {
    // If replying to a nested comment, we attach it to the root comment to prevent disappearing comments
    // But we keep the targetComment's author for the UI display
    setReplyTo({
      id: rootComment ? rootComment.id : targetComment.id,
      author: targetComment.author
    });

    setText((prev) => {
      const mention = `@${targetComment.author?.username} `;
      if (prev.startsWith('@')) {
        const spaceIdx = prev.indexOf(' ');
        if (spaceIdx !== -1) {
          return mention + prev.slice(spaceIdx + 1);
        }
      }
      return mention + prev;
    });

    // Focus with a small delay for smoother mobile keyboard opening
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const load = useCallback(() => {
    if (!photoId) return;
    setLoading(true);
    commentsApi.getForPhoto(photoId)
      .then(setComments)
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [photoId]);

  useEffect(() => {
    // Only auto-fetch if no pre-loaded data was provided at mount
    if (initialComments !== null) return;

    // Delay the initial fetch slightly so it doesn't block the UI thread 
    // during the 300ms BottomSheet slide-up animation
    const timer = setTimeout(() => {
      load();
    }, 350);

    return () => clearTimeout(timer);
  }, [load]); // intentionally omitting initialComments — it's only read at mount

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const created = await commentsApi.create({
        photo_id: photoId,
        text: text.trim(),
        parent_id: replyTo?.id ?? null,
      });
      setText("");
      setReplyTo(null);
      // Optimistic update — the optimistic result is reliable so we avoid
      // calling load() which would briefly show a skeleton and could race.
      if (created) {
        setComments((prev) => replyTo?.id
          ? prev.map((comment) => String(comment.id) === String(replyTo.id)
            ? { ...comment, replies: [...(comment.replies || []), created] }
            : comment)
          : [...prev, created]);
      }
    } catch (err) {
      toast.error(err?.message || "Failed to submit comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try { await commentsApi.delete(id); load(); } catch { /**/ }
  };

  if (loading) return <CommentSkeleton count={4} />;

  return (
    <div className="flex flex-col flex-1 min-h-full">
      {comments.length === 0
        ? <p className="text-center text-gray-400 text-sm py-6">
          {lang === "ru" ? "Комментариев пока нет. Будьте первым!" : "No comments yet. Be the first!"}
        </p>
        : (
          <div className="mb-4 flex-1">
            <AnimatePresence>
              {comments.map((c) => (
                <CommentItem key={c.id} comment={c}
                  onDelete={handleDelete}
                  onReply={startReply}
                  isAlbumOwner={isAlbumOwner} />
              ))}
            </AnimatePresence>
          </div>
        )
      }

      {/* Input — pill-shape, fixed at bottom */}
      <div className="sticky bottom-0 flex-shrink-0 pt-3 pb-1 bg-card-light dark:bg-card-dark z-10">
        {replyTo && (
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-gray-400
                          bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-xl">
            <span>{t("replyToUser")} <strong>{replyTo.author?.username}</strong></span>
            <button onClick={() => setReplyTo(null)} className="ml-auto p-1 hover:text-gray-700 dark:hover:text-gray-200"><X size={12} /></button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("addCommentPlaceholder")}
            className="flex-1 py-2.5 px-4 text-[15px] rounded-full
                       bg-border-light dark:bg-border-dark
                       text-gray-900 dark:text-gray-100
                       placeholder:text-gray-400 dark:placeholder:text-gray-500
                       focus:outline-none focus:ring-2 focus:ring-primary-400
                       border-0"
            autoComplete="off"
            autoCorrect="off"
          />
          <motion.button type="submit"
            disabled={submitting || !text.trim()}
            whileTap={{ scale: 0.9 }}
            className="btn-primary w-11 h-11 flex-shrink-0 p-0">
            <SendHorizontal size={18} strokeWidth={2.4} />
          </motion.button>
        </form>
      </div>
    </div>
  );
}
