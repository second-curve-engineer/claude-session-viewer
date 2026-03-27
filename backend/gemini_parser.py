"""JSONL 解析器 - 解析 Gemini CLI 会话数据"""
import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

from common import parse_timestamp
from models import (
    Message, SessionSummary, SessionDetail,
    SearchResult, Project, ToolCall, TokenUsage, UsageSummary, UsageDetail, DailyUsage
)
from collections import defaultdict
from datetime import timedelta


GEMINI_DIR = Path.home() / ".gemini"
GEMINI_TMP_DIR = GEMINI_DIR / "tmp"

# TODO: 在此处添加 Gemini 的工具名称映射（如果需要）
GEMINI_TOOL_NAME_MAP = {
    "run_shell_command": "Bash",
    "replace": "Edit",
    "write_file": "Write",
    "read_file": "Read",
    "search_file_content": "Grep",
    "glob": "Glob"
}


def gemini_project_path_to_name(raw_path: str) -> str:
    """Gemini 项目路径展示（将用户目录替换为 ~）"""
    if not raw_path:
        return "gemini"
    try:
        home = str(Path.home())
        if raw_path.startswith(home):
            return "~" + raw_path[len(home):]
    except Exception:
        pass
    return raw_path


def get_gemini_session_files() -> List[Path]:
    """获取 Gemini 会话文件列表"""
    if not GEMINI_TMP_DIR.exists():
        return []
    return sorted(GEMINI_TMP_DIR.rglob("chats/session-*.json"), key=lambda x: x.stat().st_mtime, reverse=True)


def map_gemini_tool_name(name: str) -> str:
    """将 Gemini 工具名映射到 UI 友好名称"""
    return GEMINI_TOOL_NAME_MAP.get(name, name or "unknown")


def _load_gemini_session_data(session_file: Path) -> Optional[dict]:
    try:
        return json.loads(session_file.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return None


def _extract_tool_result(result: Any) -> Optional[str]:
    if isinstance(result, list) and result:
        first = result[0]
        if isinstance(first, dict):
            response = first.get("functionResponse", {}).get("response", {})
            output = response.get("output")
            if isinstance(output, str):
                return output
        try:
            return json.dumps(result, ensure_ascii=False, indent=2)
        except Exception:
            return str(result)
    if isinstance(result, dict):
        output = result.get("output")
        if isinstance(output, str):
            return output
        try:
            return json.dumps(result, ensure_ascii=False, indent=2)
        except Exception:
            return str(result)
    if isinstance(result, str):
        return result
    return None


def get_gemini_sessions() -> List[SessionSummary]:
    """获取 Gemini 会话摘要列表"""
    sessions: List[SessionSummary] = []
    for session_file in get_gemini_session_files():
        summary = get_gemini_session_summary(session_file)
        if summary:
            sessions.append(summary)
    sessions.sort(key=lambda x: x.updated_at, reverse=True)
    return sessions


def get_gemini_session_summary(session_file: Path) -> Optional[SessionSummary]:
    """解析 Gemini 会话摘要"""
    data = _load_gemini_session_data(session_file)
    if not data:
        return None

    project_path = "gemini"
    project_name = "gemini"
    title = "(无标题)"
    timestamps: List[datetime] = []
    message_count = 0
    tool_calls = set()
    has_user_message = False

    messages = data.get("messages", [])
    for msg in messages:
        ts = msg.get("timestamp")
        if ts:
            timestamps.append(parse_timestamp(ts))

        msg_type = msg.get("type")
        if msg_type == "user":
            has_user_message = True
            message_count += 1
            if title == "(无标题)":
                content = msg.get("content", "")
                if isinstance(content, str) and content:
                    title = content[:100] + ("..." if len(content) > 100 else "")
        elif msg_type == "gemini":
            message_count += 1
            for tool_call in msg.get("toolCalls", []) or []:
                name = tool_call.get("name", "unknown")
                tool_calls.add(map_gemini_tool_name(name))

    if not has_user_message:
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
        source="gemini"
    )




def get_gemini_session_detail(session_id: str) -> Optional[SessionDetail]:
    """获取 Gemini 会话详情"""
    # session_id 可能包含特殊字符，需要查找匹配的文件
    for session_file in get_gemini_session_files():
        if session_file.stem == session_id:
            return get_gemini_session_detail_by_file(session_file)
    return None


