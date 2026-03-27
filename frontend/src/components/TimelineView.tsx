import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Folder, Clock, Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import type { SessionSummary } from '../lib/api';
import { formatDate, cn, groupSessionsByDate, getGroupId } from '../lib/utils';
import { ResumeButton } from './ResumeButton';

interface TimelineViewProps {
  sessions: SessionSummary[];
  loading?: boolean;
  onGroupsChange?: (groups: Map<string, { count: number }>) => void;
}

export function TimelineView({ sessions, loading, onGroupsChange }: TimelineViewProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const groupedSessions = useMemo(() => {
    const groups = groupSessionsByDate(sessions);
    // 通知父组件分组信息
    if (onGroupsChange) {
      const groupInfo = new Map<string, { count: number }>();
      groups.forEach((items, group) => {
        groupInfo.set(group, { count: items.length });
      });
      onGroupsChange(groupInfo);
    }
    return groups;
  }, [sessions, onGroupsChange]);

  const toggleCollapse = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        没有找到会话记录
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(groupedSessions.entries()).map(([group, groupSessions]) => (
        <DateGroupSection
          key={group}
          group={group}
          sessions={groupSessions}
          collapsed={collapsedGroups.has(group)}
          onToggle={() => toggleCollapse(group)}
        />
      ))}
    </div>
  );
}

interface DateGroupSectionProps {
  group: string;
  sessions: SessionSummary[];
  collapsed: boolean;
  onToggle: () => void;
}

function DateGroupSection({ group, sessions, collapsed, onToggle }: DateGroupSectionProps) {
  return (
    <div
      id={getGroupId(group)}
      className="bg-white rounded-lg border border-gray-200 overflow-hidden scroll-mt-32"
    >
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          {group}
          <span className="text-gray-400 font-normal">({sessions.length})</span>
        </h3>
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {!collapsed && (
        <div className="divide-y divide-gray-200">
          {sessions.map((session) => (
            <TimelineSessionItem key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineSessionItem({ session }: { session: SessionSummary }) {
  return (
    <Link
      to={`/session/${session.id}`}
      className={cn(
        "block p-4 hover:bg-gray-50 transition-colors",
        "border-l-4 border-transparent hover:border-blue-500"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {session.title || '(无标题)'}
          </h3>

          <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Folder className="w-3 h-3" />
              {session.project_name}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {session.message_count} 条消息
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(session.updated_at)}
            </span>
          </div>

          {session.tool_calls.length > 0 && (
            <div className="mt-2 flex items-center gap-1 flex-wrap">
              <Wrench className="w-3 h-3 text-gray-400" />
              {session.tool_calls.slice(0, 5).map((tool) => (
                <span
                  key={tool}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                >
                  {tool}
                </span>
              ))}
              {session.tool_calls.length > 5 && (
                <span className="text-xs text-gray-400">
                  +{session.tool_calls.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          <ResumeButton sessionId={session.id} compact />
          <div className="text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        <div className="flex-shrink-0 text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
