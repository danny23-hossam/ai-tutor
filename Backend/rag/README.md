# RAG Service

Dedicated retrieval-augmented chat service.

## Purpose

This service owns contextual chat. It retrieves document chunks from `vector_database_service`, sends document context to `text_services`, and stores conversation memory.

## Memory Scope

Memory is stored per:

```text
user_id + lesson_id + document_id
```

This keeps conversations isolated between users, lessons, and documents.

## Endpoints

- `/rag/ask`: Retrieve chunks, generate an answer, and update memory.
- `/rag/memory`: Read stored memory for a user/lesson/document.
- `/rag/memory` with DELETE: Clear memory for a user/lesson/document.
- `/health`: Check vector DB and text service connectivity.

## Models

This service does not load an embedding model or LLM directly. It calls:

- `vector_database_service` for embedding-based retrieval.
- `text_services` for answer generation.

## Storage

Conversation memory is stored in JSON under `/data`, mounted by the `rag_data` Docker volume. Full stored history is retained for display, while only the recent `MEMORY_MAX_TURNS` messages are sent back into the model prompt.

## Swagger

```text
http://localhost:8006/docs
```
