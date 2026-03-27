"""使用量服务层：按来源聚合"""
from typing import Optional

from models import UsageSummary, UsageDetail
from parser import get_usage_summary as get_claude_usage_summary, get_usage_detail as get_claude_usage_detail
from codex_parser import get_codex_usage_summary, get_codex_usage_detail
from gemini_parser import get_gemini_usage_summary, get_gemini_usage_detail
from session_service import normalize_source


def get_usage_summary(source: Optional[str] = None) -> UsageSummary:
    source = normalize_source(source)
    if source == "codex":
        return get_codex_usage_summary()
    if source == "gemini":
        return get_gemini_usage_summary()
    return get_claude_usage_summary()


def get_usage_detail(days: int = 30, source: Optional[str] = None) -> UsageDetail:
    source = normalize_source(source)
    if source == "codex":
        return get_codex_usage_detail(days)
    if source == "gemini":
        return get_gemini_usage_detail(days)
    return get_claude_usage_detail(days)
