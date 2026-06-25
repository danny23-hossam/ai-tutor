from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from inference import generate_speech, load_model, normalize_language, service_info


app = FastAPI(title="NAMAA Dahih LoRA TTS Service")

tts_service = None


class TTSRequest(BaseModel):
    text: str
    language: str = "ar"


@app.on_event("startup")
def startup_event():
    global tts_service
    tts_service = load_model()
    print("NAMAA Dahih LoRA TTS model loaded successfully.")


@app.get("/health")
def health():
    info = service_info(tts_service)
    return {
        "status": "ok" if tts_service is not None else "loading",
        "model_loaded": tts_service is not None,
        "arabic_model_loaded": bool(info.get("arabic", {}).get("loaded")),
        "english_model_loaded": bool(info.get("english", {}).get("loaded")),
    }


@app.get("/info")
def info():
    return service_info(tts_service)


@app.post("/tts")
def tts(req: TTSRequest):
    if tts_service is None:
        raise HTTPException(status_code=503, detail="TTS model is not loaded yet.")

    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text is empty.")

    try:
        selected_language = normalize_language(req.language)
        audio_path = generate_speech(req.text, selected_language, tts_service)
        return FileResponse(
            audio_path,
            media_type="audio/wav",
            filename=os.path.basename(audio_path),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
