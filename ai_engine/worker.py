"""
Persistent Stdio NDJSON Worker for CivicSaathi Python AI/ML Engine (`python3 -u -m ai_engine.worker`).

Communicates with the Express gateway over standard input/output pipes using newline-delimited
JSON (NDJSON) with thread-pooled concurrent execution — requiring ZERO network ports and ZERO
microservice host/port environment variables.
"""

from __future__ import annotations

import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict

from .ml_models import get_civic_classifier, get_duplicate_ranker, get_severity_scorer
from .pipelines import (
    classify_by_python_ml_fallback,
    classify_citizen_complaint,
    get_engine_status,
    rank_duplicate_candidates,
    stream_ask_saathi_chat,
    transcribe_citizen_audio,
)

_STDOUT_LOCK = threading.Lock()


def emit_message(payload: Dict[str, Any]) -> None:
    line = json.dumps(payload, ensure_ascii=False)
    with _STDOUT_LOCK:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def handle_request(req: Dict[str, Any]) -> None:
    req_id = req.get("id")
    method = str(req.get("method") or "")
    params = req.get("params") or {}

    try:
        if method == "status":
            emit_message({"id": req_id, "event": "result", "data": get_engine_status()})
            return

        if method == "classify":
            result = classify_citizen_complaint(params)
            emit_message({"id": req_id, "event": "result", "data": result})
            return

        if method == "duplicates":
            ranked = rank_duplicate_candidates(params)
            emit_message({"id": req_id, "event": "result", "data": ranked})
            return

        if method == "transcribe":
            transcript = transcribe_citizen_audio(params)
            emit_message({"id": req_id, "event": "result", "data": transcript})
            return

        if method == "ask_saathi":
            messages = params.get("messages") or []
            for stream_event in stream_ask_saathi_chat(messages):
                ev_type = stream_event.get("type")
                if ev_type == "notice":
                    emit_message(
                        {
                            "id": req_id,
                            "event": "notice",
                            "message": stream_event.get("message", ""),
                        }
                    )
                elif ev_type == "delta":
                    emit_message(
                        {
                            "id": req_id,
                            "event": "delta",
                            "text": stream_event.get("text", ""),
                        }
                    )
            emit_message({"id": req_id, "event": "result", "data": {"done": True}})
            return

        emit_message(
            {
                "id": req_id,
                "event": "error",
                "error": f"Unsupported Python AI worker method: {method}",
            }
        )
    except Exception as exc:
        emit_message(
            {
                "id": req_id,
                "event": "error",
                "error": str(exc) or "Python AI engine execution error.",
            }
        )


def run_self_test() -> int:
    """Runs deterministic verification of all Python ML models from the CLI."""
    status = get_engine_status()
    triage = classify_by_python_ml_fallback(
        "Karol Bagh Ajmal Khan Road ke paas main paani ki pipeline phat gayi hai",
        "hinglish",
        "Ajmal Khan Road",
    )
    assert triage["category"] == "Water Supply", f"Expected Water Supply, got {triage['category']}"
    assert triage["priority"] == "Critical", f"Expected Critical, got {triage['priority']}"

    dups = rank_duplicate_candidates(
        {
            "locality": "Ajmal Khan Road",
            "wardCode": "DEL-W78",
            "description": "Ajmal Khan Road par paani ki pipeline phat gayi hai",
            "interpretedSummary": "Water pipeline burst on Ajmal Khan Road Karol Bagh",
            "candidates": [
                {
                    "trackingCode": "CS-DEL-2026-1001",
                    "category": "Water Supply",
                    "locality": "Ajmal Khan Road",
                    "wardCode": "DEL-W78",
                    "wardName": "Karol Bagh Central (Ward 78)",
                    "rawDescription": "Karol Bagh Ajmal Khan Road ke paas main paani ki pipeline phat gayi hai",
                    "interpretedSummary": "Major municipal water supply pipeline burst near Ajmal Khan Road",
                    "status": "Pending",
                    "createdAt": "2026-01-01T00:00:00Z",
                    "duplicateOfTrackingCode": None,
                }
            ],
        }
    )
    assert len(dups) == 1 and dups[0]["trackingCode"] == "CS-DEL-2026-1001"
    sys.stdout.write(
        json.dumps({"selfTest": "passed", "status": status, "sampleTriage": triage, "duplicates": dups})
        + "\n"
    )
    return 0


def main() -> int:
    if "--self-test" in sys.argv:
        return run_self_test()

    # Warm pre-trained Python ML models immediately on startup
    get_civic_classifier()
    get_severity_scorer()
    get_duplicate_ranker()

    emit_message({"id": "__boot__", "event": "ready", "data": get_engine_status()})

    with ThreadPoolExecutor(max_workers=8, thread_name_prefix="civicsaathi-py-ai") as pool:
        for raw_line in sys.stdin:
            line = raw_line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
            except json.JSONDecodeError as err:
                emit_message({"id": None, "event": "error", "error": f"Invalid JSON IPC line: {err}"})
                continue
            pool.submit(handle_request, req)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
