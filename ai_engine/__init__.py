"""
CivicSaathi AI — Primary Python AI & Machine Learning Engine (`ai_engine`).

Provides all core AI/ML capabilities in Python:
1. Multilingual Multinomial Naive Bayes + N-Gram Grievance Classifier (`MultilingualCivicNaiveBayes`)
2. Deterministic Safety Rule + Weighted Feature Urgency Scorer (`CivicSeverityScorer`)
3. Sublinear TF-IDF + Okapi BM25 + Character N-Gram Duplicate Ranker (`SublinearTfidfBm25DuplicateRanker`)
4. Server-Side Gemini 3.8 Flash / 3.5 Transcribe Orchestration & SSE Streaming (`GeminiRestClient`)
5. Persistent NDJSON Stdio Worker (`ai_engine.worker`) for zero-port IPC with the Express gateway.
"""

from .ml_models import (
    CIVIC_CATEGORIES,
    COMPLAINT_PRIORITIES,
    CivicSeverityScorer,
    LocationEntityExtractor,
    MultilingualCivicNaiveBayes,
    SublinearTfidfBm25DuplicateRanker,
    get_civic_classifier,
    get_duplicate_ranker,
    get_severity_scorer,
)
from .pipelines import (
    classify_citizen_complaint,
    get_engine_status,
    rank_duplicate_candidates,
    stream_ask_saathi_chat,
    transcribe_citizen_audio,
)

__version__ = "1.0.0"

__all__ = [
    "CIVIC_CATEGORIES",
    "COMPLAINT_PRIORITIES",
    "MultilingualCivicNaiveBayes",
    "CivicSeverityScorer",
    "LocationEntityExtractor",
    "SublinearTfidfBm25DuplicateRanker",
    "get_civic_classifier",
    "get_duplicate_ranker",
    "get_severity_scorer",
    "classify_citizen_complaint",
    "rank_duplicate_candidates",
    "transcribe_citizen_audio",
    "stream_ask_saathi_chat",
    "get_engine_status",
]
