/**
 * API 调用封装
 */

const API_BASE = '/api';

export interface SessionSummary {
  id: string;
  project_path: string;
  project_name: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  tool_calls: string[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string | null;
}

export interface Message {
  uuid: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tool_use?: Array<{
    type: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  tool_calls?: ToolCall[];
}

export interface FileChange {
  file_path: string;
  backup_file: string | null;
  version: number;
  timestamp: string;
}

export interface SessionDetail {
  id: string;
  project_path: string;
  project_name: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
  file_changes: FileChange[];
}

export interface SearchResult {
  session_id: string;
  project_name: string;
  title: string;
  timestamp: string;
  matched_content: string;
  message_type: string;
}

export interface Project {
  path: string;
  name: string;
  session_count: number;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

export interface DailyUsage {
  date: string;
  models: string[];
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

export interface UsageSummary {
  today: TokenUsage;
  this_month: TokenUsage;
  total: TokenUsage;
}

export interface UsageDetail {
  daily_usage: DailyUsage[];
  by_model: Record<string, {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
    total_tokens: number;
    cost_usd: number;
  }>;
}

export interface SessionContext {
  context: string;
}

/**
 * 获取会话列表
 */
export async function getSessions(project?: string): Promise<SessionSummary[]> {
  const params = new URLSearchParams();
  if (project) params.set('project', project);

  const url = `${API_BASE}/sessions${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch sessions');
  return response.json();
}

/**
 * 获取会话详情
 */
export async function getSession(id: string): Promise<SessionDetail> {
  const response = await fetch(`${API_BASE}/sessions/${id}`);
  if (!response.ok) throw new Error('Failed to fetch session');
  return response.json();
}

/**
 * 搜索会话
 */
export async function searchSessions(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`${API_BASE}/search?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to search');
  return response.json();
}

/**
 * 获取项目列表
 */
export async function getProjects(): Promise<Project[]> {
  const response = await fetch(`${API_BASE}/projects`);
  if (!response.ok) throw new Error('Failed to fetch projects');
  return response.json();
}

/**
 * 获取使用量摘要
 */
export async function getUsageSummary(): Promise<UsageSummary> {
  const response = await fetch(`${API_BASE}/usage/summary`);
  if (!response.ok) throw new Error('Failed to fetch usage summary');
  return response.json();
}

/**
 * 获取详细使用量统计
 */
export async function getUsageDetail(days: number = 30): Promise<UsageDetail> {
  const response = await fetch(`${API_BASE}/usage/detail?days=${days}`);
  if (!response.ok) throw new Error('Failed to fetch usage detail');
  return response.json();
}

/**
 * 获取压缩后的会话上下文，用于继续对话
 */
export async function getSessionContext(id: string): Promise<SessionContext> {
  const response = await fetch(`${API_BASE}/sessions/${id}/context`);
  if (!response.ok) throw new Error('Failed to fetch session context');
  return response.json();
}
