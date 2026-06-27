import asyncio

from app import audio_storage, clients
from app.chuncking import chunk_text
from app.config import settings


class PipelineError(Exception):
    status_code = 400

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        if status_code is not None:
            self.status_code = status_code


class DocumentNotFoundError(PipelineError):
    def __init__(self, document_id: str):
        super().__init__(
            f"Document '{document_id}' does not exist. "
            f"Add it first using /pipeline/documents/add-text.",
            status_code=404,
        )


class InvalidPipelineStateError(PipelineError):
    status_code = 409


class AudioUrlUnavailableError(PipelineError):
    def __init__(self):
        super().__init__(
            "Audio URL playback requires S3 audio storage to be configured.",
            status_code=409,
        )


def public_document(document: dict) -> dict:
    visible_document = dict(document)
    full_text = visible_document.pop("full_text", "")
    visible_document["full_text_length"] = len(full_text or "")
    return visible_document


def text_for_generation(text: str) -> str:
    max_chars = settings.generation_max_chars

    if len(text) <= max_chars:
        return text

    head_chars = int(max_chars * 0.65)
    tail_chars = max_chars - head_chars

    return (
        text[:head_chars].rstrip()
        + "\n\n[...middle of source document omitted for model token limit...]\n\n"
        + text[-tail_chars:].lstrip()
    )


def transcript_text_from_record(record: dict | None) -> str | None:
    if not record:
        return None
    return (
        record.get("transcript_text")
        or record.get("friendly_script")
        or record.get("text")
    )


async def get_document_text_or_fail(document_id: str) -> str:
    document = await clients.get_document(document_id)

    if not document:
        raise DocumentNotFoundError(document_id)

    full_text = document.get("full_text")

    if not full_text:
        raise InvalidPipelineStateError(f"Document '{document_id}' exists but has no full_text.")

    return full_text


async def get_or_create_english_transcript_text(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    force_regenerate: bool = False,
) -> str:
    if not force_regenerate:
        cached_english = await clients.get_transcript(
            user_id=user_id,
            lesson_id=lesson_id,
            document_id=document_id,
            language="en",
        )

        cached_text = transcript_text_from_record(cached_english)
        if cached_text:
            return cached_text

    text = text_for_generation(await get_document_text_or_fail(document_id))
    generated = await clients.generate_english_transcript(text)

    transcript_text = (
        generated.get("friendly_script")
        or generated.get("text")
        or str(generated)
    )

    stored_english = await clients.store_transcript(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        language="en",
        transcript_text=transcript_text,
    )

    return transcript_text_from_record(stored_english) or transcript_text


async def add_text_document_pipeline(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    title: str | None,
    text: str,
    language: str = "en",
):
    """
    Add plain text document.
    This replaces the document/OCR upload temporarily.
    """

    existing_document = await clients.get_document(document_id)

    if existing_document:
        existing_chunks = await clients.get_chunks(document_id)

        return {
            "source": "cache",
            "message": "Document already exists. Did not store it again.",
            "document_saved": False,
            "chunks_saved": False,
            "document": public_document(existing_document),
            "chunks_count": len(existing_chunks),
        }

    document = await clients.create_document(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        title=title,
        full_text=text,
        language=language,
        source_name="manual_text",
    )

    chunks = chunk_text(
        text,
        chunk_size=settings.chunk_size,
        overlap=settings.chunk_overlap,
    )

    stored_chunks = []

    if chunks:
        stored_chunks = await clients.store_chunks(document_id, chunks)

    return {
        "source": "generated",
        "message": "Document stored and chunks created.",
        "document_saved": True,
        "chunks_saved": True,
        "document": public_document(document),
        "chunks_count": len(stored_chunks),
    }


