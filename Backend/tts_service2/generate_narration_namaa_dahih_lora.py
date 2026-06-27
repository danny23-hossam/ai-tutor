# -*- coding: utf-8 -*-
"""
Generate narration with the AliAbdallah Chatterbox checkpoint plus a Dahih LoRA.

This script intentionally reuses generate_narration.py for text cleaning,
chunking, retry handling, silence insertion, and stitching. The LoRA-specific
part is limited to loading the AliAbdallah T3 checkpoint and merging adapter
weights into the T3 linear layers.
"""

from __future__ import annotations

import argparse
import contextlib
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

import generate_narration as base


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
DEFAULT_CACHE = ROOT_DIR / "models_cache" / "namaa_dahih_lora_hf"

FOUNDATION_REPO_ID = "NAMAA-Space/NAMAA-Egyptian-TTS"
FOUNDATION_T3_FILE = "t3_mtl23ls_v2.safetensors"
START_REPO_ID = "AliAbdallah/egyptian-arabic-tts-chatterbox"
START_CHECKPOINT_FILE = "model.safetensors"
DEFAULT_ADAPTER_REPO = "YomnaGharib/namaa-dahih-egyptian-lora"


def _resolve_local_or_hf_snapshot(repo_or_path: str, subfolder: str, revision: str, cache_dir: Path, token: str | None) -> Path:
    maybe_path = Path(repo_or_path).expanduser()
    if maybe_path.exists():
        adapter_dir = maybe_path
        if subfolder and subfolder not in (".", "./"):
            adapter_dir = adapter_dir / subfolder
        return adapter_dir.resolve()

    from huggingface_hub import hf_hub_download
    from huggingface_hub.utils import EntryNotFoundError

    # Avoid snapshot_download here on Windows: the hub cache may try to create
    # symlinks and fail without Developer Mode/admin privileges. Download the
    # adapter files into a plain local folder instead.
    safe_repo = repo_or_path.replace("/", "--")
    safe_subfolder = (subfolder or ".").replace("/", "_").replace("\\", "_").strip("._") or "root"
    adapter_dir = cache_dir / "manual_adapter_downloads" / safe_repo / revision / safe_subfolder
    adapter_dir.mkdir(parents=True, exist_ok=True)

    prefix = "" if not subfolder or subfolder in (".", "./") else subfolder.strip("/\\") + "/"
    downloaded_required = []
    for filename in ("adapter_config.json", "adapter_model.safetensors", "adapter_model.bin"):
        remote_name = prefix + filename
        try:
            hf_hub_download(
                repo_id=repo_or_path,
                filename=remote_name,
                repo_type="model",
                revision=revision,
                cache_dir=str(cache_dir),
                local_dir=str(adapter_dir),
                local_dir_use_symlinks=False,
                token=token,
            )
            downloaded_required.append(filename)
        except EntryNotFoundError:
            continue

    if "adapter_config.json" not in downloaded_required:
        raise FileNotFoundError(f"Could not download {prefix}adapter_config.json from {repo_or_path}")
    if not ({"adapter_model.safetensors", "adapter_model.bin"} & set(downloaded_required)):
        raise FileNotFoundError(
            f"Could not download adapter weights from {repo_or_path}/{subfolder}. "
            "Expected adapter_model.safetensors or adapter_model.bin."
        )
    actual_dir = adapter_dir
    if prefix:
        nested = adapter_dir / prefix.strip("/\\")
        if (nested / "adapter_config.json").exists():
            actual_dir = nested
    return actual_dir


def _load_adapter_state(adapter_dir: Path, torch):
    safetensors_path = adapter_dir / "adapter_model.safetensors"
    bin_path = adapter_dir / "adapter_model.bin"

    if safetensors_path.exists():
        from safetensors.torch import load_file

        return load_file(str(safetensors_path), device="cpu")
    if bin_path.exists():
        return torch.load(str(bin_path), map_location="cpu")
    raise FileNotFoundError(
        f"No adapter weights found in {adapter_dir}. Expected adapter_model.safetensors or adapter_model.bin."
    )


