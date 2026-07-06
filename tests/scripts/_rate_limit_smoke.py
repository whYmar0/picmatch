"""Smoke test for rate-limiting setup. Run from project root:

    python -m backend.tests.scripts._rate_limit_smoke

or from backend/:

    cd backend && python tests/scripts/_rate_limit_smoke.py
"""
import os
import sys

# Set required env BEFORE importing anything (H1 fix: SECRET_KEY required).
os.environ.setdefault("SECRET_KEY", "x" * 64)  # 64 bytes > 32 required
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./pickmatch.db")

# Ensure project root is on the import path. The smoke test is meant
# to be invoked from the project root (canonical) but also works from
# `cd backend && python tests/...`. pathlib normalizes both cases.
from pathlib import Path  # noqa: E402
HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

results = []


def check(name, condition, detail=""):
    results.append((bool(condition), name, detail))


# 1. limiter + helpers import cleanly (no encoding crash, no NameError).
try:
    from middleware.rate_limit import (
        limiter,
        _get_limit,
        _cached_decode,
        _hybrid_key,
        custom_rate_limit_exceeded_handler,
    )
    # default_limits=[] keeps per-route audit clean (no surprise global caps).
    check("limiter_defaults_empty", limiter._default_limits == [],
          f"got {limiter._default_limits!r}")
except Exception as e:
    check("limiter_import", False, repr(e))

# 2. Full app loads (this exercises every router import path).
try:
    from main import app
    # At least the 5 protected routes must be present (login, register,
    # vote, comment, share-analytics, plus health/root).
    n_routes = sum(1 for r in app.routes if hasattr(r, "path"))
    check("app_loads", n_routes >= 10, f"{n_routes} routes")
except Exception as e:
    check("app_loads", False, repr(e))

# 3. _get_limit is defensive against bad env values.
import middleware.rate_limit as rl  # noqa: E402
os.environ["RATE_LIMIT_LOGIN"] = "this-is-garbage-!!"
got = rl._get_limit("RATE_LIMIT_LOGIN", "5/minute")
check("_get_limit_defensive", got == "5/minute", f"got={got!r}")

# 4. _get_limit honours valid env values verbatim.
del os.environ["RATE_LIMIT_LOGIN"]
os.environ["RATE_LIMIT_LOGIN"] = "10/minute"
got = rl._get_limit("RATE_LIMIT_LOGIN", "5/minute")
check("_get_limit_passes_through", got == "10/minute", f"got={got!r}")
del os.environ["RATE_LIMIT_LOGIN"]

# 5. _cached_decode caps token length at 4096 -> None.
got = rl._cached_decode("x" * 5000)
check("token_length_cap", got is None, f"got={got!r}")

# 6. _cached_decode returns consistent values (LRU works).
got1 = rl._cached_decode("garbage.token.value")
got2 = rl._cached_decode("garbage.token.value")
check("lru_cache_stable", got1 == got2, f"first={got1!r} second={got2!r}")
# Same None for same garbage input -- this is correct (decode_token errors -> None).

# 7. monkey-patch is installed on starlette.config.Config.
from starlette.config import Config  # noqa: E402
check("monkey_patch_installed",
      getattr(Config, "_read_file", None).__name__ == "_no_read_file",
      f"got {Config._read_file!r}")

# 8. SlowAPIMiddleware is registered on app.
try:
    # FastAPI stores user-added middleware as descriptors where m.cls
    # is the class object itself, so use m.cls.__name__ (not
    # type(m.cls).__name__ which would just be 'type').
    middleware_classes = [m.cls.__name__ for m in app.user_middleware]
    check("slowapi_middleware_registered",
          "SlowAPIMiddleware" in middleware_classes,
          f"middleware list: {middleware_classes}")
except Exception as e:
    check("slowapi_middleware_registered", False, repr(e))

# 9. Custom 429 handler is registered.
try:
    handlers = list(app.exception_handlers.keys())
    from slowapi.errors import RateLimitExceeded  # noqa: E402
    check("custom_429_handler_registered",
          RateLimitExceeded in handlers,
          f"handlers: {[h.__name__ for h in handlers]}")
except Exception as e:
    check("custom_429_handler_registered", False, repr(e))

# Summary.
ok = all(v[0] for v in results)
print("\n=== Rate-limit smoke test ===")
for passed, name, detail in results:
    flag = "PASS" if passed else "FAIL"
    suffix = f" -- {detail}" if detail else ""
    print(f"{flag} {name}{suffix}")
print()
print("ALL_PASS" if ok else "SOME_FAILED")
sys.exit(0 if ok else 1)
