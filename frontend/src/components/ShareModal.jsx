/**
 * ShareModal.jsx — Simplified Link Sharing modal
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Info } from "lucide-react";
import toast from "react-hot-toast";
import { useLang } from "../contexts/LangContext";
import BottomSheet from "./BottomSheet";

export default function ShareModal({ album, open, onClose }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!album?.invite_url) return;
    await navigator.clipboard.writeText(album.invite_url);
    setCopied(true);
    toast.success(t("copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Share Link">
      <div className="space-y-4 pt-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Anyone with this link can vote in your album.
        </p>
        
        <div className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <p className="flex-1 text-sm font-mono truncate text-gray-700 dark:text-gray-300">
            {album?.invite_url}
          </p>
          <motion.button
            onClick={handleCopy}
            whileTap={{ scale: 0.9 }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              copied ? "bg-green-500 text-white" : "bg-primary-500 text-white"
            }`}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </motion.button>
        </div>

        <div className="flex items-start gap-3 p-4 bg-primary-50 dark:bg-primary-900/10 rounded-2xl text-primary-600 dark:text-primary-400">
          <Info size={18} className="mt-0.5 flex-shrink-0" />
          <p className="text-xs leading-relaxed">
            Invite your friends and followers to vote for their favorite photos. 
            Once they vote, they'll be able to see the live results!
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}
