"""会话服务层：按来源聚合"""
from typing import List, Optional

from models import SessionSummary, SessionDetail, SearchResult, Project
from parser import (
    get_all_sessions as get_claude_sessions,
    get_session_detail as get_claude_session_detail,
    search_sessions as search_claude_sessions,
    get_all_projects as get_claude_projects,
)
from codex_parser import (
    get_codex_sessions,
    get_codex_session_detail,
    search_codex_sessions,
    get_codex_projects,
)
from gemini_parser import (
    get_gemini_sessions,
    get_gemini_session_detail,
    search_gemini_sessions,
    get_gemini_projects,
)


def normalize_source(source: Optional[str]) -> str:
    if not source:
        return "claude"
    source = source.lower()
    if source in ("claude", "codex", "gemini"):
        return source
    return "claude"


def get_all_sessions(source: Optional[str] = None) -> List[SessionSummary]:
    source = normalize_source(source)
    if source == "codex":
        return get_codex_sessions()
    if source == "gemini":
        return get_gemini_sessions()
    return get_claude_sessions()


def get_session_detail(session_id: str, source: Optional[str] = None) -> Optional[SessionDetail]:
    source = normalize_source(source)
    if source == "codex":
        return get_codex_session_detail(session_id)
    if source == "gemini":
        return get_gemini_session_detail(session_id)
    return get_claude_session_detail(session_id)


def search_sessions(query: str, limit: int = 50, source: Optional[str] = None) -> List[SearchResult]:
    source = normalize_source(source)
    if source == "codex":
        return search_codex_sessions(query, limit)
    if source == "gemini":
        return search_gemini_sessions(query, limit)
    return search_claude_sessions(query, limit)


def get_all_projects(source: Optional[str] = None) -> List[Project]:
    source = normalize_source(source)
    if source == "codex":
        return get_codex_projects()
    if source == "gemini":
        return get_gemini_projects()
    return get_claude_projects()
