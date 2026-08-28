import { useState, useEffect, useMemo } from "react";
import { notificationsApi } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LangContext";
import { UserAvatar } from "../components/Navbar";
import { isVideoUrl } from "../utils/media";
import { Bell, MessageSquare, BarChart2, CheckCircle, ChevronLeft, AtSign, MessageCircle } from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday, differenceInDays } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

export default function Notifications() {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) load();
  }, [user]);

  const load = async () => {
    try {
      const data = await notificationsApi.getMine();
      setNotifications(data);
      const unread = data.filter(n => !n.is_read);
      if (unread.length > 0) await notificationsApi.markAllRead();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const timeLocale = lang === "ru" ? ru : enUS;

  const grouped = useMemo(() => {
    const groups = {
      today: [],
      yesterday: [],
      thisWeek: [],
      lastMonth: [],
      earlier: []
    };

    notifications.forEach(n => {
      // Ensure date is treated as UTC by appending 'Z' since SQLite might return naive UTC time
      const dateString = n.created_at.endsWith("Z") ? n.created_at : n.created_at + "Z";
      const date = new Date(dateString);
      if (isToday(date)) groups.today.push(n);
      else if (isYesterday(date)) groups.yesterday.push(n);
      else if (differenceInDays(new Date(), date) < 7) groups.thisWeek.push(n);
      else if (differenceInDays(new Date(), date) < 30) groups.lastMonth.push(n);
      else groups.earlier.push(n);
    });

    return groups;
  }, [notifications]);

  const getIcon = (type) => {
    switch(type) {
      case "reply":   return <AtSign size={12} strokeWidth={3} className="text-white" />;
      case "comment": return <MessageCircle size={12} fill="white" className="text-white" />;
      case "vote":    return <BarChart2 size={12} fill="white" className="text-white" />;
      default:        return <Bell size={12} className="text-white" />;
    }
  };

  const getIconBg = (type) => {
    switch(type) {
      case "reply":   return "bg-blue-500";
      case "comment": return "bg-primary-500";
      case "vote":    return "bg-green-500";
      default:        return "bg-gray-500";
    }
  };

  const getMessage = (n) => {
    const actorName = n.actor?.username || t("someone");
    const nameSpan = <span className="font-bold text-gray-900 dark:text-white mr-1">{actorName}</span>;
    const textPreview = n.text ? (
      <span className="text-gray-500 dark:text-gray-400 font-normal">
        : "{n.text}"
      </span>
    ) : null;
    
    switch(n.type) {
      case "reply":   return <>{nameSpan} {t("notifRepliedComment")}{textPreview}</>;
      case "comment": return <>{nameSpan} {t("notifCommentPhoto")}{textPreview}</>;
      case "vote":    return <>{nameSpan} {t("notifVotedAlbum")}</>;
      default:        return <>{t("newNotification")}</>;
    }
  };

  const NotificationItem = ({ n }) => {
    const dateString = n.created_at.endsWith("Z") ? n.created_at : n.created_at + "Z";

    // Routing logic:
    // reply/like → analytics page with photo comment sheet auto-opened
    //              (works even on private albums - AnalyticsPage handles the 403 case)
    // vote       → album analytics
    const handleClick = () => {
      const isCommentRelated = n.type === "reply" || n.type === "comment";
      if (isCommentRelated && n.album_id && n.photo_id) {
        const params = new URLSearchParams({ photo: n.photo_id, tab: "comments" });
        if (n.comment_id) params.set("comment", n.comment_id);
        navigate(`/analytics/${n.album_id}?${params}`);
      } else if (n.album_id) {
        navigate("/analytics/" + n.album_id);
      }
    };

    const isClickable = !!n.album_id;

    return (
      <div
        onClick={handleClick}
        className={`flex items-center gap-3 py-3 group ${
          isClickable ? 'cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/30 rounded-xl px-2 -mx-2' : ''
        }`}
      >
        <div className="relative flex-shrink-0">
          <UserAvatar user={n.actor} size={48} />
          <div className={`absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center ${getIconBg(n.type)}`}>
            {getIcon(n.type)}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] leading-tight text-gray-700 dark:text-gray-300">
            {getMessage(n)}
            <span className="text-gray-400 dark:text-gray-500 ml-2 whitespace-nowrap inline-block text-xs">
              {formatDistanceToNow(new Date(dateString), { addSuffix: false, locale: timeLocale })
                .replace("about ", "").replace("less than ", "")}
            </span>
          </p>
        </div>
        <div className="relative w-12 h-12 flex-shrink-0">
          {n.thumbnail_url ? (
            isVideoUrl(n.thumbnail_url) ? (
              <video
                src={n.thumbnail_url}
                className="w-12 h-12 rounded-xl object-cover bg-gray-100 dark:bg-gray-800"
                preload="metadata"
                muted
                playsInline
              />
            ) : (
              <img
                src={n.thumbnail_url}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-12 h-12 rounded-xl object-cover bg-gray-100 dark:bg-gray-800"
              />
            )
          ) : (
            <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-300">
              <Bell size={18} />
            </div>
          )}
          {!n.is_read && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary-500 rounded-full ring-2 ring-white dark:ring-gray-900" />
          )}
        </div>
      </div>
    );
  };

  const Section = ({ title, items }) => {
    if (!items?.length) return null;
    return (
      <div className="mb-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 px-1">
          {title}
        </h3>
        <div>
          {items.map(item => <NotificationItem key={item.id} n={item} />)}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {t("notifications")}
        </h1>
      </div>

      {loading ? (
        <div className="space-y-6 animate-pulse">
          {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl" />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-20">
          <CheckCircle size={40} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">{t("noNewNotifs")}</p>
        </div>
      ) : (
        <>
          <Section title={t("today")} items={grouped.today} />
          <Section title={t("yesterday")} items={grouped.yesterday} />
          <Section title={t("thisWeek")} items={grouped.thisWeek} />
          <Section title={t("last30Days")} items={grouped.lastMonth} />
          <Section title={t("earlier")} items={grouped.earlier} />
        </>
      )}
    </div>
  );
}
