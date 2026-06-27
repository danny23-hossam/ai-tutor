from typing import Literal
from pydantic import BaseModel, Field


class BasePipelineRequest(BaseModel):
    user_id: str = Field(..., description="User ID from frontend")
    document_id: str = Field(..., description="Document ID from frontend")
    lesson_id: str = Field("default", description="Optional lesson ID")


class AddTextDocumentRequest(BasePipelineRequest):
    title: str | None = None
    text: str
    document_language: str = "en"
    # Original document language, not output language


class SummaryRequest(BasePipelineRequest):
    pass


class QuestionsRequest(BasePipelineRequest):
    qty: Literal["low", "standard", "high"] = "standard"
    diff: Literal["easy", "standard", "hard"] = "standard"


class FlashcardsRequest(BasePipelineRequest):
    qty: Literal["low", "standard", "high"] = "standard"
    diff: Literal["easy", "standard", "hard"] = "standard"


class AskRequest(BasePipelineRequest):
    question: str
    # RAG answer is generated in English


class TranscriptRequest(BasePipelineRequest):
    language: Literal["en", "ar"] = "ar"
    force_regenerate: bool = False
    # en = English friendly script
    # ar = Egyptian Arabic TTS script


class AudioRequest(BasePipelineRequest):
    language: Literal["en", "ar"] = "ar"
    # en = English audio
    # ar = Arabic audio