async def upload_document_pipeline(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    file,
):
    """
    Add an uploaded document by extracting text through the document service,
    then storing and chunking it for the rest of the pipeline.
    """

    existing_document = await clients.get_document(document_id)

    if existing_document:
        existing_chunks = await clients.get_chunks(document_id)

        return {
            "source": "cache",
            "message": "Document already exists. Skipped extraction.",
            "document_saved": False,
            "chunks_saved": False,
            "document": public_document(existing_document),
            "chunks_count": len(existing_chunks),
        }

    extraction = await clients.extract_document_from_file(
        file,
    )
    extracted_text = extraction["full_text"]
    extraction_metadata = extraction.get("metadata", {})

    document = await clients.create_document(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        title=file.filename,
        full_text=extracted_text,
        language="en",
        source_name=file.filename or "uploaded_document",
        metadata={
            "source": file.filename or "uploaded_document",
            "document_service": "compact_document_service",
            "extraction": {
                "metadata": extraction_metadata,
                "pages_processed": extraction.get("pages_processed"),
                "native_count": extraction.get("native_count"),
                "ocr_count": extraction.get("ocr_count"),
                "visual_count": extraction.get("visual_count"),
                "device_used": extraction.get("device_used"),
                "processing_time_ms": extraction.get("processing_time_ms"),
            },
        },
    )

    chunks = chunk_text(
        extracted_text,
        chunk_size=settings.chunk_size,
        overlap=settings.chunk_overlap,
    )

    stored_chunks = []

    if chunks:
        stored_chunks = await clients.store_chunks(document_id, chunks)

    return {
        "source": "generated",
        "message": "Document uploaded, extracted, stored, and chunked.",
        "document_saved": True,
        "chunks_saved": True,
        "document": public_document(document),
        "extraction": {
            "success": extraction.get("success", True),
            "metadata": extraction_metadata,
            "pages_processed": extraction.get("pages_processed"),
            "native_count": extraction.get("native_count"),
            "ocr_count": extraction.get("ocr_count"),
            "visual_count": extraction.get("visual_count"),
            "device_used": extraction.get("device_used"),
            "processing_time_ms": extraction.get("processing_time_ms"),
            "full_text_length": len(extracted_text),
        },
        "chunks_count": len(stored_chunks),
    }


async def summary_pipeline(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    summary_type: str = "concise",
    language: str = "en",
):
    """
    Check DB first.
    If summary exists, return it.
    If missing, generate, store, and return.
    """

    cached_summary = await clients.get_summary(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        summary_type=summary_type,
        language=language,
    )

    if cached_summary:
        return {
            "source": "cache",
            "summary": cached_summary,
        }

    text = text_for_generation(await get_document_text_or_fail(document_id))

    generated = await clients.generate_summary(text)

    summary_text = (
        generated.get("summary_html")
        or generated.get("summary")
        or str(generated)
    )

    stored_summary = await clients.store_summary(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        summary_text=summary_text,
        summary_type=summary_type,
        language=language,
    )

    return {
        "source": "generated",
        "summary": stored_summary,
    }


async def questions_pipeline(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    qty: str = "standard",
    diff: str = "standard",
    language: str = "en",
):
    cached_questions = await clients.get_mcqs(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        language=language,
    )

    if cached_questions and cached_questions.get("mcqs"):
        return {
            "source": "cache",
            "questions": cached_questions,
        }

    text = text_for_generation(await get_document_text_or_fail(document_id))

    generated = await clients.generate_questions(
        text,
        qty=qty,
        diff=diff,
    )

    questions = [
        normalize_mcq(question)
        for question in generated.get("questions", [])
    ]

    await clients.store_mcqs(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        mcqs=questions,
        language=language,
    )

    return {
        "source": "generated",
        "questions": questions,
    }


def normalize_mcq(question: dict) -> dict:
    options = question.get("options", {})

    if isinstance(options, list):
        options = {
            str(option.get("key", "")).upper(): option.get("text", "")
            for option in options
            if isinstance(option, dict)
        }

    if isinstance(options, dict):
        options = {
            str(key).upper(): value
            for key, value in options.items()
        }

    answer = question.get("answer", "")
    if isinstance(answer, str):
        answer = answer.upper()

    explanation = question.get("explanation")
    if not explanation:
        explanation_points = question.get("explanation_points", [])
        if isinstance(explanation_points, list):
            explanation = "\n".join(
                f"{str(point.get('key', '')).upper()}: {point.get('text', '')}"
                for point in explanation_points
                if isinstance(point, dict) and point.get("text")
            ) or None

    return {
        "question": question.get("question", ""),
        "options": options,
        "answer": answer,
        "explanation": explanation,
    }


async def flashcards_pipeline(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    qty: str = "standard",
    diff: str = "standard",
    language: str = "en",
):
    cached_flashcards = await clients.get_flashcards(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        language=language,
    )

    if cached_flashcards and cached_flashcards.get("flashcards"):
        return {
            "source": "cache",
            "flashcards": cached_flashcards,
        }

    text = text_for_generation(await get_document_text_or_fail(document_id))

    generated = await clients.generate_flashcards(
        text,
        qty=qty,
        diff=diff,
    )

    flashcards = [
        normalize_flashcard(flashcard)
        for flashcard in generated.get("flashcards", [])
    ]

    await clients.store_flashcards(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        flashcards=flashcards,
        language=language,
    )

    return {
        "source": "generated",
        "flashcards": flashcards,
    }


def normalize_flashcard(flashcard: dict) -> dict:
    question = (
        flashcard.get("question")
        or flashcard.get("front")
        or flashcard.get("term")
        or ""
    )

    answer = (
        flashcard.get("answer")
        or flashcard.get("back")
        or flashcard.get("definition")
        or ""
    )

    clarification = flashcard.get("clarification")
    if clarification and isinstance(clarification, list):
        answer = f"{answer}\n\n" + "\n".join(str(item) for item in clarification)

    return {
        "question": question,
        "answer": answer,
    }


