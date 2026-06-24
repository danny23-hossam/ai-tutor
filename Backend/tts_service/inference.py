import os
import re
import time
import unicodedata
import uuid

import torch
import torchaudio
from torch.serialization import safe_globals

from TTS.tts.configs.xtts_config import XttsConfig
from TTS.tts.models.xtts import Xtts, XttsArgs, XttsAudioConfig
from TTS.config.shared_configs import BaseDatasetConfig


MOJIBAKE_MARKERS = ("Ø", "Ù", "Ð", "Ñ", "â", "Ã", "Â")

SYMBOL_REPLACEMENTS = {
    "α": " alpha ",
    "β": " beta ",
    "γ": " gamma ",
    "δ": " delta ",
    "Δ": " delta ",
    "ε": " epsilon ",
    "λ": " lambda ",
    "μ": " mu ",
    "π": " pi ",
    "σ": " sigma ",
    "θ": " theta ",
    "∞": " infinity ",
    "×": " times ",
    "÷": " divided by ",
    "·": " times ",
    "≤": " less than or equal to ",
    "≥": " greater than or equal to ",
    "≠": " not equal to ",
    "≈": " approximately ",
    "→": " to ",
    "←": " from ",
    "↔": " to and from ",
    "⇒": " implies ",
    "∑": " summation ",
    "√": " square root ",
    "∈": " in ",
    "∉": " not in ",
    "∩": " intersection ",
    "∪": " union ",
    "–": " ",
    "—": " ",
    "−": " minus ",
    "“": '"',
    "”": '"',
    "‘": "'",
    "’": "'",
}


# ---------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------

def load_model(model_dir: str):
    """
    Load the fine-tuned XTTS model.

    Expected folder structure:

    model/
        config.json
        speaker_reference.wav
        model.pth
        vocab.json
        other checkpoint files...
    """

    config_path = os.path.join(model_dir, "config.json")

    if not os.path.exists(config_path):
        raise FileNotFoundError(f"config.json not found at: {config_path}")

    config = XttsConfig()
    config.load_json(config_path)

    model = Xtts.init_from_config(config)

    with safe_globals([XttsConfig, XttsArgs, XttsAudioConfig, BaseDatasetConfig]):
        model.load_checkpoint(config, checkpoint_dir=model_dir)

    if torch.cuda.is_available():
        model.cuda()
        print("XTTS model loaded on GPU.")
    else:
        print("XTTS model loaded on CPU.")

    model.eval()

    return model, config


# ---------------------------------------------------------------------
# Text cleaning
# ---------------------------------------------------------------------

