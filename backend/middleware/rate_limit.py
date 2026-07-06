"""
middleware/rate_limit.py - Rate limiter setup shared across routers.

Library : slowapi (FastAPI-native decorator-based rate limiting, built on `limits`).
Storage  : in-memory dict (single Render instance). Swap to Redis by passing
           `storage_uri=os.getenv("RATE_LIMIT_STORAGE_URI", "memory://")`.
Key      : hybrid (valid JWT-sub first, remote IP fallback).
Limits   : every RATE_LIMIT_* env var is validated at module import via
           `_get_limit`; bad values fall back to the default and emit a
           WARNING -- never crash startup.
"""
import logging
import os
import time
from functools import lru_cache

# starlette.config.Config is monkey-patched BEFORE slowapi is imported
# below, because slowapi internally calls Config() at Limiter.__init__
# time. Slowapi opens `.env` with the OS-preferred encoding, which
# crashes on Windows (cp1252) when our `.env` contains UTF-8 bytes
# (Cyrillic / box-drawing / em-dashes). Making `_read_file` a no-op
# avoids the disk read entirely. Our rate-limit values come from
# `os.getenv(...)` via `_get_limit`, so losing the .env read costs
# nothing.
# See SKILL.md -- known issue with slowapi < 0.1.11.
import starlette.config as _starlette_config
from fastapi import Request
from fastapi.responses import JSONResponse
from limits import parse as _limits_parse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from auth import decode_token

logger = logging.getLogger("pickmatch")


def _no_read_file(self, *args, **kwargs):
    """No-op stand-in for starlette's Config._read_file.

    Slowapi / starlette calls this to read `.env`. Returning an empty
    dict means Config is constructed harmlessly regardless of disk
    contents or locale encoding. Rate-limit values come from
    `os.getenv(...)` via `_get_limit`, so we don't lose anything by
    skipping the .env read here.
    """
    return {}


_starlette_config.Config._read_file = _no_read_file


def _get_limit(env_var: str, default: str) -> str:
    """Read a rate-limit environment var with defensive parsing.

    Pattern in routers:

        from middleware.rate_limit import _get_limit
        @limiter.limit(_get_limit("RATE_LIMIT_LOGIN", "5/minute"))
        async def login(request: Request, ...): ...

    A typo like `RATE_LIMIT_LOGIN=10pm` would otherwise raise inside
    slowapi at decorator evaluation time (module load). We catch it,
    log a WARNING, and fall back to the default -- so a misspelled env
    var on Render doesn't take down the whole API.
    """
    raw = os.getenv(env_var, default)
    try:
        _limits_parse(raw)
        return raw
    except (ValueError, TypeError, AttributeError) as exc:
        logger.warning(
            "Invalid rate-limit env %s=%r (%s); using default=%r instead.",
            env_var, raw, exc, default,
        )
        return default


@lru_cache(maxsize=4096)
def _cached_decode(token: str):
    """Cache decoded JWT payloads to avoid repaying HMAC verify on every
    rate-limited request. Returns None for invalid tokens (consistent
    with `auth.decode_token`). Enforces a 4096-byte cap so attackers
    can't burn CPU by sending megabyte-long malformed tokens.
    """
    if not token or len(token) > 4096:
        return None
    return decode_token(token)


def _hybrid_key(request: Request) -> str:
    """Rate-limit key derivation.

    Priority:
      1. If a valid Bearer JWT is present -> "user:<sub>" (canonical id).
      2. Otherwise -> "ip:<remote>".

    Using `sub` (canonical user id) rather than a raw-token hash keeps
    the bucket stable across token rotations and after H2
    password_version bumps (so a user who re-logs in keeps their bucket
    rather than getting a new empty one).

    Invalid/malformed Bearer tokens fall through to per-IP rate limiting,
    which closes the "Bearer-dodge" attack where spammers rotate random
    garbage tokens to receive per-token buckets forever.
    """
    authz = request.headers.get("Authorization", "")
    if not authz.startswith("Bearer ") or len(authz) <= 7:
        return f"ip:{get_remote_address(request)}"
    token = authz[7:].strip()
    if not token:
        return f"ip:{get_remote_address(request)}"
    payload = _cached_decode(token)
    if payload and payload.get("sub"):
        return f"user:{payload['sub']}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=_hybrid_key, default_limits=[])


async def custom_rate_limit_exceeded_handler(
    request: Request, exc: RateLimitExceeded
) -> JSONResponse:
    """Replace slowapi's default 429 handler.

    Default leaks the configured limit string verbatim, e.g.
    `{"error": "Rate limit exceeded: 5 per 1 minute"}`. That's a
    fingerprint -- adversaries probe-and-time to learn your limits.
    This handler returns a generic detail string plus a Retry-After
    header, omitting internal config.
    """
    retry_after = 60
    try:
        limit_obj = getattr(exc, "limit", None)
        reset_at = getattr(limit_obj, "reset_at", None) if limit_obj else None
        if reset_at:
            retry_after = max(1, int(reset_at - time.time()))
    except Exception:
        pass
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests"},
        headers={"Retry-After": str(retry_after)},
    )