async def transcript_pipeline(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    language: str,
    force_regenerate: bool = False,
):
    if not force_regenerate:
        cached_transcript = await clients.get_transcript(
            user_id=user_id,
            lesson_id=lesson_id,
            document_id=document_id,
            language=language,
        )

        if cached_transcript:
            return {
                "source": "cache",
                "transcript": cached_transcript,
            }

    stored_transcript = await generate_and_store_transcript(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        language=language,
        force_regenerate=force_regenerate,
    )

    return {
        "source": "generated",
        "transcript": stored_transcript,
    }


async def generate_and_store_transcript(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    language: str,
    force_regenerate: bool = False,
):
    if language == "ar":
        english_transcript = await get_or_create_english_transcript_text(
            user_id=user_id,
            lesson_id=lesson_id,
            document_id=document_id,
            force_regenerate=force_regenerate,
        )

        generated = await clients.generate_arabic_transcript(english_transcript)

        transcript_text = (
            generated.get("arabic_tts")
            or generated.get("arabic_text")
            or generated.get("text")
            or str(generated)
        )

    else:
        text = text_for_generation(await get_document_text_or_fail(document_id))
        generated = await clients.generate_english_transcript(text)

        transcript_text = (
            generated.get("friendly_script")
            or generated.get("text")
            or str(generated)
        )

    stored_transcript = await clients.store_transcript(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        language=language,
        transcript_text=transcript_text,
    )

    return stored_transcript


async def ask_pipeline(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    question: str,
):
    return await clients.ask_rag(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        question=question,
    )


async def audio_pipeline(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    language: str,
):
    """
    Audio flow:
    1. Check S3 for cached audio when S3 audio storage is configured.
    2. Fall back to DB audio cache when S3 is not configured.
    2. Check DB for a transcript.
    3. If no transcript exists, generate it from the document and store it.
    4. Generate audio from the transcript, store it in S3 or DB, and return it.
    """

    s3_key = None

    if audio_storage.is_s3_audio_enabled():
        s3_key = audio_storage.build_audio_key(
            user_id=user_id,
            lesson_id=lesson_id,
            document_id=document_id,
            language=language,
        )

        cached_audio = await asyncio.to_thread(audio_storage.get_audio_bytes, s3_key)

        if cached_audio:
            return {
                "audio_bytes": cached_audio,
                "metadata": {
                    "user_id": user_id,
                    "lesson_id": lesson_id,
                    "document_id": document_id,
                    "language": language,
                    "source": "cache",
                    "audio_storage": "s3",
                    "s3_bucket": settings.s3_audio_bucket,
                    "s3_key": s3_key,
                    "audio_size_bytes": len(cached_audio),
                },
            }

    else:
        cached_audio = await clients.get_audio(
            user_id=user_id,
            lesson_id=lesson_id,
            document_id=document_id,
            language=language,
        )

        if cached_audio:
            return {
                "audio_bytes": cached_audio,
                "metadata": {
                    "user_id": user_id,
                    "lesson_id": lesson_id,
                    "document_id": document_id,
                    "language": language,
                    "source": "cache",
                    "audio_storage": "database",
                    "audio_size_bytes": len(cached_audio),
                },
            }

    transcript = await clients.get_transcript(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        language=language,
    )

    if not transcript:
        transcript = await generate_and_store_transcript(
            user_id=user_id,
            lesson_id=lesson_id,
            document_id=document_id,
            language=language,
        )

    transcript_text = transcript.get("transcript_text")

    if not transcript_text:
        raise InvalidPipelineStateError("Transcript exists in DB but transcript_text is empty.")

    audio_bytes = await clients.generate_audio(
        transcript_text=transcript_text,
        language=language,
    )

    if audio_storage.is_s3_audio_enabled():
        if s3_key is None:
            s3_key = audio_storage.build_audio_key(
                user_id=user_id,
                lesson_id=lesson_id,
                document_id=document_id,
                language=language,
            )

        stored_audio = await asyncio.to_thread(
            audio_storage.put_audio_bytes,
            s3_key,
            audio_bytes,
            "audio/wav",
        )
        audio_storage_name = "s3"
    else:
        stored_audio = await clients.store_audio(
            user_id=user_id,
            lesson_id=lesson_id,
            document_id=document_id,
            language=language,
            audio_bytes=audio_bytes,
            mime_type="audio/wav",
        )
        audio_storage_name = "database"

    return {
        "audio_bytes": audio_bytes,
        "metadata": {
            "user_id": user_id,
            "lesson_id": lesson_id,
            "document_id": document_id,
            "language": language,
            "source": "generated",
            "audio_storage": audio_storage_name,
            "audio_cache": stored_audio,
            "audio_size_bytes": len(audio_bytes),
        },
    }


