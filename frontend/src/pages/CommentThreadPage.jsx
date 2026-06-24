/**
 * CommentThreadPage.jsx
 *
 * Isolated view for notification deep-links.
 * Shows only the user's comment thread (their comment + album owner's replies).
 * Accessible even if the album is private.
 * No navigation out to analytics.
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Lock, MessageCircle } from "lucide-react";
import { commentsApi } from "../api";
import { UserAvatar } from "../components/Navbar";
import LoadingSpinner from "../components/LoadingSpinner";
import { useLang } from "../contexts/LangContext";

function fmt(dateStr, lang) {
  const ds = dateStr.endsWith("Z") ? dateStr : dateStr + "Z";
  const s = Math.max(0, (Date.now() - new Date(ds).getTime()) / 1000);
  
  if (s < 60) {
    return lang === "ru" ? "только что" : "now";
  } else if (s < 3600) {
    return `${Math.floor(s / 60)}${lang === "ru" ? "м" : "m"}`;
  } else if (s < 86400) {
    return `${Math.floor(s / 3600)}${lang === "ru" ? "ч" : "h"}`;
  } else {
    return `${Math.floor(s / 86400)}${lang === "ru" ? "д" : "d"}`;
  }
}

function ThreadComment({ comment, isRoot }) {
  const { lang } = useLang();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={isRoot ? "" : "ml-[38px] mt-3 pt-3 border-t border-gray-100 dark:border-gray-800"}
    >
      <div className="flex items-start gap-2.5">
        <UserAvatar user={comment.author} size={isRoot ? 36 : 32} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] leading-snug break-words">
            <span className="font-bold text-gray-900 dark:text-gray-100 mr-2">
              {comment.author?.username}
            </span>
            <span className="text-gray-800 dark:text-gray-200">{comment.text}</span>
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold mt-1.5">
            {fmt(comment.created_at, lang)}
          </p>
        </div>
      </div>

      {/* Replies */}
      {comment.replies?.map((reply) => (
        <ThreadComment key={reply.id} comment={reply} isRoot={false} />
      ))}
    </motion.div>
  );
}

export default function CommentThreadPage() {
  const { commentId } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const [thread, setThread] = useState([]);
  const [isPublic, setIsPublic] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    commentsApi
      .getThread(commentId)
      .then((data) => {
        setThread(data.thread);
        setIsPublic(data.is_public);
        setIsOwner(data.is_owner);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [commentId]);

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate("/inbox")}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t("Comments")}</h1>
        </div>
      </div>

      {/* Private Badge - only for non-owners in private albums */}
      {!isOwner && !isPublic && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800/50 mb-6">
          <Lock size={15} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {t("privateAlbumThreadHint")}
          </p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">🔒</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      ) : thread.length === 0 ? (
        <div className="text-center py-16">
          <MessageCircle size={36} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-sm">{t("commentNotFound")}</p>
        </div>
      ) : (
        <div className="space-y-1">
          <AnimatePresence>
            {thread.map((comment) => (
              <ThreadComment key={comment.id} comment={comment} isRoot={true} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
