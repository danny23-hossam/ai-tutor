# TTS Service 2

Use this folder as the replacement for `Backend/tts_service` by changing the
Docker build path to `./tts_service2`. Keep the service name as `tts_service`
so the rest of the backend can continue calling the same container hostname.

This service keeps the same API used by the existing pipeline:

```text
GET  /health
GET  /info
POST /tts
```

`POST /tts` accepts:

```json
{
  "text": "...",
  "language": "ar"
}
```

and returns WAV bytes. The pipeline can keep using:

```text
TTS_SERVICE_URL=http://tts_service:8000
```

inside Docker Compose, or `http://localhost:8002` from the host.

## Replace Existing tts_service

In `Backend/docker-compose.yml`, replace the existing `tts_service` block with:

```yaml
tts_service:
  build: ./tts_service2
  container_name: tts_service
  ports:
    - "8002:8000"
  volumes:
    - ./tts_service2/outputs:/app/outputs
    - ./tts_service2/english_model/cache:/app/english_model/cache
    - ./models_cache/namaa_dahih_lora_hf:/app/models_cache/namaa_dahih_lora_hf
  environment:
    TTS_MODEL_CACHE: /app/models_cache/namaa_dahih_lora_hf
    TTS_OUTPUT_DIR: /app/outputs
    TTS_ARABIC_REFERENCE_WAV: /app/arabic_model/reference.wav
    HF_TOKEN: ${HF_TOKEN:-}
  gpus: all
  restart: unless-stopped
```

Then build and run from `Backend/`:

```powershell
docker compose build tts_service
docker compose up tts_service
```

Or build directly from this folder:

```powershell
docker build -t tts-service2 .
```

Run directly:

```powershell
docker run --gpus all `
  -p 8002:8000 `
  -e HF_TOKEN=$env:HF_TOKEN `
  -v "C:\path\to\ai-tutor\Backend\tts_service2\outputs:/app/outputs" `
  -v "C:\path\to\ai-tutor\Backend\tts_service2\english_model\cache:/app/english_model/cache" `
  -v "C:\path\to\ai-tutor\Backend\models_cache\namaa_dahih_lora_hf:/app/models_cache/namaa_dahih_lora_hf" `
  --name tts-service2-test `
  tts-service2
```

`HF_TOKEN` is optional for public repos, but recommended for better Hugging Face rate limits. Do not commit tokens.

## Models

Large model weights are not committed to Git.

Arabic:

- Runtime: Chatterbox multilingual TTS.
- Starting checkpoint: `AliAbdallah/egyptian-arabic-tts-chatterbox`.
- LoRA adapter: `YomnaGharib/namaa-dahih-egyptian-lora`, subfolder `latest`.
- Local speaker reference: `arabic_model/reference.wav`.
- Cache mount: `/app/models_cache/namaa_dahih_lora_hf`.

English:

- Runtime: regular `ResembleAI/chatterbox`.
- Class: `chatterbox.tts.ChatterboxTTS`.
- Cache mount: `/app/english_model/cache`.

First startup can be slow because model files are downloaded. Later runs reuse mounted caches.

## Folder Structure

```text
tts_service2/
+-- app.py
+-- inference.py
+-- Dockerfile
+-- requirements.txt
+-- generate_narration.py
+-- generate_narration_namaa_dahih_lora.py
+-- arabic_model/
|   +-- README.md
|   +-- model.json
|   +-- reference.wav
+-- english_model/
|   +-- README.md
|   +-- model.json
+-- outputs/
|   +-- .gitkeep
```

Do not commit:

```text
english_model/cache/
outputs/service_*/
outputs/*.wav
outputs/*.log
models_cache/
.env
```

## Test Commands

Health:

```powershell
Invoke-RestMethod "http://localhost:8002/health"
```

Arabic:

```powershell
$body = @{
  text = "اهلا بيك، ده اختبار سريع للصوت العربي المصري."
  language = "ar"
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri "http://localhost:8002/tts" `
  -Method Post `
  -ContentType "application/json; charset=utf-8" `
  -Body $body `
  -OutFile ".\test_ar.wav"
```

English:

```powershell
$body = @{
  text = "Hello, this is a Docker test for the regular English Chatterbox voice."
  language = "en"
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri "http://localhost:8002/tts" `
  -Method Post `
  -ContentType "application/json; charset=utf-8" `
  -Body $body `
  -OutFile ".\test_en.wav"
```

Check WAV subtype and duration:

```powershell
python -c "import soundfile as sf; [print(p, sf.info(p).format, sf.info(p).subtype, sf.info(p).samplerate, round(sf.info(p).duration, 2)) for p in ['test_ar.wav','test_en.wav']]"
```

Expected subtype:

```text
PCM_16
```

## Notes

- The service intentionally uses a no-op watermark fallback when `resemble-perth` is unavailable in Docker.
- `TTS_FORCE_EAGER_ATTENTION=1` exists as a troubleshooting option, but it is off by default.
- Arabic generation refuses to return a silence-only WAV if all speech chunks fail.