def _module_name_from_lora_key(key: str, suffix: str) -> str | None:
    if not key.endswith(suffix):
        return None
    name = key[: -len(suffix)]
    if name.startswith("base_model.model."):
        name = name[len("base_model.model.") :]
    elif name.startswith("model."):
        name = name[len("model.") :]
    return name


def _candidate_module_names(name: str) -> list[str]:
    candidates = [name]
    for prefix in ("t3.", "model.", "base_model.model."):
        if name.startswith(prefix):
            candidates.append(name[len(prefix) :])
    if not name.startswith("tfmr.") and ".tfmr." in name:
        candidates.append(name[name.index("tfmr.") :])
    return list(dict.fromkeys(candidates))


def apply_lora_manually(model, adapter_dir: Path, torch) -> int:
    config_path = adapter_dir / "adapter_config.json"
    if not config_path.exists():
        raise FileNotFoundError(f"Missing adapter_config.json in {adapter_dir}")

    config = json.loads(config_path.read_text(encoding="utf-8"))
    alpha = float(config.get("lora_alpha", 1.0))
    state = _load_adapter_state(adapter_dir, torch)
    modules = dict(model.t3.named_modules())

    suffixes = (
        (".lora_A.weight", ".lora_B.weight"),
        (".lora_A.default.weight", ".lora_B.default.weight"),
    )

    applied = 0
    missing = []
    with torch.no_grad():
        for key, a_weight in state.items():
            matched = None
            for a_suffix, b_suffix in suffixes:
                module_name = _module_name_from_lora_key(key, a_suffix)
                if module_name is None:
                    continue
                b_key = key[: -len(a_suffix)] + b_suffix
                if b_key not in state:
                    continue
                matched = (module_name, state[b_key])
                break

            if matched is None:
                continue

            module_name, b_weight = matched
            module = None
            resolved_name = ""
            for candidate in _candidate_module_names(module_name):
                if candidate in modules:
                    module = modules[candidate]
                    resolved_name = candidate
                    break

            if module is None or not hasattr(module, "weight"):
                missing.append(module_name)
                continue

            rank = int(a_weight.shape[0])
            scale = alpha / float(rank)
            delta = torch.matmul(b_weight.float(), a_weight.float()) * scale
            if delta.shape != module.weight.shape:
                if delta.T.shape == module.weight.shape:
                    delta = delta.T
                else:
                    raise RuntimeError(
                        f"LoRA shape mismatch for {resolved_name}: delta={tuple(delta.shape)} "
                        f"weight={tuple(module.weight.shape)}"
                    )
            module.weight.add_(delta.to(device=module.weight.device, dtype=module.weight.dtype))
            applied += 1

    if applied == 0:
        sample_keys = ", ".join(list(state.keys())[:8])
        raise RuntimeError(
            "LoRA adapter loaded, but 0 modules matched the current T3 model. "
            f"Adapter dir: {adapter_dir}. Sample keys: {sample_keys}"
        )
    if missing:
        print(f"Warning: {len(missing)} LoRA module names were not found. First few: {missing[:5]}")
    return applied


