"""
main.py - FastAPI application entry point
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from database import init_db, AsyncSessionLocal
from middleware.rate_limit import limiter, custom_rate_limit_exceeded_handler
from routers import albums, auth_router, comments, notifications, shared_access, share_links, votes
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


async def _pending_upload_cleanup_loop():
    """Periodically remove abandoned pre-uploaded media."""
    from routers.albums import _cleanup_expired_pending_uploads

    while True:
        try:
            async with AsyncSessionLocal() as db:
                await _cleanup_expired_pending_uploads(db)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Pending upload cleanup failed")
        await asyncio.sleep(15 * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    setup_cloudinary()
    cleanup_task = asyncio.create_task(_pending_upload_cleanup_loop())
    if cloudinary_enabled():
        logger.info("Cloudinary configured — images will be uploaded to cloud storage.")
    elif os.getenv("ENVIRONMENT", "").lower() == "production":
        logger.warning(
            "Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, "
            "and CLOUDINARY_API_SECRET for persistent image storage on Render."
        )
    logger.info("Database ready; uploads directory: %s", UPLOAD_DIR)
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="Pickmatch API",
    description="Photo rating platform with swipe voting, shared access, and comments.",
    version="2.0.0",
    lifespan=lifespan,
)

# ─── Security headers (OWASP A05) ───────────────────────────────────────────
# Applied as the OUTERMOST middleware (registered before CORS/SlowAPI) so that
# every response — including CORS preflights, 429 rate-limit responses, and
# Swagger UI pages — gets the same hardening. See
# .agents/skills/performing-security-headers-audit/SKILL.md for methodology.
# Dev vs prod CSP differs: dev allows Vite HMR (unsafe-eval, ws://, inline
# styles); prod is strict. HSTS only fires in prod (HTTPS-only there).
_CSP_PROD = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob: https://res.cloudinary.com; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "connect-src 'self' https://*.vercel.app; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'"
)
_CSP_DEV = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-eval'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob: https://res.cloudinary.com; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "connect-src 'self' http://localhost:8000 ws://localhost:5173 wss://localhost:5173; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'"
)
# Swagger UI / ReDoc load from cdn.jsdelivr.net and rely on inline scripts.
# Strict prod CSP blocks them entirely; a relaxed policy keeps /docs usable
# without weakening protection of the API surface.
_CSP_SWAGGER = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://cdn.jsdelivr.net; "
    "font-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "object-src 'none'"
)


def _csp_for(path: str, is_dev: bool) -> str:
    if path.startswith(("/docs", "/redoc", "/openapi.json")):
        return _CSP_SWAGGER
    return _CSP_DEV if is_dev else _CSP_PROD


@app.middleware("http")
async def security_headers(request, call_next):
    resp = await call_next(request)
    is_dev = os.getenv("DEBUG", "false").lower() == "true"

    # HSTS — 1 year, includeSubDomains, NOT preload yet. After ~1 month of
    # stable production traffic, bump to max-age=63072000 (2y) and add
    # `; preload` to qualify for the Chrome HSTS preload list. Submitting
    # too early risks lockout if a subdomain ever needs HTTP for health
    # probes or similar.
    if not is_dev:
        resp.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

    # Clickjacking (legacy + modern: X-Frame-Options is belt-and-suspenders for
    # the CSP frame-ancestors directive which not all old browsers honour).
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Modern CSP supersedes the legacy XSS auditor; explicitly disable to
    # avoid a buggy fallback path in old browsers.
    resp.headers["X-XSS-Protection"] = "0"
    # NOTE on "Server" header: uvicorn's protocol layer hardcodes
    # "Server: uvicorn" in HttpToolsProtocol._get_default_headers, AFTER ASGI
    # middleware finishes. Setting it in resp.headers above would be a no-op
    # in production. The fix lives in two places:
    #   - Dockerfile CMD: --no-server-header --header 'server: Pickmatch'
    #   - if __name__ == "__main__" block: server_header=False + headers=[...]
    # TestClient (in-process) does not add a default Server header, so
    # security-headers tests do not cover the production behaviour — verify
    # via curl -I https://api.picmatch.com/api/health post-deploy.

    # Tab-isolation: prevents malicious sites that open a popup referencing
    # our domain from getting a window.opener reference. Free, no downside.
    resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"

    # Disable powerful browser features the app does not use. clipboard-write
    # stays open (explicit allow-self) so "Copy invite link" / share-link
    # flows keep working. NOTE: Swagger UI's /docs /redoc /openapi.json get
    # the relaxed _CSP_SWAGGER above; this middleware runs after the path
    # check, so COOP still applies to those pages (harmless).
    resp.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), "
        "interest-cohort=(), payment=(), usb=(), "
        "clipboard-write=(self)"
    )

    resp.headers["Content-Security-Policy"] = _csp_for(request.url.path, is_dev)
    return resp


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

# Register the limiter on app.state so @limiter.limit() decorators in routers
# can find it via `request.app.state.limiter`. The exception handler converts
# slowapi's RateLimitExceeded into a clean 429 JSON response.
app.state.limiter = limiter
# Use the project's custom 429 handler -- it returns a generic
# "Too many requests" detail + Retry-After header, instead of slowapi's
# default which echoes back the configured limit string (a fingerprint
# adversaries can use to probe-and-time our rate limits).
app.add_exception_handler(RateLimitExceeded, custom_rate_limit_exceeded_handler)
# SlowAPIMiddleware injects X-RateLimit-Limit / X-RateLimit-Remaining /
# X-RateLimit-Reset headers on every response so clients can self-throttle.
app.add_middleware(SlowAPIMiddleware)

app.include_router(auth_router.router, prefix="/api")
app.include_router(albums.router, prefix="/api")
app.include_router(votes.router, prefix="/api")
app.include_router(shared_access.router, prefix="/api")
app.include_router(share_links.router, prefix="/api")
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

    # proxy_headers=True + forwarded_allow_ips=<env-trusted-list> per the
    # security audit. Naive "*" lets clients forge X-Forwarded-For and
    # bypass per-IP rate limits. Empty TRUSTED_PROXY_IPS falls back to
    # "127.0.0.1" (no XFF trust on prod, local LB on dev).
    trusted_proxies = os.getenv("TRUSTED_PROXY_IPS", "").strip() or "127.0.0.1"
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("DEBUG", "false").lower() == "true",
        proxy_headers=True,
        forwarded_allow_ips=trusted_proxies,
        # Strip framework fingerprint. uvicorn hardcodes "Server: uvicorn"
        # at the ASGI protocol layer; --no-server-header removes it and our
        # custom header replaces it. See security_headers middleware for
        # the same constraint in production. The Dockerfile CMD applies
        # the same flags when running under Render.
        server_header=False,
        headers=[("server", "Pickmatch")],
    )
