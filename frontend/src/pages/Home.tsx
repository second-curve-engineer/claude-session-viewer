import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Search as SearchIcon } from 'lucide-react';
import { SessionList } from '../components/SessionList';
import { SearchBar } from '../components/SearchBar';
import { ViewModeSwitch, type ViewMode } from '../components/ViewModeSwitch';
import { TimelineView } from '../components/TimelineView';
import { TimelineNav } from '../components/TimelineNav';
import { HighlightText } from '../components/HighlightText';
import { UsageStats } from '../components/UsageStats';
import {
  getSessions,
  getProjects,
  searchSessions,
  type SessionSummary,
  type Project,
  type SearchResult,
  type SourceFilter,
} from '../lib/api';
import { cn, formatDate, getGroupId } from '../lib/utils';

const VIEW_MODE_KEY = 'claude-session-viewer-view-mode';
const SOURCE_FILTER_KEY = 'claude-session-viewer-source';

export function Home() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(() => {
    const saved = localStorage.getItem(SOURCE_FILTER_KEY);
    return (saved === 'claude' || saved === 'codex' || saved === 'gemini') ? saved : 'claude';
  });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return (saved === 'timeline' || saved === 'project') ? saved : 'project';
  });
  const [timelineGroups, setTimelineGroups] = useState<Map<string, { count: number }>>(new Map());
  const [activeTimelineGroup, setActiveTimelineGroup] = useState<string | null>(null);

  // 切换视图模式时保存到 localStorage
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
    // 切换到时间线模式时，清除项目筛选以显示所有会话
    if (mode === 'timeline') {
      setSelectedProject(null);
    }
  }, []);

  const handleSourceChange = useCallback((source: SourceFilter) => {
    setSourceFilter(source);
    localStorage.setItem(SOURCE_FILTER_KEY, source);
    setSelectedProject(null);
    setSearchResults(null);
    setSearchQuery('');
  }, []);

  // 时间线分组变化回调
  const handleTimelineGroupsChange = useCallback((groups: Map<string, { count: number }>) => {
    setTimelineGroups(groups);
  }, []);

  // 点击时间线导航项，滚动到对应分组
  const handleTimelineGroupClick = useCallback((group: string) => {
    setActiveTimelineGroup(group);
    const element = document.getElementById(getGroupId(group));
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // 加载会话列表
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [sessionsData, projectsData] = await Promise.all([
          getSessions(selectedProject || undefined, sourceFilter),
          getProjects(sourceFilter),
        ]);
        setSessions(sessionsData);
        setProjects(projectsData);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedProject, sourceFilter]);

  // 搜索处理
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    setLoading(true);
    try {
      const results = await searchSessions(query, sourceFilter);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  }, [sourceFilter]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6C4 4.34315 5.34315 3 7 3H25C26.6569 3 28 4.34315 28 6V20C28 21.6569 26.6569 23 25 23H14L7 29V23H7C5.34315 23 4 21.6569 4 20V6Z" fill="#EA580C"/>
                <circle cx="16" cy="13" r="6" stroke="white" strokeWidth="2" fill="none"/>
                <path d="M16 9V13.5L19 15.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <h1 className="text-xl font-semibold text-gray-900">
                {sourceFilter === 'codex' ? 'Codex CLI 会话历史' : (sourceFilter === 'gemini' ? 'Gemini CLI 会话历史' : 'Claude Code 会话历史')}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1 bg-gray-50">
                <button
                  onClick={() => handleSourceChange('claude')}
                  className={cn(
                    "px-3 py-1 text-sm rounded",
                    sourceFilter === 'claude'
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Claude
                </button>
                <button
                  onClick={() => handleSourceChange('codex')}
                  className={cn(
                    "px-3 py-1 text-sm rounded",
                    sourceFilter === 'codex'
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Codex
                </button>
                <button
                  onClick={() => handleSourceChange('gemini')}
                  className={cn(
                    "px-3 py-1 text-sm rounded",
                    sourceFilter === 'gemini'
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Gemini
                </button>
              </div>
              <div className="text-sm text-gray-500">
                共 {sessions.length} 个会话
              </div>
            </div>
          </div>

          {/* 搜索栏 */}
          <div className="mt-4">
            <SearchBar
              onSearch={handleSearch}
              placeholder="搜索会话内容、代码、关键词..."
            />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* 侧边栏 - 视图切换 & 项目筛选 */}
          <aside className="w-64 flex-shrink-0 space-y-4 sticky top-28 self-start max-h-[calc(100vh-8rem)] overflow-y-auto">
            {/* Token 统计 */}
            <UsageStats source={sourceFilter} />

            {/* 视图模式切换 */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-700 mb-3">
                显示方式
              </h2>
              <ViewModeSwitch value={viewMode} onChange={handleViewModeChange} />
            </div>

            {/* 项目筛选 - 仅在按项目模式下显示 */}
            {viewMode === 'project' && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                  <FolderOpen className="w-4 h-4" />
                  项目筛选
                </h2>
                <ul className="space-y-1">
                  <li>
                    <button
                      onClick={() => setSelectedProject(null)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded text-sm",
                        selectedProject === null
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      全部项目
                    </button>
                  </li>
                  {projects.map((project) => (
                    <li key={project.path}>
                      <button
                        onClick={() => setSelectedProject(project.path)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded text-sm truncate",
                          selectedProject === project.path
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-600 hover:bg-gray-50"
                        )}
                        title={project.path}
                      >
                        {project.name}
                        <span className="ml-1 text-gray-400">({project.session_count})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 时间线导航 - 仅在时间线模式下显示 */}
            {viewMode === 'timeline' && timelineGroups.size > 0 && (
              <TimelineNav
                groups={timelineGroups}
                activeGroup={activeTimelineGroup}
                onGroupClick={handleTimelineGroupClick}
              />
            )}
          </aside>

          {/* 主内容区 */}
          <main className="flex-1">
            {searchResults !== null ? (
              // 搜索结果
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <SearchIcon className="w-4 h-4" />
                    搜索结果: "{searchQuery}"
                    <span className="text-gray-400">({searchResults.length} 条)</span>
                  </h2>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    没有找到匹配的结果
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {searchResults.map((result, index) => (
                      <div
                        key={`${result.session_id}-${index}`}
                        className="p-4 hover:bg-gray-50 cursor-pointer"
                        onClick={() => navigate(`/session/${result.session_id}?source=${result.source || sourceFilter}`)}
                      >
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded",
                            result.message_type === 'user'
                              ? "bg-blue-100 text-blue-700"
                              : "bg-orange-100 text-orange-700"
                          )}>
                            {result.message_type === 'user' ? '用户' : (result.source === 'codex' ? 'Codex' : (result.source === 'gemini' ? 'Gemini' : 'Claude'))}
                          </span>
                          {result.source && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                              {result.source}
                            </span>
                          )}
                          <span>{result.project_name}</span>
                          <span>·</span>
                          <span>{formatDate(result.timestamp)}</span>
                        </div>
                        <div className="text-sm text-gray-900 line-clamp-2">
                          <HighlightText
                            text={result.matched_content}
                            highlight={searchQuery}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : viewMode === 'timeline' ? (
              // 时间线视图
              <TimelineView
                sessions={sessions}
                loading={loading}
                onGroupsChange={handleTimelineGroupsChange}
              />
            ) : (
              // 会话列表
              <div className="bg-white rounded-lg border border-gray-200">
                <SessionList sessions={sessions} loading={loading} />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
