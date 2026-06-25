"""LexiTech FastAPI backend.

Endpoints:
    GET  /health         — liveness probe.
    POST /api/v1/explain — 12-field pedagogical explanation of a term in context.

Architecture:
    - The OpenAI client is constrained to the ExplanationResponse Pydantic
      schema via response_format=ExplanationResponse (Structured Outputs).
    - Redis caches responses keyed by (term, sha256(context)) for
      CACHE_TTL_SECONDS. Cache hits never call OpenAI.
    - Heavy SDKs (openai, redis) are lazy-imported / lazy-initialised so the
      cold-start cost is low and tests can run without a live network.

Security:
    - OPENAI_API_KEY is read from the environment; the value is never logged
      and never sent to clients.
    - Request bounds (term ≤ 100 chars, context ≤ 500 chars) are enforced
      by Pydantic and re-checked defensively before any external call.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Any, Final

from fastapi import FastAPI, HTTPException, status
from pydantic import ValidationError

from schemas import ExplanationRequest, ExplanationResponse


# --- Configuration -----------------------------------------------------------

REDIS_URL: Final[str] = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CACHE_TTL_SECONDS: Final[int] = int(os.environ.get("CACHE_TTL_SECONDS", "86400"))
OPENAI_MODEL: Final[str] = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
APP_NAME: Final[str] = "LexiTech API"
APP_VERSION: Final[str] = "0.1.0"

# Bounded inputs mirror the Pydantic Field constraints; re-asserted at the
# boundary in case the model is bypassed.
MAX_TERM_LENGTH: Final[int] = 100
MAX_CONTEXT_LENGTH: Final[int] = 500

logger = logging.getLogger(__name__)

# Lazy-initialised clients.
_redis_client: Any = None
_openai_client: Any = None


# --- Helpers (mockable from tests) -------------------------------------------

def _get_redis() -> Any:
    """Return a singleton Redis client, creating it on first use."""
    global _redis_client
    if _redis_client is None:
        import redis  # noqa: PLC0415 — lazy import keeps cold start light

        _redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


def _get_openai() -> Any:
    """Return a singleton OpenAI client, creating it on first use."""
    global _openai_client
    if _openai_client is None:
        api_key: str = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        import openai  # noqa: PLC0415 — lazy import keeps cold start light

        _openai_client = openai.OpenAI(api_key=api_key)
    return _openai_client


def _cache_key(term: str, context: str) -> str:
    """Deterministic cache key for a (term, context) pair.

    Uses SHA-256 on the context (truncated to 16 hex chars) so the key is
    stable across Python sessions, unlike the built-in ``hash()`` which is
    randomised by PYTHONHASHSEED.
    """
    context_digest: str = hashlib.sha256(context.encode("utf-8")).hexdigest()[:16]
    return f"lexitech:explain:{term.lower().strip()}:{context_digest}"


def _get_cached(key: str) -> dict[str, Any] | None:
    """Read a cached ExplanationResponse payload. Returns None on miss.

    Corrupt cache entries (invalid JSON) are treated as misses — the caller
    will fall back to the LLM and overwrite the bad entry.
    """
    try:
        raw: str | None = _get_redis().get(key)
    except Exception as exc:  # noqa: BLE001 — boundary handler; cache is best-effort
        logger.warning("Redis GET failed for key %s: %s", key, exc)
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("Corrupt cache entry for key %s: %s", key, exc)
        return None


def _set_cached(key: str, value: dict[str, Any], ttl: int) -> None:
    """Store a payload in the cache with the given TTL in seconds.

    Cache write failures are logged and swallowed — a missing cache entry
    on a future read will just trigger another LLM call.
    """
    try:
        _get_redis().setex(key, ttl, json.dumps(value))
    except Exception as exc:  # noqa: BLE001 — boundary handler; cache is best-effort
        logger.warning("Redis SETEX failed for key %s: %s", key, exc)


def _call_openai(term: str, context: str) -> dict[str, Any]:
    """Call OpenAI with structured outputs. Returns a dict matching ExplanationResponse.

    The Pydantic class is passed as ``response_format``, which instructs the
    OpenAI SDK to constrain the LLM's output to the JSON schema and to parse
    the result into the model instance. We then ``model_dump()`` to a plain
    dict for storage and for the cache layer.
    """
    client = _get_openai()
    completion: Any = client.beta.chat.completions.parse(
        model=OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a precise technical English tutor. Explain the "
                    "given term in the context provided. Be concise, "
                    "pedagogical, and accurate. Always fill all 12 fields."
                ),
            },
            {
                "role": "user",
                "content": f"Term: {term}\nContext: {context}",
            },
        ],
        response_format=ExplanationResponse,
    )
    parsed: ExplanationResponse | None = completion.choices[0].message.parsed
    if parsed is None:
        raise RuntimeError("OpenAI returned no parsed content for the structured output")
    return parsed.model_dump()


# --- FastAPI app -------------------------------------------------------------

app = FastAPI(title=APP_NAME, version=APP_VERSION)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe used by Docker, CI, and orchestrators."""
    return {"status": "ok"}


@app.post(
    "/api/v1/explain",
    response_model=ExplanationResponse,
    status_code=status.HTTP_200_OK,
)
def explain(request: ExplanationRequest) -> ExplanationResponse:
    """Return a 12-field pedagogical explanation for the requested term.

    Cache flow:
        1. Compute the deterministic cache key from (term, sha256(context)).
        2. Try Redis. On hit, return the cached payload after Pydantic validation.
        3. On miss, call OpenAI with response_format=ExplanationResponse,
           validate the result, store it in Redis, and return it.
    """
    # Defensive re-check at the boundary (matches Pydantic Field bounds).
    if not request.term or len(request.term) > MAX_TERM_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"term must be 1..{MAX_TERM_LENGTH} characters",
        )
    if not request.context or len(request.context) > MAX_CONTEXT_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"context must be 1..{MAX_CONTEXT_LENGTH} characters",
        )

    key: str = _cache_key(request.term, request.context)
    cached: dict[str, Any] | None = _get_cached(key)
    if cached is not None:
        try:
            return ExplanationResponse.model_validate(cached)
        except ValidationError:
            # Corrupt cache: treat as miss and re-fetch from the LLM.
            logger.warning("Cache entry failed Pydantic validation for key %s", key)

    payload: dict[str, Any] = _call_openai(request.term, request.context)
    _set_cached(key, payload, CACHE_TTL_SECONDS)
    return ExplanationResponse.model_validate(payload)
