from fastapi import FastAPI, HTTPException

from app import clients
from app.config import settings
from app.memory import memory
from app.schemas import AskRequest, AskResponse


app = FastAPI(
    title="AI Tutor RAG Service",
    description="Retrieval augmented chat with per user/lesson/document memory.",
    version="1.0.0",
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "services": {
            "vector_database_service": await clients.check_health(settings.vector_database_service_url),
            "llm": clients.check_llm_config(),
        },
    }


@app.post("/rag/ask", response_model=AskResponse)
async def ask(req: AskRequest):
    try:
        retrieved = await clients.retrieve_chunks(
            user_id=req.user_id,
            lesson_id=req.lesson_id,
            document_id=req.document_id,
            question=req.question,
            top_k=10,
        )
        chunks = retrieved.get("results", []) if retrieved else []
        memory_turns = memory.get_recent(req.user_id, req.lesson_id, req.document_id)

        generated = await clients.generate_answer(
            question=req.question,
            chunks=chunks,
            memory_turns=memory_turns,
        )

        answer = (
            generated.get("explanation")
            or generated.get("answer")
            or generated.get("text")
            or str(generated)
        )

        memory.append_turns(
            req.user_id,
            req.lesson_id,
            req.document_id,
            req.question,
            answer,
        )

        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rag/memory")
async def get_memory(user_id: str, lesson_id: str, document_id: str):
    return {
        "memory_key": memory.key(user_id, lesson_id, document_id),
        "memory": memory.get(user_id, lesson_id, document_id),
    }


@app.delete("/rag/memory")
async def clear_memory(user_id: str, lesson_id: str, document_id: str):
    memory.clear(user_id, lesson_id, document_id)
    return {
        "message": "Memory cleared.",
        "memory_key": memory.key(user_id, lesson_id, document_id),
    }
