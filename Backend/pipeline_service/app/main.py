import asyncio
import traceback

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse

from app.config import settings
from app import audio_storage, clients
from app.schemas import (
    AddTextDocumentRequest,
    SummaryRequest,
    QuestionsRequest,
    FlashcardsRequest,
    TranscriptRequest,
    AskRequest,
    AudioRequest,
    VideoRequest,
)

from app.pipeline import (
    PipelineError,
    add_text_document_pipeline,
    upload_document_pipeline,
    summary_pipeline,
    questions_pipeline,
    flashcards_pipeline,
    transcript_pipeline,
    ask_pipeline,
    audio_pipeline,
    audio_url_status_pipeline,
    ensure_audio_generated_pipeline,
    video_url_status_pipeline,
    ensure_video_generated_pipeline,
)


def raise_pipeline_error(exc: PipelineError):
    raise HTTPException(status_code=exc.status_code, detail=str(exc))


def audio_response_headers(
    *,
    document_id: str,
    language: str,
    source: str,
    content_length: int | None = None,
) -> dict:
    headers = {
        "Content-Disposition": f'attachment; filename="{document_id}_{language}.wav"',
        "X-Audio-Source": source,
    }

    if content_length is not None:
        headers["Content-Length"] = str(content_length)

    return headers


async def stream_s3_audio_response(
    *,
    key: str,
    document_id: str,
    language: str,
    source: str,
):
    audio_object = await asyncio.to_thread(audio_storage.get_audio_object, key)

    if not audio_object:
        return None

    return StreamingResponse(
        audio_storage.iter_audio_object(audio_object["body"]),
        media_type=audio_object["content_type"],
        headers=audio_response_headers(
            document_id=document_id,
            language=language,
            source=source,
            content_length=audio_object["content_length"],
        ),
    )


app = FastAPI(
    title="AI Tutor Pipeline Service",
    description="Central pipeline service connecting DB, RAG, text generation, and TTS.",
    version="1.0.0",
)

audio_generation_tasks: dict[str, asyncio.Task] = {}
audio_generation_errors: dict[str, str] = {}
audio_generation_lock = asyncio.Lock()
video_generation_tasks: dict[str, asyncio.Task] = {}
video_generation_errors: dict[str, str] = {}
video_generation_lock = asyncio.Lock()


def audio_task_key(req: AudioRequest) -> str:
    return audio_storage.build_audio_key(
        user_id=req.user_id,
        lesson_id=req.lesson_id,
        document_id=req.document_id,
        language=req.language,
    )


def video_task_key(req: VideoRequest) -> str:
    return audio_storage.build_video_key(
        user_id=req.user_id,
        lesson_id=req.lesson_id,
        document_id=req.document_id,
        mode="medium",
        max_slides=15,
        quality="medium_quality",
        transition="fade",
        tts_backend="ali_chatterbox_dahih_lora",
        tts_generation_preset="conservative",
        tts_max_chars=320,
        tts_min_chars=100,
    )


async def run_audio_generation(req: AudioRequest, task_key: str):
    try:
        audio_generation_errors.pop(task_key, None)
        await ensure_audio_generated_pipeline(
            user_id=req.user_id,
            lesson_id=req.lesson_id,
            document_id=req.document_id,
            language=req.language,
        )
    except Exception as exc:
        traceback.print_exc()
        audio_generation_errors[task_key] = str(exc)
    finally:
        current_task = asyncio.current_task()
        if audio_generation_tasks.get(task_key) is current_task:
            audio_generation_tasks.pop(task_key, None)


async def run_video_generation(req: VideoRequest, task_key: str):
    try:
        video_generation_errors.pop(task_key, None)
        await ensure_video_generated_pipeline(
            user_id=req.user_id,
            lesson_id=req.lesson_id,
            document_id=req.document_id,
        )
    except Exception as exc:
        traceback.print_exc()
        video_generation_errors[task_key] = str(exc)
    finally:
        current_task = asyncio.current_task()
        if video_generation_tasks.get(task_key) is current_task:
            video_generation_tasks.pop(task_key, None)


async def ensure_audio_generation_started(req: AudioRequest, task_key: str):
    async with audio_generation_lock:
        existing_task = audio_generation_tasks.get(task_key)

        if existing_task and not existing_task.done():
            return False

        audio_generation_tasks[task_key] = asyncio.create_task(
            run_audio_generation(req, task_key)
        )
        return True


async def ensure_video_generation_started(req: VideoRequest, task_key: str):
    async with video_generation_lock:
        existing_task = video_generation_tasks.get(task_key)

        if existing_task and not existing_task.done():
            return False

        video_generation_tasks[task_key] = asyncio.create_task(
            run_video_generation(req, task_key)
        )
        return True


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "services": {
            "text_service": await clients.check_health(settings.text_service_url),
            "database_service": await clients.check_health(settings.database_service_url),
            "rag_service": await clients.check_health(settings.rag_service_url),
            "tts_service": await clients.check_health(settings.tts_service_url),
            "document_service": await clients.check_health(settings.document_service_url),
            "video_service": await clients.check_health(settings.video_service_url),
        },
    }


@app.post("/pipeline/documents/add-text")
async def add_text_document(req: AddTextDocumentRequest):
    try:
        return await add_text_document_pipeline(
            user_id=req.user_id,
            lesson_id=req.lesson_id,
            document_id=req.document_id,
            title=req.title,
            text=req.text,
            language=req.document_language,
        )

    except PipelineError as e:
        raise_pipeline_error(e)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pipeline/summary")
