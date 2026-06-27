from __future__ import annotations

import argparse
import json
import os
import re
import threading
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

import generate_narration as base
import generate_narration_namaa_dahih_lora as lora


SERVICE_DIR = Path(__file__).resolve().parent
ARABIC_MODEL_DIR = SERVICE_DIR / "arabic_model"
ENGLISH_MODEL_DIR = SERVICE_DIR / "english_model"
DEFAULT_ARABIC_REFERENCE = ARABIC_MODEL_DIR / "reference.wav"
DEFAULT_OUTPUTS = SERVICE_DIR / "outputs"


def _default_model_cache() -> Path:
    if os.environ.get("TTS_MODEL_CACHE"):
        return Path(os.environ["TTS_MODEL_CACHE"]).expanduser()
    if len(SERVICE_DIR.parents) > 3:
        return SERVICE_DIR.parents[3] / "models_cache" / "namaa_dahih_lora_hf"
    return SERVICE_DIR / "models_cache" / "namaa_dahih_lora_hf"


DEFAULT_MODEL_CACHE = _default_model_cache()


def sanitize_hf_token_env() -> None:
    for name in ("HF_TOKEN", "HUGGING_FACE_HUB_TOKEN", "HUGGINGFACE_HUB_TOKEN"):
        if not os.environ.get(name, "").strip():
            os.environ.pop(name, None)


def force_chatterbox_eager_attention() -> None:
    if os.environ.get("TTS_FORCE_EAGER_ATTENTION", "").strip().lower() not in {"1", "true", "yes"}:
        return

    try:
        from chatterbox.models.t3 import llama_configs
    except Exception:
        return

    for config in llama_configs.LLAMA_CONFIGS.values():
        config["attn_implementation"] = "eager"


def install_perth_watermark_fallback() -> None:
    try:
        import perth
    except Exception:
        return

    if callable(getattr(perth, "PerthImplicitWatermarker", None)):
        return

    class NoOpWatermarker:
        def apply_watermark(self, wav, sample_rate=None):
            return wav

    perth.PerthImplicitWatermarker = NoOpWatermarker
    print("Warning: Perth watermark unavailable; using no-op audio watermark fallback.")


class RegularChatterboxEnglishEngine:
    def __init__(self, args: argparse.Namespace):
        sanitize_hf_token_env()
        force_chatterbox_eager_attention()
        base.require_package("torch", "Run from Namaa_tts venv, then install torch.")
        base.require_package("torchaudio", "Run from Namaa_tts venv, then install torchaudio.")
        base.require_package("huggingface_hub", "pip install huggingface_hub")
        base.ensure_numba_cache_dir()
        install_perth_watermark_fallback()

        try:
            from chatterbox.tts import ChatterboxTTS
        except ImportError as exc:
            raise SystemExit("Missing chatterbox. Run from the Namaa_tts environment.") from exc

        import torch
        from huggingface_hub import hf_hub_download

        self.torch = torch
        self.ta = base.require_package("torchaudio", "pip install torchaudio")
        self.args = args
        self.device = args.device if args.device else ("cuda" if torch.cuda.is_available() else "cpu")
        cache_dir = Path(args.model_dir) / "cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        local_path = None
        for filename in [
            "ve.safetensors",
            "t3_cfg.safetensors",
            "s3gen.safetensors",
            "tokenizer.json",
            "conds.pt",
        ]:
            local_path = hf_hub_download(
                repo_id="ResembleAI/chatterbox",
                filename=filename,
                cache_dir=str(cache_dir),
                token=os.getenv("HF_TOKEN"),
            )
        self.model = ChatterboxTTS.from_local(Path(local_path).parent, device=self.device)
        self.model.t3.to(self.device).eval()
        self.sample_rate = self.model.sr

    def variants(self, retry_index: int) -> dict:
        variants = [
            dict(exaggeration=0.45, cfg_weight=0.45, temperature=0.45, repetition_penalty=2.0, min_p=0.05, top_p=0.90),
            dict(exaggeration=0.40, cfg_weight=0.40, temperature=0.35, repetition_penalty=2.5, min_p=0.08, top_p=0.85),
            dict(exaggeration=0.35, cfg_weight=0.35, temperature=0.30, repetition_penalty=3.0, min_p=0.10, top_p=0.80),
            dict(exaggeration=0.30, cfg_weight=0.30, temperature=0.25, repetition_penalty=3.5, min_p=0.12, top_p=0.75),
        ]
        return variants[retry_index % len(variants)]

    def synthesize(self, text: str, out_path: Path, retry_index: int) -> float:
        params = self.variants(retry_index)
        reference = getattr(self.args, "english_reference", None)
        audio_prompt_path = str(reference) if reference and Path(reference).exists() else None
        wav = self.model.generate(
            text=text,
            audio_prompt_path=audio_prompt_path,
            **params,
        )
        out_path.parent.mkdir(parents=True, exist_ok=True)
        self.ta.save(str(out_path), wav.detach().cpu(), self.sample_rate)
        return base.audio_duration(out_path)


