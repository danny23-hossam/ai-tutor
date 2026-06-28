# Video Service S3 Upload Contract

This is the contract the video generation service must implement for the AI Tutor pipeline.

## Goal

The video service must generate the MP4 video, upload it directly to S3, and return JSON metadata to the pipeline.

Do not return raw MP4 bytes from `POST /video` for pipeline integration.

## Pipeline Flow

```text
pipeline_service
  -> builds summary, English transcript, Arabic transcript from DB/cache
  -> calls video service /slides/from-text-services
  -> calls video service /video with slides and upload target

video service
  -> starts a render job
  -> returns JSON quickly
  -> renders MP4 locally in the background
  -> uploads MP4 directly to S3

pipeline_service
  -> polls S3 until the expected object exists
  -> returns a presigned video_url from /pipeline/video/prepare
```

## S3 Target

Use the same bucket as audio:

```text
ai-tutor-audio-moham-2026
```

Videos are stored under this prefix:

```text
video/
```

The pipeline will generate the exact object key. The video service must use the key it receives in `upload.key`.

Example key:

```text
video/USER_ID/LESSON_ID/DOCUMENT_ID/medium-12-medium_quality-abc123def456.mp4
```

## Required Endpoints

### GET `/health`

Return a simple health response.

Example:

```json
{
  "status": "ok"
}
```

### GET `/info`

Return service metadata. Shape is flexible.

Example:

```json
{
  "service": "video_generation",
  "version": "1.0.0"
}
```

### POST `/slides/from-text-services`

This endpoint converts upstream text-service outputs into structured video slides.

#### Request

```json
{
  "topic_title": "Social Network Analysis",
  "mode": "medium",
  "max_slides": 12,
  "llm_endpoint": "",
  "payload": {
    "api_explain_response": {
      "explanation": "Cached English summary from the pipeline."
    },
    "api_tts_script_response": {
      "friendly_script": "Cached English transcript from the pipeline."
    },
    "api_translate_to_arabic_tts_response": {
      "arabic_script": "Cached Arabic transcript from the pipeline."
    }
  }
}
```

#### Response

```json
{
  "run_id": "20260628T120000Z",
  "slides": [
    {
      "title": "Degree Centrality",
      "layout": "title_bullets",
      "bullets": [
        "Direct connection count",
        "Simple local importance"
      ],
      "concepts": [],
      "narration": "Egyptian Arabic narration with English technical terms.",
      "equation": null,
      "code": null,
      "code_language": "python"
    }
  ],
  "slides_path": "outputs/convert_20260628T120000Z/slides.json"
}
```

The pipeline requires `slides` to be a non-empty array.

### POST `/video`

This endpoint starts video rendering and uploads the finished MP4 directly to S3.

For Cloudflare tunnels, do not keep this HTTP request open for the whole render. Cloudflare can return `524` when the origin takes too long to answer. Return `202` quickly after starting the job, then continue rendering and uploading in the background.

#### Request

```json
{
  "slides": [
    {
      "title": "Degree Centrality",
      "layout": "title_bullets",
      "bullets": [
        "Direct connection count",
        "Simple local importance"
      ],
      "concepts": [],
      "narration": "Egyptian Arabic narration with English technical terms.",
      "equation": null,
      "code": null,
      "code_language": "python"
    }
  ],
  "output_name": "123_medium.mp4",
  "quality": "medium_quality",
  "transition": "fade",
  "no_cache": false,
  "tts_backend": "ali_chatterbox_dahih_lora",
  "tts_generation_preset": "conservative",
  "tts_max_chars": 320,
  "tts_min_chars": 100,
  "upload": {
    "bucket": "ai-tutor-audio-moham-2026",
    "key": "video/USER_ID/LESSON_ID/DOCUMENT_ID/medium-12-medium_quality-abc123def456.mp4",
    "content_type": "video/mp4"
  }
}
```

#### Required Behavior

1. Validate the request.
2. Start a background job to render the MP4 locally from `slides`.
3. Return HTTP `202` quickly with the expected S3 metadata.
4. In the background job, upload the generated MP4 to S3 using:

```text
bucket = request.upload.bucket
key = request.upload.key
content_type = request.upload.content_type
```