def clean_tts_text(text: str) -> str:
    """
    Clean generated script before sending it to XTTS.

    Important:
    - Keeps [pause] and [transition] markers because we use them later
      to insert real silence.
    - Keeps technical/math words like log, sin, cos, softmax in English.
    """

    if not text:
        return ""

    text = repair_common_mojibake(text.strip())
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[\u0610-\u061a\u0640\u064b-\u065f\u0670\u06d6-\u06ed]", "", text)

    # Normalize different marker styles
    text = re.sub(r"\[pause\]", " [PAUSE] ", text, flags=re.IGNORECASE)
    text = re.sub(r"\[transition\]", " [TRANSITION] ", text, flags=re.IGNORECASE)

    # Remove markdown headings like ##, ###, etc.
    text = re.sub(r"#{1,6}\s*", "", text)

    # Remove markdown bullets at line starts
    text = re.sub(r"^\s*[-*]\s+", "", text, flags=re.MULTILINE)

    # Remove markdown bold/italic symbols
    text = text.replace("**", "")
    text = text.replace("*", "")

    # Remove horizontal separators
    text = re.sub(r"-{3,}", " ", text)

    # Remove emails because XTTS may read them badly
    text = re.sub(r"\S+@\S+", " ", text)

    # Remove reference numbers like [38], [2], [9]
    # But do not remove [PAUSE] or [TRANSITION]
    text = re.sub(
        r"\[(?!PAUSE\]|TRANSITION\])\d+\]",
        " ",
        text,
        flags=re.IGNORECASE,
    )

    # Remove SSML/XML tags if they accidentally arrive
    text = re.sub(r"<[^>]+>", " ", text)

    # Remove LaTeX block markers
    text = text.replace("\\[", " ")
    text = text.replace("\\]", " ")
    text = text.replace("\\(", " ")
    text = text.replace("\\)", " ")

    # Convert common LaTeX text command
    text = re.sub(r"\\text\{([^}]*)\}", r"\1", text)

    # Keep important technical/math commands in English
    text = re.sub(r"\\log", " log ", text)
    text = re.sub(r"\\sin", " sine ", text)
    text = re.sub(r"\\cos", " cosine ", text)
    text = re.sub(r"\\tan", " tangent ", text)
    text = re.sub(r"\\softmax", " softmax ", text)
    text = re.sub(r"\\operatorname\{softmax\}", " softmax ", text)

    # Convert common LaTeX math commands to readable English
    text = re.sub(r"\\sqrt\{([^}]*)\}", r" square root of \1 ", text)
    text = re.sub(r"\\frac\{([^}]*)\}\{([^}]*)\}", r"\1 over \2", text)
    text = re.sub(r"\\sum", " summation ", text)
    text = re.sub(r"\\max", " max ", text)
    text = re.sub(r"\\min", " min ", text)
    text = re.sub(r"\\exp", " exp ", text)

    # Common math and typography symbols. XTTS can fail hard on some symbols
    # that survive tokenization, especially in mixed Arabic/math transcripts.
    for old, new in SYMBOL_REPLACEMENTS.items():
        text = text.replace(old, new)

    text = re.sub(r"\b([A-Za-z])\s*_\s*([A-Za-z0-9]+)\b", r"\1 sub \2", text)
    text = re.sub(r"\b([A-Za-z])\s*\^\s*([A-Za-z0-9]+)\b", r"\1 power \2", text)
    text = re.sub(r"(?<=\w)_(?=\w)", " sub ", text)
    text = re.sub(r"(?<=\w)\^(?=\w)", " power ", text)
    text = text.replace("=", " equals ")
    text = text.replace("<", " less than ")
    text = text.replace(">", " greater than ")
    text = text.replace("/", " over ")
    text = text.replace("^", " power ")

    # Make some frequent AI terms stay readable in English
    replacements = {
        "softmax": " softmax ",
        "Softmax": " softmax ",
        "BLEU": " BLEU ",
        "Transformer": " Transformer ",
        "transformer": " Transformer ",
        "Adam": " Adam ",
        "ReLU": " ReLU ",
        "RNN": " RNN ",
        "LSTM": " LSTM ",
        "GRU": " GRU ",
        "CNN": " CNN ",
        "GPU": " GPU ",
        "P100": " P100 ",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    # Remove remaining LaTeX commands but keep surrounding content
    text = re.sub(r"\\[a-zA-Z]+", " ", text)

    # Remove braces used in LaTeX
    text = text.replace("{", " ")
    text = text.replace("}", " ")

    # Drop control characters and symbols that are not useful for narration.
    text = "".join(
        " "
        if (
            unicodedata.category(char).startswith("C")
            or unicodedata.category(char).startswith("S")
        )
        else char
        for char in text
    )

    # Clean duplicate punctuation/spaces
    text = re.sub(r"\s+", " ", text)

    # Restore markers cleanly
    text = text.replace("[ PAUSE ]", "[PAUSE]")
    text = text.replace("[ TRANSITION ]", "[TRANSITION]")

    return text.strip()


def repair_common_mojibake(text: str) -> str:
    """
    Repair common UTF-8-as-Latin-1/Windows-1252 mojibake when it genuinely
    arrives in request text. Correct Arabic text is left unchanged.
    """

    if not text or not any(marker in text for marker in MOJIBAKE_MARKERS):
        return text

    candidates = [text]

    for encoding in ("latin-1", "cp1252"):
        try:
            candidates.append(text.encode(encoding).decode("utf-8"))
        except UnicodeError:
            pass

    def score(candidate: str) -> int:
        arabic_count = sum("\u0600" <= char <= "\u06ff" for char in candidate)
        mojibake_count = sum(candidate.count(marker) for marker in MOJIBAKE_MARKERS)
        replacement_count = candidate.count("\ufffd")
        return arabic_count * 3 - mojibake_count * 4 - replacement_count * 10

    return max(candidates, key=score)


def split_long_sentence(sentence: str, max_chars: int) -> list[str]:
    words = sentence.split()

    if not words:
        return []

    chunks = []
    current = ""

    for word in words:
        if len(word) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(word[i:i + max_chars] for i in range(0, len(word), max_chars))
            continue

        candidate = f"{current} {word}".strip() if current else word

        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = word

    if current:
        chunks.append(current)

    return chunks


# ---------------------------------------------------------------------
# Splitting text while preserving real pauses
# ---------------------------------------------------------------------

def split_text_with_pauses(text: str, max_chars: int = 165):
    """
    Split text into XTTS-safe chunks and pause markers.

    Returns items like:

    [
        {"type": "text", "content": "..."},
        {"type": "pause", "duration": 0.45},
        {"type": "text", "content": "..."},
        {"type": "pause", "duration": 0.80},
    ]
    """

    text = clean_tts_text(text)

    if not text:
        return []

    # Split while keeping pause markers
    parts = re.split(r"(\[PAUSE\]|\[TRANSITION\])", text)

    final_items = []

    for part in parts:
        part = part.strip()

        if not part:
            continue

        if part == "[PAUSE]":
            final_items.append({
                "type": "pause",
                "duration": 0.45,
            })
            continue

        if part == "[TRANSITION]":
            final_items.append({
                "type": "pause",
                "duration": 0.80,
            })
            continue

        # Split normal text by Arabic and English punctuation
        sentences = re.split(r"(?<=[\.\!\?؟…؛])\s+", part)

        current = ""

        for sentence in sentences:
            sentence = sentence.strip()

            if not sentence:
                continue

            # If a sentence is too long, split manually
            if len(sentence) > max_chars:
                if current:
                    final_items.append({
                        "type": "text",
                        "content": current.strip(),
                    })
                    current = ""

                for small_part in split_long_sentence(sentence, max_chars):
                    if small_part:
                        final_items.append({
                            "type": "text",
                            "content": small_part,
                        })

                continue

            if len(current) + 1 + len(sentence) <= max_chars:
                current = f"{current} {sentence}".strip()
            else:
                if current:
                    final_items.append({
                        "type": "text",
                        "content": current.strip(),
                    })
                current = sentence

        if current:
            final_items.append({
                "type": "text",
                "content": current.strip(),
            })

    return final_items


# ---------------------------------------------------------------------
# Inference for long text
# ---------------------------------------------------------------------

@torch.inference_mode()
def infer_long_text(
    model,
    config,
    text: str,
    speaker_wav: str,
    out_path: str,
    language: str,
    max_chars: int = 165,
):
    """
    Generate speech for long text.

    Steps:
    1. Clean the text.
    2. Split it into safe chunks.
    3. Convert [pause] and [transition] into real silence.
    4. Generate audio chunk by chunk.
    5. Concatenate all audio parts into one WAV file.
    """

    if not os.path.exists(speaker_wav):
        raise FileNotFoundError(f"speaker_reference.wav not found at: {speaker_wav}")

    items = split_text_with_pauses(text, max_chars=max_chars)

    if not items:
        raise ValueError("Empty text after cleaning/splitting.")

    text_item_count = sum(item["type"] == "text" for item in items)
    print(f"Generating speech for {len(items)} text/pause items ({text_item_count} text chunks)...")

    # Compute speaker conditioning once per request
    gpt_latent, speaker_emb = model.get_conditioning_latents(
        audio_path=[speaker_wav]
    )

    sample_rate = config.audio.sample_rate
    audio_parts = []
    text_chunk_count = 0

    for item in items:
        if item["type"] == "pause":
            duration = item["duration"]
            silence = torch.zeros(int(sample_rate * duration))
            audio_parts.append(silence)
            continue

        chunk = item["content"]
        text_chunk_count += 1

        print(f"Generating text chunk {text_chunk_count}/{text_item_count}: {chunk[:120]}")

        try:
            out = model.inference(
                chunk,
                language,
                gpt_cond_latent=gpt_latent,
                speaker_embedding=speaker_emb,
                temperature=0.7,
                repetition_penalty=10.0,
                enable_text_splitting=False,
            )
        except Exception as exc:
            raise RuntimeError(
                f"TTS inference failed at text chunk "
                f"{text_chunk_count}/{text_item_count}: {chunk[:160]!r}"
            ) from exc

        wav = torch.tensor(out["wav"]).float().cpu()
        audio_parts.append(wav)

        # Very small natural silence between generated chunks
        small_gap = torch.zeros(int(sample_rate * 0.12))
        audio_parts.append(small_gap)

    if not audio_parts:
        raise ValueError("No audio parts were generated.")

    full_wav = torch.cat(audio_parts, dim=0).clamp(-1.0, 1.0).unsqueeze(0)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    torchaudio.save(
        out_path,
        full_wav,
        sample_rate,
        encoding="PCM_S",
        bits_per_sample=16,
    )

    return out_path


# ---------------------------------------------------------------------
# FastAPI-compatible generation function
# ---------------------------------------------------------------------

def generate_speech(
    text: str,
    language: str,
    model,
    config,
    root_dir: str,
    model_dir: str,
):
    """
    FastAPI-compatible function.

    The model is already loaded in app.py.
    model_dir is selected based on language:
    - model_arabic for Arabic
    - english_model for English
    """

    text = clean_tts_text(text)

    if not text:
        raise ValueError("Text is empty after cleaning.")

    speaker_wav = os.path.join(model_dir, "speaker_reference.wav")

    output_dir = os.path.join(root_dir, "outputs")
    os.makedirs(output_dir, exist_ok=True)

    output_path = os.path.join(output_dir, f"tts_{uuid.uuid4().hex}.wav")

    t1 = time.perf_counter()

    audio_path = infer_long_text(
        model=model,
        config=config,
        text=text,
        speaker_wav=speaker_wav,
        out_path=output_path,
        language=language,
        max_chars=120 if language == "ar" else 165,
    )

    t2 = time.perf_counter()
    print(f"Inference time: {t2 - t1:.3f} seconds")

    return audio_path

# ---------------------------------------------------------------------
# Optional local test only
# ---------------------------------------------------------------------

def read_text_file(path: str) -> str:
    """
    Read UTF-8 text file.
    utf-8-sig handles files saved with BOM on Windows.
    """

    with open(path, "r", encoding="utf-8-sig") as f:
        return f.read().strip()