def _clean_english_text(text: str) -> str:
    text = text.strip()
    text = re.sub(r"\[pause\]", " [PAUSE] ", text, flags=re.IGNORECASE)
    text = re.sub(r"\[transition\]", " [TRANSITION] ", text, flags=re.IGNORECASE)
    text = re.sub(r"#{1,6}\s*", "", text)
    text = re.sub(r"^\s*[-*]\s+", "", text, flags=re.MULTILINE)
    text = text.replace("**", "").replace("*", "")
    text = re.sub(r"\S+@\S+", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\[(?!PAUSE\]|TRANSITION\])\d+\]", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _prepare_english_events(text: str, args: argparse.Namespace) -> list[base.Event]:
    text = _clean_english_text(text)
    if not text:
        return []

    text = re.sub(r"\[PAUSE\]", f" [pause:{args.pause_ms}ms] ", text)
    text = re.sub(r"\[TRANSITION\]", f" [pause:{args.transition_ms}ms] ", text)
    if args.punctuation_mode == "pause":
        text = re.sub(r"[,;:]", f" [pause:{args.comma_pause_ms}ms] ", text)
        text = re.sub(r"[.!?]", f" [pause:{args.stop_pause_ms}ms] ", text)
    elif args.punctuation_mode == "remove":
        text = re.sub(r"[,;:.?!]", " ", text)

    marker_re = re.compile(r"\[\s*pause\s*:\s*(\d+)\s*ms\s*\]", re.IGNORECASE)
    parts = marker_re.split(text)
    events: list[base.Event] = []
    idx = 0
    current_text = True
    for part in parts:
        part = part.strip()
        if not part:
            current_text = not current_text
            continue
        if current_text:
            for chunk in base.split_text_chunk(part, args.max_chars):
                events.append(base.Event(index=idx, kind="speech", text=chunk, source=part))
                idx += 1
        else:
            events.append(base.Event(index=idx, kind="silence", duration_ms=int(part), source=f"[pause:{part}ms]"))
            idx += 1
        current_text = not current_text
    return base.merge_short_speech_events(events, args.min_chars, args.max_chars)


def _to_mono_numpy(wav) -> np.ndarray:
    if hasattr(wav, "detach"):
        arr = wav.detach().cpu().float().numpy()
    else:
        arr = np.asarray(wav, dtype=np.float32)

    arr = np.asarray(arr, dtype=np.float32)
    arr = np.squeeze(arr)
    if arr.ndim == 0:
        arr = arr.reshape(1)
    elif arr.ndim == 2:
        if arr.shape[0] <= arr.shape[1]:
            arr = arr.mean(axis=0)
        else:
            arr = arr.mean(axis=1)
    elif arr.ndim > 2:
        arr = arr.reshape(-1)
    return np.clip(arr, -1.0, 1.0).astype(np.float32, copy=False)


