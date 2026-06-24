import os
import threading
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from inference import load_model, generate_speech

app = FastAPI(title="XTTS Service")

ROOT = os.path.dirname(os.path.abspath(__file__))

ARABIC_MODEL_DIR = os.path.join(ROOT, "arabic_model")
ENGLISH_MODEL_DIR = os.path.join(ROOT, "english_model")

arabic_model = None
arabic_config = None

english_model = None
english_config = None
tts_lock = threading.Lock()


class TTSRequest(BaseModel):
    text: str
    language: str = "ar"


@app.on_event("startup")
def startup_event():
    global arabic_model, arabic_config
    global english_model, english_config

    arabic_model, arabic_config = load_model(ARABIC_MODEL_DIR)
    print("Arabic XTTS model loaded successfully.")

    english_model, english_config = load_model(ENGLISH_MODEL_DIR)
    print("English XTTS model loaded successfully.")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "arabic_model_loaded": arabic_model is not None,
        "english_model_loaded": english_model is not None,
    }


def select_model(language: str):
    """
    Choose the correct model based on the requested language.
    """

    language = language.lower().strip()

    if language in ["ar", "arabic", "ara"]:
        return arabic_model, arabic_config, "ar", ARABIC_MODEL_DIR

    if language in ["en", "english", "eng"]:
        return english_model, english_config, "en", ENGLISH_MODEL_DIR

    raise HTTPException(
        status_code=400,
        detail="Unsupported language. Use 'ar' for Arabic or 'en' for English.",
    )


@app.post("/tts")
def tts(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text is empty.")

    try:
        selected_model, selected_config, selected_language, selected_model_dir = select_model(
            req.language
        )

        if selected_model is None or selected_config is None:
            raise HTTPException(
                status_code=500,
                detail=f"Model for language '{req.language}' is not loaded.",
            )

        # XTTS keeps mutable GPU/model state during inference. Running two
        # requests through the same loaded model concurrently can corrupt the
        # CUDA execution path and surface as low-level index assertions.
        with tts_lock:
            audio_path = generate_speech(
                text=req.text,
                language=selected_language,
                model=selected_model,
                config=selected_config,
                root_dir=ROOT,
                model_dir=selected_model_dir,
            )

        return FileResponse(
            audio_path,
            media_type="audio/wav",
            filename=os.path.basename(audio_path),
        )

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

#docker build --no-cache --progress=plain -t xtts-fastapi .  
#docker run --gpus all -p 8000:8000 -v "D:/Grad_scripts/ai-tutor/Backend/tts_service/model:/app/model" -v "D:/Grad_scripts/ai-tutor/Backend/tts_service/outputs:/app/outputs" xtts-fastapi
#how to test
#$body = @{
#    text = "مرحباً بك، هذا اختبار بسيط لنظام بابيروس."
#    language = "ar"
#} | ConvertTo-Json
#
#Invoke-WebRequest -Uri "http://localhost:8000/tts" `
#  -Method Post `
#  -ContentType "application/json; charset=utf-8" `
#  -Body $body `
#  -OutFile "test_ar.wav"