class NamaaDahihLoraEngine(base.NamaaEngine):
    def __init__(self, args):
        base.require_package("torch", "Run from Namaa_tts venv, then install torch.")
        base.require_package("torchaudio", "Run from Namaa_tts venv, then install torchaudio.")
        base.require_package("safetensors", "pip install safetensors")
        base.require_package("huggingface_hub", "pip install huggingface_hub")
        base.ensure_numba_cache_dir()

        try:
            from chatterbox import mtl_tts
        except ImportError as exc:
            raise SystemExit("Missing chatterbox. Run from the Namaa_tts environment.") from exc

        import torch
        from huggingface_hub import hf_hub_download, snapshot_download
        from safetensors.torch import load_file as load_safetensors

        self.torch = torch
        self.ta = base.require_package("torchaudio", "pip install torchaudio")
        self.args = args
        self.device = args.device if args.device else ("cuda" if torch.cuda.is_available() else "cpu")

        cache_dir = Path(args.model_cache).expanduser().resolve()
        cache_dir.mkdir(parents=True, exist_ok=True)
        token = args.hf_token or None

        print(f"Device: {self.device}")
        print("Loading Chatterbox base model ...")
        model = mtl_tts.ChatterboxMultilingualTTS.from_pretrained(device=self.device)
        print(f"  Base text_emb vocab: {model.t3.text_emb.num_embeddings}")

        if args.load_foundation_first:
            print("Loading NAMAA foundation T3 ...")
            foundation_dir = Path(snapshot_download(
                repo_id=args.foundation_repo,
                repo_type="model",
                revision=args.foundation_revision,
                cache_dir=str(cache_dir),
                allow_patterns=[args.foundation_t3_file],
                token=token,
            ))
            self._load_t3_checkpoint(foundation_dir / args.foundation_t3_file, model, load_safetensors, torch, self.device)
            print(f"  Foundation loaded. text_emb vocab: {model.t3.text_emb.num_embeddings}")

        print("Loading AliAbdallah starting checkpoint ...")
        if args.start_checkpoint_path:
            start_checkpoint = Path(args.start_checkpoint_path).expanduser().resolve()
            if not start_checkpoint.exists():
                raise FileNotFoundError(f"Start checkpoint not found: {start_checkpoint}")
        else:
            start_checkpoint = Path(hf_hub_download(
                repo_id=args.start_checkpoint_repo,
                filename=args.start_checkpoint_file,
                repo_type="model",
                revision=args.start_checkpoint_revision,
                cache_dir=str(cache_dir),
                token=token,
            ))

        before_vocab = model.t3.text_emb.num_embeddings
        state = self._extract_t3_state(load_safetensors(str(start_checkpoint), device=self.device))
        checkpoint_vocab = state["text_emb.weight"].shape[0]
        if checkpoint_vocab != before_vocab:
            print(f"  [AliAbdallah] Resizing text_emb: {before_vocab} -> {checkpoint_vocab}")
        self._resize_t3_vocab_if_needed(model, state, torch, self.device)
        model.t3.load_state_dict(state)
        print(f"  [AliAbdallah] loaded. text_emb vocab: {model.t3.text_emb.num_embeddings}")

        if not args.no_adapter:
            print(f"Downloading adapter: {args.adapter_repo}/{args.adapter_subfolder} ...")
            adapter_dir = _resolve_local_or_hf_snapshot(
                args.adapter_repo,
                args.adapter_subfolder,
                args.adapter_revision,
                cache_dir,
                token,
            )
            cfg = json.loads((adapter_dir / "adapter_config.json").read_text(encoding="utf-8"))
            r = cfg.get("r", "?")
            alpha = cfg.get("lora_alpha", "?")
            print(f"Applying LoRA manually (r={r}, alpha={alpha}) ...")
            applied = apply_lora_manually(model, adapter_dir, torch)
            print(f"LoRA applied to {applied} modules.")
        else:
            print("No adapter requested; running AliAbdallah checkpoint only.")

        model.t3.to(self.device).eval()
        self.model = model
        self.sample_rate = model.sr


