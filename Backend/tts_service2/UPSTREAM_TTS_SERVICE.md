# Upstream TTS Service Check

Source checked:

```text
https://github.com/danny23-hossam/ai-tutor/tree/main/Backend/tts_service
```

Temporary clone used for comparison:

```text
C:\tmp\ai-tutor-danny23-latest
```

## Upstream files

```text
Backend/tts_service/
+-- app.py
+-- inference.py
+-- Dockerfile
+-- requirements.txt
+-- setup_gpu.txt
+-- README.md
+-- arabic_model/
|   +-- config.json
|   +-- vocab.json
|   +-- README.md
+-- english_model/
    +-- config.json
    +-- vocab.json
    +-- README.md
```

## Important upstream behavior

- `POST /tts` accepts `text` and `language`.
- `language` can select Arabic or English in upstream XTTS.
- The service returns a WAV file response.
- Docker Compose maps host `8002` to container `8000`.
- The pipeline default is `TTS_SERVICE_URL=http://localhost:8002`.

## How tts_service2 maps to that setup

- Keeps `POST /tts` with the same request body shape.
- Keeps `GET /health`.
- Returns a WAV file response.
- Uses host port `8002` for local launcher/docs.
- Uses container port `8000` in Docker, matching upstream compose mapping.
- Uses root-level model folders like upstream.
- `arabic_model` is AliAbdallah Egyptian Arabic Chatterbox plus the
  Dahih LoRA adapter.
- `english_model` is regular `ResembleAI/chatterbox`.

## Intentional differences

- `tts_service2` uses Chatterbox for both languages instead of XTTS.
- English is regular Chatterbox, not XTTS.
- Arabic is AliAbdallah Chatterbox plus the Dahih LoRA adapter, not XTTS.
- Large model files are not copied into the service folder. The Arabic service
  defaults to the existing root cache:

```text
models_cache/namaa_dahih_lora_hf
```

- The LoRA generation code lives in `generate_narration.py` and
  `generate_narration_namaa_dahih_lora.py`, copied from the current
  `audio_gen` setup.