async def get_summary(req: SummaryRequest):
    try:
        return await summary_pipeline(
            user_id=req.user_id,
            lesson_id=req.lesson_id,
            document_id=req.document_id,
        )

    except PipelineError as e:
        raise_pipeline_error(e)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pipeline/questions")
async def get_questions(req: QuestionsRequest):
    try:
        return await questions_pipeline(
            user_id=req.user_id,
            lesson_id=req.lesson_id,
            document_id=req.document_id,
            qty=req.qty,
            diff=req.diff,
        )

    except PipelineError as e:
        raise_pipeline_error(e)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pipeline/flashcards")
async def get_flashcards(req: FlashcardsRequest):
    try:
        return await flashcards_pipeline(
            user_id=req.user_id,
            lesson_id=req.lesson_id,
            document_id=req.document_id,
            qty=req.qty,
            diff=req.diff,
        )

    except PipelineError as e:
        raise_pipeline_error(e)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pipeline/transcript")
async def get_transcript(req: TranscriptRequest):
    try:
        return await transcript_pipeline(
            user_id=req.user_id,
            lesson_id=req.lesson_id,
            document_id=req.document_id,
            language=req.language,
            force_regenerate=req.force_regenerate,
        )

    except PipelineError as e:
        raise_pipeline_error(e)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pipeline/ask")
async def ask_document(req: AskRequest):
    try:
        return await ask_pipeline(
            user_id=req.user_id,
            lesson_id=req.lesson_id,
            document_id=req.document_id,
            question=req.question,
        )

    except PipelineError as e:
        raise_pipeline_error(e)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pipeline/audio")
async def get_audio(req: AudioRequest):
    try:
        s3_key = None

        if audio_storage.is_s3_audio_enabled():
            s3_key = audio_storage.build_audio_key(
                user_id=req.user_id,
                lesson_id=req.lesson_id,
                document_id=req.document_id,
                language=req.language,
            )
            cached_response = await stream_s3_audio_response(
                key=s3_key,
                document_id=req.document_id,
                language=req.language,
                source="cache",
            )

            if cached_response:
                return cached_response

        result = await audio_pipeline(
            user_id=req.user_id,
            lesson_id=req.lesson_id,
            document_id=req.document_id,
            language=req.language,
        )

        if audio_storage.is_s3_audio_enabled():
            audio_cache = result["metadata"].get("audio_cache") or {}
            response_key = audio_cache.get("key") or s3_key

            if response_key:
                generated_response = await stream_s3_audio_response(
                    key=response_key,
                    document_id=req.document_id,
                    language=req.language,
                    source=result["metadata"].get("source", "generated"),
                )

                if generated_response:
                    return generated_response

        audio_bytes = result["audio_bytes"]

        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers=audio_response_headers(
                document_id=req.document_id,
                language=req.language,
                source=result["metadata"].get("source", "unknown"),
                content_length=len(audio_bytes),
            ),
        )

    except PipelineError as e:
        raise_pipeline_error(e)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pipeline/audio/prepare")
async def prepare_audio(req: AudioRequest):
    try:
        result = await audio_url_status_pipeline(
            user_id=req.user_id,
            lesson_id=req.lesson_id,
            document_id=req.document_id,
            language=req.language,
        )

        task_key = result["s3_key"]

        if result["status"] == "ready":
            audio_generation_errors.pop(task_key, None)
            return result

        if task_key in audio_generation_errors:
            raise HTTPException(
                status_code=500,
                detail={
                    "status": "failed",
                    "message": audio_generation_errors[task_key],
                    "s3_key": task_key,
                },
            )

        started = await ensure_audio_generation_started(req, task_key)

        return {
            **result,
            "started": started,
            "message": (
                "Audio generation started. Poll this endpoint again until status is ready."
                if started
                else "Audio generation is already running. Poll this endpoint again until status is ready."
            ),
        }

    except PipelineError as e:
        raise_pipeline_error(e)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pipeline/video/prepare")
async def prepare_video(req: VideoRequest):
    try:
        result = await video_url_status_pipeline(
            user_id=req.user_id,
            lesson_id=req.lesson_id,
            document_id=req.document_id,
        )

        task_key = result["s3_key"]

        if result["status"] == "ready":
            video_generation_errors.pop(task_key, None)
            return result

        if task_key in video_generation_errors:
            # Previous attempt failed or timed out. Clear the error and start a new request
            # if the S3 object is still missing.
            video_generation_errors.pop(task_key, None)

        started = await ensure_video_generation_started(req, task_key)

        return {
            **result,
            "started": started,
            "message": (
                "Video generation started. Poll this endpoint again until status is ready."
                if started
                else "Video generation is already running. Poll this endpoint again until status is ready."
            ),
        }

    except PipelineError as e:
        raise_pipeline_error(e)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/pipeline/documents/upload")
async def upload_document(
    user_id: str = Form(...),
    document_id: str = Form(...),
    lesson_id: str = Form("default"),
    file: UploadFile = File(...),
):
    try:
        return await upload_document_pipeline(
            user_id=user_id,
            lesson_id=lesson_id,
            document_id=document_id,
            file=file,
        )

    except PipelineError as e:
        raise_pipeline_error(e)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
