# -*- coding: utf-8 -*-
"""
Unified narration cleaner/generator for:
- NAMAA Egyptian TTS / Chatterbox multilingual
- YomnaGharib/Egtts-v0.2 XTTS-v2 checkpoint

Input is a JSON object containing transcript_text. The script cleans text,
turns pause markers and punctuation into silence events, generates per-chunk
WAV files, retries unstable chunks, and stitches a final WAV.
"""

from __future__ import annotations

import argparse
import contextlib
import csv
import html
import json
import logging
import math
import os
import random
import re
import shutil
import sys
import tempfile
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional

import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
DEFAULT_REF = SCRIPT_DIR / "reference.wav"
DEFAULT_CACHE = SCRIPT_DIR / "models_cache"
DEFAULT_OUTPUTS = SCRIPT_DIR / "outputs"

NAMAA_REPO_ID = "NAMAA-Space/NAMAA-Egyptian-TTS"
NAMAA_T3_CHECKPOINT_FILE = "t3_mtl23ls_v2.safetensors"
NAMAA_FINETUNED_REPO_ID = "AliAbdallah/egyptian-arabic-tts-chatterbox"
NAMAA_FINETUNED_CHECKPOINT_FILE = "model.safetensors"
XTTS_REPO_ID = "YomnaGharib/Egtts-v0.2"
XTTS_CHECKPOINT_FILE = "checkpoint_71500.pth"
LANGUAGE_ID = "ar"


ARABIC_DIACRITICS_RE = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]")
CONTROL_RE = re.compile(r"[\u0000-\u001f\u007f-\u009f]")
MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
PAUSE_MARKER_RE = re.compile(
    r"\[\s*(pause|transition|break|silence)"
    r"(?:\s*[:=]\s*(\d+(?:\.\d+)?)\s*(ms|msec|milliseconds?|s|sec|seconds?)?)?"
    r"\s*\]",
    re.IGNORECASE,
)
LEFTOVER_BRACKET_RE = re.compile(r"\[[^\]]{1,120}\]")
PAREN_RE = re.compile(r"\([^)]{0,220}\)|\[[^\]]{0,220}\]")
QUOTE_RE = re.compile(r"[\"'«»]")
REPEATED_PUNCT_RE = re.compile(r"([,;:?!.\-])\1+")

ARABIC_DIGITS = str.maketrans("\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669", "0123456789")
PERSIAN_DIGITS = str.maketrans("\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9", "0123456789")
SUPERSCRIPT_MAP = str.maketrans({
    "\u2070": "0", "\u00B9": "1", "\u00B2": "2", "\u00B3": "3", "\u2074": "4",
    "\u2075": "5", "\u2076": "6", "\u2077": "7", "\u2078": "8", "\u2079": "9",
    "\u207B": "-", "\u207A": "+",
})
SUBSCRIPT_MAP = str.maketrans({
    "\u2080": "0", "\u2081": "1", "\u2082": "2", "\u2083": "3", "\u2084": "4",
    "\u2085": "5", "\u2086": "6", "\u2087": "7", "\u2088": "8", "\u2089": "9",
})


@dataclass
class Event:
    index: int
    kind: str
    text: str = ""
    duration_ms: int = 0
    source: str = ""


@dataclass
class ChunkResult:
    event_index: int
    chunk_index: int
    kind: str
    text: str
    cleaned_text: str
    audio_path: str
    duration_sec: float
    status: str
    attempts: int
    error: str = ""


class GenerationError(RuntimeError):
    pass


def require_package(import_name: str, install_hint: str):
    try:
        return __import__(import_name)
    except ImportError as exc:
        raise SystemExit(f"Missing dependency: {import_name}\nInstall hint: {install_hint}") from exc


def ensure_numba_cache_dir():
    cache_dir = Path(os.environ.get("NUMBA_CACHE_DIR") or Path(tempfile.gettempdir()) / "numba_cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("NUMBA_CACHE_DIR", str(cache_dir))


def read_text_file(path: Path) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1256", "cp1252"):
        try:
            return path.read_text(encoding=enc)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="replace")


def fix_possible_mojibake(text: str) -> str:
    if not isinstance(text, str):
        return text
    suspicious = ("" in text) or ("" in text) or ("" in text)
    if not suspicious:
        return text
    original_score = len(re.findall(r"[\u0600-\u06FF]", text))
    for enc in ("latin1", "cp1252"):
        try:
            repaired = text.encode(enc).decode("utf-8")
        except UnicodeError:
            continue
        repaired_score = len(re.findall(r"[\u0600-\u06FF]", repaired))
        if repaired_score > original_score:
            return repaired
    return text


def extract_transcript(path: Path, field: str) -> str:
    raw = fix_possible_mojibake(read_text_file(path).strip())
    obj = json.loads(raw)
    if not isinstance(obj, dict):
        raise ValueError("Input JSON must be one object, not a list.")
    if field not in obj:
        raise ValueError(f"Input JSON missing field: {field}")
    return str(obj[field])


