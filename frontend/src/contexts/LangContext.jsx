/**
 * contexts/LangContext.jsx — 100% bilingual translations (EN / RU)
 * Every key exists in both languages — no fallback mixing.
 */
import { createContext, useContext, useState } from "react";

const T = {
  en: {
    // ── App ──────────────────────────────────────────────────────────────────
    appName: "PicMatch",
    login: "Log in",
    register: "Sign up",
    logout: "Log out",
    dashboard: "My Albums",
    createAlbum: "New Album",

    // ── Auth ─────────────────────────────────────────────────────────────────
    email: "Email",
    username: "Username",
    password: "Password",
    alreadyHaveAccount: "Already have an account?",
    dontHaveAccount: "No account yet?",
    loginTitle: "Welcome back",
    loginSubtitle: "Sign in to continue",
    registerTitle: "Create account",
    registerSubtitle: "Join PicMatch — it's free",

    // ── Album ─────────────────────────────────────────────────────────────────
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

    // ── Swipe ─────────────────────────────────────────────────────────────────
    swipeHint: "Swipe right to like · left to skip",
    allDone: "You rated all photos!",
    allDoneSubtitle: "Thanks for voting",
    viewResults: "See results",
    swipeRemaining: "left",

    // ── Analytics / Summary ──────────────────────────────────────────────────
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
    sortBy: "Sort by",
    sortLikesDesc: "Most liked",
    sortLikesAsc: "Least liked",
    sortDislikesDesc: "Most disliked",
    filterAll: "All",
    filterLiked: "Liked only",
    filterDisliked: "Disliked only",
    gridView: "Grid",
    listView: "List",
    views: "Views",
    voters: "Voters",
    reactions: "Reactions",
    noReactions: "No reactions yet",
    share: "Share",
    shareTitle: "Check out this album on PicMatch",

    // ── Landing ───────────────────────────────────────────────────────────────
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

    // ── Errors ────────────────────────────────────────────────────────────────
    errorGeneric: "Something went wrong. Please try again.",
    errorNotFound: "Page not found",
    errorAlbumNotFound: "Album not found or link has expired",
  },

  ru: {
    // ── App ──────────────────────────────────────────────────────────────────
    appName: "PicMatch",
    login: "Войти",
    register: "Регистрация",
    logout: "Выйти",
    dashboard: "Мои альбомы",
    createAlbum: "Новый альбом",

    // ── Auth ─────────────────────────────────────────────────────────────────
    email: "Email",
    username: "Имя пользователя",
    password: "Пароль",
    alreadyHaveAccount: "Уже есть аккаунт?",
    dontHaveAccount: "Нет аккаунта?",
    loginTitle: "С возвращением",
    loginSubtitle: "Войдите, чтобы продолжить",
    registerTitle: "Создать аккаунт",
    registerSubtitle: "Присоединяйтесь к PicMatch — бесплатно",

    // ── Album ─────────────────────────────────────────────────────────────────
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

    // ── Swipe ─────────────────────────────────────────────────────────────────
    swipeHint: "Вправо — нравится · влево — пропустить",
    allDone: "Вы оценили все фото!",
    allDoneSubtitle: "Спасибо за ваши голоса",
    viewResults: "Посмотреть результаты",
    swipeRemaining: "осталось",

    // ── Analytics / Summary ──────────────────────────────────────────────────
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
    sortBy: "Сортировка",
    sortLikesDesc: "Больше лайков",
    sortLikesAsc: "Меньше лайков",
    sortDislikesDesc: "Больше дизлайков",
    filterAll: "Все",
    filterLiked: "Только лайки",
    filterDisliked: "Только дизлайки",
    gridView: "Сетка",
    listView: "Список",
    views: "Просмотры",
    voters: "Голосующие",
    reactions: "Реакции",
    noReactions: "Реакций пока нет",
    share: "Поделиться",
    shareTitle: "Посмотри этот альбом в PicMatch",

    // ── Landing ───────────────────────────────────────────────────────────────
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

    // ── Errors ────────────────────────────────────────────────────────────────
    errorGeneric: "Что-то пошло не так. Попробуйте ещё раз.",
    errorNotFound: "Страница не найдена",
    errorAlbumNotFound: "Альбом не найден или ссылка устарела",
  },
};

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(
    () => localStorage.getItem("picmatch_lang") || "en"
  );

  const setLanguage = (l) => {
    setLang(l);
    localStorage.setItem("picmatch_lang", l);
  };

  // t() never returns undefined — always has both EN and RU for every key
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