def parse_args(argv: Optional[list[str]] = None):
    parser = argparse.ArgumentParser(description="Generate narration with AliAbdallah Chatterbox plus optional Dahih LoRA.")
    parser.add_argument("--input", required=True, help="JSON file with transcript_text.")
    parser.add_argument("--field", default="transcript_text", help="JSON text field name.")
    parser.add_argument("--output-dir", default=str(base.DEFAULT_OUTPUTS))
    parser.add_argument("--run-name", default="")
    parser.add_argument("--reference", default=str(base.DEFAULT_REF), help="Speaker reference wav.")
    parser.add_argument("--model-cache", default=str(DEFAULT_CACHE))
    parser.add_argument("--device", default="", help="cuda, cpu, or empty for auto.")
    parser.add_argument("--hf-token", default="", help="Optional Hugging Face token.")

    parser.add_argument("--start-checkpoint-repo", default=START_REPO_ID)
    parser.add_argument("--start-checkpoint-file", default=START_CHECKPOINT_FILE)
    parser.add_argument("--start-checkpoint-revision", default="main")
    parser.add_argument("--start-checkpoint-path", default="", help="Optional local AliAbdallah .safetensors path.")

    parser.add_argument("--adapter-repo", default=DEFAULT_ADAPTER_REPO, help="HF model repo or local adapter directory.")
    parser.add_argument("--adapter-subfolder", default="latest")
    parser.add_argument("--adapter-revision", default="main")
    parser.add_argument("--no-adapter", action="store_true")

    parser.add_argument("--load-foundation-first", action="store_true", help="Load NAMAA foundation T3 before AliAbdallah.")
    parser.add_argument("--foundation-repo", default=FOUNDATION_REPO_ID)
    parser.add_argument("--foundation-t3-file", default=FOUNDATION_T3_FILE)
    parser.add_argument("--foundation-revision", default="main")

    parser.add_argument("--punctuation-mode", choices=["pause", "keep", "remove"], default="pause")
    parser.add_argument("--pause-ms", type=int, default=200)
    parser.add_argument("--transition-ms", type=int, default=400)
    parser.add_argument("--comma-pause-ms", type=int, default=120)
    parser.add_argument("--stop-pause-ms", type=int, default=240)
    parser.add_argument("--min-chars", type=int, default=90, help="Merge speech chunks shorter than this many characters. Default 90.")
    parser.add_argument("--max-chars", type=int, default=200)
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
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    args.reference = Path(args.reference).expanduser().resolve()
    args.model_cache = str(Path(args.model_cache).expanduser().resolve())
    if not args.reference.exists() and not args.clean_only:
        raise FileNotFoundError(f"Reference WAV not found: {args.reference}")

    run_name = args.run_name or datetime.now().strftime("dahih_lora_%Y-%m-%d_%H-%M-%S")
    run_dir = Path(args.output_dir).expanduser().resolve() / run_name
    run_dir.mkdir(parents=True, exist_ok=True)
    print(f"Output dir: {run_dir}")

    events = base.prepare_events(args)
    print(f"Prepared {len(events)} events/chunks from cleaned input.")
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

    engine = NamaaDahihLoraEngine(args)
    results: list[base.ChunkResult] = []
    chunk_idx = 1
    for event in events:
        if event.kind == "silence":
            out_path = run_dir / "chunks" / f"chunk_{chunk_idx:04d}_silence.wav"
            base.write_silence(out_path, event.duration_ms, engine.sample_rate, args.fade_ms)
            results.append(base.ChunkResult(
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
            results.extend(base.generate_speech_event(engine, event, chunk_idx, run_dir, args))
        chunk_idx += 1
        ok = sum(1 for r in results if r.status == "ok")
        failed = sum(1 for r in results if r.status == "failed")
        print(f"[{chunk_idx - 1}/{len(events)}] ok={ok} failed={failed}")

    base.save_csv(results, run_dir / "chunks.csv")
    failed = [r.__dict__ for r in results if r.status == "failed"]
    (run_dir / "failed_chunks.json").write_text(
        json.dumps(failed, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    base.stitch(results, run_dir / "final.wav", args, engine.sample_rate)
    print(f"Final WAV: {run_dir / 'final.wav'}")
    print(f"Chunk log: {run_dir / 'chunks.csv'}")
    if failed:
        print(f"Failed chunks: {len(failed)}. See {run_dir / 'failed_chunks.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
