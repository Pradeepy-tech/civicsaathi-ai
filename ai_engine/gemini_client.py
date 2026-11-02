"""
Server-Side Gemini API & Speech-to-Text Client in Python (`ai_engine.gemini_client`).

Implements direct HTTPS/REST and SSE streaming calls to `generativelanguage.googleapis.com/v1beta`
using Python's thread-safe standard library (`urllib.request`), enforcing:
- `'User-Agent': 'aistudio-build'` header on all Gemini requests
- `gemini-3.8-flash` (`thinkingLevel: "LOW"`) with `gemini-3.1-flash-lite` fallback for text/JSON
- `gemini-3.5-transcribe` with `gemini-3.1-flash-lite` fallback (plus optional VachaAI `vach_`) for audio
- Per-key and per-model quota/overload cooldown tracking
- Filtering out internal `thought: true` parts from candidate responses and SSE chunks.
"""

from __future__ import annotations

import json
import re
import threading
import urllib.error
import urllib.request
from time import monotonic
from typing import Any, Dict, Iterator, List, Optional

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

_COOLDOWN_LOCK = threading.Lock()
_MODEL_COOLDOWN_UNTIL: Dict[str, float] = {}


class GeminiRequestError(RuntimeError):
    """Raised when a Gemini REST or SSE request returns an HTTP or network error."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def canonical_quota_bucket(model: str) -> str:
    return "gemini-3.8-flash" if model == "gemini-flash-latest" else model


def is_model_cooling_down(key_id: str, model: str) -> bool:
    bucket_key = f"{key_id}:{canonical_quota_bucket(model)}"
    now = monotonic()
    with _COOLDOWN_LOCK:
        until = _MODEL_COOLDOWN_UNTIL.get(bucket_key)
        if until is None:
            return False
        if now >= until:
            _MODEL_COOLDOWN_UNTIL.pop(bucket_key, None)
            return False
        return True


def record_quota_cooldown_if_needed(key_id: str, model: str, err: Exception) -> bool:
    raw = str(err or "")
    bucket_key = f"{key_id}:{canonical_quota_bucket(model)}"

    if re.search(r"429|RESOURCE_EXHAUSTED|quota", raw, re.IGNORECASE):
        cooldown_sec = 90.0
        delay_match = re.search(r'"retryDelay"\s*:\s*"(\d+)s"', raw, re.IGNORECASE)
        if delay_match:
            parsed = float(delay_match.group(1))
            if parsed > 0:
                cooldown_sec = min(max(parsed, 30.0), 900.0)
        elif re.search(r"PerDay|requests per day", raw, re.IGNORECASE):
            cooldown_sec = 900.0

        with _COOLDOWN_LOCK:
            _MODEL_COOLDOWN_UNTIL[bucket_key] = monotonic() + cooldown_sec
        return True

    if canonical_quota_bucket(model) == "gemini-3.8-flash" and re.search(
        r"503|UNAVAILABLE|high demand|overloaded|timed out|timeout",
        raw,
        re.IGNORECASE,
    ):
        with _COOLDOWN_LOCK:
            _MODEL_COOLDOWN_UNTIL[bucket_key] = monotonic() + 45.0

    return False


def is_auth_or_key_error(err: Exception) -> bool:
    raw = str(err or "")
    return bool(
        re.search(
            r"401|403|API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED|API key not valid",
            raw,
            re.IGNORECASE,
        )
    )


def is_transient_gemini_error(err: Exception) -> bool:
    raw = str(err or "")
    return bool(
        re.search(
            r"429|500|502|503|504|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|"
            r"timed out|timeout|Connection reset|urlopen error",
            raw,
            re.IGNORECASE,
        )
    )


def format_gemini_error_message(
    err: Optional[Exception], saw_quota_exhausted: bool = False
) -> str:
    if err and is_auth_or_key_error(err):
        return (
            "Gemini API key could not be authorized. Please check or select a valid "
            "API key in the Settings > Secrets panel."
        )

    raw = str(err or "")
    is_503_or_timeout = bool(
        re.search(r"503|UNAVAILABLE|high demand|timed out|timeout", raw, re.IGNORECASE)
    )
    is_429 = saw_quota_exhausted or bool(
        re.search(r"429|RESOURCE_EXHAUSTED|quota", raw, re.IGNORECASE)
    )

    if is_429 and is_503_or_timeout:
        return (
            "Live Gemini free-tier quota was reached and backup model capacity is busy. "
            "Upgrading to a billing-enabled API key in Settings > Secrets increases quota, "
            "or tap Try again shortly."
        )
    if is_429:
        return (
            "Gemini API free-tier quota has been reached. Upgrading to a paid tier increases "
            "quota — select a billing-enabled API key in Settings > Secrets, or tap Try again later."
        )
    if is_503_or_timeout:
        return "Gemini AI is experiencing temporary high traffic right now. Tap Try again in a moment for live AI."
    if raw and len(raw) < 220:
        return raw
    return "Could not reach live Gemini AI right now. Please try again shortly. For emergencies, call 112."


def _extract_non_thought_text(payload: Dict[str, Any]) -> str:
    """Extracts model output text while skipping internal `thought: true` reasoning parts."""
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    chunks: List[str] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        if part.get("thought") is True:
            continue
        text_val = part.get("text")
        if isinstance(text_val, str):
            chunks.append(text_val)
    return "".join(chunks)


def generate_content(
    *,
    api_key: str,
    model: str,
    contents: List[Dict[str, Any]],
    system_instruction: Optional[str] = None,
    response_mime_type: Optional[str] = None,
    response_schema: Optional[Dict[str, Any]] = None,
    thinking_level: Optional[str] = None,
    timeout_sec: float = 5.5,
) -> str:
    """Executes a server-side unary `generateContent` call to Gemini v1beta in Python."""
    url = f"{GEMINI_API_BASE}/{model}:generateContent"
    body: Dict[str, Any] = {"contents": contents}

    if system_instruction:
        body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    gen_cfg: Dict[str, Any] = {}
    if response_mime_type:
        gen_cfg["responseMimeType"] = response_mime_type
    if response_schema:
        gen_cfg["responseSchema"] = response_schema
    if thinking_level:
        gen_cfg["thinkingConfig"] = {"thinkingLevel": thinking_level}
    if gen_cfg:
        body["generationConfig"] = gen_cfg

    encoded = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=encoded,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
            "User-Agent": "aistudio-build",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=max(1.5, timeout_sec)) as resp:
            raw_bytes = resp.read()
            parsed = json.loads(raw_bytes.decode("utf-8"))
            return _extract_non_thought_text(parsed)
    except urllib.error.HTTPError as http_err:
        err_body = ""
        try:
            err_body = http_err.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            pass
        raise GeminiRequestError(
            f"HTTP {http_err.code}: {err_body or http_err.reason}",
            status_code=http_err.code,
        ) from http_err
    except Exception as exc:
        raise GeminiRequestError(f"Gemini request failed: {exc}") from exc


def stream_generate_content(
    *,
    api_key: str,
    model: str,
    contents: List[Dict[str, Any]],
    system_instruction: Optional[str] = None,
    thinking_level: Optional[str] = None,
    timeout_sec: float = 6.0,
) -> Iterator[str]:
    """Executes a server-side SSE `streamGenerateContent?alt=sse` call in Python."""
    url = f"{GEMINI_API_BASE}/{model}:streamGenerateContent?alt=sse"
    body: Dict[str, Any] = {"contents": contents}

    if system_instruction:
        body["systemInstruction"] = {"parts": [{"text": system_instruction}]}
    if thinking_level:
        body["generationConfig"] = {"thinkingConfig": {"thinkingLevel": thinking_level}}

    encoded = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=encoded,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "x-goog-api-key": api_key,
            "User-Agent": "aistudio-build",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=max(2.0, timeout_sec)) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line or not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if not data_str or data_str == "[DONE]":
                    continue
                try:
                    chunk_json = json.loads(data_str)
                except json.JSONDecodeError:
                    continue
                text_piece = _extract_non_thought_text(chunk_json)
                if text_piece:
                    yield text_piece
    except urllib.error.HTTPError as http_err:
        err_body = ""
        try:
            err_body = http_err.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            pass
        raise GeminiRequestError(
            f"HTTP {http_err.code}: {err_body or http_err.reason}",
            status_code=http_err.code,
        ) from http_err
    except Exception as exc:
        raise GeminiRequestError(f"Gemini stream failed: {exc}") from exc


VACHA_LANG_MAP: Dict[str, str] = {
    "hi": "hi",
    "hinglish": "hi",
    "en": "en",
    "mr": "mr",
    "pa": "pa",
    "ta": "ta",
    "bn": "bn",
    "te": "te",
}


def transcribe_via_vacha(api_key: str, base64_audio: str, language_code: str) -> str:
    """Optional VachaAI (`vach_...`) speech-to-text endpoint call in Python."""
    target_lang = VACHA_LANG_MAP.get(language_code, "hi")
    payload = json.dumps({"audio_b64": base64_audio, "language": target_lang}).encode("utf-8")
    req = urllib.request.Request(
        "https://ai.langlex.com/api-proxy/asr",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key.strip()}",
            "X-API-Key": api_key.strip(),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=12.0) as resp:
            parsed = json.loads(resp.read().decode("utf-8"))
            text = parsed.get("text") or (parsed.get("data") or {}).get("text") or ""
            return str(text).strip()
    except urllib.error.HTTPError as http_err:
        err_body = ""
        try:
            err_body = http_err.read().decode("utf-8", errors="replace")[:160]
        except Exception:
            pass
        raise RuntimeError(
            f"Speech-to-Text service returned HTTP {http_err.code}: {err_body}"
        ) from http_err
    except Exception as exc:
        raise RuntimeError(f"Speech-to-Text request failed: {exc}") from exc
