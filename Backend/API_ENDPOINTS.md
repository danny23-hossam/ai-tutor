# Backend API Endpoints

Main frontend API base URL:

```text
http://localhost:8005
```

Pipeline Swagger:

```text
http://localhost:8005/docs
```

The frontend should normally call the pipeline service, not the internal services directly.

## Pipeline Service

### GET `/health`

Checks pipeline and downstream service health.

Request:

```text
No body
```

Response:

```json
{
  "status": "ok",
  "services": {
    "text_service": {},
    "database_service": {},
    "rag_service": {},
    "tts_service": {},
    "document_service": {}
  }
}
```

### POST `/pipeline/documents/upload`

Uploads a document, extracts text, stores the full text in DB, chunks it, and stores the chunks.

Request type:

```text
multipart/form-data
```

Request fields:

```text
user_id      string, required
document_id  string, required
lesson_id    string, optional, default "default"
file         binary file, required
```

Frontend example:

```js
const formData = new FormData();
formData.append("user_id", "omar");
formData.append("document_id", "1");
formData.append("lesson_id", "1");
formData.append("file", file);

const res = await fetch("http://localhost:8005/pipeline/documents/upload", {
  method: "POST",
  body: formData,
});

const data = await res.json();
```

Response:

```json
{
  "source": "generated",
  "message": "Document uploaded, extracted, stored, and chunked.",
  "document_saved": true,
  "chunks_saved": true,
  "document": {
    "id": "internal-db-id",
    "uid": "omar",
    "lid": "1",
    "did": "1",
    "title": "lecture.pdf",
    "source_name": "lecture.pdf",
    "language": "en",
    "doc_type": "text",
    "metadata": {},
    "created_at": "2026-06-22T00:00:00",
    "full_text_length": 12345
  },
  "extraction": {
    "success": true,
    "metadata": {
      "filename": "lecture.pdf",
      "file_type": "pdf",
      "file_size_bytes": 123456,
      "page_count": 10,
      "slide_count": null
    },
    "pages_processed": 10,
    "native_count": 10,
    "ocr_count": 2,
    "visual_count": 10,
    "device_used": "cuda",
    "processing_time_ms": 1234.5,
    "full_text_length": 12345
  },
  "chunks_count": 12
}
```

If the document already exists, response has:

```json
{
  "source": "cache",
  "message": "Document already exists. Skipped extraction.",
  "document_saved": false,
  "chunks_saved": false,
  "document": {},
  "chunks_count": 12
}
```

### POST `/pipeline/documents/add-text`

Stores raw text as a document and chunks it. Useful for testing without upload.

Request type:

```text
application/json
```

Request body:

```json
{
  "user_id": "omar",
  "document_id": "1",
  "lesson_id": "1",
  "title": "Manual text",
  "text": "The document content goes here.",
  "document_language": "en"
}
```

Required fields:

```text
user_id
document_id
text
```

Response:

```json
{
  "source": "generated",
  "message": "Document stored and chunks created.",
  "document_saved": true,
  "chunks_saved": true,
  "document": {},
  "chunks_count": 1
}
```

### POST `/pipeline/summary`

Returns cached summary if found. Otherwise generates, stores, and returns a summary.

Request type:

```text
application/json
```

Request body:

```json
{
  "user_id": "omar",
  "document_id": "1",
  "lesson_id": "1"
}
```

Required fields:

```text
user_id
document_id
```

Response:

```json
{
  "source": "generated",
  "summary": {
    "did": "1",
    "uid": "omar",
    "lid": "1",
    "summary_text": "...",
    "summary_type": "concise",
    "language": "en",
    "created_at": "2026-06-22T00:00:00"
  }
}
```

### POST `/pipeline/questions`

Returns cached MCQs if found. Otherwise generates, stores, and returns MCQs.

Request type:

```text
application/json
```

Request body:

```json
{
  "user_id": "omar",
  "document_id": "1",
  "lesson_id": "1",
  "qty": "standard",
  "diff": "standard"
}
```

Required fields:

```text
user_id
document_id
```

Options:

```text
qty:  low | standard | high
diff: easy | standard | hard
```

Response:

```json
{
  "source": "generated",
  "questions": [
    {
      "question": "Question text?",
      "options": {
        "A": "Option A",
        "B": "Option B",
        "C": "Option C",
        "D": "Option D"
      },
      "answer": "A",
      "explanation": "Why A is correct."
    }
  ]
}
```

### POST `/pipeline/flashcards`

Returns cached flashcards if found. Otherwise generates, stores, and returns flashcards.

Request type:

```text
application/json
```

Request body:

```json
{
  "user_id": "omar",
  "document_id": "1",
  "lesson_id": "1",
  "qty": "standard",
  "diff": "standard"
}
```

Required fields:

```text
user_id
document_id
```

Options:

```text
qty:  low | standard | high
diff: easy | standard | hard
```

Response:

```json
{
  "source": "generated",
  "flashcards": [
    {
      "question": "Front side text",
      "answer": "Back side text"
    }
  ]
}
```

### POST `/pipeline/transcript`

Returns cached transcript if found. Otherwise generates, stores, and returns transcript text.

