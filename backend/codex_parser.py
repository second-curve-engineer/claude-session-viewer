"""JSONL 解析器 - 解析 Codex 会话数据"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

from common import parse_timestamp, parse_jsonl_file
from models import (
    Message, SessionSummary, SessionDetail,
    SearchResult, Project, ToolCall, TokenUsage, UsageSummary, UsageDetail, DailyUsage
)
from collections import defaultdict
from datetime import timedelta


CODEX_DIR = Path.home() / ".codex"
CODEX_SESSIONS_DIR = CODEX_DIR / "sessions"

CODEX_TOOL_NAME_MAP = {
    "shell_command": "Bash",
    "apply_patch": "Edit",
}

# Codex 定价（每百万 tokens，美元）
# 数据来源：
# - codex-mini-latest: https://platform.openai.com/docs/models/codex-mini-latest
# - gpt-5-codex: https://platform.openai.com/docs/models/gpt-5-codex
CODEX_DEFAULT_MODEL = os.environ.get("CODEX_DEFAULT_MODEL", "codex-mini-latest")
CODEX_PRICING = {
    "codex-mini-latest": {
        "input": 1.50,
        "cached_input": 0.375,
        "output": 6.00,
    },
    "gpt-5.2-codex": {
        "input": 1.75,
        "cached_input": 0.175,
        "output": 14.00,
    },
    "gpt-5.1-codex-max": {
        "input": 1.25,
        "cached_input": 0.125,
        "output": 10.00,
    },
    "gpt-5.1-codex": {
        "input": 1.25,
        "cached_input": 0.125,
        "output": 10.00,
    },
    "gpt-5-codex": {
        "input": 1.25,
        "cached_input": 0.125,
        "output": 10.00,
    },
}


def extract_codex_content(content: Any) -> str:
    """从 Codex message content 中提取文本内容"""
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        texts = []
        for item in content:
            if not isinstance(item, dict):
                continue
            item_type = item.get("type")
            if item_type in ("input_text", "output_text"):
                texts.append(item.get("text", ""))
        return "\n".join([t for t in texts if t])

    return ""


def parse_codex_arguments(arguments: Any) -> dict:
    """解析 Codex function_call 的 arguments（JSON 字符串或 dict）"""
    if isinstance(arguments, dict):
        return arguments
    if isinstance(arguments, str):
        try:
            return json.loads(arguments)
        except Exception:
            return {"raw": arguments}
    return {}


def map_codex_tool_name(name: str) -> str:
    """将 Codex 工具名映射到 UI 友好名称"""
    return CODEX_TOOL_NAME_MAP.get(name, name or "unknown")


def codex_project_path_to_name(raw_path: str) -> str:
    """Codex 项目路径展示（将用户目录替换为 ~）"""
    if not raw_path:
        return "codex"
    try:
        home = str(Path.home())
        if raw_path.startswith(home):
            return "~" + raw_path[len(home):]
    except Exception:
        pass
    return raw_path


def get_codex_session_files() -> List[Path]:
    """获取 Codex 会话文件列表"""
    if not CODEX_SESSIONS_DIR.exists():
        return []
    return sorted(CODEX_SESSIONS_DIR.rglob("*.jsonl"), key=lambda x: x.stat().st_mtime, reverse=True)


def get_codex_sessions() -> List[SessionSummary]:
    """获取 Codex 会话摘要列表"""
    sessions: List[SessionSummary] = []
    for session_file in get_codex_session_files():
        summary = get_codex_session_summary(session_file)
        if summary:
            sessions.append(summary)
    sessions.sort(key=lambda x: x.updated_at, reverse=True)
    return sessions


def get_codex_session_summary(session_file: Path) -> Optional[SessionSummary]:
    """解析 Codex 会话摘要"""
    records = parse_jsonl_file(session_file)
    if not records:
        return None

    project_path = "codex"
    project_name = "codex"
    title = "(无标题)"
    timestamps = []
    message_count = 0
    tool_calls = set()

    for record in records:
        ts = record.get("timestamp")
        if ts:
            timestamps.append(parse_timestamp(ts))

        record_type = record.get("type")
        if record_type == "session_meta":
            payload = record.get("payload", {})
            cwd = payload.get("cwd")
            if cwd:
                project_path = codex_project_path_to_name(cwd)
                project_name = project_path.split("/")[-1] if "/" in project_path else project_path
        elif record_type == "response_item":
            payload = record.get("payload", {})
            payload_type = payload.get("type")
            if payload_type == "message":
                role = payload.get("role")
                if role in ("user", "assistant"):
                    message_count += 1
                    content = extract_codex_content(payload.get("content", []))
                    if role == "user" and title == "(无标题)" and content:
                        title = content[:100] + ("..." if len(content) > 100 else "")
            elif payload_type == "function_call":
                name = payload.get("name", "unknown")
                tool_calls.add(map_codex_tool_name(name))

    if message_count == 0:
        return None

    created_at = min(timestamps) if timestamps else datetime.now()
    updated_at = max(timestamps) if timestamps else datetime.now()

    return SessionSummary(
        id=session_file.stem,
        project_path=project_path,
        project_name=project_name,
        title=title,
        created_at=created_at,
        updated_at=updated_at,
        message_count=message_count,
        tool_calls=sorted(list(tool_calls)),
        source="codex"
    )


def get_codex_session_detail(session_id: str) -> Optional[SessionDetail]:
    """获取 Codex 会话详情"""
    for session_file in get_codex_session_files():
        if session_file.stem == session_id:
            return get_codex_session_detail_by_file(session_file)
    return None


def get_codex_session_detail_by_file(session_file: Path) -> Optional[SessionDetail]:
    """解析 Codex 会话详情"""
    records = parse_jsonl_file(session_file)
    if not records:
        return None

    project_path = "codex"
    project_name = "codex"
    timestamps = []

    tool_results: Dict[str, str] = {}
    for record in records:
        ts = record.get("timestamp")
        if ts:
            timestamps.append(parse_timestamp(ts))

        if record.get("type") == "session_meta":
            payload = record.get("payload", {})
            cwd = payload.get("cwd")
            if cwd:
                project_path = codex_project_path_to_name(cwd)
                project_name = project_path.split("/")[-1] if "/" in project_path else project_path

        if record.get("type") == "response_item":
            payload = record.get("payload", {})
            if payload.get("type") == "function_call_output":
                call_id = payload.get("call_id")
                output = payload.get("output")
                if call_id and isinstance(output, str):
                    tool_results[call_id] = output

    messages: List[Message] = []
    for record in records:
        if record.get("type") != "response_item":
            continue

        payload = record.get("payload", {})
        payload_type = payload.get("type")
        timestamp = parse_timestamp(record.get("timestamp", ""))

        if payload_type == "message":
            role = payload.get("role")
            if role not in ("user", "assistant"):
                continue
            content = extract_codex_content(payload.get("content", []))
            messages.append(Message(
                uuid=payload.get("id", ""),
                type=role,
                content=content,
                timestamp=timestamp,
                tool_use=None,
                tool_calls=None
            ))

        elif payload_type == "function_call":
            call_id = payload.get("call_id", "")
            name = map_codex_tool_name(payload.get("name", "unknown"))
            tool_calls = [
                ToolCall(
                    id=call_id,
                    name=name,
                    input=parse_codex_arguments(payload.get("arguments")),
                    result=tool_results.get(call_id)
                )
            ]
            messages.append(Message(
                uuid=call_id,
                type="assistant",
                content="",
                timestamp=timestamp,
                tool_use=None,
                tool_calls=tool_calls
            ))

    first_user_msg = next((m for m in messages if m.type == "user" and m.content), None)
    title = first_user_msg.content[:100] if first_user_msg else "(无标题)"
    if first_user_msg and len(first_user_msg.content) > 100:
        title += "..."

    created_at = min(timestamps) if timestamps else datetime.now()
    updated_at = max(timestamps) if timestamps else datetime.now()

    return SessionDetail(
        id=session_file.stem,
        project_path=project_path,
        project_name=project_name,
        title=title,
        created_at=created_at,
        updated_at=updated_at,
        messages=messages,
        file_changes=[],
        source="codex"
    )


def search_codex_sessions(query: str, limit: int = 50) -> List[SearchResult]:
    """全文搜索 Codex 会话"""
    results: List[SearchResult] = []
    query_lower = query.lower()

    for session_file in get_codex_session_files():
        records = parse_jsonl_file(session_file)
        if not records:
            continue

        project_name = "codex"
        title = "(无标题)"

        for record in records:
            if record.get("type") == "session_meta":
                cwd = record.get("payload", {}).get("cwd")
                if cwd:
                    project_path = codex_project_path_to_name(cwd)
                    project_name = project_path.split("/")[-1] if "/" in project_path else project_path
            if record.get("type") == "response_item":
                payload = record.get("payload", {})
                if payload.get("type") == "message" and payload.get("role") == "user":
                    content = extract_codex_content(payload.get("content", []))
                    if content:
                        title = content[:50] + ("..." if len(content) > 50 else "")
                        break

        for record in records:
            if record.get("type") != "response_item":
                continue
            payload = record.get("payload", {})
            if payload.get("type") != "message":
                continue
            role = payload.get("role")
            if role not in ("user", "assistant"):
                continue

            content = extract_codex_content(payload.get("content", []))
            if query_lower in content.lower():
                idx = content.lower().find(query_lower)
                start = max(0, idx - 50)
                end = min(len(content), idx + len(query) + 50)
                matched = content[start:end]
                if start > 0:
                    matched = "..." + matched
                if end < len(content):
                    matched = matched + "..."

                results.append(SearchResult(
                    session_id=session_file.stem,
                    project_name=project_name,
                    title=title,
                    timestamp=parse_timestamp(record.get("timestamp", "")),
                    matched_content=matched,
                    message_type=role,
                    source="codex"
                ))

                if len(results) >= limit:
                    return results

    return results


def get_codex_projects() -> List[Project]:
    """获取 Codex 项目列表（按 cwd 聚合）"""
    projects: Dict[str, Project] = {}

    for session_file in get_codex_session_files():
        records = parse_jsonl_file(session_file)
        if not records:
            continue
        project_path = "codex"
        for record in records:
            if record.get("type") == "session_meta":
                cwd = record.get("payload", {}).get("cwd")
                if cwd:
                    project_path = codex_project_path_to_name(cwd)
                break
        project_name = project_path.split("/")[-1] if "/" in project_path else project_path
        if project_path in projects:
            projects[project_path].session_count += 1
        else:
            projects[project_path] = Project(
                path=project_path,
                name=project_name,
                session_count=1
            )

    project_list = list(projects.values())
    project_list.sort(key=lambda x: x.session_count, reverse=True)
    return project_list


def _extract_token_event(record: dict) -> Optional[dict]:
    """从 event_msg 中提取 token 统计"""
    if record.get("type") != "event_msg":
        return None
    payload = record.get("payload") or {}
    if payload.get("type") != "token_count":
        return None
    info = payload.get("info") or {}
    last_usage = info.get("last_token_usage") or {}
    if not last_usage:
        return None
    return last_usage


def _extract_model_name(record: dict) -> Optional[str]:
    if record.get("type") == "session_meta":
        payload = record.get("payload") or {}
        for key in ("model", "model_name", "model_id"):
            value = payload.get(key)
            if value:
                return value
    if record.get("type") == "event_msg":
        payload = record.get("payload") or {}
        info = payload.get("info") or {}
        for key in ("model", "model_name", "model_id"):
            value = info.get(key)
            if value:
                return value
    return None


def _normalize_codex_model_name(model: Optional[str]) -> str:
    if not model:
        return CODEX_DEFAULT_MODEL
    return model


def _get_codex_pricing(model: Optional[str]) -> dict:
    model_name = _normalize_codex_model_name(model)
    if model_name in CODEX_PRICING:
        return CODEX_PRICING[model_name]
    # 模糊匹配（比如带前缀）
    for key in CODEX_PRICING:
        if key in model_name:
            return CODEX_PRICING[key]
    return CODEX_PRICING[CODEX_DEFAULT_MODEL]


def _calculate_codex_cost(input_tokens: int, cached_input_tokens: int, output_tokens: int, model: Optional[str]) -> float:
    pricing = _get_codex_pricing(model)
    cost = (
        (input_tokens / 1_000_000) * pricing["input"] +
        (cached_input_tokens / 1_000_000) * pricing["cached_input"] +
        (output_tokens / 1_000_000) * pricing["output"]
    )
    return cost


def get_codex_usage_summary() -> UsageSummary:
    """获取 Codex 使用量摘要：今日、本月、总计"""
    from datetime import timezone

    now_local = datetime.now()
    today = now_local.date()
    first_of_month = today.replace(day=1)

    today_usage = TokenUsage()
    month_usage = TokenUsage()
    total_usage = TokenUsage()

    for jsonl_file in get_codex_session_files():
        records = parse_jsonl_file(jsonl_file)
        for record in records:
            last_usage = _extract_token_event(record)
            if not last_usage:
                continue

            timestamp_str = record.get("timestamp", "")
            if not timestamp_str:
                continue

            try:
                ts_utc = parse_timestamp(timestamp_str)
                if ts_utc.tzinfo is None:
                    ts_utc = ts_utc.replace(tzinfo=timezone.utc)
                ts_local = ts_utc.astimezone()
                ts_date = ts_local.date()
            except Exception:
                continue

            input_tokens = last_usage.get("input_tokens", 0)
            output_tokens = last_usage.get("output_tokens", 0)
            cache_read = last_usage.get("cached_input_tokens", 0)
            model = _normalize_codex_model_name(_extract_model_name(record))
            cost = _calculate_codex_cost(input_tokens, cache_read, output_tokens, model)

            total_usage.input_tokens += input_tokens
            total_usage.output_tokens += output_tokens
            total_usage.cache_read_tokens += cache_read
            total_usage.cost_usd += cost

            if ts_date >= first_of_month:
                month_usage.input_tokens += input_tokens
                month_usage.output_tokens += output_tokens
                month_usage.cache_read_tokens += cache_read
                month_usage.cost_usd += cost

            if ts_date == today:
                today_usage.input_tokens += input_tokens
                today_usage.output_tokens += output_tokens
                today_usage.cache_read_tokens += cache_read
                today_usage.cost_usd += cost

    for usage in (today_usage, month_usage, total_usage):
        usage.total_tokens = (
            usage.input_tokens +
            usage.output_tokens +
            usage.cache_creation_tokens +
            usage.cache_read_tokens
        )

    return UsageSummary(
        today=today_usage,
        this_month=month_usage,
        total=total_usage
    )


def get_codex_usage_detail(days: int = 30) -> UsageDetail:
    """获取 Codex 详细使用量统计"""
    from datetime import timezone

    daily_data: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
        "models": set(),
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation_tokens": 0,
        "cache_read_tokens": 0,
        "cost_usd": 0.0
    })

    model_data: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation_tokens": 0,
        "cache_read_tokens": 0,
        "total_tokens": 0,
        "cost_usd": 0.0
    })

    today = datetime.now().date()
    cutoff_date = today - timedelta(days=days)

    for jsonl_file in get_codex_session_files():
        records = parse_jsonl_file(jsonl_file)
        for record in records:
            last_usage = _extract_token_event(record)
            if not last_usage:
                continue

            timestamp_str = record.get("timestamp", "")
            if not timestamp_str:
                continue

            try:
                ts_utc = parse_timestamp(timestamp_str)
                if ts_utc.tzinfo is None:
                    ts_utc = ts_utc.replace(tzinfo=timezone.utc)
                ts_local = ts_utc.astimezone()
                ts_date = ts_local.date()
            except Exception:
                continue

            if ts_date < cutoff_date:
                continue

            date_str = ts_date.isoformat()
            model = _normalize_codex_model_name(_extract_model_name(record))
            input_tokens = last_usage.get("input_tokens", 0)
            output_tokens = last_usage.get("output_tokens", 0)
            cache_read = last_usage.get("cached_input_tokens", 0)
            cost = _calculate_codex_cost(input_tokens, cache_read, output_tokens, model)

            daily_data[date_str]["models"].add(model)
            daily_data[date_str]["input_tokens"] += input_tokens
            daily_data[date_str]["output_tokens"] += output_tokens
            daily_data[date_str]["cache_read_tokens"] += cache_read
            daily_data[date_str]["cost_usd"] += cost

            model_data[model]["input_tokens"] += input_tokens
            model_data[model]["output_tokens"] += output_tokens
            model_data[model]["cache_read_tokens"] += cache_read
            model_data[model]["cost_usd"] += cost

    daily_usage = []
    for date_str, data in sorted(daily_data.items(), reverse=True):
        total = (data["input_tokens"] + data["output_tokens"] +
                 data["cache_creation_tokens"] + data["cache_read_tokens"])
        models = sorted([m for m in data["models"] if m != "unknown"])
        daily_usage.append(DailyUsage(
            date=date_str,
            models=models,
            input_tokens=data["input_tokens"],
            output_tokens=data["output_tokens"],
            cache_creation_tokens=data["cache_creation_tokens"],
            cache_read_tokens=data["cache_read_tokens"],
            total_tokens=total,
            cost_usd=data["cost_usd"]
        ))

    by_model = {}
    for model, data in model_data.items():
        if model == "unknown":
            continue
        data["total_tokens"] = (data["input_tokens"] + data["output_tokens"] +
                                data["cache_creation_tokens"] + data["cache_read_tokens"])
        by_model[model] = data

    return UsageDetail(
        daily_usage=daily_usage,
        by_model=by_model
    )
