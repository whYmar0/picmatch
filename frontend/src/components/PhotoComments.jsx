/**
 * PhotoComments.jsx — v1.1
 *
 * CHANGES:
 *  - Uses UserAvatar from Navbar for avatar display (consistent across app)
 *  - Removed "@" prefix from usernames
 *  - Shows avatar_url if set, else initial letter
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ThumbsUp, Trash2, CornerDownRight, Send } from "lucide-react";
import { commentsApi } from "../api";
import { useAuth }     from "../contexts/AuthContext";
import LoadingSpinner  from "./LoadingSpinner";
import { UserAvatar }  from "./Navbar";

// ─── Single comment row ───────────────────────────────────────────────────────
function CommentItem({ comment, onDelete, onLike, onReply, depth = 0 }) {
  const { user }     = useAuth();
  const [showReplies, setShowReplies] = useState(true);
  const isOwn = user && String(user.id) === String(comment.author?.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={depth > 0 ? "ml-8 border-l-2 border-border-light dark:border-border-dark pl-3" : ""}
    >
      <div className="flex gap-2.5 py-2">
        {/* Avatar */}
        <UserAvatar user={comment.author} size={28} className="mt-0.5 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            {/* No @ prefix */}
            <span className="text-xs font-semibold">{comment.author?.username}</span>
            <span className="text-[10px] text-gray-400">
              {new Date(comment.created_at).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 break-words leading-relaxed">
            {comment.text}
          </p>

          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <button
              onClick={() => onLike(comment.id)}
              className={`flex items-center gap-1 text-[11px] font-medium transition-colors
                          ${comment.liked_by_me ? "text-primary-500" : "text-gray-400 hover:text-primary-400"}`}
            >
              <ThumbsUp size={11} /> {comment.like_count > 0 ? comment.like_count : ""}
            </button>

            {depth === 0 && (
              <button onClick={() => onReply(comment)}
                className="text-[11px] text-gray-400 hover:text-primary-400 transition-colors
                           flex items-center gap-1">
                <CornerDownRight size={11} /> Reply
              </button>
            )}

            {(comment.replies?.length ?? 0) > 0 && (
              <button onClick={() => setShowReplies(!showReplies)}
                className="text-[11px] text-gray-400 hover:text-primary-400 transition-colors">
                {showReplies ? "Hide" : `${comment.replies.length} replies`}
              </button>
            )}

            {isOwn && (
              <button onClick={() => onDelete(comment.id)}
                className="text-[11px] text-red-400 hover:text-red-500 transition-colors ml-auto">
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showReplies && comment.replies?.map((reply) => (
          <CommentItem key={reply.id} comment={reply} depth={depth + 1}
            onDelete={onDelete} onLike={onLike} onReply={onReply} />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PhotoComments({ photoId }) {
  const [comments,   setComments]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [text,       setText]       = useState("");
  const [replyTo,    setReplyTo]    = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!photoId) return;
    setLoading(true);
    commentsApi.getForPhoto(photoId)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [photoId]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await commentsApi.create({
        photo_id:  photoId,
        text:      text.trim(),
        parent_id: replyTo?.id ?? null,
      });
      setText("");
      setReplyTo(null);
      load();
    } catch { /**/ } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try { await commentsApi.delete(id); load(); } catch { /**/ }
  };

  const handleLike = async (id) => {
    try {
      await commentsApi.toggleLike(id);
      const toggle = (list) => list.map((c) => {
        if (String(c.id) === String(id))
          return { ...c, liked_by_me: !c.liked_by_me,
                   like_count: c.liked_by_me ? c.like_count - 1 : c.like_count + 1 };
        if (c.replies?.length) return { ...c, replies: toggle(c.replies) };
        return c;
      });
      setComments((prev) => toggle(prev));
    } catch { /**/ }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="flex flex-col">
      {comments.length === 0
        ? <p className="text-center text-gray-400 text-sm py-6">No comments yet — be first!</p>
        : (
          <div className="divide-y divide-border-light dark:divide-border-dark mb-3">
            <AnimatePresence>
              {comments.map((c) => (
                <CommentItem key={c.id} comment={c}
                  onDelete={handleDelete} onLike={handleLike}
                  onReply={(parent) => setReplyTo(parent)} />
              ))}
            </AnimatePresence>
          </div>
        )
      }

      {/* Input */}
      <div className="sticky bottom-0 pt-2 pb-1 bg-card-light dark:bg-card-dark">
        {replyTo && (
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-400
                          bg-border-light dark:bg-border-dark px-3 py-1.5 rounded-xl">
            <CornerDownRight size={11} />
            <span>Replying to <strong>{replyTo.author?.username}</strong></span>
            <button onClick={() => setReplyTo(null)} className="ml-auto text-gray-500 hover:text-gray-700">✕</button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment…"
            className="input-field flex-1 py-2 text-sm"
          />
          <motion.button type="submit"
            disabled={submitting || !text.trim()}
            whileTap={{ scale: 0.9 }}
            className="btn-primary px-3 py-2">
            <Send size={15} />
          </motion.button>
        </form>
      </div>
    </div>
  );
}
