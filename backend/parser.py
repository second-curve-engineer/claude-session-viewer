"""JSONL 解析器 - 解析 Claude Code 会话数据"""
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

from models import (
    Message, FileChange, SessionSummary, SessionDetail,
    SearchResult, Project, ToolCall, TokenUsage, DailyUsage,
    UsageSummary, UsageDetail
)
from collections import defaultdict
from datetime import date, timedelta
from common import parse_timestamp, parse_jsonl_file


# Claude Code 数据目录
CLAUDE_DIR = Path.home() / ".claude"
PROJECTS_DIR = CLAUDE_DIR / "projects"
FILE_HISTORY_DIR = CLAUDE_DIR / "file-history"

 


def extract_content(message: dict) -> str:
    """从消息中提取文本内容"""
    msg = message.get("message", {})
    content = msg.get("content", "")

    # 如果 content 是列表（多模态内容）
    if isinstance(content, list):
        texts = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    texts.append(item.get("text", ""))
                # 跳过 tool_use，会在单独的工具卡片中展示
                # 跳过 thinking 类型，这是 Claude 的内部思考
            elif isinstance(item, str):
                texts.append(item)
        return "\n".join(texts)

    return str(content) if content else ""


def has_visible_content(message: dict) -> bool:
    """检查消息是否有可见内容（排除只有 thinking 的消息）"""
    msg = message.get("message", {})
    content = msg.get("content", "")

    # 字符串内容
    if isinstance(content, str):
        return bool(content.strip())

    # 列表内容 - 检查是否有 text 或 tool_use
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict):
                item_type = item.get("type")
                if item_type == "text" and item.get("text", "").strip():
                    return True
                elif item_type == "tool_use":
                    return True
            elif isinstance(item, str) and item.strip():
                return True

    return False


def extract_tool_calls(messages: List[dict]) -> List[str]:
    """提取会话中使用的工具列表"""
    tools = set()
    for msg in messages:
        content = msg.get("message", {}).get("content", [])
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "tool_use":
                    tools.add(item.get("name", "unknown"))
    return sorted(list(tools))


def get_project_dirs() -> List[Path]:
    """获取所有项目目录"""
    if not PROJECTS_DIR.exists():
        return []

    dirs = []
    for item in PROJECTS_DIR.iterdir():
        if item.is_dir() and not item.name.startswith("."):
            dirs.append(item)
    return sorted(dirs, key=lambda x: x.name)


def get_session_files(project_dir: Path, include_agents: bool = False) -> List[Path]:
    """获取项目目录下的所有会话文件

    Args:
        project_dir: 项目目录
        include_agents: 是否包含 agent-* 子代理文件（用于 token 统计）
    """
    files = []
    for item in project_dir.iterdir():
        if item.is_file() and item.suffix == ".jsonl":
            # 排除 agent- 开头的子 agent 文件（除非明确要包含）
            if include_agents or not item.stem.startswith("agent-"):
                files.append(item)
    return sorted(files, key=lambda x: x.stat().st_mtime, reverse=True)


def get_all_jsonl_files() -> List[Path]:
    """获取所有 JSONL 文件（包括 agent 文件和子目录），用于 token 统计"""
    files = []
    for project_dir in get_project_dirs():
        # 递归查找所有 .jsonl 文件
        for jsonl_file in project_dir.rglob("*.jsonl"):
            files.append(jsonl_file)
    return files


def project_path_to_name(encoded_path: str) -> str:
    """将编码的项目路径转换为显示名称"""
    # -Users-longyun-Documents-code -> ~/Documents/code
    if encoded_path.startswith("-"):
        path = encoded_path.replace("-", "/")
        # 替换用户目录
        home = str(Path.home())
        if path.startswith(home.replace("/", "/")):
            path = "~" + path[len(home):]
        return path
    return encoded_path