def get_gemini_session_detail_by_file(session_file: Path) -> Optional[SessionDetail]:
    """通过文件解析 Gemini 会话详情"""
    data = _load_gemini_session_data(session_file)
    if not data:
        return None

    project_path = "gemini"
    project_name = "gemini"
    timestamps: List[datetime] = []
    messages: List[Message] = []

    for msg in data.get("messages", []):
        if msg.get("timestamp"):
            timestamps.append(parse_timestamp(msg["timestamp"]))

        msg_type = msg.get("type")
        timestamp = parse_timestamp(msg.get("timestamp", ""))
        if msg_type == "user":
            content = msg.get("content", "")
            messages.append(Message(
                uuid=msg.get("id", ""),
                type="user",
                content=content if isinstance(content, str) else "",
                timestamp=timestamp,
                tool_use=None,
                tool_calls=None
            ))
        elif msg_type == "gemini":
            content = msg.get("content", "")
            parsed_tool_calls: List[ToolCall] = []
            for i, call_data in enumerate(msg.get("toolCalls", []) or []):
                tool_name = call_data.get("name", "unknown")
                parsed_tool_calls.append(ToolCall(
                    id=call_data.get("id", f"call_{i}"),
                    name=map_gemini_tool_name(tool_name),
                    input=call_data.get("args", {}) or {},
                    result=_extract_tool_result(call_data.get("result"))
                ))

            messages.append(Message(
                uuid=msg.get("id", ""),
                type="assistant",
                content=content if isinstance(content, str) else "",
                timestamp=timestamp,
                tool_use=None,
                tool_calls=parsed_tool_calls if parsed_tool_calls else None
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
        file_changes=[],  # Gemini 日志目前不直接提供文件变更
        source="gemini"
    )


def search_gemini_sessions(query: str, limit: int = 50) -> List[SearchResult]:
    """全文搜索 Gemini 会话"""
    results: List[SearchResult] = []
    query_lower = query.lower()

    for session_file in get_gemini_session_files():
        data = _load_gemini_session_data(session_file)
        if not data:
            continue

        project_name = "gemini"
        title = "(无标题)"
        for msg in data.get("messages", []):
            if msg.get("type") == "user":
                content = msg.get("content", "")
                if isinstance(content, str) and content:
                    title = content[:50] + ("..." if len(content) > 50 else "")
                    break

        for msg in data.get("messages", []):
            msg_type = msg.get("type")
            content_to_search = ""
            message_type = "unknown"
            if msg_type == "user":
                content_to_search = msg.get("content", "") if isinstance(msg.get("content"), str) else ""
                message_type = "user"
            elif msg_type == "gemini":
                content_to_search = msg.get("content", "") if isinstance(msg.get("content"), str) else ""
                message_type = "assistant"

            if query_lower in content_to_search.lower():
                idx = content_to_search.lower().find(query_lower)
                start = max(0, idx - 50)
                end = min(len(content_to_search), idx + len(query) + 50)
                matched = content_to_search[start:end]
                if start > 0:
                    matched = "..." + matched
                if end < len(content_to_search):
                    matched = matched + "..."

                results.append(SearchResult(
                    session_id=session_file.stem,
                    project_name=project_name,
                    title=title,
                    timestamp=parse_timestamp(msg.get("timestamp", "")),
                    matched_content=matched,
                    message_type=message_type,
                    source="gemini"
                ))

                if len(results) >= limit:
                    return results
    return results


def get_gemini_projects() -> List[Project]:
    """获取 Gemini 项目列表（按 cwd 聚合）"""
    session_count = len(get_gemini_session_files())
    if session_count == 0:
        return []
    return [Project(path="gemini", name="gemini", session_count=session_count)]


def get_gemini_usage_summary() -> UsageSummary:
    """获取 Gemini 使用量摘要：今日、本月、总计"""
    from datetime import timezone

    now_local = datetime.now()
    today = now_local.date()
    first_of_month = today.replace(day=1)

    today_usage = TokenUsage()
    month_usage = TokenUsage()
    total_usage = TokenUsage()

    for jsonl_file in get_gemini_session_files():
        data = _load_gemini_session_data(jsonl_file)
        if not data:
            continue
        for record in data.get("messages", []):
            if record.get("type") != "gemini" or not record.get("tokens"):
                continue

            usage_data = record["tokens"]
            input_tokens = usage_data.get("input", 0)
            output_tokens = usage_data.get("output", 0)
            cache_read = usage_data.get("cached", 0)

            timestamp_str = record.get("timestamp", "")
            if not timestamp_str:
                continue

            try:
                ts_utc = parse_timestamp(timestamp_str).replace(tzinfo=timezone.utc)
                ts_local = ts_utc.astimezone()
                ts_date = ts_local.date()
            except Exception:
                continue

            # 累加到总计
            total_usage.input_tokens += input_tokens
            total_usage.output_tokens += output_tokens
            total_usage.cache_read_tokens += cache_read

            # 累加到当月
            if ts_date >= first_of_month:
                month_usage.input_tokens += input_tokens
                month_usage.output_tokens += output_tokens
                month_usage.cache_read_tokens += cache_read

            # 累加到当天
            if ts_date == today:
                today_usage.input_tokens += input_tokens
                today_usage.output_tokens += output_tokens
                today_usage.cache_read_tokens += cache_read

    for usage in (today_usage, month_usage, total_usage):
        usage.total_tokens = (usage.input_tokens + usage.output_tokens +
                              usage.cache_creation_tokens + usage.cache_read_tokens)
        usage.cost_usd = 0.0

    return UsageSummary(
        today=today_usage,
        this_month=month_usage,
        total=total_usage
    )


def get_gemini_usage_detail(days: int = 30) -> UsageDetail:
    """获取 Gemini 详细使用量统计"""
    from datetime import timezone

    daily_data = defaultdict(lambda: {
        "models": set(), "input": 0, "output": 0, "cache_read": 0, "cache_create": 0
    })
    model_data = defaultdict(lambda: {
        "input": 0, "output": 0, "cache_read": 0, "cache_create": 0
    })

    today = datetime.now().date()
    cutoff_date = today - timedelta(days=days)

    for jsonl_file in get_gemini_session_files():
        data = _load_gemini_session_data(jsonl_file)
        if not data:
            continue
        for record in data.get("messages", []):
            if record.get("type") != "gemini" or not record.get("tokens"):
                continue

            timestamp_str = record.get("timestamp", "")
            if not timestamp_str:
                continue
            
            try:
                ts_utc = parse_timestamp(timestamp_str).replace(tzinfo=timezone.utc)
                ts_local = ts_utc.astimezone()
                ts_date = ts_local.date()
            except Exception:
                continue

            if ts_date < cutoff_date:
                continue

            usage_data = record["tokens"]
            input_tokens = usage_data.get("input", 0)
            output_tokens = usage_data.get("output", 0)
            cache_read = usage_data.get("cached", 0)
            model = record.get("model", "gemini")
            
            date_str = ts_date.isoformat()
            daily_data[date_str]["models"].add(model)
            daily_data[date_str]["input"] += input_tokens
            daily_data[date_str]["output"] += output_tokens
            daily_data[date_str]["cache_read"] += cache_read

            model_data[model]["input"] += input_tokens
            model_data[model]["output"] += output_tokens
            model_data[model]["cache_read"] += cache_read

    daily_usage = []
    for date_str, data in sorted(daily_data.items(), reverse=True):
        daily_usage.append(DailyUsage(
            date=date_str,
            models=sorted(list(data["models"])),
            input_tokens=data["input"],
            output_tokens=data["output"],
            cache_creation_tokens=data.get("cache_create", 0),
            cache_read_tokens=data.get("cache_read", 0),
            total_tokens=data["input"] + data["output"] + data.get("cache_read", 0) + data.get("cache_create", 0),
            cost_usd=0.0
        ))
    
    by_model_processed = {}
    for model, data in model_data.items():
        by_model_processed[model] = {
            "input_tokens": data["input"],
            "output_tokens": data["output"],
            "cache_creation_tokens": data.get("cache_create", 0),
            "cache_read_tokens": data.get("cache_read", 0),
            "total_tokens": data["input"] + data["output"] + data.get("cache_read", 0) + data.get("cache_create", 0),
            "cost_usd": 0.0
        }

    return UsageDetail(
        daily_usage=daily_usage,
        by_model=by_model_processed
    )
