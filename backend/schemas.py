"""Pydantic schemas for the LexiTech API.

These models define the wire contract of the /api/v1/explain endpoint.
The OpenAI client passes ExplanationResponse as response_format, so the
LLM is constrained to this JSON schema; Pydantic re-validates the
response on the server side as a defence-in-depth check.
"""
from typing import Final, Literal

from pydantic import BaseModel, Field


DifficultyLevel = Literal["beginner", "intermediate", "advanced"]

# Pedagogical fields per the MVP spec — 12 distinct fields in the response.
PEDAGOGICAL_FIELD_COUNT: Final[int] = 12


class ExplanationRequest(BaseModel):
    """Request body for /api/v1/explain."""

    term: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="The English technical term to explain.",
    )
    context: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Surrounding text (max 500 chars) used for disambiguation.",
    )


class ExplanationResponse(BaseModel):
    """12-field pedagogical explanation of a term in context.

    The fields are ordered to match the prompt template the LLM is given.
    All defaults are explicit (no implicit empty values from the model).
    """

    term: str = Field(..., description="The term being explained.")
    part_of_speech: str = Field(..., description="Grammatical category (noun, verb, adj, ...).")
    definition: str = Field(..., description="A clear, accurate, concise definition.")
    etymology: str = Field(..., description="Origin and history of the term.")
    usage_example: str = Field(..., description="An example sentence in technical context.")
    synonyms: list[str] = Field(
        default_factory=list,
        description="Terms with similar meaning.",
    )
    antonyms: list[str] = Field(
        default_factory=list,
        description="Opposite or contrasting terms.",
    )
    difficulty_level: DifficultyLevel = Field(
        ...,
        description="Self-reported difficulty: beginner, intermediate, or advanced.",
    )
    related_concepts: list[str] = Field(
        default_factory=list,
        description="Terms the user might want to look up next.",
    )
    common_misuses: list[str] = Field(
        default_factory=list,
        description="Common mistakes or misconceptions about the term.",
    )
    memory_aid: str = Field(..., description="A mnemonic, analogy, or learning tip.")
    audio_available: bool = Field(
        default=True,
        description="Whether the client can synthesize audio for this term.",
    )
