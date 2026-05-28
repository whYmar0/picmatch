/**
 * contexts/LangContext.jsx — 100% bilingual EN / RU
 * New keys: seeMore, seeLess, sort, filterBy, filterByVoter,
 *           noVoters, selectVoters, sortMostLikes, sortMostDislikes
 */
import { createContext, useContext, useState } from "react";

const T = {
  en: {
    appName: "PicMatch",
    login: "Log in",
    register: "Sign up",
    logout: "Log out",
    dashboard: "My Albums",
    createAlbum: "New Album",

    email: "Email",
    username: "Username",
    password: "Password",
    alreadyHaveAccount: "Already have an account?",
    dontHaveAccount: "No account yet?",
    loginTitle: "Welcome back",
    loginSubtitle: "Sign in to continue",
    registerTitle: "Create account",
    registerSubtitle: "Join PicMatch — it's free",

    albumTitle: "Album title",
    albumDescription: "Description (optional)",
    uploadPhotos: "Upload Photos",
    uploadDrag: "Drag & drop photos here, or click to browse",
    uploadHint: "JPEG, PNG, WebP · max 10 MB each",
    createAlbumBtn: "Create Album",
    inviteLink: "Invite Link",
    copyLink: "Copy",
    copied: "Copied!",
    myAlbums: "My Albums",
    noAlbums: "No albums yet — create your first one",
    photos: "photos",
    votes: "votes",
    viewAnalytics: "Results",
    deleteAlbum: "Delete",
    sharedWithMe: "Shared with me",
    sharedBy: "Shared by",
    shareAlbum: "Share album",
    shareWithUser: "Share with user (username or email)",
    shareSuccess: "Album shared",
    revokeAccess: "Revoke access",
    sharedAccess: "Shared access",
    noSharedAlbums: "No albums shared with you yet",

    swipeHint: "Swipe right to like · left to skip",
    allDone: "You've rated all photos!",
    allDoneSubtitle: "Thanks for your votes",
    viewResults: "See results",
    swipeRemaining: "left",

    // New: expandable description
    seeMore: "See more",
    seeLess: "See less",

    // Analytics
    winner: "Winner",
    winnerBadge: "🏆 Best Shot",
    likes: "Likes",
    dislikes: "Dislikes",
    totalVotes: "Votes",
    likeRate: "Like rate",
    globalLikeRate: "Global like rate",
    uniqueVoters: "Voters",
    noVotes: "No votes yet",
    analyticsTitle: "All photos",
    backToAlbums: "My albums",
    // Sort & filter (button labels)
    sort: "Sort",
    filterBy: "Filter",
    // Sort sheet options
    sortMostLikes: "Most Likes",
    sortMostDislikes: "Most Dislikes",
    // View toggle inside sort sheet
    gridView: "Grid",
    listView: "List",
    // Filter sheet
    filterByVoter: "Filter by voter",
    noVoters: "No voters yet",
    selectVoters: "Select voters to filter",
    clearFilter: "Clear",
    applyFilter: "Apply",
    // Kept for backwards compat
    sortBy: "Sort by",
    sortLikesDesc: "Most liked",
    sortLikesAsc: "Least liked",
    sortDislikesDesc: "Most disliked",
    filterAll: "All",
    filterLiked: "Liked only",
    filterDisliked: "Disliked only",
    views: "Views",
    voters: "Voters",
    reactions: "Reactions",
    noReactions: "No reactions yet",
    share: "Share",
    shareTitle: "Check out this album on PicMatch",

    heroTitle: "Pick the best photo.",
    heroSubtitle: "Swipe right to like, left to pass. Your community crowns the winner.",
    getStarted: "Get started free",
    howItWorks: "How it works",
    step1Title: "Upload your album",
    step1Desc: "Add your photos and get a unique invite link in seconds.",
    step2Title: "Share & collect votes",
    step2Desc: "Send the link to friends, clients, or your audience.",
    step3Title: "Discover the winner",
    step3Desc: "The photo with the most likes wins — backed by full analytics.",

    errorGeneric: "Something went wrong. Please try again.",
    errorNotFound: "Page not found",
    errorAlbumNotFound: "Album not found or link has expired",

    notifications: "Notifications",
    replies: "Replies",
    inbox: "Inbox",
    inboxDetails: "Activity and notifications",
    allCaughtUp: "You're all caught up!",
    noNewNotifs: "No new notifications right now.",
    Comments: "Comments",
    recentlyVisited: "Recently Visited",
    noRecentAlbums: "Albums you visit will appear here",
    viewMyComments: "my thread",
  },

  ru: {
    appName: "PicMatch",
    login: "Войти",
    register: "Регистрация",
    logout: "Выйти",
    dashboard: "Мои альбомы",
    createAlbum: "Новый альбом",

    email: "Email",
    username: "Имя пользователя",
    password: "Пароль",
    alreadyHaveAccount: "Уже есть аккаунт?",
    dontHaveAccount: "Нет аккаунта?",
    loginTitle: "С возвращением",
    loginSubtitle: "Войдите, чтобы продолжить",
    registerTitle: "Создать аккаунт",
    registerSubtitle: "Присоединяйтесь к PicMatch — бесплатно",

    albumTitle: "Название альбома",
    albumDescription: "Описание (необязательно)",
    uploadPhotos: "Загрузить фото",
    uploadDrag: "Перетащите фото сюда или нажмите для выбора",
    uploadHint: "JPEG, PNG, WebP · до 10 МБ каждое",
    createAlbumBtn: "Создать альбом",
    inviteLink: "Ссылка-приглашение",
    copyLink: "Копировать",
    copied: "Скопировано!",
    myAlbums: "Мои альбомы",
    noAlbums: "Альбомов пока нет — создайте первый",
    photos: "фото",
    votes: "голосов",
    viewAnalytics: "Результаты",
    deleteAlbum: "Удалить",
    sharedWithMe: "Поделились со мной",
    sharedBy: "Поделился",
    shareAlbum: "Поделиться альбомом",
    shareWithUser: "Поделиться (имя пользователя или email)",
    shareSuccess: "Альбом открыт",
    revokeAccess: "Отозвать доступ",
    sharedAccess: "Общий доступ",
    noSharedAlbums: "Вам ещё не поделились альбомами",

    swipeHint: "Вправо — нравится · влево — пропустить",
    allDone: "Вы оценили все фото!",
    allDoneSubtitle: "Спасибо за ваши голоса",
    viewResults: "Посмотреть результаты",
    swipeRemaining: "осталось",

    seeMore: "Подробнее",
    seeLess: "Свернуть",

    winner: "Победитель",
    winnerBadge: "🏆 Лучший кадр",
    likes: "Лайки",
    dislikes: "Дизлайки",
    totalVotes: "Голосов",
    likeRate: "Рейтинг",
    globalLikeRate: "Общий рейтинг",
    uniqueVoters: "Голосующих",
    noVotes: "Пока нет голосов",
    analyticsTitle: "Все фото",
    backToAlbums: "Мои альбомы",
    sort: "Сортировка",
    filterBy: "Фильтр",
    sortMostLikes: "Больше лайков",
    sortMostDislikes: "Больше дизлайков",
    gridView: "Сетка",
    listView: "Список",
    filterByVoter: "Фильтр по голосующему",
    noVoters: "Голосующих пока нет",
    selectVoters: "Выберите голосующих",
    clearFilter: "Сбросить",
    applyFilter: "Применить",
    sortBy: "Сортировка",
    sortLikesDesc: "Больше лайков",
    sortLikesAsc: "Меньше лайков",
    sortDislikesDesc: "Больше дизлайков",
    filterAll: "Все",
    filterLiked: "Только лайки",
    filterDisliked: "Только дизлайки",
    views: "Просмотры",
    voters: "Голосующие",
    reactions: "Реакции",
    noReactions: "Реакций пока нет",
    share: "Поделиться",
    shareTitle: "Посмотри этот альбом в PicMatch",

    heroTitle: "Выбери лучшее фото.",
    heroSubtitle: "Вправо — нравится, влево — нет. Сообщество выбирает победителя.",
    getStarted: "Начать бесплатно",
    howItWorks: "Как это работает",
    step1Title: "Загрузи альбом",
    step1Desc: "Добавь фотографии и получи уникальную ссылку за секунды.",
    step2Title: "Поделись и собери голоса",
    step2Desc: "Отправь ссылку друзьям, клиентам или своей аудитории.",
    step3Title: "Узнай победителя",
    step3Desc: "Фото с наибольшим числом лайков побеждает — с полной аналитикой.",

    errorGeneric: "Что-то пошло не так. Попробуйте ещё раз.",
    errorNotFound: "Страница не найдена",
    errorAlbumNotFound: "Альбом не найден или ссылка устарела",

    notifications: "Уведомления",
    replies: "Ответы",
    inbox: "Входящие",
    inboxDetails: "Уведомления об активности",
    allCaughtUp: "Отлично, всё прочитано!",
    noNewNotifs: "Сейчас нет новых уведомлений.",
    Comments: "Комментарии",
    recentlyVisited: "Недавно посещённые",
    noRecentAlbums: "Здесь появятся альбомы, которые вы посещали",
    viewMyComments: "мои комментарии",
  },
};

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(
    () => localStorage.getItem("picmatch_lang") || "en"
  );
  const setLanguage = (l) => { setLang(l); localStorage.setItem("picmatch_lang", l); };
  const t = (key) => T[lang]?.[key] ?? T.en[key] ?? key;
  return (
    <LangContext.Provider value={{ lang, setLanguage, t }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be inside LangProvider");
  return ctx;
};