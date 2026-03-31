"""
main.py — Точка входа FastAPI приложения / FastAPI application entry point
PicMatch — Photo Rating Platform / Платформа для рейтинга фотографий
"""

import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db
from routers import auth_router, albums, votes

# ─── Upload directory ────────────────────────────────────────────────────────
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ─── Lifespan (startup/shutdown) ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Инициализация при старте / Initialize on startup"""
    await init_db()
    print("✅ Database tables created / Таблицы БД созданы")
    yield
    print("👋 Application shutting down / Завершение работы приложения")


# ─── App Instance ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="PicMatch API",
    description="""
## PicMatch — Photo Rating Platform / Платформа для рейтинга фотографий

Creators upload photo albums and share invite links.
Voters swipe through photos like Tinder to pick the best shots.

Создатели загружают альбомы и делятся ссылками-приглашениями.
Голосующие листают фото как в Tinder, выбирая лучший кадр.
    """,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


# ─── CORS Middleware ──────────────────────────────────────────────────────────
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000", "https://*.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Static Files (uploaded images) ──────────────────────────────────────────
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


# ─── Routers ─────────────────────────────────────────────────────────────────
app.include_router(auth_router.router, prefix="/api")
app.include_router(albums.router, prefix="/api")
app.include_router(votes.router, prefix="/api")


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["System"])
async def health_check():
    """Проверка работоспособности / Health check"""
    return {
        "status": "healthy",
        "service": "PicMatch API",
        "version": "1.0.0",
    }


@app.get("/", tags=["System"])
async def root():
    return {
        "message": "Welcome to PicMatch API! / Добро пожаловать в PicMatch API!",
        "docs": "/docs",
        "redoc": "/redoc",
    }


# ─── Run directly ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("DEBUG", "false").lower() == "true",
    )
