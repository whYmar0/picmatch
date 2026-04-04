# 📸 PicMatch

> **EN:** A photo-rating platform where creators upload albums and invited users vote using a Tinder-like swipe interface to determine the best shot.
>
> **RU:** Платформа для рейтинга фотографий, где создатели загружают альбомы, а приглашённые пользователи голосуют с помощью свайп-интерфейса в стиле Tinder, чтобы выбрать лучший кадр.

---

## 🌐 Live Demo / Демо
- Frontend (Vercel): `https://picmatch.vercel.app`
- Backend (Render): `https://picmatch-api.onrender.com`

---

## ✨ Features / Возможности

| Feature | EN | RU |
|---|---|---|
| 🔐 Auth | JWT-based registration & login for Creators and Voters | Регистрация и вход на JWT для Создателей и Голосующих |
| 🖼️ Albums | Upload up to 50 photos, get a unique invite link | Загрузка до 50 фото, уникальная ссылка-приглашение |
| 👆 Swipe | Tinder-style card swipe (right = like, left = dislike) | Свайп в стиле Tinder (вправо = лайк, влево = нет) |
| 📊 Analytics | Per-photo stats, winner highlight, like % | Статистика по фото, победитель, % лайков |
| 🌗 Theme | Full light / dark mode | Полная поддержка светлой и тёмной темы |
| 🌍 i18n | English and Russian UI | Интерфейс на английском и русском |
| 📱 Mobile | Mobile-first responsive design | Адаптивный дизайн с приоритетом мобильных |

---

## 🗂 Project Structure / Структура проекта

```
picmatch/
├── backend/                  # Python FastAPI
│   ├── main.py               # App entry point / Точка входа
│   ├── database.py           # DB engine + session / Движок и сессии БД
│   ├── models.py             # SQLAlchemy ORM models / Модели ORM
│   ├── schemas.py            # Pydantic schemas / Схемы Pydantic
│   ├── auth.py               # JWT utilities / Утилиты JWT
│   ├── routers/
│   │   ├── auth_router.py    # /api/auth routes
│   │   ├── albums.py         # /api/albums routes
│   │   └── votes.py          # /api/votes routes
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/                 # React + Vite + Tailwind
    ├── src/
    │   ├── api/index.js       # Axios client / Клиент Axios
    │   ├── contexts/
    │   │   ├── AuthContext.jsx
    │   │   ├── ThemeContext.jsx
    │   │   └── LangContext.jsx
    │   ├── components/
    │   │   ├── Navbar.jsx
    │   │   ├── SwipeCard.jsx      # ⭐ Core swipe mechanic
    │   │   ├── AlbumSummary.jsx   # ⭐ Analytics display
    │   │   ├── AlbumCard.jsx
    │   │   ├── ProtectedRoute.jsx
    │   │   └── LoadingSpinner.jsx
    │   ├── pages/
    │   │   ├── Landing.jsx
    │   │   ├── Login.jsx
    │   │   ├── Register.jsx
    │   │   ├── Dashboard.jsx      # Creator dashboard
    │   │   ├── CreateAlbum.jsx    # Upload + drag-drop
    │   │   ├── VotePage.jsx       # ⭐ Swipe interface
    │   │   └── AnalyticsPage.jsx
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── tailwind.config.js
    ├── vite.config.js
    └── .env.example
```

---

## 🚀 Local Setup / Локальная установка

### Prerequisites / Требования
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ (or Docker)

---

### Backend

```bash
# 1. Navigate / Перейти
cd picmatch/backend

# 2. Create virtual environment / Создать виртуальное окружение
python -m venv venv
source venv/bin/activate      # Linux/macOS
venv\Scripts\activate         # Windows

# 3. Install dependencies / Установить зависимости
pip install -r requirements.txt

# 4. Set up environment / Настроить окружение
cp .env.example .env
# Edit .env with your database credentials

# 5. Create PostgreSQL database / Создать базу данных
psql -U postgres -c "CREATE DATABASE picmatch;"

# 6. Run / Запустить
uvicorn main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs`

---

### Frontend

```bash
# 1. Navigate / Перейти
cd picmatch/frontend

# 2. Install / Установить
npm install

# 3. Environment / Окружение
cp .env.example .env

# 4. Run / Запустить
npm run dev
```

App available at: `http://localhost:5173`

---

### Quick Start with Docker / Быстрый старт с Docker

```bash
# From project root / Из корня проекта
docker compose up --build
```

---

## 📡 API Reference / Справочник API

### Authentication — `/api/auth`

| Method | Endpoint | Description | Описание |
|--------|----------|-------------|----------|
| `POST` | `/register` | Register new user | Регистрация |
| `POST` | `/login` | Login, get JWT | Вход, получить JWT |
| `GET`  | `/me` | Current user info | Данные текущего пользователя |

**Register body:**
```json
{
  "email": "creator@example.com",
  "username": "photoman",
  "password": "secret123",
  "role": "creator"    // "creator" | "voter"
}
```

**Login response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": { "id": "uuid", "username": "photoman", "role": "creator" }
}
```

---

### Albums — `/api/albums`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/` | Creator | Create album (multipart/form-data) |
| `GET`  | `/my` | Creator | List my albums |
| `GET`  | `/invite/{code}` | Any | Get album by invite code |
| `GET`  | `/{id}/analytics` | Creator | Album vote analytics |
| `DELETE` | `/{id}` | Creator | Delete album |

**Create Album (multipart):**
```
title: "My Summer Shoot"
description: "Optional description"
photos: [file1.jpg, file2.jpg, ...]
```

---

### Votes — `/api/votes`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/` | Any | Cast a vote |
| `GET`  | `/session/{code}` | Any | Get session (voted IDs) |
| `GET`  | `/album/{id}/my-votes` | Any | My votes in album |

**Cast Vote body:**
```json
{
  "photo_id": "uuid-of-photo",
  "is_like": true
}
```

---

## 🗄 Database Schema / Схема базы данных

```
users          albums         photos         votes
─────────────  ─────────────  ─────────────  ─────────────
id (UUID PK)   id (UUID PK)   id (UUID PK)   id (UUID PK)
email          title          album_id (FK)  photo_id (FK)
username       description    filename       voter_id (FK)
hashed_pwd     invite_code    stored_fname   is_like
role           creator_id(FK) order          created_at
is_active      is_active      created_at
created_at     created_at
```

---

## 🎨 Design Tokens / Дизайн-токены

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#FFB347` | Buttons, accents |
| Surface Light | `#FAFAF8` | Page background |
| Surface Dark | `#141412` | Dark page bg |
| Card Light | `#FFFFFF` | Card background |
| Card Dark | `#1E1C1A` | Dark card bg |
| Font Display | Fraunces | Headings |
| Font Sans | Outfit | Body text |

---

## 🧪 Tech Stack / Технический стек

### Backend
- **FastAPI** — async Python web framework
- **SQLAlchemy 2.0** (async) — ORM
- **asyncpg** — async PostgreSQL driver
- **python-jose** — JWT tokens
- **passlib[bcrypt]** — password hashing

### Frontend
- **React 18** + **Vite 5**
- **Framer Motion** — swipe animations
- **Tailwind CSS 3** — utility styling
- **Lucide React** — icons
- **Axios** — HTTP client
- **react-dropzone** — file upload UX
- **react-hot-toast** — notifications

---

## 📄 License / Лицензия
MIT — feel free to use for portfolio projects / Свободно используйте для портфолио.
