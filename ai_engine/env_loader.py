"""
Environment & API key resolution for the CivicSaathi Python AI/ML Engine.
Reads inherited server-side environment variables directly (and optional local .env).
No external host or port variables are used.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Dict, List, Optional

PLACEHOLDER_KEYS = {"", "MY_GEMINI_API_KEY", "YOUR_API_KEY"}
THIRD_PARTY_KEY_RE = re.compile(r"^(vach_|sk-|dg_|xi-|gsk_|xai-)", re.IGNORECASE)

_ENV_LOADED = False


def load_dotenv_if_present() -> None:
    """Loads key=value pairs from .env into os.environ without overriding existing env vars."""
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    _ENV_LOADED = True

    env_path = Path.cwd() / ".env"
    if not env_path.is_file():
        return

    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
    except OSError:
        pass


def is_usable_api_key(value: Optional[str]) -> bool:
    if not value:
        return False
    trimmed = value.strip()
    return bool(trimmed) and trimmed not in PLACEHOLDER_KEYS


def is_vacha_speech_key(value: Optional[str]) -> bool:
    if not is_usable_api_key(value):
        return False
    return str(value).strip().lower().startswith("vach_")


def is_gemini_compatible_key(value: Optional[str]) -> bool:
    if not is_usable_api_key(value):
        return False
    return not bool(THIRD_PARTY_KEY_RE.match(str(value).strip()))


def collect_gemini_keys(env_names: List[str]) -> List[Dict[str, str]]:
    """Returns deduplicated Gemini-compatible API keys with stable anonymized IDs."""
    load_dotenv_if_present()
    seen = set()
    entries: List[Dict[str, str]] = []
    for name in env_names:
        raw = os.environ.get(name, "")
        if not is_gemini_compatible_key(raw):
            continue
        clean = raw.strip()
        if clean in seen:
            continue
        seen.add(clean)
        entries.append(
            {
                "id": f"k{len(entries)}_{clean[-6:]}",
                "api_key": clean,
                "source": name,
            }
        )
    return entries


def get_general_gemini_keys() -> List[Dict[str, str]]:
    return collect_gemini_keys(["GEMINI_API_KEY", "ASK_SAATHI_API_KEY"])


def get_ask_saathi_gemini_keys() -> List[Dict[str, str]]:
    return collect_gemini_keys(["ASK_SAATHI_API_KEY", "GEMINI_API_KEY"])


def get_stt_gemini_keys() -> List[Dict[str, str]]:
    return collect_gemini_keys(
        [
            "SPEECH_TO_TEXT_API_KEY",
            "STT_API_KEY",
            "GEMINI_API_KEY",
            "ASK_SAATHI_API_KEY",
        ]
    )


def get_dedicated_stt_key() -> Optional[str]:
    load_dotenv_if_present()
    val = os.environ.get("SPEECH_TO_TEXT_API_KEY") or os.environ.get("STT_API_KEY")
    if is_usable_api_key(val):
        return str(val).strip()
    return None
