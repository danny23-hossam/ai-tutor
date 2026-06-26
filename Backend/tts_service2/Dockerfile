FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NUMBA_CACHE_DIR=/tmp/numba_cache
ENV HF_HUB_DISABLE_SYMLINKS_WARNING=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -U pip setuptools wheel && \
    pip install \
    torch==2.7.0 torchaudio==2.7.0 \
    --index-url https://download.pytorch.org/whl/cu128 && \
    pip install -r requirements.txt && \
    pip install --no-deps chatterbox-tts==0.1.3

RUN pip install transformers==4.46.2

ENV HF_HOME=/app/models_cache/namaa_dahih_lora_hf/huggingface_home
ENV HUGGINGFACE_HUB_CACHE=/app/models_cache/namaa_dahih_lora_hf/huggingface_home/hub

COPY app.py .
COPY inference.py .
COPY generate_narration.py .
COPY generate_narration_namaa_dahih_lora.py .
COPY arabic_model ./arabic_model
COPY english_model ./english_model

RUN mkdir -p /app/outputs /app/models_cache /tmp/numba_cache

ENV TTS_MODEL_CACHE=/app/models_cache/namaa_dahih_lora_hf
ENV TTS_OUTPUT_DIR=/app/outputs
ENV TTS_ARABIC_REFERENCE_WAV=/app/arabic_model/reference.wav

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