async def audio_url_pipeline(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    language: str,
    expires_in: int = 3600,
):
    """
    Ensure audio exists in S3 and return a presigned URL for browser playback.
    This avoids sending large WAV files through the API server or frontend JS.
    """

    if not audio_storage.is_s3_audio_enabled():
        raise AudioUrlUnavailableError()

    s3_key = audio_storage.build_audio_key(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        language=language,
    )

    audio_metadata = await asyncio.to_thread(audio_storage.get_audio_metadata, s3_key)
    source = "cache"

    if not audio_metadata:
        transcript = await clients.get_transcript(
            user_id=user_id,
            lesson_id=lesson_id,
            document_id=document_id,
            language=language,
        )

        if not transcript:
            transcript = await generate_and_store_transcript(
                user_id=user_id,
                lesson_id=lesson_id,
                document_id=document_id,
                language=language,
            )

        transcript_text = transcript.get("transcript_text")

        if not transcript_text:
            raise InvalidPipelineStateError("Transcript exists in DB but transcript_text is empty.")

        audio_bytes = await clients.generate_audio(
            transcript_text=transcript_text,
            language=language,
        )

        stored_audio = await asyncio.to_thread(
            audio_storage.put_audio_bytes,
            s3_key,
            audio_bytes,
            "audio/wav",
        )

        audio_metadata = {
            "content_length": stored_audio["size_bytes"],
            "content_type": stored_audio["mime_type"],
        }
        source = "generated"

    audio_url = await asyncio.to_thread(
        audio_storage.create_presigned_audio_url,
        s3_key,
        expires_in,
    )

    return {
        "status": "ready",
        "source": source,
        "audio_url": audio_url,
        "expires_in": expires_in,
        "content_type": audio_metadata.get("content_type") or "audio/wav",
        "size_bytes": audio_metadata.get("content_length"),
        "s3_key": s3_key,
    }


async def audio_url_status_pipeline(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    language: str,
    expires_in: int = 3600,
):
    """
    Return a presigned audio URL only when the S3 object already exists.
    This call is intentionally fast and does not generate audio.
    """

    if not audio_storage.is_s3_audio_enabled():
        raise AudioUrlUnavailableError()

    s3_key = audio_storage.build_audio_key(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        language=language,
    )

    audio_metadata = await asyncio.to_thread(audio_storage.get_audio_metadata, s3_key)

    if not audio_metadata:
        return {
            "status": "processing",
            "source": "pending",
            "audio_url": None,
            "expires_in": expires_in,
            "content_type": "audio/wav",
            "size_bytes": None,
            "s3_key": s3_key,
        }

    audio_url = await asyncio.to_thread(
        audio_storage.create_presigned_audio_url,
        s3_key,
        expires_in,
    )

    return {
        "status": "ready",
        "source": "cache",
        "audio_url": audio_url,
        "expires_in": expires_in,
        "content_type": audio_metadata.get("content_type") or "audio/wav",
        "size_bytes": audio_metadata.get("content_length"),
        "s3_key": s3_key,
    }


async def ensure_audio_generated_pipeline(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    language: str,
):
    """
    Generate and upload audio to S3 if it is missing. This is intended to run
    as a background task so frontend requests do not stay open for TTS.
    """

    if not audio_storage.is_s3_audio_enabled():
        raise AudioUrlUnavailableError()

    s3_key = audio_storage.build_audio_key(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        language=language,
    )

    audio_metadata = await asyncio.to_thread(audio_storage.get_audio_metadata, s3_key)
    if audio_metadata:
        return {
            "status": "ready",
            "source": "cache",
            "s3_key": s3_key,
            "size_bytes": audio_metadata.get("content_length"),
        }

    transcript = await clients.get_transcript(
        user_id=user_id,
        lesson_id=lesson_id,
        document_id=document_id,
        language=language,
    )

    if not transcript:
        transcript = await generate_and_store_transcript(
            user_id=user_id,
            lesson_id=lesson_id,
            document_id=document_id,
            language=language,
        )

    transcript_text = transcript.get("transcript_text")

    if not transcript_text:
        raise InvalidPipelineStateError("Transcript exists in DB but transcript_text is empty.")

    audio_bytes = await clients.generate_audio(
        transcript_text=transcript_text,
        language=language,
    )

    stored_audio = await asyncio.to_thread(
        audio_storage.put_audio_bytes,
        s3_key,
        audio_bytes,
        "audio/wav",
    )

    return {
        "status": "ready",
        "source": "generated",
        "s3_key": s3_key,
        "size_bytes": stored_audio["size_bytes"],
    }


