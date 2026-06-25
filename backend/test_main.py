"""Tests for the FastAPI backend.

TDD Red phase: these tests must fail before main.py and schemas.py exist.
They define the API contract that the implementation must satisfy.
"""
from typing import Any

import pytest
from fastapi.testclient import TestClient


def test_health_returns_ok() -> None:
    """/health returns 200 with status: ok payload."""
    from main import app  # noqa: WPS433 — intentional import for late binding

    client: TestClient = TestClient(app)
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_explain_returns_explanation_response_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    """/api/v1/explain returns a JSON object that validates as ExplanationResponse.

    OpenAI and Redis are mocked at the function boundary so the test does not
    touch the network.
    """
    from main import app  # noqa: WPS433
    from schemas import ExplanationResponse

    fake_llm_payload: dict[str, Any] = {
        "term": "container",
        "part_of_speech": "noun",
        "definition": "A standard unit of software that packages code and dependencies.",
        "etymology": "From 'contain' + the agent suffix '-er'.",
        "usage_example": "Deploy the application as a Docker container.",
        "synonyms": ["package", "image"],
        "antonyms": [],
        "difficulty_level": "intermediate",
        "related_concepts": ["Docker", "Kubernetes", "microservices"],
        "common_misuses": ["Confusing a container with a virtual machine."],
        "memory_aid": "A container contains an app — simple as that.",
        "audio_available": True,
    }

    def fake_call_openai(term: str, context: str) -> dict[str, Any]:
        assert term == "container"
        assert "container" in context
        return fake_llm_payload

    monkeypatch.setattr("main._call_openai", fake_call_openai)
    monkeypatch.setattr("main._get_cached", lambda _key: None)
    monkeypatch.setattr("main._set_cached", lambda _key, _value, _ttl: None)

    client: TestClient = TestClient(app)
    response = client.post(
        "/api/v1/explain",
        json={"term": "container", "context": "We use a container to deploy."},
    )

    assert response.status_code == 200
    parsed: ExplanationResponse = ExplanationResponse.model_validate(response.json())
    assert parsed.term == "container"
    assert parsed.difficulty_level == "intermediate"
    assert isinstance(parsed.synonyms, list)
    assert len(parsed.synonyms) == 2


def test_explain_rejects_empty_term() -> None:
    """/api/v1/explain rejects an empty term with 422 (Pydantic validation)."""
    from main import app  # noqa: WPS433

    client: TestClient = TestClient(app)
    response = client.post(
        "/api/v1/explain",
        json={"term": "", "context": "valid surrounding text"},
    )

    assert response.status_code == 422


def test_explain_uses_cache_when_available(monkeypatch: pytest.MonkeyPatch) -> None:
    """/api/v1/explain returns the cached payload without calling OpenAI on a hit."""
    from main import app  # noqa: WPS433

    cached_payload: dict[str, Any] = {
        "term": "cache",
        "part_of_speech": "noun",
        "definition": "A high-speed data storage layer.",
        "etymology": "From French 'cacher' (to hide).",
        "usage_example": "Cache the result to avoid recomputation.",
        "synonyms": ["buffer", "store"],
        "antonyms": [],
        "difficulty_level": "beginner",
        "related_concepts": ["Redis", "memcached"],
        "common_misuses": ["Using cache as the primary store."],
        "memory_aid": "Cache = cash register — fast checkout.",
        "audio_available": True,
    }

    openai_called: bool = False

    def fake_call_openai(term: str, context: str) -> dict[str, Any]:
        nonlocal openai_called
        openai_called = True
        return {}

    monkeypatch.setattr("main._get_cached", lambda _key: cached_payload)
    monkeypatch.setattr("main._call_openai", fake_call_openai)
    monkeypatch.setattr("main._set_cached", lambda _key, _value, _ttl: None)

    client: TestClient = TestClient(app)
    response = client.post(
        "/api/v1/explain",
        json={"term": "cache", "context": "We use a cache."},
    )

    assert response.status_code == 200
    assert response.json()["definition"].startswith("A high-speed")
    assert not openai_called, "OpenAI must not be invoked on a cache hit"