ONES = {
    0: "\u0635\u0641\u0631", 1: "\u0648\u0627\u062d\u062f", 2: "\u0627\u062a\u0646\u064a\u0646", 3: "\u062a\u0644\u0627\u062a\u0629", 4: "\u0623\u0631\u0628\u0639\u0629",
    5: "\u062e\u0645\u0633\u0629", 6: "\u0633\u062a\u0629", 7: "\u0633\u0628\u0639\u0629", 8: "\u062a\u0645\u0646\u064a\u0629", 9: "\u062a\u0633\u0639\u0629",
}
TENS = {
    10: "\u0639\u0634\u0631\u0629", 11: "\u062d\u062f\u0627\u0634\u0631", 12: "\u0627\u062a\u0646\u0627\u0634\u0631", 13: "\u062a\u0644\u062a\u0627\u0634\u0631", 14: "\u0623\u0631\u0628\u0639\u062a\u0627\u0634\u0631",
    15: "\u062e\u0645\u0633\u062a\u0627\u0634\u0631", 16: "\u0633\u062a\u0627\u0634\u0631", 17: "\u0633\u0628\u0639\u062a\u0627\u0634\u0631", 18: "\u062a\u0645\u0646\u062a\u0627\u0634\u0631", 19: "\u062a\u0633\u0639\u062a\u0627\u0634\u0631",
    20: "\u0639\u0634\u0631\u064a\u0646", 30: "\u062a\u0644\u0627\u062a\u064a\u0646", 40: "\u0623\u0631\u0628\u0639\u064a\u0646", 50: "\u062e\u0645\u0633\u064a\u0646", 60: "\u0633\u062a\u064a\u0646",
    70: "\u0633\u0628\u0639\u064a\u0646", 80: "\u062a\u0645\u0627\u0646\u064a\u0646", 90: "\u062a\u0633\u0639\u064a\u0646",
}
HUNDREDS = {
    100: "\u0645\u064a\u0629", 200: "\u0645\u064a\u062a\u064a\u0646", 300: "\u062a\u0644\u062a\u0645\u064a\u0629", 400: "\u0631\u0628\u0639\u0645\u064a\u0629",
    500: "\u062e\u0645\u0633\u0645\u064a\u0629", 600: "\u0633\u062a\u0645\u064a\u0629", 700: "\u0633\u0628\u0639\u0645\u064a\u0629", 800: "\u062a\u0645\u0646\u0645\u064a\u0629", 900: "\u062a\u0633\u0639\u0645\u064a\u0629",
}