Request type:

```text
application/json
```

Request body:

```json
{
  "user_id": "omar",
  "document_id": "1",
  "lesson_id": "1",
  "language": "ar"
}
```

Required fields:

```text
user_id
document_id
```

Options:

```text
language: en | ar
```

Response:

```json
{
  "source": "generated",
  "transcript": {
    "did": "1",
    "uid": "omar",
    "lid": "1",
    "language": "ar",
    "transcript_text": "...",
    "created_at": "2026-06-22T00:00:00"
  }
}
```

### POST `/pipeline/audio`

Returns a WAV audio file. It checks DB for cached audio first. If audio is missing, it generates transcript if needed, calls TTS, stores the WAV in DB, and returns it.

Request type:

```text
application/json
```

Request body:

```json
{
  "user_id": "omar",
  "document_id": "1",
  "lesson_id": "1",
  "language": "ar"
}
```

Required fields:

```text
user_id
document_id
```

Options:

```text
language: en | ar
```

Response:

```text
Binary audio/wav response
```

Important response headers:

```text
Content-Type: audio/wav
Content-Disposition: attachment; filename="1_ar.wav"
X-Audio-Source: generated | cache
```

Frontend example:

```js
const res = await fetch("http://localhost:8005/pipeline/audio", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user_id: "omar",
    document_id: "1",
    lesson_id: "1",
    language: "ar",
  }),
});

const audioBlob = await res.blob();
const audioUrl = URL.createObjectURL(audioBlob);
```

PowerShell download example:

```powershell
$body = '{"user_id":"omar","document_id":"1","lesson_id":"1","language":"ar"}'

Invoke-WebRequest `
  -UseBasicParsing `
  -Method POST `
  -Uri 'http://localhost:8005/pipeline/audio' `
  -ContentType 'application/json' `
  -Headers @{ Accept = 'audio/wav' } `
  -Body $body `
  -OutFile .\omar_1_ar.wav
```

### POST `/pipeline/ask`

Asks a document-grounded question using RAG and chat memory.

Request type:

```text
application/json
```

Request body:

```json
{
  "user_id": "omar",
  "document_id": "1",
  "lesson_id": "1",
  "question": "What is this document about?"
}
```

Required fields:

```text
user_id
document_id
question
```

Response:

```json
{
  "answer": "..."
}
```

The RAG service retrieves up to 10 chunks internally. If no chunks are found, the answer will say that no document chunks were available, then provide a general explanation.

### GET `/pipeline/chat/history`

Returns stored RAG chat memory for a user, lesson, and document. New chats retain full history for display; the RAG prompt still uses only the recent configured memory window.

Request query parameters:

```text
user_id      string, required
document_id  string, required
lesson_id    string, optional, default "default"
```

Example:

```text
http://localhost:8005/pipeline/chat/history?user_id=omar&lesson_id=1&document_id=1
```

Response:

```json
{
  "user_id": "omar",
  "lesson_id": "1",
  "document_id": "1",
  "memory_key": "omar::1::1",
  "messages": [
    {
      "role": "user",
      "content": "What is this document about?"
    },
    {
      "role": "assistant",
      "content": "..."
    }
  ],
  "count": 2
}
```

The public Node API exposes the same retained history for the logged-in user at:

```text
GET /api/ai-generations/chat/history/:lessonId
```

## Useful Internal Debug Endpoints

These are not the main frontend API, but they are useful for checking stored data.

Vector database base URL:

```text
http://localhost:8004
```

### GET `/documents/{document_id}`

Returns the stored full document record.

Example:

```text
http://localhost:8004/documents/1
```

### GET `/documents/{document_id}/chunks`

Returns chunks stored for the document.

Example:

```text
http://localhost:8004/documents/1/chunks
```

### GET `/documents/{document_id}/audio/{language}`

Returns cached audio metadata, not the WAV bytes.

Example:

```text
http://localhost:8004/documents/1/audio/ar?uid=omar&lid=1
```

Response:

```json
{
  "did": "1",
  "uid": "omar",
  "lid": "1",
  "language": "ar",
  "mime_type": "audio/wav",
  "audio_size_bytes": 8891312,
  "created_at": "2026-06-22T00:00:00"
}
```

### GET `/documents/{document_id}/audio/{language}/content`

Returns cached audio bytes directly.

Example:

```text
http://localhost:8004/documents/1/audio/ar/content?uid=omar&lid=1
```

Response:

```text
Binary audio/wav response
```

## Current Ports

```text
8001 -> Text generation service
8002 -> XTTS service
8003 -> Document extraction service
8004 -> Vector database service
8005 -> Pipeline service
8006 -> RAG service
5437 -> PostgreSQL
```

## Recommended Frontend Flow

1. Upload file with `/pipeline/documents/upload`.
2. Save `document_id`, `user_id`, and `lesson_id` in frontend state.
3. Call `/pipeline/summary`, `/pipeline/questions`, `/pipeline/flashcards`, `/pipeline/ask`, `/pipeline/transcript`, or `/pipeline/audio` using the same IDs.
4. For audio, treat response as a Blob, not JSON.
