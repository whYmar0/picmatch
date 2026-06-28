"""
main.py - FastAPI application entry point
"""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db
from routers import albums, auth_router, comments, notifications, shared_access, votes
from cloudinary_utils import setup_cloudinary, is_cloudinary_configured as cloudinary_enabled

BASE_DIR = Path(__file__).resolve().parent
raw_upload_dir = os.getenv("UPLOAD_DIR", "./uploads")
if Path(raw_upload_dir).is_absolute():
    UPLOAD_DIR = Path(raw_upload_dir)
else:
    UPLOAD_DIR = BASE_DIR / raw_upload_dir
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger("pickmatch")


def _parse_origins(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    setup_cloudinary()
    if cloudinary_enabled():
        logger.info("Cloudinary configured — images will be uploaded to cloud storage.")
    elif os.getenv("ENVIRONMENT", "").lower() == "production":
        logger.warning(
            "Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, "
            "and CLOUDINARY_API_SECRET for persistent image storage on Render."
        )
    logger.info("Database ready; uploads directory: %s", UPLOAD_DIR)
    yield


app = FastAPI(
    title="Pickmatch API",
    description="Photo rating platform with swipe voting, shared access, and comments.",
    version="2.0.0",
    lifespan=lifespan,
)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
allowed_origins = _parse_origins(os.getenv("CORS_ORIGINS"))
if frontend_url not in allowed_origins:
    allowed_origins.append(frontend_url)
if os.getenv("DEBUG", "false").lower() == "true":
    for origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
        if origin not in allowed_origins:
            allowed_origins.append(origin)

allow_origin_regex = None
if os.getenv("CORS_ALLOW_REGEX", "").strip():
    allow_origin_regex = os.getenv("CORS_ALLOW_REGEX").strip()
elif os.getenv("ENVIRONMENT", "").lower() == "production":
    allow_origin_regex = r"https://.*\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.include_router(auth_router.router, prefix="/api")
app.include_router(albums.router, prefix="/api")
app.include_router(votes.router, prefix="/api")
app.include_router(shared_access.router, prefix="/api")
app.include_router(comments.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")


@app.get("/api/health", tags=["System"])
async def health():
    return {
        "status": "healthy",
        "version": "2.0.0",
        "uploads_directory": str(UPLOAD_DIR),
        "uploads_writable": os.access(UPLOAD_DIR, os.W_OK),
    }


@app.get("/", tags=["System"])
async def root():
    return {"message": "Pickmatch API v2", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("DEBUG", "false").lower() == "true",
    )