def _synthesize_waveform(engine, text: str, retry_index: int, language_id: str) -> tuple[np.ndarray, float]:
    params = engine.variants(retry_index)
    if language_id == "ar":
        with base.capture_chatterbox_repetition() as repetition_logs:
            wav = engine.model.generate(
                text=text,
                language_id=base.LANGUAGE_ID,
                audio_prompt_path=str(engine.args.reference),
                **params,
            )
        if repetition_logs:
            raise base.GenerationError("; ".join(repetition_logs[-2:]))
    else:
        reference = getattr(engine.args, "english_reference", None)
        audio_prompt_path = str(reference) if reference and Path(reference).exists() else None
        wav = engine.model.generate(
            text=text,
            audio_prompt_path=audio_prompt_path,
            **params,
        )

    audio = _to_mono_numpy(wav)
    return audio, float(len(audio)) / float(engine.sample_rate)


def _generate_speech_event_memory(
    engine,
    event: base.Event,
    chunk_idx: int,
    args: argparse.Namespace,
    language_id: str,
) -> tuple[list[base.ChunkResult], list[np.ndarray]]:
    results: list[base.ChunkResult] = []
    audio_parts: list[np.ndarray] = []
    pieces = [event.text]
    pass_no = 0

    while pieces:
        text = pieces.pop(0).strip()
        if not text:
            continue

        last_error = ""
        for attempt in range(args.retries):
            try:
                audio, duration = _synthesize_waveform(engine, text, attempt, language_id)
                if duration < base.expected_min_duration(text):
                    raise base.GenerationError(
                        f"Generated audio too short: {duration:.2f}s for {len(text)} chars"
                    )
                results.append(
                    base.ChunkResult(
                        event_index=event.index,
                        chunk_index=chunk_idx,
                        kind="speech",
                        text=event.source,
                        cleaned_text=text,
                        audio_path="",
                        duration_sec=duration,
                        status="ok",
                        attempts=attempt + 1,
                    )
                )
                audio_parts.append(audio)
                return results, audio_parts
            except Exception as exc:
                last_error = repr(exc)
                base.time.sleep(args.retry_sleep_sec)

        if pass_no < args.split_retry_passes and len(text) > args.min_split_chars:
            smaller = max(args.min_split_chars, len(text) // 2)
            pieces = base.split_text_chunk(text, smaller) + pieces
            pass_no += 1
            continue

        results.append(
            base.ChunkResult(
                event_index=event.index,
                chunk_index=chunk_idx,
                kind="speech",
                text=event.source,
                cleaned_text=text,
                audio_path="",
                duration_sec=0.0,
                status="failed",
                attempts=args.retries,
                error=last_error,
            )
        )
        return results, audio_parts
    return results, audio_parts


def _silence_audio(duration_ms: int, sample_rate: int) -> np.ndarray:
    samples = max(1, int(sample_rate * duration_ms / 1000))
    return np.zeros(samples, dtype=np.float32)


def _write_final_audio(audio_parts: list[np.ndarray], final_path: Path, args: argparse.Namespace, sample_rate: int) -> None:
    sf = base.require_package("soundfile", "pip install soundfile")
    pieces = [base.apply_fade(part, sample_rate, args.fade_ms) for part in audio_parts if len(part)]
    if not pieces:
        raise RuntimeError("No successful audio chunks to stitch.")

    final = np.concatenate(pieces).astype(np.float32)
    if args.peak_normalize:
        peak = float(np.max(np.abs(final))) if len(final) else 0.0
        if peak > 0:
            final = final * min(1.0, args.peak_target / peak)
    final_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(final_path), final, sample_rate, subtype="PCM_16")