def get_all_sessions() -> List[SessionSummary]:
    """获取所有会话摘要"""
    sessions = []

    for project_dir in get_project_dirs():
        project_path = project_path_to_name(project_dir.name)
        project_name = project_path.split("/")[-1] if "/" in project_path else project_path

        for session_file in get_session_files(project_dir):
            records = parse_jsonl_file(session_file)
            if not records:
                continue

            # 过滤出用户和助手消息
            messages = [r for r in records if r.get("type") in ("user", "assistant")]
            if not messages:
                continue

            # 提取首条用户消息作为标题
            first_user_msg = next((m for m in messages if m.get("type") == "user"), None)
            title = ""
            if first_user_msg:
                title = extract_content(first_user_msg)[:100]  # 截取前100字符
                if len(extract_content(first_user_msg)) > 100:
                    title += "..."

            # 获取时间信息
            timestamps = [parse_timestamp(r.get("timestamp", "")) for r in records if r.get("timestamp")]
            created_at = min(timestamps) if timestamps else datetime.now()
            updated_at = max(timestamps) if timestamps else datetime.now()

            sessions.append(SessionSummary(
                id=session_file.stem,
                project_path=project_path,
                project_name=project_name,
                title=title or "(无标题)",
                created_at=created_at,
                updated_at=updated_at,
                message_count=len(messages),
                tool_calls=extract_tool_calls(records),
                source="claude"
            ))

    # 按更新时间倒序排序
    sessions.sort(key=lambda x: x.updated_at, reverse=True)
    return sessions


def get_session_detail(session_id: str) -> Optional[SessionDetail]:
    """获取会话详情"""
    # 在所有项目目录中查找该会话
    for project_dir in get_project_dirs():
        session_file = project_dir / f"{session_id}.jsonl"
        if session_file.exists():
            records = parse_jsonl_file(session_file)
            if not records:
                return None

            project_path = project_path_to_name(project_dir.name)
            project_name = project_path.split("/")[-1] if "/" in project_path else project_path

            # 第一遍：收集所有 tool_result
            tool_results: Dict[str, str] = {}
            for record in records:
                if record.get("type") == "user":
                    msg_content = record.get("message", {}).get("content", [])
                    if isinstance(msg_content, list):
                        for item in msg_content:
                            if isinstance(item, dict) and item.get("type") == "tool_result":
                                tool_id = item.get("tool_use_id", "")
                                result_content = item.get("content", "")
                                if tool_id:
                                    # 截取结果，避免太长
                                    if isinstance(result_content, str):
                                        tool_results[tool_id] = result_content[:2000]
                                        if len(result_content) > 2000:
                                            tool_results[tool_id] += "\n... (truncated)"

            # 第二遍：解析消息
            messages = []
            file_changes = []

            for record in records:
                record_type = record.get("type")

                if record_type in ("user", "assistant"):
                    # 跳过只有 thinking 没有可见内容的消息
                    if not has_visible_content(record):
                        continue

                    content = extract_content(record)
                    tool_use = None
                    tool_calls = None

                    # 提取工具调用信息
                    msg_content = record.get("message", {}).get("content", [])
                    if isinstance(msg_content, list):
                        tool_use_items = [
                            item for item in msg_content
                            if isinstance(item, dict) and item.get("type") == "tool_use"
                        ]
                        if tool_use_items:
                            tool_use = tool_use_items
                            # 构建完整的工具调用信息（包含结果）
                            tool_calls = []
                            for item in tool_use_items:
                                tool_id = item.get("id", "")
                                tool_calls.append(ToolCall(
                                    id=tool_id,
                                    name=item.get("name", "unknown"),
                                    input=item.get("input", {}),
                                    result=tool_results.get(tool_id)
                                ))

                    messages.append(Message(
                        uuid=record.get("uuid", ""),
                        type=record_type,
                        content=content,
                        timestamp=parse_timestamp(record.get("timestamp", "")),
                        tool_use=tool_use if tool_use else None,
                        tool_calls=tool_calls if tool_calls else None
                    ))

                elif record_type == "file-history-snapshot":
                    snapshot = record.get("snapshot", {})
                    backups = snapshot.get("trackedFileBackups", {})
                    for file_path, info in backups.items():
                        file_changes.append(FileChange(
                            file_path=file_path,
                            backup_file=info.get("backupFileName"),
                            version=info.get("version", 1),
                            timestamp=parse_timestamp(info.get("backupTime", ""))
                        ))

            # 获取标题
            first_user_msg = next((m for m in messages if m.type == "user"), None)
            title = first_user_msg.content[:100] if first_user_msg else "(无标题)"
            if first_user_msg and len(first_user_msg.content) > 100:
                title += "..."

            # 获取时间
            timestamps = [m.timestamp for m in messages]
            created_at = min(timestamps) if timestamps else datetime.now()
            updated_at = max(timestamps) if timestamps else datetime.now()

            return SessionDetail(
                id=session_id,
                project_path=project_path,
                project_name=project_name,
                title=title,
                created_at=created_at,
                updated_at=updated_at,
                messages=messages,
                file_changes=file_changes,
                source="claude"
            )

    return None


