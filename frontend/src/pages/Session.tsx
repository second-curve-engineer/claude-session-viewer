import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Folder, Clock, FileText, MessageSquare } from 'lucide-react';
import { MessageBubble } from '../components/MessageBubble';
import { CopyContextButton } from '../components/CopyContextButton';
import { getSession, type SessionDetail } from '../lib/api';
import { formatDateTime, cn } from '../lib/utils';

export function Session() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'messages' | 'files'>('messages');

  useEffect(() => {
    async function load() {
      if (!id) return;

      setLoading(true);
      setError(null);

      try {
        const data = await getSession(id);
        setSession(data);
      } catch (err) {
        setError('加载会话失败');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500 mb-4">{error || '会话不存在'}</div>
          <Link to="/" className="text-blue-600 hover:underline">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          {/* 返回按钮和标题 */}
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">返回</span>
            </Link>
          </div>

          {/* 会话信息 */}
          <div className="mt-3">
            <h1 className="text-lg font-medium text-gray-900 line-clamp-2">
              {session.title}
            </h1>
            <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Folder className="w-4 h-4" />
                {session.project_path}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatDateTime(session.created_at)}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-4 h-4" />
                {session.messages.length} 条消息
              </span>
            </div>
          </div>

          {/* 标签页 + 复制按钮 */}
          <div className="mt-4 flex items-center justify-between border-b border-gray-200">
            <div className="flex gap-4 -mb-px">
              <button
                onClick={() => setActiveTab('messages')}
                className={cn(
                  "flex items-center gap-1 px-3 py-2 text-sm border-b-2 -mb-px",
                  activeTab === 'messages'
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                )}
              >
                <MessageSquare className="w-4 h-4" />
                对话内容
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={cn(
                  "flex items-center gap-1 px-3 py-2 text-sm border-b-2 -mb-px",
                  activeTab === 'files'
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                )}
              >
                <FileText className="w-4 h-4" />
                文件变更
                {session.file_changes.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                    {session.file_changes.length}
                  </span>
                )}
              </button>
            </div>
            {/* 复制上下文按钮 */}
            <CopyContextButton sessionId={id!} />
          </div>
        </div>
      </header>

      {/* 内容区 */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'messages' ? (
          <div className="space-y-6">
            {session.messages.map((message) => (
              <MessageBubble key={message.uuid} message={message} />
            ))}
          </div>
        ) : (
          <FileChangesPanel changes={session.file_changes} />
        )}
      </main>
    </div>
  );
}

interface FileChangesPanelProps {
  changes: SessionDetail['file_changes'];
}

function FileChangesPanel({ changes }: FileChangesPanelProps) {
  if (changes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        此会话没有文件变更记录
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="divide-y divide-gray-200">
        {changes.map((change, index) => (
          <div key={index} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-900">
                  {change.file_path}
                </span>
                <span className="text-xs text-gray-400">v{change.version}</span>
              </div>
              <span className="text-xs text-gray-500">
                {formatDateTime(change.timestamp)}
              </span>
            </div>
            {change.backup_file && (
              <div className="mt-1 text-xs text-gray-400">
                备份: {change.backup_file}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
