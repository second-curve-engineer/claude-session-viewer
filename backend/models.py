"""数据模型定义"""
from datetime import datetime
from typing import List, Optional, Any
from pydantic import BaseModel


class ToolCall(BaseModel):
    """工具调用"""
    id: str
    name: str
    input: dict = {}
    result: Optional[str] = None  # 工具执行结果


class Message(BaseModel):
    """单条消息"""
    uuid: str
    type: str  # user / assistant / progress / file-history-snapshot
    content: str
    timestamp: datetime
    tool_use: Optional[List[dict]] = None  # 保留旧字段兼容
    tool_calls: Optional[List[ToolCall]] = None  # 新的完整工具调用信息


class FileChange(BaseModel):
    """文件变更记录"""
    file_path: str
    backup_file: Optional[str] = None
    version: int
    timestamp: datetime


class SessionSummary(BaseModel):
    """会话摘要（列表展示用）"""
    id: str
    project_path: str
    project_name: str  # 项目名称（路径最后一部分）
    title: str  # 首条用户消息
    created_at: datetime
    updated_at: datetime
    message_count: int
    tool_calls: List[str] = []  # 使用的工具列表
    source: str = "claude"


class SessionDetail(BaseModel):
    """会话详情"""
    id: str
    project_path: str
    project_name: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: List[Message]
    file_changes: List[FileChange] = []
    source: str = "claude"


class SearchResult(BaseModel):
    """搜索结果"""
    session_id: str
    project_name: str
    title: str
    timestamp: datetime
    matched_content: str  # 匹配的内容片段
    message_type: str  # user / assistant
    source: str = "claude"


class Project(BaseModel):
    """项目信息"""
    path: str
    name: str
    session_count: int


class TokenUsage(BaseModel):
    """Token 使用统计"""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0


class DailyUsage(BaseModel):
    """每日使用统计"""
    date: str  # YYYY-MM-DD
    models: List[str] = []
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0


class UsageSummary(BaseModel):
    """使用量摘要"""
    today: TokenUsage
    this_month: TokenUsage
    total: TokenUsage


class UsageDetail(BaseModel):
    """使用量详情"""
    daily_usage: List[DailyUsage] = []
    by_model: dict = {}  # 按模型统计
