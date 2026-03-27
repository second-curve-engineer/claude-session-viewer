"""FastAPI 主入口"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional

from models import SessionSummary, SessionDetail, SearchResult, Project, UsageSummary, UsageDetail
from session_service import get_all_sessions, get_session_detail, search_sessions, get_all_projects
from usage_service import get_usage_summary, get_usage_detail
from compressor import compress_session

app = FastAPI(
    title="Claude Session Viewer API",
    description="查看和搜索 Claude Code 历史会话",
    version="0.1.0"
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    """API 根路径"""
    return {"message": "Claude Session Viewer API", "version": "0.1.0"}


@app.get("/api/sessions", response_model=List[SessionSummary])
def list_sessions(
    project: Optional[str] = Query(None, description="按项目路径筛选"),
    source: Optional[str] = Query("claude", description="数据来源: claude/codex/gemini"),
    limit: int = Query(100, ge=1, le=500, description="返回数量限制")
):
    """获取会话列表"""
    sessions = get_all_sessions(source)

    # 按项目筛选
    if project:
        sessions = [s for s in sessions if project in s.project_path]

    return sessions[:limit]


@app.get("/api/sessions/{session_id}", response_model=SessionDetail)
def get_session(
    session_id: str,
    source: Optional[str] = Query("claude", description="数据来源: claude/codex/gemini")
):
    """获取会话详情"""
    session = get_session_detail(session_id, source)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.get("/api/sessions/{session_id}/context")
def get_session_context(
    session_id: str,
    source: Optional[str] = Query("claude", description="数据来源: claude/codex/gemini"),
):
    """获取压缩后的会话上下文，用于继续对话"""
    session = get_session_detail(session_id, source)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    context = compress_session(messages=session.messages)
    return {"context": context}


@app.get("/api/search", response_model=List[SearchResult])
def search(
    q: str = Query(..., min_length=1, description="搜索关键词"),
    source: Optional[str] = Query("claude", description="数据来源: claude/codex/gemini"),
    limit: int = Query(50, ge=1, le=200, description="返回数量限制")
):
    """全文搜索"""
    if not q.strip():
        raise HTTPException(status_code=400, detail="Search query cannot be empty")
    return search_sessions(q, limit, source)


@app.get("/api/projects", response_model=List[Project])
def list_projects(
    source: Optional[str] = Query("claude", description="数据来源: claude/codex/gemini")
):
    """获取项目列表"""
    return get_all_projects(source)


@app.get("/api/usage/summary", response_model=UsageSummary)
def usage_summary(
    source: Optional[str] = Query("claude", description="数据来源: claude/codex/gemini")
):
    """获取使用量摘要：今日、本月、总计"""
    return get_usage_summary(source)


@app.get("/api/usage/detail", response_model=UsageDetail)
def usage_detail(
    days: int = Query(30, ge=1, le=365, description="统计天数"),
    source: Optional[str] = Query("claude", description="数据来源: claude/codex/gemini"),
):
    """获取详细使用量统计"""
    return get_usage_detail(days, source)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
