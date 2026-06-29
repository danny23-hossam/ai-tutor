# Pipeline Service

Central backend API for the frontend.

## Purpose

This service orchestrates all AI Tutor flows. The frontend should call this service instead of calling the lower-level services directly.

## Main Endpoints

- `/pipeline/documents/add-text`: Store raw text as a document.
- `/pipeline/documents/upload`: Upload a PDF, DOCX, PPTX, or image and extract text through `document_service`.
- `/pipeline/summary`: Generate or fetch a cached summary.
- `/pipeline/questions`: Generate or fetch cached MCQs.
- `/pipeline/flashcards`: Generate or fetch cached flashcards.
- `/pipeline/transcript`: Generate or fetch a TTS transcript.
- `/pipeline/audio`: Generate audio from a stored transcript.
- `/pipeline/video/prepare`: Start or poll S3-backed video generation.
- `/pipeline/ask`: Ask the RAG service with user/lesson/document memory.
- `/pipeline/chat/history`: Retrieve retained RAG chat memory for a user/lesson/document.
- `/health`: Check connected services.

## Connected Services

- `TEXT_SERVICE_URL`: text generation service.
- `DATABASE_SERVICE_URL`: vector database service.
- `RAG_SERVICE_URL`: RAG chat and memory service.
- `TTS_SERVICE_URL`: text-to-speech service.
- `DOCUMENT_SERVICE_URL`: document extraction service.
- `VIDEO_SERVICE_URL`: external video generation service. This must be a valid
  `http://` or `https://` base URL; do not hardcode temporary tunnel URLs in
  `docker-compose.yml`.

## Video Retry

If `/pipeline/video/prepare` reports a failed generation attempt, fix the
upstream video service URL or service availability, then call the same endpoint
with `retry_failed: true` to start a new attempt. Regular polling does not retry
failed jobs automatically.

## Models

This service does not load AI models directly. It calls the model-owning services.

## Swagger

```text
http://localhost:8005/docs
```
