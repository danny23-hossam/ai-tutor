from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    vector_database_service_url: str = "http://localhost:8004"
    request_timeout_seconds: float = 600.0
    memory_max_turns: int = 12
    data_dir: str = "/data"
    groq_api_key: str | None = None
    groq_base_url: str = "https://api.groq.com/openai/v1"
    rag_model_name: str = "openai/gpt-oss-20b"
    rag_temperature: float = 0.2
    rag_max_tokens: int = 500
    rag_top_k: int = 4
    rag_context_max_chars: int = 4500
    rag_chunk_max_chars: int = 1200
    rag_history_max_turns: int = 4

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
