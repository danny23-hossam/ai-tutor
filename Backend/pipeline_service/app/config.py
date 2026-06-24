from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    text_service_url: str = "http://localhost:8001"
    database_service_url: str = "http://localhost:8004"
    rag_service_url: str = "http://localhost:8006"
    tts_service_url: str = "http://localhost:8002"
    document_service_url: str = "http://localhost:8003"
    request_timeout_seconds: float = 600.0
    chunk_size: int = 1200
    chunk_overlap: int = 150
    generation_max_chars: int = 24000
    aws_region: str | None = None
    s3_audio_bucket: str | None = None
    s3_audio_prefix: str = "audio"
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
