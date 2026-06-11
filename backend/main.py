"""
main.py — FastAPI application entry point
"""
import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db
from routers import auth_router, albums, votes
from routers import shared_access, comments, notifications   # NEW

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    print("✅ Database ready")
    yield


app = FastAPI(
    title="Pickmatch API",
    description="Photo rating platform with swipe voting, shared access, and comments.",
    version="2.0.0",
    lifespan=lifespan,
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.include_router(auth_router.router,    prefix="/api")
app.include_router(albums.router,         prefix="/api")
app.include_router(votes.router,          prefix="/api")
app.include_router(shared_access.router,  prefix="/api")
app.include_router(comments.router,       prefix="/api")
app.include_router(notifications.router,  prefix="/api")   # NEW


@app.get("/api/health", tags=["System"])
async def health():
    return {"status": "healthy", "version": "2.0.0"}

@app.get("/", tags=["System"])
async def root():
    return {"message": "Pickmatch API v2", "docs": "/docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0",
                port=int(os.getenv("PORT", 8000)),
                reload=os.getenv("DEBUG", "false").lower() == "true")