class MultiModelTTSService:
    def __init__(self, arabic_args: argparse.Namespace, english_args: argparse.Namespace):
        sanitize_hf_token_env()
        force_chatterbox_eager_attention()
        install_perth_watermark_fallback()
        self.arabic_args = arabic_args
        self.english_args = english_args
        self.arabic_engine = lora.NamaaDahihLoraEngine(arabic_args)
        self.english_engine = RegularChatterboxEnglishEngine(english_args)
        self._locks = {
            "ar": threading.Lock(),
            "en": threading.Lock(),
        }

    def synthesize(self, text: str, language: str) -> Path:
        if not text or not text.strip():
            raise ValueError("Text is empty.")

        language_id = normalize_language(language)
        args = self.arabic_args if language_id == "ar" else self.english_args
        engine = self.arabic_engine if language_id == "ar" else self.english_engine
        run_prefix = "service_arabic_lora" if language_id == "ar" else "service_english_chatterbox"
        run_name = datetime.now().strftime(f"{run_prefix}_%Y-%m-%d_%H-%M-%S_%f")
        run_dir = Path(args.output_dir).expanduser().resolve() / run_name
        run_dir.mkdir(parents=True, exist_ok=True)

        input_path = run_dir / "request.json"
        input_path.write_text(
            json.dumps({args.field: text, "language": language_id}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        request_args = deepcopy(args)
        request_args.input = str(input_path)
        request_args.run_name = run_name

        events = (
            base.prepare_events(request_args)
            if language_id == "ar"
            else _prepare_english_events(text, request_args)
        )
        if not events:
            raise ValueError("Text is empty after cleaning/splitting.")

        clean_preview = [
            {
                "index": event.index,
                "kind": event.kind,
                "text": event.text,
                "duration_ms": event.duration_ms,
            }
            for event in events
        ]
        (run_dir / "cleaned_events.json").write_text(
            json.dumps(clean_preview, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        results: list[base.ChunkResult] = []
        audio_parts: list[np.ndarray] = []
        chunk_idx = 1

        with self._locks[language_id]:
            for event in events:
                if event.kind == "silence":
                    audio_parts.append(_silence_audio(event.duration_ms, engine.sample_rate))
                    results.append(
                        base.ChunkResult(
                            event_index=event.index,
                            chunk_index=chunk_idx,
                            kind="silence",
                            text=event.source,
                            cleaned_text="",
                            audio_path="",
                            duration_sec=event.duration_ms / 1000.0,
                            status="ok",
                            attempts=0,
                        )
                    )
                else:
                    chunk_results, chunk_audio_parts = _generate_speech_event_memory(
                        engine,
                        event,
                        chunk_idx,
                        request_args,
                        language_id,
                    )
                    results.extend(chunk_results)
                    audio_parts.extend(chunk_audio_parts)
                chunk_idx += 1

            base.save_csv(results, run_dir / "chunks.csv")
            failed = [row.__dict__ for row in results if row.status == "failed"]
            (run_dir / "failed_chunks.json").write_text(
                json.dumps(failed, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            expected_speech = any(event.kind == "speech" for event in events)
            successful_speech = any(
                row.kind == "speech" and row.status == "ok"
                for row in results
            )
            if expected_speech and not successful_speech:
                error_summary = "; ".join(
                    row.error for row in results if row.status == "failed" and row.error
                )
                raise RuntimeError(
                    "All speech chunks failed; refusing to return silence-only WAV. "
                    f"First errors: {error_summary[:1000]}"
                )
            final_path = run_dir / "final.wav"
            _write_final_audio(audio_parts, final_path, request_args, engine.sample_rate)

        return final_path


def normalize_language(language: str) -> str:
    value = (language or "ar").lower().strip()
    if value in {"ar", "arabic", "ara", "egyptian-arabic", "egyptian_arabic", "egyptian"}:
        return "ar"
    if value in {"en", "english", "eng"}:
        return "en"
    raise ValueError("Unsupported language. Use 'ar' for Egyptian Arabic or 'en' for English.")


def _env_path(name: str, default: Path) -> Path:
    value = os.environ.get(name, "").strip()
    return Path(value).expanduser().resolve() if value else default.resolve()


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name, "").strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "on"}


def build_arabic_args() -> argparse.Namespace:
    dummy_input = ARABIC_MODEL_DIR / "_startup_input.json"
    reference = _env_path("TTS_ARABIC_REFERENCE_WAV", _env_path("TTS_REFERENCE_WAV", DEFAULT_ARABIC_REFERENCE))
    model_cache = _env_path("TTS_MODEL_CACHE", DEFAULT_MODEL_CACHE)
    output_dir = _env_path("TTS_OUTPUT_DIR", DEFAULT_OUTPUTS)

    args = lora.parse_args(
        [
            "--input",
            str(dummy_input),
            "--reference",
            str(reference),
            "--model-cache",
            str(model_cache),
            "--output-dir",
            str(output_dir),
            "--adapter-repo",
            os.environ.get("TTS_LORA_ADAPTER_REPO", lora.DEFAULT_ADAPTER_REPO),
            "--adapter-subfolder",
            os.environ.get("TTS_LORA_ADAPTER_SUBFOLDER", "latest"),
            "--adapter-revision",
            os.environ.get("TTS_LORA_ADAPTER_REVISION", "main"),
            "--start-checkpoint-repo",
            os.environ.get("TTS_START_CHECKPOINT_REPO", lora.START_REPO_ID),
            "--start-checkpoint-file",
            os.environ.get("TTS_START_CHECKPOINT_FILE", lora.START_CHECKPOINT_FILE),
            "--start-checkpoint-revision",
            os.environ.get("TTS_START_CHECKPOINT_REVISION", "main"),
            "--device",
            os.environ.get("TTS_DEVICE", ""),
            "--min-chars",
            os.environ.get("TTS_MIN_CHARS", "90"),
            "--max-chars",
            os.environ.get("TTS_MAX_CHARS", "200"),
            "--retries",
            os.environ.get("TTS_RETRIES", "4"),
            "--split-retry-passes",
            os.environ.get("TTS_SPLIT_RETRY_PASSES", "1"),
            "--min-split-chars",
            os.environ.get("TTS_MIN_SPLIT_CHARS", "55"),
            "--pause-ms",
            os.environ.get("TTS_PAUSE_MS", "200"),
            "--comma-pause-ms",
            os.environ.get("TTS_COMMA_PAUSE_MS", "120"),
            "--stop-pause-ms",
            os.environ.get("TTS_STOP_PAUSE_MS", "240"),
        ]
    )
    args.hf_token = os.environ.get("HF_TOKEN", os.environ.get("TTS_HF_TOKEN", ""))
    args.load_foundation_first = _env_bool("TTS_LOAD_FOUNDATION_FIRST", False)
    args.no_adapter = _env_bool("TTS_NO_ADAPTER", False)
    args.clean_only = False
    args.model_dir = ARABIC_MODEL_DIR
    args.reference = reference
    args.model_cache = str(model_cache)
    args.output_dir = str(output_dir)
    return args


def build_english_args() -> argparse.Namespace:
    output_dir = _env_path("TTS_OUTPUT_DIR", DEFAULT_OUTPUTS)
    reference_value = os.environ.get("TTS_ENGLISH_REFERENCE_WAV", "").strip()
    english_reference = Path(reference_value).expanduser().resolve() if reference_value else None
    return argparse.Namespace(
        input=str(ENGLISH_MODEL_DIR / "_startup_input.json"),
        field="transcript_text",
        output_dir=str(output_dir),
        run_name="",
        reference="",
        english_reference=english_reference,
        model_dir=ENGLISH_MODEL_DIR,
        device=os.environ.get("TTS_DEVICE", ""),
        punctuation_mode=os.environ.get("TTS_ENGLISH_PUNCTUATION_MODE", os.environ.get("TTS_PUNCTUATION_MODE", "pause")),
        pause_ms=int(os.environ.get("TTS_PAUSE_MS", "200")),
        transition_ms=int(os.environ.get("TTS_TRANSITION_MS", "400")),
        comma_pause_ms=int(os.environ.get("TTS_COMMA_PAUSE_MS", "120")),
        stop_pause_ms=int(os.environ.get("TTS_STOP_PAUSE_MS", "240")),
        min_chars=int(os.environ.get("TTS_MIN_CHARS", "90")),
        max_chars=int(os.environ.get("TTS_ENGLISH_MAX_CHARS", os.environ.get("TTS_MAX_CHARS", "200"))),
        keep_parentheses=False,
        keep_diacritics=False,
        keep_quotes=False,
        retries=int(os.environ.get("TTS_ENGLISH_RETRIES", os.environ.get("TTS_RETRIES", "4"))),
        split_retry_passes=int(os.environ.get("TTS_SPLIT_RETRY_PASSES", "1")),
        min_split_chars=int(os.environ.get("TTS_MIN_SPLIT_CHARS", "55")),
        retry_sleep_sec=float(os.environ.get("TTS_RETRY_SLEEP_SEC", "0.2")),
        fade_ms=int(os.environ.get("TTS_FADE_MS", "8")),
        peak_normalize=_env_bool("TTS_PEAK_NORMALIZE", True),
        peak_target=float(os.environ.get("TTS_PEAK_TARGET", "0.95")),
        clean_only=False,
    )


def validate_paths(args: argparse.Namespace) -> None:
    reference = Path(args.reference) if getattr(args, "reference", "") else None
    if reference and not reference.exists():
        raise FileNotFoundError(f"Reference WAV not found: {reference}")

    model_dir = Path(args.model_dir)
    if not model_dir.exists():
        raise FileNotFoundError(f"Model folder not found: {model_dir}")

    model_cache = Path(args.model_cache) if hasattr(args, "model_cache") else None
    if model_cache and not model_cache.exists():
        model_cache.mkdir(parents=True, exist_ok=True)


def load_model() -> MultiModelTTSService:
    arabic_args = build_arabic_args()
    english_args = build_english_args()
    validate_paths(arabic_args)
    validate_paths(english_args)
    return MultiModelTTSService(arabic_args, english_args)


def generate_speech(text: str, language: str, service: MultiModelTTSService) -> Path:
    return service.synthesize(text, language)


def service_info(service: MultiModelTTSService | None) -> dict[str, Any]:
    if service is None:
        return {"loaded": False}
    return {
        "loaded": True,
        "outputs": service.arabic_args.output_dir,
        "arabic": {
            "loaded": service.arabic_engine is not None,
            "device": service.arabic_engine.device,
            "sample_rate": service.arabic_engine.sample_rate,
            "model_dir": str(service.arabic_args.model_dir),
            "reference": str(service.arabic_args.reference),
            "model_cache": str(service.arabic_args.model_cache),
            "adapter_repo": service.arabic_args.adapter_repo,
            "adapter_subfolder": service.arabic_args.adapter_subfolder,
            "start_checkpoint_repo": service.arabic_args.start_checkpoint_repo,
            "max_chars": service.arabic_args.max_chars,
            "min_chars": service.arabic_args.min_chars,
            "retries": service.arabic_args.retries,
            "split_retry_passes": service.arabic_args.split_retry_passes,
            "min_split_chars": service.arabic_args.min_split_chars,
            "pause_ms": service.arabic_args.pause_ms,
            "comma_pause_ms": service.arabic_args.comma_pause_ms,
            "stop_pause_ms": service.arabic_args.stop_pause_ms,
            "generation_variants_by_retry": [
                service.arabic_engine.variants(i) for i in range(service.arabic_args.retries)
            ],
        },
        "english": {
            "loaded": service.english_engine is not None,
            "device": service.english_engine.device,
            "sample_rate": service.english_engine.sample_rate,
            "model_dir": str(service.english_args.model_dir),
            "model_repo": "ResembleAI/chatterbox",
            "reference": str(service.english_args.english_reference) if service.english_args.english_reference else "built-in default voice",
            "min_chars": service.english_args.min_chars,
            "max_chars": service.english_args.max_chars,
        },
    }
