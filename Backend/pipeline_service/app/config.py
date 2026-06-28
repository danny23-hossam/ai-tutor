from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    text_service_url: str = "http://localhost:8001"
    database_service_url: str = "http://localhost:8004"
    rag_service_url: str = "http://localhost:8006"
    tts_service_url: str = "http://localhost:8002"
    document_service_url: str = "http://localhost:8003"
    video_service_url: str = "http://localhost:8007"
    request_timeout_seconds: float = 600.0
    chunk_size: int = 1200
    chunk_overlap: int = 150
    generation_max_chars: int = 24000
    aws_region: str | None = None
    s3_audio_bucket: str | None = None
    s3_audio_prefix: str = "audio"
    s3_video_bucket: str | None = None
    s3_video_prefix: str = "video"
    video_slides_llm_endpoint: str = ""
    video_upload_wait_seconds: float = 1800.0
    video_upload_poll_seconds: float = 10.0
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