def int_to_egyptian(n: int) -> str:
    if n < 0:
        return "\u0633\u0627\u0644\u0628 " + int_to_egyptian(abs(n))
    if n < 10:
        return ONES[n]
    if n < 20:
        return TENS[n]
    if n < 100:
        tens = (n // 10) * 10
        ones = n % 10
        return TENS[tens] if ones == 0 else f"{ONES[ones]} \u0648 {TENS[tens]}"
    if n < 1000:
        hundreds = (n // 100) * 100
        rest = n % 100
        return HUNDREDS[hundreds] if rest == 0 else f"{HUNDREDS[hundreds]} \u0648 {int_to_egyptian(rest)}"
    if n < 1_000_000:
        thousands = n // 1000
        rest = n % 1000
        if thousands == 1:
            base = "\u0623\u0644\u0641"
        elif thousands == 2:
            base = "\u0623\u0644\u0641\u064a\u0646"
        elif 3 <= thousands <= 10:
            base = f"{int_to_egyptian(thousands)} \u0622\u0644\u0627\u0641"
        else:
            base = f"{int_to_egyptian(thousands)} \u0623\u0644\u0641"
        return base if rest == 0 else f"{base} \u0648 {int_to_egyptian(rest)}"
    if n < 1_000_000_000:
        millions = n // 1_000_000
        rest = n % 1_000_000
        if millions == 1:
            base = "\u0645\u0644\u064a\u0648\u0646"
        elif millions == 2:
            base = "\u0645\u0644\u064a\u0648\u0646\u064a\u0646"
        else:
            base = f"{int_to_egyptian(millions)} \u0645\u0644\u064a\u0648\u0646"
        return base if rest == 0 else f"{base} \u0648 {int_to_egyptian(rest)}"
    return " ".join(ONES[int(d)] for d in str(n))


def year_to_egyptian(year: int) -> str:
    if 2000 <= year <= 2099:
        rest = year - 2000
        return "\u0623\u0644\u0641\u064a\u0646" if rest == 0 else f"\u0623\u0644\u0641\u064a\u0646 \u0648 {int_to_egyptian(rest)}"
    if 1900 <= year <= 1999:
        rest = year - 1900
        return "\u0623\u0644\u0641 \u062a\u0633\u0639\u0645\u064a\u0629" if rest == 0 else f"\u0623\u0644\u0641 \u062a\u0633\u0639\u0645\u064a\u0629 \u0648 {int_to_egyptian(rest)}"
    return int_to_egyptian(year)


def decimal_to_egyptian(match: re.Match) -> str:
    left = int(match.group(1))
    right = match.group(2)
    return f"{int_to_egyptian(left)} \u0641\u0627\u0635\u0644\u0629 {' '.join(ONES[int(d)] for d in right)}"


def number_to_egyptian(match: re.Match) -> str:
    n = int(match.group(0))
    if 1900 <= n <= 2099:
        return year_to_egyptian(n)
    return int_to_egyptian(n)


def percent_to_egyptian(match: re.Match) -> str:
    value = match.group(1)
    if "." in value:
        spoken = decimal_to_egyptian(re.match(r"(\d+)\.(\d+)", value))
    else:
        spoken = int_to_egyptian(int(value))
    return f"{spoken} \u0641\u064a \u0627\u0644\u0645\u064a\u0629"


def scientific_power_to_egyptian(match: re.Match) -> str:
    base = match.group(1)
    exp = match.group(2)
    if "." in base:
        base_spoken = decimal_to_egyptian(re.match(r"(\d+)\.(\d+)", base))
    else:
        base_spoken = int_to_egyptian(int(base))
    exp_spoken = int_to_egyptian(int(exp))
    return f" {base_spoken} \u0627\u0633 {exp_spoken} "


def marker_token(index: int) -> str:
    letters = []
    n = index
    while True:
        letters.append(chr(ord("A") + (n % 26)))
        n //= 26
        if n == 0:
            break
    return "ZZZPAUSEMARKER" + "".join(letters) + "ZZZ"


def normalize_math_symbols(text: str) -> str:
    text = text.translate(SUPERSCRIPT_MAP).translate(SUBSCRIPT_MAP)
    text = re.sub(r"(\d+(?:\.\d+)?)\s*(?:\^|\*\*)\s*\(?\s*([+-]?\d+)\s*\)?", scientific_power_to_egyptian, text)
    text = re.sub(r"(\d+(?:\.\d+)?)\s*[%٪]", percent_to_egyptian, text)
    text = re.sub(r"(\d+)\.(\d+)", decimal_to_egyptian, text)
    text = re.sub(r"(?<![\w])\d{1,9}(?![\w])", number_to_egyptian, text)

    symbol_words = {
        "\u00B7": " \u0636\u0631\u0628 ",
        "\u00D7": " \u0636\u0631\u0628 ",
        "*": " \u0636\u0631\u0628 ",
        "/": " \u0639\u0644\u0649 ",
        "=": " \u064a\u0633\u0627\u0648\u064a ",
        "+": " \u0632\u0627\u0626\u062f ",
        "\u2212": " \u0646\u0627\u0642\u0635 ",
        "-": " \u0646\u0627\u0642\u0635 ",
        "\u03B2": "\u0628\u064a\u062a\u0627",
        "\u03B5": "\u0625\u0628\u0633\u064a\u0644\u0648\u0646",
    }
    for k, v in symbol_words.items():
        text = text.replace(k, v)

    # d_model -> d model, h_t-1 -> h t اص احد after symbol handling.
    text = re.sub(r"(?<=\w)_(?=\w)", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text


def clean_text_for_tts(
    text: str,
    keep_parentheses: bool,
    remove_diacritics: bool,
    remove_quotes: bool,
) -> str:
    text = fix_possible_mojibake(text)
    text = html.unescape(text)
    text = unicodedata.normalize("NFKC", text)

    protected_markers: dict[str, str] = {}

    def protect_marker(match: re.Match) -> str:
        token = marker_token(len(protected_markers))
        protected_markers[token] = match.group(0)
        return f" {token} "

    text = PAUSE_MARKER_RE.sub(protect_marker, text)
    text = CONTROL_RE.sub(" ", text)
    text = MARKDOWN_LINK_RE.sub(r"\1", text)
    text = URL_RE.sub(" ", text)
    if not keep_parentheses:
        text = re.sub(r"[()\[\]]", " ", text)
        text = LEFTOVER_BRACKET_RE.sub(" ", text)
    text = text.replace("\u0640", "")
    text = text.translate(ARABIC_DIGITS).translate(PERSIAN_DIGITS)
    if remove_diacritics:
        text = ARABIC_DIACRITICS_RE.sub("", text)
    text = re.sub(r"[إأآٱ]", "ا", text)
    text = normalize_math_symbols(text)
    if remove_quotes:
        text = QUOTE_RE.sub(" ", text)
    text = text.replace("\u2026", ".")
    text = REPEATED_PUNCT_RE.sub(r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([\u060C,\u061B;:.\u061F?!])", r"\1", text)
    text = re.sub(r"([\u060C,\u061B;:.\u061F?!])(?=\S)", r"\1 ", text)
    for token, marker in protected_markers.items():
        text = text.replace(token, marker)
    return text.strip()


def punctuation_to_markers(text: str, comma_ms: int, stop_ms: int) -> str:
    # The punctuation is removed from speech and represented as silence.
    text = re.sub(r"[\u060C,\u061B;:]", f" [pause:{comma_ms}ms] ", text)
    text = re.sub(r"[.\u061F?!]", f" [pause:{stop_ms}ms] ", text)
    return text


def split_markers(text: str, pause_ms: int, transition_ms: int) -> list[Event]:
    events: list[Event] = []
    pos = 0
    index = 0
    for match in PAUSE_MARKER_RE.finditer(text):
        before = text[pos:match.start()].strip()
        if before:
            events.append(Event(index=index, kind="speech", text=before, source=before))
            index += 1
        marker = match.group(1).lower()
        value = match.group(2)
        unit = (match.group(3) or "ms").lower()
        if value is not None:
            duration = float(value)
            if unit.startswith("s") and unit not in {"ms", "msec", "millisecond", "milliseconds"}:
                duration_ms = int(duration * 1000)
            else:
                duration_ms = int(duration)
        else:
            duration_ms = transition_ms if marker == "transition" else pause_ms
        events.append(Event(index=index, kind="silence", duration_ms=duration_ms, source=match.group(0)))
        index += 1
        pos = match.end()
    tail = text[pos:].strip()
    if tail:
        events.append(Event(index=index, kind="speech", text=tail, source=tail))
    return events


def split_text_chunk(text: str, max_chars: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    boundaries = [
        r"(?<=[.!?])\s+",
        r"(?<=[,;:])\s+",
        r"\s+",
    ]
    chunks = [text]
    for pattern in boundaries:
        next_chunks: list[str] = []
        for chunk in chunks:
            if len(chunk) <= max_chars:
                next_chunks.append(chunk)
                continue
            current = ""
            for part in re.split(pattern, chunk):
                part = part.strip()
                if not part:
                    continue
                if len(current) + len(part) + 1 <= max_chars:
                    current = (current + " " + part).strip()
                else:
                    if current:
                        next_chunks.append(current)
                    current = part
            if current:
                next_chunks.append(current)
        chunks = next_chunks

    final: list[str] = []
    for chunk in chunks:
        while len(chunk) > max_chars:
            cut = chunk.rfind(" ", 0, max_chars)
            if cut < max_chars // 2:
                cut = max_chars
            final.append(chunk[:cut].strip())
            chunk = chunk[cut:].strip()
        if chunk:
            final.append(chunk)
    return final


def _merge_speech_event(left: Event, right: Event) -> Event:
    text = f"{left.text} {right.text}".strip()
    source = f"{left.source} {right.source}".strip()
    return Event(index=left.index, kind="speech", text=text, source=source)


def merge_short_speech_events(events: list[Event], min_chars: int, max_chars: int) -> list[Event]:
    if min_chars <= 0:
        return events

    out: list[Event] = []
    i = 0
    while i < len(events):
        event = events[i]
        if event.kind != "speech":
            out.append(event)
            i += 1
            continue

        current = event
        i += 1
        held_silences: list[Event] = []
        while len(current.text) < min_chars and i < len(events):
            candidate = events[i]
            if candidate.kind == "silence":
                held_silences.append(candidate)
                i += 1
                continue

            combined = _merge_speech_event(current, candidate)
            if len(combined.text) > max_chars:
                break
            current = combined
            held_silences = []
            i += 1

        if len(current.text) < min_chars:
            merge_index = None
            for j in range(len(out) - 1, -1, -1):
                if out[j].kind == "speech":
                    merge_index = j
                    break
                if out[j].kind != "silence":
                    break
            if merge_index is not None:
                combined = _merge_speech_event(out[merge_index], current)
                if len(combined.text) <= max_chars:
                    out[merge_index] = combined
                    del out[merge_index + 1 :]
                    out.extend(held_silences)
                    continue

        out.append(current)
        out.extend(held_silences)

    reindexed: list[Event] = []
    for idx, event in enumerate(out):
        reindexed.append(Event(
            index=idx,
            kind=event.kind,
            text=event.text,
            duration_ms=event.duration_ms,
            source=event.source,
        ))
    return reindexed


def prepare_events(args) -> list[Event]:
    transcript = extract_transcript(Path(args.input), args.field)
    transcript = transcript.replace("\r\n", "\n").replace("\r", "\n")
    transcript = clean_text_for_tts(
        transcript,
        keep_parentheses=args.keep_parentheses,
        remove_diacritics=not args.keep_diacritics,
        remove_quotes=not args.keep_quotes,
    )
    if args.punctuation_mode == "pause":
        transcript = punctuation_to_markers(transcript, args.comma_pause_ms, args.stop_pause_ms)
    elif args.punctuation_mode == "remove":
        transcript = re.sub(r"[,;:.?!]", " ", transcript)
    events = split_markers(transcript, args.pause_ms, args.transition_ms)

    out: list[Event] = []
    idx = 0
    for event in events:
        if event.kind == "silence":
            out.append(Event(index=idx, kind="silence", duration_ms=event.duration_ms, source=event.source))
            idx += 1
            continue
        for chunk in split_text_chunk(event.text, args.max_chars):
            out.append(Event(index=idx, kind="speech", text=chunk, source=event.source))
            idx += 1
    return merge_short_speech_events(out, args.min_chars, args.max_chars)


@contextlib.contextmanager
def capture_chatterbox_repetition():
    records: list[str] = []

    class Handler(logging.Handler):
        def emit(self, record):
            message = record.getMessage()
            if "Detected" in message and "repetition" in message:
                records.append(message)
            if "forcing EOS token" in message:
                records.append(message)

    logger = logging.getLogger("chatterbox.models.t3.inference.alignment_stream_analyzer")
    handler = Handler()
    logger.addHandler(handler)
    try:
        yield records
    finally:
        logger.removeHandler(handler)


class NamaaEngine:
    sample_rate = 24000

    @staticmethod
    def _extract_t3_state(state: dict) -> dict:
        if "text_emb.weight" in state:
            return state

        for prefix in ("t3.", "model.t3.", "module.t3."):
            prefixed = {key[len(prefix):]: value for key, value in state.items() if key.startswith(prefix)}
            if "text_emb.weight" in prefixed:
                return prefixed

        sample_keys = ", ".join(list(state.keys())[:8])
        raise RuntimeError(
            "Could not find T3 weights in NAMAA checkpoint. "
            f"Expected keys like 'text_emb.weight' or 't3.text_emb.weight'. Found: {sample_keys}"
        )

    @staticmethod
    def _resize_t3_vocab_if_needed(model, t3_state: dict, torch, device: str):
        checkpoint_vocab = t3_state["text_emb.weight"].shape[0]
        current_vocab = model.t3.text_emb.num_embeddings
        if checkpoint_vocab == current_vocab:
            return
        model.t3.text_emb = torch.nn.Embedding(checkpoint_vocab, model.t3.dim).to(device)
        model.t3.text_head = torch.nn.Linear(
            model.t3.cfg.hidden_size,
            checkpoint_vocab,
            bias=False,
        ).to(device)

    @staticmethod
    def _load_t3_checkpoint(path: Path, model, load_safetensors, torch, device: str):
        t3_state = NamaaEngine._extract_t3_state(load_safetensors(str(path), device=device))
        NamaaEngine._resize_t3_vocab_if_needed(model, t3_state, torch, device)
        model.t3.load_state_dict(t3_state)

    def __init__(self, args):
        require_package("torch", "Run from Namaa_tts venv, then: pip install -r requirements.txt")
        require_package("torchaudio", "Run from Namaa_tts venv, then: pip install -r requirements.txt")
        require_package("safetensors", "Run from Namaa_tts venv, then: pip install -r requirements.txt")
        require_package("huggingface_hub", "pip install huggingface_hub")
        ensure_numba_cache_dir()
        try:
            from chatterbox import mtl_tts
        except ImportError as exc:
            raise SystemExit("Missing chatterbox. Run from Namaa_tts venv and install requirements.txt") from exc

        import torch
        from huggingface_hub import hf_hub_download, snapshot_download
        from safetensors.torch import load_file as load_safetensors

        self.torch = torch
        self.ta = require_package("torchaudio", "pip install torchaudio")
        self.args = args
        self.device = args.device if args.device else ("cuda" if torch.cuda.is_available() else "cpu")

        cache_dir = Path(args.model_cache) / "namaa_hf"
        cache_dir.mkdir(parents=True, exist_ok=True)

        ckpt_dir = Path(snapshot_download(
            repo_id=NAMAA_REPO_ID,
            repo_type="model",
            revision="main",
            cache_dir=str(cache_dir),
        ))

        model = mtl_tts.ChatterboxMultilingualTTS.from_pretrained(device=self.device)

        base_t3_checkpoint = ckpt_dir / NAMAA_T3_CHECKPOINT_FILE
        self._load_t3_checkpoint(base_t3_checkpoint, model, load_safetensors, torch, self.device)

        finetuned_checkpoint = None
        if args.namaa_checkpoint_path:
            finetuned_checkpoint = Path(args.namaa_checkpoint_path).expanduser().resolve()
            if not finetuned_checkpoint.exists():
                raise FileNotFoundError(f"NAMAA checkpoint not found: {finetuned_checkpoint}")
        elif args.namaa_finetuned or args.namaa_checkpoint_repo:
            checkpoint_repo = args.namaa_checkpoint_repo or NAMAA_FINETUNED_REPO_ID
            finetuned_checkpoint = Path(hf_hub_download(
                repo_id=checkpoint_repo,
                filename=args.namaa_checkpoint_file,
                repo_type="model",
                revision=args.namaa_checkpoint_revision,
                cache_dir=str(cache_dir),
            ))

        if finetuned_checkpoint:
            self._load_t3_checkpoint(finetuned_checkpoint, model, load_safetensors, torch, self.device)

        model.t3.to(self.device).eval()
        self.model = model
        self.sample_rate = model.sr

    def variants(self, retry_index: int) -> dict:
        base = [
            dict(exaggeration=0.18, cfg_weight=0.18, temperature=0.08, repetition_penalty=7.0, min_p=0.25, top_p=0.50),
            dict(exaggeration=0.15, cfg_weight=0.15, temperature=0.06, repetition_penalty=8.0, min_p=0.30, top_p=0.45),
            dict(exaggeration=0.12, cfg_weight=0.12, temperature=0.04, repetition_penalty=9.0, min_p=0.35, top_p=0.40),
            dict(exaggeration=0.10, cfg_weight=0.10, temperature=0.03, repetition_penalty=10.0, min_p=0.40, top_p=0.35),
        ]
        return base[retry_index % len(base)]

    def synthesize(self, text: str, out_path: Path, retry_index: int) -> float:
        params = self.variants(retry_index)
        with capture_chatterbox_repetition() as repetition_logs:
            wav = self.model.generate(
                text=text,
                language_id=LANGUAGE_ID,
                audio_prompt_path=str(self.args.reference),
                **params,
            )
        if repetition_logs:
            raise GenerationError("; ".join(repetition_logs[-2:]))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        self.ta.save(str(out_path), wav.detach().cpu(), self.sample_rate)
        return audio_duration(out_path)


class XTTSEngine:
    sample_rate = 24000

    def __init__(self, args):
        require_package("torch", "Install a working Coqui XTTS environment.")
        require_package("huggingface_hub", "pip install huggingface_hub")
        try:
            from TTS.tts.configs.xtts_config import XttsConfig
            from TTS.tts.models.xtts import Xtts
        except ImportError as exc:
            raise SystemExit(
                "Missing Coqui TTS / XTTS. Install in your XTTS env, for example:\n"
                "pip install \"numpy<2\" \"transformers<4.44\" coqui-tts"
            ) from exc

        import torch
        from huggingface_hub import hf_hub_download

        self.torch = torch
        self.sf = require_package("soundfile", "pip install soundfile")
        self.args = args
        self.device = args.device if args.device else ("cuda" if torch.cuda.is_available() else "cpu")

        model_dir = Path(args.model_cache) / "egtts-v0.2"
        model_dir.mkdir(parents=True, exist_ok=True)
        required = [
            (args.xtts_checkpoint, "model.pth"),
            ("config.json", "config.json"),
            ("vocab.json", "vocab.json"),
            ("dvae.pth", "dvae.pth"),
            ("mel_stats.pth", "mel_stats.pth"),
        ]
        for repo_name, local_name in required:
            target = model_dir / local_name
            if target.exists() and target.stat().st_size > 0:
                continue
            downloaded = hf_hub_download(
                repo_id=args.xtts_repo,
                filename=repo_name,
                local_dir=str(model_dir),
                local_dir_use_symlinks=False,
            )
            downloaded = Path(downloaded)
            if downloaded.name != local_name:
                shutil.copy2(downloaded, target)

        config = XttsConfig()
        config.load_json(str(model_dir / "config.json"))
        model = Xtts.init_from_config(config)
        model.load_checkpoint(config, checkpoint_dir=str(model_dir), eval=True)
        if self.device == "cuda" and torch.cuda.is_available():
            model.cuda()
        self.model = model
        self.config = config

    def variants(self, retry_index: int) -> dict:
        base = [
            dict(temperature=0.01,epetition_penalty=8.0, top_k=5, top_p=0.5),
            dict(temperature=0.005, repetition_penalty=10.0, top_k=4, top_p=0.45),
            dict(temperature=0.001, repetition_penalty=12.0, top_k=3, top_p=0.35),
            dict(temperature=0.0005, repetition_penalty=14.0, top_k=2, top_p=0.3),
        ]
        return base[retry_index % len(base)]

    def synthesize(self, text: str, out_path: Path, retry_index: int) -> float:
        params = self.variants(retry_index)
        with self.torch.inference_mode():
            output = self.model.synthesize(
                text,
                self.config,
                speaker_wav=str(self.args.reference),
                language=LANGUAGE_ID,
                gpt_cond_len=self.args.xtts_gpt_cond_len,
                enable_text_splitting=False,
                **params,
            )
        wav = np.asarray(output["wav"], dtype=np.float32).reshape(-1)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        self.sf.write(str(out_path), wav, self.sample_rate)
        return audio_duration(out_path)


def audio_duration(path: Path) -> float:
    sf = require_package("soundfile", "pip install soundfile")
    info = sf.info(str(path))
    return float(info.frames) / float(info.samplerate)


def format_duration(seconds: float) -> str:
    total_ms = max(0, int(round(float(seconds) * 1000)))
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"
    return f"{minutes:02d}:{secs:02d}.{ms:03d}"


def expected_min_duration(text: str) -> float:
    # Conservative lower bound to catch Chatterbox forced-EOS partial outputs.
    return max(0.25, min(2.0, len(text) / 55.0))


def generate_speech_event(engine, event: Event, chunk_idx: int, out_dir: Path, args) -> list[ChunkResult]:
    results: list[ChunkResult] = []
    pieces = [event.text]
    pass_no = 0

    while pieces:
        text = pieces.pop(0).strip()
        if not text:
            continue
        chunk_name = f"chunk_{chunk_idx:04d}"
        out_path = out_dir / "chunks" / f"{chunk_name}.wav"
        last_error = ""

        for attempt in range(args.retries):
            try:
                duration = engine.synthesize(text, out_path, attempt)
                if duration < expected_min_duration(text):
                    raise GenerationError(
                        f"Generated audio too short: {duration:.2f}s for {len(text)} chars"
                    )
                results.append(ChunkResult(
                    event_index=event.index,
                    chunk_index=chunk_idx,
                    kind="speech",
                    text=event.source,
                    cleaned_text=text,
                    audio_path=str(out_path),
                    duration_sec=duration,
                    status="ok",
                    attempts=attempt + 1,
                ))
                return results
            except Exception as exc:
                last_error = repr(exc)
                if out_path.exists():
                    with contextlib.suppress(Exception):
                        out_path.unlink()
                time.sleep(args.retry_sleep_sec)

        if pass_no < args.split_retry_passes and len(text) > args.min_split_chars:
            smaller = max(args.min_split_chars, len(text) // 2)
            pieces = split_text_chunk(text, smaller) + pieces
            pass_no += 1
            continue

        results.append(ChunkResult(
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
        ))
        return results
    return results


def write_silence(path: Path, duration_ms: int, sample_rate: int, fade_ms: int):
    sf = require_package("soundfile", "pip install soundfile")
    path.parent.mkdir(parents=True, exist_ok=True)
    samples = max(1, int(sample_rate * duration_ms / 1000))
    audio = np.zeros(samples, dtype=np.float32)
    sf.write(str(path), audio, sample_rate, subtype="PCM_16")


def read_wav_mono(path: Path) -> tuple[np.ndarray, int]:
    sf = require_package("soundfile", "pip install soundfile")
    wav, sr = sf.read(str(path), dtype="float32", always_2d=False)
    if wav.ndim == 2:
        wav = wav.mean(axis=1)
    return wav.astype(np.float32), int(sr)


def apply_fade(audio: np.ndarray, sr: int, fade_ms: int) -> np.ndarray:
    if fade_ms <= 0 or len(audio) == 0:
        return audio
    n = min(len(audio) // 2, int(sr * fade_ms / 1000))
    if n <= 1:
        return audio
    out = audio.copy()
    out[:n] *= np.linspace(0.0, 1.0, n, dtype=np.float32)
    out[-n:] *= np.linspace(1.0, 0.0, n, dtype=np.float32)
    return out


def stitch(results: list[ChunkResult], final_path: Path, args, sample_rate: int):
    sf = require_package("soundfile", "pip install soundfile")
    pieces: list[np.ndarray] = []
    for row in results:
        if row.status != "ok" or not row.audio_path:
            continue
        wav, sr = read_wav_mono(Path(row.audio_path))
        if sr != sample_rate:
            # Avoid adding another dependency path. Engine outputs should already match.
            raise RuntimeError(f"Sample-rate mismatch in {row.audio_path}: {sr} != {sample_rate}")
        pieces.append(apply_fade(wav, sr, args.fade_ms))
    if not pieces:
        raise RuntimeError("No successful audio chunks to stitch.")
    final = np.concatenate(pieces).astype(np.float32)
    if args.peak_normalize:
        peak = float(np.max(np.abs(final))) if len(final) else 0.0
        if peak > 0:
            final = final * min(1.0, args.peak_target / peak)
    final_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(final_path), final, sample_rate, subtype="PCM_16")


def save_csv(rows: list[ChunkResult], path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "event_index", "chunk_index", "kind", "text", "cleaned_text",
            "audio_path", "duration", "duration_sec", "status", "attempts", "error",
        ])
        writer.writeheader()
        for row in rows:
            data = row.__dict__.copy()
            data["duration"] = format_duration(data["duration_sec"])
            writer.writerow(data)


def parse_args(argv: Optional[list[str]] = None):
    parser = argparse.ArgumentParser(description="Clean transcript JSON and generate stitched TTS narration.")
    parser.add_argument("--input", required=True, help="JSON file with transcript_text.")
    parser.add_argument("--field", default="transcript_text", help="JSON text field name.")
    parser.add_argument("--engine", choices=["namaa", "xtts"], default="namaa")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUTS))
    parser.add_argument("--run-name", default="")
    parser.add_argument("--reference", default=str(DEFAULT_REF), help="Speaker reference wav.")
    parser.add_argument("--model-cache", default=str(DEFAULT_CACHE))
    parser.add_argument("--device", default="", help="cuda, cpu, or empty for auto.")

    parser.add_argument(
        "--namaa-finetuned",
        action="store_true",
        help=f"Use fine-tuned NAMAA checkpoint {NAMAA_FINETUNED_REPO_ID}/{NAMAA_FINETUNED_CHECKPOINT_FILE}.",
    )
    parser.add_argument("--namaa-checkpoint-path", default="", help="Local NAMAA fine-tuned .safetensors file.")
    parser.add_argument("--namaa-checkpoint-repo", default="", help="Hugging Face repo containing a NAMAA fine-tuned checkpoint.")
    parser.add_argument("--namaa-checkpoint-file", default=NAMAA_FINETUNED_CHECKPOINT_FILE)
    parser.add_argument("--namaa-checkpoint-revision", default="main")

    parser.add_argument("--punctuation-mode", choices=["pause", "keep", "remove"], default="pause")
    parser.add_argument("--pause-ms", type=int, default=200)
    parser.add_argument("--transition-ms", type=int, default=400)
    parser.add_argument("--comma-pause-ms", type=int, default=120)
    parser.add_argument("--stop-pause-ms", type=int, default=240)
    parser.add_argument("--min-chars", type=int, default=0, help="Merge speech chunks shorter than this many characters. Default 0 disables merging.")
    parser.add_argument("--max-chars", type=int, default=150)
    parser.add_argument("--keep-parentheses", action="store_true")
    parser.add_argument("--keep-diacritics", action="store_true")
    parser.add_argument("--keep-quotes", action="store_true")

    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--split-retry-passes", type=int, default=1)
    parser.add_argument("--min-split-chars", type=int, default=55)
    parser.add_argument("--retry-sleep-sec", type=float, default=0.2)
    parser.add_argument("--fade-ms", type=int, default=8)
    parser.add_argument("--peak-normalize", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--peak-target", type=float, default=0.95)
    parser.add_argument("--clean-only", action="store_true")

    parser.add_argument("--xtts-repo", default=XTTS_REPO_ID)
    parser.add_argument("--xtts-checkpoint", default=XTTS_CHECKPOINT_FILE)
    parser.add_argument("--xtts-gpt-cond-len", type=int, default=3)
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    args.reference = Path(args.reference).expanduser().resolve()
    args.model_cache = str(Path(args.model_cache).expanduser().resolve())
    if not args.reference.exists() and not args.clean_only:
        raise FileNotFoundError(f"Reference WAV not found: {args.reference}")

    run_name = args.run_name or datetime.now().strftime("generated_%Y-%m-%d_%H-%M-%S")
    run_dir = Path(args.output_dir).expanduser().resolve() / run_name
    run_dir.mkdir(parents=True, exist_ok=True)

    events = prepare_events(args)
    clean_preview = [
        {"index": e.index, "kind": e.kind, "text": e.text, "duration_ms": e.duration_ms}
        for e in events
    ]
    (run_dir / "cleaned_events.json").write_text(
        json.dumps(clean_preview, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    if args.clean_only:
        print(f"Wrote cleaned events: {run_dir / 'cleaned_events.json'}")
        return 0

    engine = NamaaEngine(args) if args.engine == "namaa" else XTTSEngine(args)
    results: list[ChunkResult] = []
    chunk_idx = 1
    for event in events:
        if event.kind == "silence":
            out_path = run_dir / "chunks" / f"chunk_{chunk_idx:04d}_silence.wav"
            write_silence(out_path, event.duration_ms, engine.sample_rate, args.fade_ms)
            results.append(ChunkResult(
                event_index=event.index,
                chunk_index=chunk_idx,
                kind="silence",
                text=event.source,
                cleaned_text="",
                audio_path=str(out_path),
                duration_sec=event.duration_ms / 1000.0,
                status="ok",
                attempts=0,
            ))
        else:
            chunk_results = generate_speech_event(engine, event, chunk_idx, run_dir, args)
            results.extend(chunk_results)
        chunk_idx += 1
        ok = sum(1 for r in results if r.status == "ok")
        failed = sum(1 for r in results if r.status == "failed")
        print(f"[{chunk_idx - 1}/{len(events)}] ok={ok} failed={failed}")

    save_csv(results, run_dir / "chunks.csv")
    failed = [r.__dict__ for r in results if r.status == "failed"]
    (run_dir / "failed_chunks.json").write_text(
        json.dumps(failed, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    stitch(results, run_dir / "final.wav", args, engine.sample_rate)
    print(f"Final WAV: {run_dir / 'final.wav'}")
    print(f"Chunk log: {run_dir / 'chunks.csv'}")
    if failed:
        print(f"Failed chunks: {len(failed)}. See {run_dir / 'failed_chunks.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