def search_sessions(query: str, limit: int = 50) -> List[SearchResult]:
    """全文搜索会话"""
    results = []
    query_lower = query.lower()

    for project_dir in get_project_dirs():
        project_path = project_path_to_name(project_dir.name)
        project_name = project_path.split("/")[-1] if "/" in project_path else project_path

        for session_file in get_session_files(project_dir):
            records = parse_jsonl_file(session_file)

            # 获取会话标题
            messages = [r for r in records if r.get("type") in ("user", "assistant")]
            first_user_msg = next((m for m in messages if m.get("type") == "user"), None)
            title = extract_content(first_user_msg)[:50] if first_user_msg else "(无标题)"

            for record in records:
                if record.get("type") not in ("user", "assistant"):
                    continue

                content = extract_content(record)
                if query_lower in content.lower():
                    # 提取匹配片段
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
                        message_type=record.get("type", "unknown"),
                        source="claude"
                    ))

                    if len(results) >= limit:
                        return results

    return results


def get_all_projects() -> List[Project]:
    """获取所有项目"""
    projects = []

    for project_dir in get_project_dirs():
        project_path = project_path_to_name(project_dir.name)
        project_name = project_path.split("/")[-1] if "/" in project_path else project_path
        session_count = len(get_session_files(project_dir))

        if session_count > 0:
            projects.append(Project(
                path=project_path,
                name=project_name,
                session_count=session_count
            ))

    projects.sort(key=lambda x: x.session_count, reverse=True)
    return projects


# Claude 模型定价 (per token)
# 数据来源: https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
# 更新日期: 2026-01-26
# 超过 200K tokens 的部分使用 *_above_200k 价格
TIERED_THRESHOLD = 200_000  # 200K tokens

MODEL_PRICING = {
    # Opus 4.5 ($5/$25 per MTok)
    "claude-opus-4-5-20251101": {
        "input": 5e-6,
        "output": 25e-6,
        "cache_creation": 6.25e-6,
        "cache_read": 0.5e-6,
    },
    # Sonnet 4.5 ($3/$15 per MTok, 分层定价)
    "claude-sonnet-4-5-20250929": {
        "input": 3e-6,
        "output": 15e-6,
        "cache_creation": 3.75e-6,
        "cache_read": 0.3e-6,
        # 超过 200K 的价格
        "input_above_200k": 6e-6,
        "output_above_200k": 22.5e-6,
        "cache_creation_above_200k": 7.5e-6,
        "cache_read_above_200k": 0.6e-6,
    },
    # Sonnet 4 ($3/$15 per MTok, 分层定价)
    "claude-sonnet-4-20250514": {
        "input": 3e-6,
        "output": 15e-6,
        "cache_creation": 3.75e-6,
        "cache_read": 0.3e-6,
        "input_above_200k": 6e-6,
        "output_above_200k": 22.5e-6,
        "cache_creation_above_200k": 7.5e-6,
        "cache_read_above_200k": 0.6e-6,
    },
    # Haiku 3.5 ($0.8/$4 per MTok)
    "claude-3-5-haiku-20241022": {
        "input": 0.8e-6,
        "output": 4e-6,
        "cache_creation": 1e-6,
        "cache_read": 0.08e-6,
    },
    # Fallback default pricing (Sonnet)
    "default": {
        "input": 3e-6,
        "output": 15e-6,
        "cache_creation": 3.75e-6,
        "cache_read": 0.3e-6,
        "input_above_200k": 6e-6,
        "output_above_200k": 22.5e-6,
        "cache_creation_above_200k": 7.5e-6,
        "cache_read_above_200k": 0.6e-6,
    }
}