5. Do not return the MP4 file body.
6. Do not generate a different S3 key.
7. Do not make the object public.

#### Response

Preferred response: return HTTP `202` immediately after queuing/starting the render:

```json
{
  "status": "accepted",
  "bucket": "ai-tutor-audio-moham-2026",
  "s3_key": "video/USER_ID/LESSON_ID/DOCUMENT_ID/medium-12-medium_quality-abc123def456.mp4",
  "content_type": "video/mp4"
}
```

If the service chooses to render synchronously and finishes before the HTTP timeout, it may return HTTP `200` or `201` with `size_bytes`:

```json
{
  "status": "uploaded",
  "bucket": "ai-tutor-audio-moham-2026",
  "s3_key": "video/USER_ID/LESSON_ID/DOCUMENT_ID/medium-12-medium_quality-abc123def456.mp4",
  "content_type": "video/mp4",
  "size_bytes": 12345678
}
```

The pipeline accepts either `s3_key` or `key`, but `s3_key` is preferred.

The returned key must match the request `upload.key`.

## Python Upload Example

Install:

```bash
pip install boto3
```

Upload helper:

```python
import os
import boto3


def upload_video_to_s3(
    file_path: str,
    bucket: str,
    key: str,
    content_type: str = "video/mp4",
) -> dict:
    s3 = boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION", "eu-north-1"),
    )

    s3.upload_file(
        Filename=file_path,
        Bucket=bucket,
        Key=key,
        ExtraArgs={
            "ContentType": content_type,
        },
    )

    return {
        "bucket": bucket,
        "s3_key": key,
        "content_type": content_type,
        "size_bytes": os.path.getsize(file_path),
    }
```

Example endpoint usage:

```python
from pydantic import BaseModel


class UploadTarget(BaseModel):
    bucket: str
    key: str
    content_type: str = "video/mp4"


class VideoRequest(BaseModel):
    slides: list[dict]
    output_name: str = "lecture_video.mp4"
    quality: str = "medium_quality"
    transition: str = "fade"
    no_cache: bool = False
    tts_backend: str = "ali_chatterbox_dahih_lora"
    tts_generation_preset: str = "conservative"
    tts_max_chars: int = 320
    tts_min_chars: int = 100
    upload: UploadTarget


from fastapi import BackgroundTasks


@app.post("/video")
async def generate_video(req: VideoRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(
        render_and_upload_video,
        req,
    )

    return {
        "status": "accepted",
        "bucket": req.upload.bucket,
        "s3_key": req.upload.key,
        "content_type": req.upload.content_type,
    }
```

Background task example:

```python
def render_and_upload_video(req: VideoRequest):
    output_path = render_video(
        slides=req.slides,
        output_name=req.output_name,
        quality=req.quality,
        transition=req.transition,
    )

    upload_video_to_s3(
        file_path=output_path,
        bucket=req.upload.bucket,
        key=req.upload.key,
        content_type=req.upload.content_type,
    )
```

## Required Environment Variables on the Video Machine

```env
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-north-1
```

## Required AWS Permission

The video service needs permission to upload under the video prefix.

Minimum IAM policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::ai-tutor-audio-moham-2026/video/*"
    }
  ]
}
```

If the service also verifies the bucket before upload, add:

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:ListBucket"
  ],
  "Resource": "arn:aws:s3:::ai-tutor-audio-moham-2026"
}
```

## Error Responses

If rendering fails, return a non-2xx response:

```json
{
  "detail": "Video rendering failed: ..."
}
```

If S3 upload fails, return a non-2xx response:

```json
{
  "detail": "S3 upload failed: ..."
}
```

The pipeline treats any non-2xx response as a generation failure.

## Important Compatibility Notes

- `POST /video` must return JSON, not `video/mp4`.
- `POST /video` should return quickly, preferably HTTP `202`.
- `upload.key` is pipeline-owned and must be used exactly.
- The S3 object content type must be `video/mp4`.
- The object should remain private.
- The pipeline will create the presigned playback URL.
- The pipeline polls S3 after `/video` returns; if the object is missing after the wait timeout, generation is treated as failed.
