# 🚀 PicMatch — Deployment Guide / Руководство по деплою

> Step-by-step instructions for deploying PicMatch for free using **Render** (backend) and **Vercel** (frontend).
>
> Пошаговые инструкции для бесплатного деплоя PicMatch с помощью **Render** (бэкенд) и **Vercel** (фронтенд).

---

## 📋 Table of Contents / Содержание

1. [Prerequisites](#prerequisites)
2. [Database (Supabase)](#1-database--supabase)
3. [Backend on Render](#2-backend--render)
4. [Frontend on Vercel](#3-frontend--vercel)
5. [Connect Frontend ↔ Backend](#4-connect-frontend--backend)
6. [Custom Domain (Optional)](#5-custom-domain-optional)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

You will need free accounts at:

| Service | URL | Purpose |
|---------|-----|---------|
| GitHub | github.com | Source code hosting |
| Supabase | supabase.com | Free PostgreSQL database |
| Render | render.com | Backend hosting |
| Vercel | vercel.com | Frontend hosting |

---

## 1. Database — Supabase

Supabase provides a free PostgreSQL database with a generous free tier.

### Steps / Шаги:

1. Go to [supabase.com](https://supabase.com) → **Start your project**
2. Create a new project, choose a region close to your users
3. Wait ~2 minutes for provisioning
4. Go to **Project Settings → Database**
5. Scroll to **Connection string → URI** tab
6. Copy the string — it looks like:
   ```
   postgresql://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   ```
7. **Important:** Replace `postgresql://` with `postgresql+asyncpg://` for async SQLAlchemy
   ```
   postgresql+asyncpg://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   ```

> **RU:** Supabase предоставляет бесплатный PostgreSQL. Скопируйте строку подключения и замените `postgresql://` на `postgresql+asyncpg://` для асинхронного SQLAlchemy.

---

## 2. Backend — Render

Render's free tier supports Python web services with automatic deploys from GitHub.

### 2.1 Push to GitHub / Загрузить на GitHub

```bash
# Initialize git in the project root / Инициализировать git
git init
git add .
git commit -m "feat: initial PicMatch MVP"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/picmatch.git
git push -u origin main
```

### 2.2 Create Render Web Service / Создать веб-сервис на Render

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repository
3. Configure the service:

| Setting | Value |
|---------|-------|
| **Name** | `picmatch-api` |
| **Root Directory** | `backend` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Plan** | Free |

### 2.3 Set Environment Variables / Переменные окружения

In Render dashboard → **Environment** tab, add:

```env
DATABASE_URL       = postgresql+asyncpg://postgres.[ref]:[pwd]@...supabase.com:5432/postgres
SECRET_KEY         = <generate with: python -c "import secrets; print(secrets.token_hex(32))">
BASE_URL           = https://picmatch-api.onrender.com
FRONTEND_URL       = https://picmatch.vercel.app
UPLOAD_DIR         = /tmp/uploads
ACCESS_TOKEN_EXPIRE_MINUTES = 10080
DEBUG              = false
```

> **⚠️ Note / Примечание:** Render's free tier uses an ephemeral filesystem — uploaded images will be lost on restart.
> For production, use **Cloudflare R2**, **AWS S3**, or **Supabase Storage** for file storage.
> For an MVP/portfolio, the current file-based approach works for demos.

### 2.4 Deploy / Деплой

Click **Create Web Service**. Render will:
1. Clone your repo
2. Install dependencies
3. Start the server
4. Auto-deploy on every `git push`

Your API will be live at: `https://picmatch-api.onrender.com`
API docs: `https://picmatch-api.onrender.com/docs`

> **RU:** После создания сервиса Render автоматически развернёт API. Каждый `git push` триггерит новый деплой.

---

## 3. Frontend — Vercel

Vercel is purpose-built for frontend apps and has an excellent free tier.

### 3.1 Prepare environment file / Подготовить файл окружения

Create `frontend/.env.production`:
```env
VITE_API_URL=https://picmatch-api.onrender.com/api
```

Commit and push / Зафиксировать и запушить:
```bash
git add frontend/.env.production
git commit -m "chore: add production env"
git push
```

### 3.2 Deploy to Vercel / Деплой на Vercel

**Option A — Vercel CLI (recommended):**
```bash
# Install CLI / Установить CLI
npm i -g vercel

# Deploy from frontend directory / Деплой из папки frontend
cd frontend
vercel

# Follow prompts:
# → Set up and deploy? Yes
# → Which scope? Your account
# → Link to existing project? No
# → Project name: picmatch
# → Root directory: ./ (we're already in frontend/)
# → Build command: npm run build
# → Output directory: dist
```

**Option B — Vercel Dashboard:**
1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repository
3. Set **Root Directory** to `frontend`
4. Framework Preset: **Vite**
5. Add environment variable:
   - `VITE_API_URL` = `https://picmatch-api.onrender.com/api`
6. Click **Deploy**

Your frontend will be live at: `https://picmatch.vercel.app`

> **RU:** Vercel автоматически определит Vite и настроит сборку. Каждый `git push` в `main` запускает новый деплой.

---

## 4. Connect Frontend ↔ Backend

### Update CORS on Render / Обновить CORS на Render

After getting your Vercel URL, update the Render environment variable:
```env
FRONTEND_URL = https://your-actual-app.vercel.app
```

Then trigger a redeploy on Render (Dashboard → Manual Deploy).

### Update BASE_URL links / Обновить ссылки BASE_URL

In Render environment variables:
```env
BASE_URL = https://picmatch-api.onrender.com
```

This is used to generate invite URLs pointing to the correct frontend:
```
https://picmatch.vercel.app/vote/{invite_code}
```

---

## 5. Custom Domain (Optional)

### Vercel (Frontend)
1. Dashboard → Your project → **Settings → Domains**
2. Add your domain (e.g., `picmatch.app`)
3. Update DNS records as instructed
4. SSL certificate is provisioned automatically

### Render (Backend)
1. Dashboard → Your service → **Settings → Custom Domains**
2. Add domain (e.g., `api.picmatch.app`)
3. Update DNS CNAME record
4. Free SSL via Let's Encrypt

---

## 6. File Storage in Production (Optional Upgrade)

For a production-ready file storage solution, replace the local file system with **Cloudflare R2** (free tier: 10GB/month):

### Install SDK:
```bash
pip install boto3
```

### Update `routers/albums.py`:
```python
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url=os.getenv("R2_ENDPOINT"),
    aws_access_key_id=os.getenv("R2_ACCESS_KEY"),
    aws_secret_access_key=os.getenv("R2_SECRET_KEY"),
)

# Replace file write with:
s3.put_object(
    Bucket=os.getenv("R2_BUCKET"),
    Key=stored_name,
    Body=content,
    ContentType=photo_file.content_type,
)

# URL becomes:
f"https://{os.getenv('R2_PUBLIC_DOMAIN')}/{stored_name}"
```

### Add Render env vars:
```env
R2_ENDPOINT    = https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY  = your_key
R2_SECRET_KEY  = your_secret
R2_BUCKET      = picmatch-uploads
R2_PUBLIC_DOMAIN = pub-xxx.r2.dev
```

---

## 🐳 Docker Compose (Local Full-Stack)

Create `docker-compose.yml` in project root:

```yaml
version: "3.9"
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: picmatch
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@db:5432/picmatch
      SECRET_KEY: local-dev-secret-key-32-chars-minimum
      BASE_URL: http://localhost:8000
      FRONTEND_URL: http://localhost:5173
    volumes:
      - ./backend:/app
      - uploads:/app/uploads
    depends_on:
      - db
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:8000/api
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  pgdata:
  uploads:
```

Create `backend/Dockerfile`:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Create `frontend/Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json .
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
```

Run everything:
```bash
docker compose up --build
```

---

## 🔧 Troubleshooting / Устранение проблем

| Problem | Solution / Решение |
|---------|-------------------|
| `CORS error` | Add your Vercel URL to `FRONTEND_URL` env var on Render and redeploy |
| `asyncpg cannot connect` | Check `DATABASE_URL` uses `postgresql+asyncpg://` not `postgresql://` |
| `401 Unauthorized` | Token expired — re-login. Check `SECRET_KEY` matches across deploys |
| `Images not loading` | Check `BASE_URL` on Render. For production use R2/S3 |
| `Render sleeps (free tier)` | Free tier sleeps after 15min. Use a cron ping service like [cron-job.org](https://cron-job.org) |
| `Vite build fails` | Run `npm run build` locally first to catch errors before deploying |
| `DB tables not created` | Tables auto-create on startup via `init_db()`. Check Render logs |

### Checking Render Logs / Просмотр логов Render

```
Render Dashboard → Your Service → Logs tab
```

### Checking Vercel Build Logs / Просмотр логов сборки Vercel

```
Vercel Dashboard → Your Project → Deployments → Click latest → Build Logs
```

---

## ✅ Deployment Checklist / Чеклист деплоя

- [ ] GitHub repo created and code pushed
- [ ] Supabase database created, connection string copied
- [ ] Render service created with all env vars set
- [ ] Backend health check passes: `GET /api/health` → `{"status": "healthy"}`
- [ ] Vercel project created with `VITE_API_URL` set
- [ ] Frontend loads without console CORS errors
- [ ] Test register → create album → copy invite link → vote → view analytics
- [ ] (Optional) Custom domain configured on Vercel and Render

---

*Built with ❤️ for portfolio use. MIT License.*