def normalize_model_name(model: str) -> str:
    """标准化模型名称，去除前缀"""
    if not model:
        return "unknown"
    # 去除 pa/ 前缀
    if model.startswith("pa/"):
        model = model[3:]
    # 去除 anthropic/ 前缀
    if model.startswith("anthropic/"):
        model = model[10:]
    # 跳过 synthetic 等测试模型
    if model.startswith("<") or model == "unknown":
        return "unknown"
    return model


def get_model_pricing(model: str) -> dict:
    """获取模型定价"""
    model = normalize_model_name(model)
    # 精确匹配
    if model in MODEL_PRICING:
        return MODEL_PRICING[model]
    # 模糊匹配
    for key in MODEL_PRICING:
        if key in model or model in key:
            return MODEL_PRICING[key]
    return MODEL_PRICING["default"]


def calculate_tiered_cost(tokens: int, base_price: float, above_200k_price: float = None) -> float:
    """计算分层定价成本

    如果 tokens 超过 200K 且有分层价格，则：
    - 前 200K tokens 使用 base_price
    - 超出部分使用 above_200k_price
    """
    if tokens <= 0:
        return 0.0

    if above_200k_price is None or tokens <= TIERED_THRESHOLD:
        return tokens * base_price

    # 分层计算
    base_cost = TIERED_THRESHOLD * base_price
    above_cost = (tokens - TIERED_THRESHOLD) * above_200k_price
    return base_cost + above_cost


def calculate_cost(usage: dict, model: str) -> float:
    """计算 token 成本（支持 200K 分层定价）"""
    pricing = get_model_pricing(model)
    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    cache_creation = usage.get("cache_creation_input_tokens", 0)
    cache_read = usage.get("cache_read_input_tokens", 0)

    cost = (
        calculate_tiered_cost(input_tokens, pricing["input"], pricing.get("input_above_200k")) +
        calculate_tiered_cost(output_tokens, pricing["output"], pricing.get("output_above_200k")) +
        calculate_tiered_cost(cache_creation, pricing["cache_creation"], pricing.get("cache_creation_above_200k")) +
        calculate_tiered_cost(cache_read, pricing["cache_read"], pricing.get("cache_read_above_200k"))
    )
    return cost


