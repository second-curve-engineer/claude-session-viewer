import { Link } from 'react-router-dom';
import { MessageSquare, Folder, Clock, Wrench } from 'lucide-react';
import type { SessionSummary } from '../lib/api';
import { formatDate, cn } from '../lib/utils';
import { ResumeButton } from './ResumeButton';

interface SessionListProps {
  sessions: SessionSummary[];
  loading?: boolean;
}

export function SessionList({ sessions, loading }: SessionListProps) {
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
    <div className="divide-y divide-gray-200">
      {sessions.map((session) => (
        <SessionItem key={session.id} session={session} />
      ))}
    </div>
  );
}

function SessionItem({ session }: { session: SessionSummary }) {
  const source = session.source || 'claude';
  return (
    <Link
      to={`/session/${session.id}?source=${source}`}
      className={cn(
        "block p-4 hover:bg-gray-50 transition-colors",
        "border-l-4 border-transparent hover:border-blue-500"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {session.title || '(无标题)'}
          </h3>

          {/* 项目信息 */}
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

          {/* 工具标签 */}
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

        {/* Resume + 箭头 */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <ResumeButton sessionId={session.id} compact />
          <div className="text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        {/* 箭头 */}
        <div className="flex-shrink-0 text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
