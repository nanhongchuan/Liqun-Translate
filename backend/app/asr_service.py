"""Local ASR via faster-whisper. Model loads lazily on first use."""

from __future__ import annotations

import os
import threading
from typing import Any, Iterator, Optional

import numpy as np

# faster-whisper is optional for import-time health; actual load is lazy.
_LAZY_MODEL: Any = None
_LAZY_LOCK = threading.Lock()
_DEFAULT_DEVICE = "cpu"
_DEFAULT_COMPUTE = "int8"


def is_asr_importable() -> bool:
    try:
        import faster_whisper  # noqa: F401

        return True
    except ImportError:
        return False


def _get_model() -> Any:
    global _LAZY_MODEL
    with _LAZY_LOCK:
        if _LAZY_MODEL is not None:
            return _LAZY_MODEL
        from faster_whisper import WhisperModel

        name = os.getenv("RT_ASR_MODEL", "base").strip() or "base"
        device = os.getenv("RT_ASR_DEVICE", _DEFAULT_DEVICE).strip() or _DEFAULT_DEVICE
        compute = os.getenv("RT_ASR_COMPUTE", _DEFAULT_COMPUTE).strip() or _DEFAULT_COMPUTE
        _LAZY_MODEL = WhisperModel(name, device=device, compute_type=compute)
        return _LAZY_MODEL


def transcribe_int16_16k_mono(
    pcm_int16: bytes,
    language: Optional[str] = None,
) -> str:
    """
    pcm_int16: little-endian int16 mono PCM, 16 kHz.
    language: BCP-47-ish (en, zh, ...); None or 'auto' = auto-detect.
    """
    if not pcm_int16:
        return ""
    if len(pcm_int16) < 3200:  # ~0.1 s: too short, skip
        return ""
    audio = np.frombuffer(pcm_int16, dtype=np.int16).astype(np.float32) / 32768.0
    model = _get_model()
    lang: Optional[str] = None
    if language and language not in ("auto", ""):
        lang = language

    segments, _ = model.transcribe(
        audio,
        language=lang,
        beam_size=1,
        vad_filter=True,
        without_timestamps=True,
    )
    return _join_segments(segments)


def _join_segments(segments: Iterator[Any]) -> str:
    parts: list[str] = []
    for seg in segments:
        t = (seg.text or "").strip()
        if t:
            parts.append(t)
    return " ".join(parts).strip()
