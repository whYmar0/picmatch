/**
 * contexts/LangContext.jsx — Контекст локализации / Localization context
 * Поддержка русского и английского языков
 * Russian and English language support
 */

import { createContext, useContext, useState } from "react";

// ─── Translation strings ──────────────────────────────────────────────────────
const translations = {
  en: {
    // Nav
    appName: "PicMatch",
    tagline: "Find the perfect shot",
    login: "Log in",
    register: "Sign up",
    logout: "Log out",
    dashboard: "Dashboard",
    createAlbum: "Create Album",

    // Auth
    email: "Email",
    username: "Username",
    password: "Password",
    confirmPassword: "Confirm Password",
    role: "I am a...",
    roleCreator: "Creator",
    roleVoter: "Voter",
    alreadyHaveAccount: "Already have an account?",
    dontHaveAccount: "Don't have an account?",
    loginTitle: "Welcome back",
    loginSubtitle: "Sign in to your account",
    registerTitle: "Create account",
    registerSubtitle: "Join PicMatch today",

    // Album
    albumTitle: "Album title",
    albumDescription: "Description (optional)",
    uploadPhotos: "Upload Photos",
    uploadDrag: "Drag & drop photos here, or click to select",
    uploadHint: "JPEG, PNG, WebP up to 10MB each",
    createAlbumBtn: "Create Album",
    inviteLink: "Invite Link",
    copyLink: "Copy Link",
    copied: "Copied!",
    myAlbums: "My Albums",
    noAlbums: "You haven't created any albums yet",
    photos: "photos",
    votes: "votes",
    viewAnalytics: "View Results",
    deleteAlbum: "Delete Album",

    // Swipe
    swipeRight: "LIKE",
    swipeLeft: "NOPE",
    swipeHint: "Swipe right to like, left to dislike",
    allDone: "You've rated all photos!",
    allDoneSubtitle: "Thanks for your votes",
    viewResults: "See Results",
    swipeRemaining: "remaining",

    // Analytics
    winner: "Winner",
    winnerBadge: "🏆 Best Shot",
    likes: "Likes",
    dislikes: "Dislikes",
    totalVotes: "Total Votes",
    likeRate: "Like Rate",
    uniqueVoters: "Unique Voters",
    noVotes: "No votes yet",
    analyticsTitle: "Album Results",
    backToAlbums: "Back to Albums",

    // Landing
    heroTitle: "Pick the best photo.",
    heroSubtitle: "Swipe right to like, left to pass. Your community decides the winner.",
    getStarted: "Get started free",
    howItWorks: "How it works",
    step1Title: "Upload your album",
    step1Desc: "Add your photos and get a unique invite link in seconds.",
    step2Title: "Share & get votes",
    step2Desc: "Send the link to friends, clients, or your community.",
    step3Title: "See the winner",
    step3Desc: "The photo with the most likes wins — with full analytics.",

    // Errors
    errorGeneric: "Something went wrong",
    errorNotFound: "Page not found",
    errorAlbumNotFound: "Album not found or link has expired",
  },
  ru: {
    // Nav
    appName: "PicMatch",
    tagline: "Найди лучший кадр",
    login: "Войти",
    register: "Регистрация",
    logout: "Выйти",
    dashboard: "Панель",
    createAlbum: "Создать альбом",

    // Auth
    email: "Email",
    username: "Имя пользователя",
    password: "Пароль",
    confirmPassword: "Подтвердите пароль",
    role: "Я являюсь...",
    roleCreator: "Создателем",
    roleVoter: "Голосующим",
    alreadyHaveAccount: "Уже есть аккаунт?",
    dontHaveAccount: "Нет аккаунта?",
    loginTitle: "С возвращением",
    loginSubtitle: "Войдите в свой аккаунт",
    registerTitle: "Создать аккаунт",
    registerSubtitle: "Присоединяйтесь к PicMatch",

    // Album
    albumTitle: "Название альбома",
    albumDescription: "Описание (необязательно)",
    uploadPhotos: "Загрузить фото",
    uploadDrag: "Перетащите фото сюда или нажмите для выбора",
    uploadHint: "JPEG, PNG, WebP до 10MB каждое",
    createAlbumBtn: "Создать альбом",
    inviteLink: "Ссылка-приглашение",
    copyLink: "Копировать",
    copied: "Скопировано!",
    myAlbums: "Мои альбомы",
    noAlbums: "Вы ещё не создали ни одного альбома",
    photos: "фото",
    votes: "голосов",
    viewAnalytics: "Смотреть результаты",
    deleteAlbum: "Удалить альбом",

    // Swipe
    swipeRight: "ЛАЙК",
    swipeLeft: "ПРОПУСТИТЬ",
    swipeHint: "Свайп вправо — нравится, влево — нет",
    allDone: "Вы оценили все фото!",
    allDoneSubtitle: "Спасибо за ваши голоса",
    viewResults: "Посмотреть результаты",
    swipeRemaining: "осталось",

    // Analytics
    winner: "Победитель",
    winnerBadge: "🏆 Лучший кадр",
    likes: "Лайки",
    dislikes: "Дизлайки",
    totalVotes: "Всего голосов",
    likeRate: "Рейтинг лайков",
    uniqueVoters: "Уникальных голосующих",
    noVotes: "Пока нет голосов",
    analyticsTitle: "Результаты альбома",
    backToAlbums: "К моим альбомам",

    // Landing
    heroTitle: "Выбери лучшее фото.",
    heroSubtitle: "Свайп вправо — нравится, влево — нет. Сообщество выбирает победителя.",
    getStarted: "Начать бесплатно",
    howItWorks: "Как это работает",
    step1Title: "Загрузи альбом",
    step1Desc: "Добавь фотографии и получи уникальную ссылку за несколько секунд.",
    step2Title: "Поделись и собери голоса",
    step2Desc: "Отправь ссылку друзьям, клиентам или своей аудитории.",
    step3Title: "Узнай победителя",
    step3Desc: "Фото с наибольшим числом лайков побеждает — с полной аналитикой.",

    // Errors
    errorGeneric: "Что-то пошло не так",
    errorNotFound: "Страница не найдена",
    errorAlbumNotFound: "Альбом не найден или ссылка устарела",
  },
};

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("picmatch_lang") || "en");

  const setLanguage = (l) => {
    setLang(l);
    localStorage.setItem("picmatch_lang", l);
  };

  const t = (key) => translations[lang]?.[key] ?? translations.en[key] ?? key;

  return (
    <LangContext.Provider value={{ lang, setLanguage, t, isRu: lang === "ru" }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
};