def get_usage_summary() -> UsageSummary:
    """获取使用量摘要：今日、本月、总计"""
    from datetime import timezone

    # 使用本地时区的今天日期
    now_local = datetime.now()
    today = now_local.date()
    first_of_month = today.replace(day=1)

    today_usage = TokenUsage()
    month_usage = TokenUsage()
    total_usage = TokenUsage()

    # 遍历所有 JSONL 文件（包括 agent 子文件）
    for jsonl_file in get_all_jsonl_files():
        records = parse_jsonl_file(jsonl_file)

        for record in records:
            if record.get("type") != "assistant":
                continue

            msg = record.get("message", {})
            usage = msg.get("usage", {})
            if not usage:
                continue

            model = msg.get("model", "")
            timestamp_str = record.get("timestamp", "")
            if not timestamp_str:
                continue

            try:
                # 将 UTC 时间转换为本地时间
                ts_utc = parse_timestamp(timestamp_str)
                if ts_utc.tzinfo is None:
                    ts_utc = ts_utc.replace(tzinfo=timezone.utc)
                ts_local = ts_utc.astimezone()
                ts = ts_local.date()
            except:
                continue

            input_tokens = usage.get("input_tokens", 0)
            output_tokens = usage.get("output_tokens", 0)
            cache_creation = usage.get("cache_creation_input_tokens", 0)
            cache_read = usage.get("cache_read_input_tokens", 0)
            cost = calculate_cost(usage, model)

            # 总计
            total_usage.input_tokens += input_tokens
            total_usage.output_tokens += output_tokens
            total_usage.cache_creation_tokens += cache_creation
            total_usage.cache_read_tokens += cache_read
            total_usage.cost_usd += cost

            # 本月
            if ts >= first_of_month:
                month_usage.input_tokens += input_tokens
                month_usage.output_tokens += output_tokens
                month_usage.cache_creation_tokens += cache_creation
                month_usage.cache_read_tokens += cache_read
                month_usage.cost_usd += cost

            # 今日
            if ts == today:
                today_usage.input_tokens += input_tokens
                today_usage.output_tokens += output_tokens
                today_usage.cache_creation_tokens += cache_creation
                today_usage.cache_read_tokens += cache_read
                today_usage.cost_usd += cost

    # 计算 total_tokens
    today_usage.total_tokens = (today_usage.input_tokens + today_usage.output_tokens +
                                today_usage.cache_creation_tokens + today_usage.cache_read_tokens)
    month_usage.total_tokens = (month_usage.input_tokens + month_usage.output_tokens +
                                month_usage.cache_creation_tokens + month_usage.cache_read_tokens)
    total_usage.total_tokens = (total_usage.input_tokens + total_usage.output_tokens +
                                total_usage.cache_creation_tokens + total_usage.cache_read_tokens)

    return UsageSummary(
        today=today_usage,
        this_month=month_usage,
        total=total_usage
    )


def get_usage_detail(days: int = 30) -> UsageDetail:
    """获取详细使用量统计"""
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

    # 遍历所有 JSONL 文件（包括 agent 子文件）
    for jsonl_file in get_all_jsonl_files():
        records = parse_jsonl_file(jsonl_file)

        for record in records:
            if record.get("type") != "assistant":
                continue

            msg = record.get("message", {})
            usage = msg.get("usage", {})
            if not usage:
                continue

            model = normalize_model_name(msg.get("model", "unknown"))
            timestamp_str = record.get("timestamp", "")
            if not timestamp_str:
                continue

            try:
                # 将 UTC 时间转换为本地时间
                ts_utc = parse_timestamp(timestamp_str)
                if ts_utc.tzinfo is None:
                    ts_utc = ts_utc.replace(tzinfo=timezone.utc)
                ts_local = ts_utc.astimezone()
                ts_date = ts_local.date()
            except:
                continue

            if ts_date < cutoff_date:
                continue

            date_str = ts_date.isoformat()
            input_tokens = usage.get("input_tokens", 0)
            output_tokens = usage.get("output_tokens", 0)
            cache_creation = usage.get("cache_creation_input_tokens", 0)
            cache_read = usage.get("cache_read_input_tokens", 0)
            cost = calculate_cost(usage, model)

            # 按日统计
            daily_data[date_str]["models"].add(model)
            daily_data[date_str]["input_tokens"] += input_tokens
            daily_data[date_str]["output_tokens"] += output_tokens
            daily_data[date_str]["cache_creation_tokens"] += cache_creation
            daily_data[date_str]["cache_read_tokens"] += cache_read
            daily_data[date_str]["cost_usd"] += cost

            # 按模型统计
            model_data[model]["input_tokens"] += input_tokens
            model_data[model]["output_tokens"] += output_tokens
            model_data[model]["cache_creation_tokens"] += cache_creation
            model_data[model]["cache_read_tokens"] += cache_read
            model_data[model]["cost_usd"] += cost

    # 转换为列表并排序
    daily_usage = []
    for date_str, data in sorted(daily_data.items(), reverse=True):
        total = (data["input_tokens"] + data["output_tokens"] +
                 data["cache_creation_tokens"] + data["cache_read_tokens"])
        # 过滤掉 unknown 模型
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

    # 处理模型统计（过滤掉 unknown）
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
