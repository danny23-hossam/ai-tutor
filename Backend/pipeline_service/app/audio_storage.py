import hashlib
from functools import lru_cache
from urllib.parse import quote

import boto3
from botocore.exceptions import ClientError

from app.config import settings


def is_s3_audio_enabled() -> bool:
    return bool(settings.s3_audio_bucket)


def is_s3_video_enabled() -> bool:
    return bool(_video_bucket())


def _video_bucket() -> str | None:
    return settings.s3_video_bucket or settings.s3_audio_bucket


def get_video_bucket() -> str | None:
    return _video_bucket()


def _safe_key_part(value: str) -> str:
    return quote(str(value), safe="-_.~")


def build_audio_key(*, user_id: str, lesson_id: str, document_id: str, language: str) -> str:
    prefix = settings.s3_audio_prefix.strip("/")
    parts = [
        prefix,
        _safe_key_part(user_id),
        _safe_key_part(lesson_id),
        _safe_key_part(document_id),
        f"{_safe_key_part(language)}.wav",
    ]
    return "/".join(part for part in parts if part)


def build_video_key(
    *,
    user_id: str,
    lesson_id: str,
    document_id: str,
    mode: str,
    max_slides: int,
    quality: str,
    transition: str,
    tts_backend: str,
    tts_generation_preset: str,
    tts_max_chars: int,
    tts_min_chars: int,
) -> str:
    prefix = settings.s3_video_prefix.strip("/")
    variant_source = "|".join(
        [
            mode,
            str(max_slides),
            quality,
            transition,
            tts_backend,
            tts_generation_preset,
            str(tts_max_chars),
            str(tts_min_chars),
        ]
    )
    variant_hash = hashlib.sha256(variant_source.encode("utf-8")).hexdigest()[:12]
    variant = f"{_safe_key_part(mode)}-{max_slides}-{_safe_key_part(quality)}-{variant_hash}.mp4"
    parts = [
        prefix,
        _safe_key_part(user_id),
        _safe_key_part(lesson_id),
        _safe_key_part(document_id),
        variant,
    ]
    return "/".join(part for part in parts if part)


@lru_cache(maxsize=1)
def _s3_client():
    kwargs = {}
    if settings.aws_region:
        kwargs["region_name"] = settings.aws_region
    return boto3.client("s3", **kwargs)


def get_audio_bytes(key: str) -> bytes | None:
    try:
        response = _s3_client().get_object(
            Bucket=settings.s3_audio_bucket,
            Key=key,
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"NoSuchKey", "404", "NotFound"}:
            return None
        raise

    return response["Body"].read()


def get_video_bytes(key: str) -> bytes | None:
    bucket = _video_bucket()
    try:
        response = _s3_client().get_object(
            Bucket=bucket,
            Key=key,
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"NoSuchKey", "404", "NotFound"}:
            return None
        raise

    return response["Body"].read()


def get_audio_object(key: str) -> dict | None:
    try:
        response = _s3_client().get_object(
            Bucket=settings.s3_audio_bucket,
            Key=key,
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"NoSuchKey", "404", "NotFound"}:
            return None
        raise

    return {
        "body": response["Body"],
        "content_length": response.get("ContentLength"),
        "content_type": response.get("ContentType") or "audio/wav",
    }


def get_video_object(key: str) -> dict | None:
    bucket = _video_bucket()
    try:
        response = _s3_client().get_object(
            Bucket=bucket,
            Key=key,
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"NoSuchKey", "404", "NotFound"}:
            return None
        raise

    return {
        "body": response["Body"],
        "content_length": response.get("ContentLength"),
        "content_type": response.get("ContentType") or "video/mp4",
    }


def get_audio_metadata(key: str) -> dict | None:
    try:
        response = _s3_client().head_object(
            Bucket=settings.s3_audio_bucket,
            Key=key,
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"NoSuchKey", "404", "NotFound"}:
            return None
        raise

    return {
        "content_length": response.get("ContentLength"),
        "content_type": response.get("ContentType") or "audio/wav",
    }


def get_video_metadata(key: str) -> dict | None:
    bucket = _video_bucket()
    try:
        response = _s3_client().head_object(
            Bucket=bucket,
            Key=key,
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"NoSuchKey", "404", "NotFound"}:
            return None
        raise

    return {
        "content_length": response.get("ContentLength"),
        "content_type": response.get("ContentType") or "video/mp4",
    }


def iter_audio_object(body, chunk_size: int = 1024 * 1024):
    try:
        yield from body.iter_chunks(chunk_size=chunk_size)
    finally:
        body.close()


def iter_video_object(body, chunk_size: int = 1024 * 1024):
    try:
        yield from body.iter_chunks(chunk_size=chunk_size)
    finally:
        body.close()


def put_audio_bytes(key: str, audio_bytes: bytes, mime_type: str = "audio/wav") -> dict:
    _s3_client().put_object(
        Bucket=settings.s3_audio_bucket,
        Key=key,
        Body=audio_bytes,
        ContentType=mime_type,
    )
    return {
        "bucket": settings.s3_audio_bucket,
        "key": key,
        "mime_type": mime_type,
        "size_bytes": len(audio_bytes),
    }


def put_video_bytes(key: str, video_bytes: bytes, mime_type: str = "video/mp4") -> dict:
    bucket = _video_bucket()
    _s3_client().put_object(
        Bucket=bucket,
        Key=key,
        Body=video_bytes,
        ContentType=mime_type,
    )
    return {
        "bucket": bucket,
        "key": key,
        "mime_type": mime_type,
        "size_bytes": len(video_bytes),
    }


def create_presigned_audio_url(key: str, expires_in: int = 3600) -> str:
    return _s3_client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.s3_audio_bucket,
            "Key": key,
            "ResponseContentType": "audio/wav",
        },
        ExpiresIn=expires_in,
    )


def create_presigned_video_url(key: str, expires_in: int = 3600) -> str:
    bucket = _video_bucket()
    return _s3_client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": bucket,
            "Key": key,
            "ResponseContentType": "video/mp4",
        },
        ExpiresIn=expires_in,
    )
