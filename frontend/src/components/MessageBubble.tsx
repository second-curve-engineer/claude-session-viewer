import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  User, Bot, Terminal, FileText, Search, Edit3, ChevronDown, ChevronRight,
  CheckCircle2, Copy, Check, ClipboardList, Zap, Globe, HelpCircle,
  ListTodo, FolderSearch, FileSearch, ExternalLink
} from 'lucide-react';
import type { Message, ToolCall } from '../lib/api';
import { formatDateTime, cn } from '../lib/utils';
import { DiffViewer } from './DiffViewer';
import { CodeViewer } from './CodeViewer';

// 去除 Read 工具结果中的行号前缀（如 "     1→"）
function stripLineNumbers(content: string): string {
  const lines = content.split('\n');
  return lines
    .map(line => {
      // 匹配格式: 空格+数字+→+内容
      const match = line.match(/^\s*\d+→(.*)$/);
      return match ? match[1] : line;
    })
    .join('\n');
}

// 处理 plan 内容中的转义换行符
function normalizePlanContent(content: string): string {
  return content
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
}

function getStringInput(tool: ToolCall, key: string): string | undefined {
  const value = tool.input[key];
  return typeof value === 'string' ? value : undefined;
}

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.type === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [message.content]);

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* 头像 */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-blue-100 text-blue-600" : "bg-orange-100 text-orange-600"
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* 消息内容 */}
      <div className={cn("flex-1 max-w-3xl", isUser ? "text-right" : "text-left")}>
        {/* 时间戳 */}
        <div className="text-xs text-gray-400 mb-1">
          {isUser ? '你' : 'Claude'} · {formatDateTime(message.timestamp)}
        </div>

        {/* 消息体 - 仅在有文本内容时显示 */}
        {message.content.trim() && (
          <div className="relative group">
            <div
              className={cn(
                "inline-block text-left rounded-lg px-4 py-3",
                isUser
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-200 text-gray-800"
              )}
            >
              {isUser ? (
                // 用户消息：简单文本
                <div className="whitespace-pre-wrap text-sm">{message.content}</div>
              ) : (
                // 助手消息：Markdown 渲染
                <div className="markdown-content text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
            {/* 复制按钮 - 仅 Claude 消息显示 */}
            {!isUser && (
              <button
                onClick={handleCopy}
                className={cn(
                  "absolute top-2 right-2 p-1.5 rounded-md transition-all",
                  "opacity-0 group-hover:opacity-100",
                  copied
                    ? "bg-green-100 text-green-600"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                )}
                title={copied ? "已复制" : "复制内容"}
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        )}

        {/* 工具调用 - 使用新的 tool_calls */}
        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.tool_calls.map((tool) => (
              <ToolCallCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ToolCallCardProps {
  tool: ToolCall;
}

function ToolCallCard({ tool }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = tool.result !== null && tool.result !== undefined;
  const subagentType = getStringInput(tool, 'subagent_type');
  const description = getStringInput(tool, 'description');
  const status = getStringInput(tool, 'status');

  // 根据工具类型获取图标和颜色
  const getToolConfig = (name: string) => {
    switch (name) {
      case 'Bash':
        return { icon: Terminal, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' };
      case 'Read':
        return { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
      case 'Write':
      case 'Edit':
      case 'NotebookEdit':
        return { icon: Edit3, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' };
      case 'Grep':
        return { icon: FileSearch, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' };
      case 'Glob':
        return { icon: FolderSearch, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' };
      case 'ExitPlanMode':
      case 'EnterPlanMode':
        return { icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' };
      case 'Task':
        return { icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' };
      case 'WebFetch':
      case 'WebSearch':
        return { icon: Globe, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-200' };
      case 'AskUserQuestion':
        return { icon: HelpCircle, color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-200' };
      case 'TodoWrite':
      case 'TaskCreate':
      case 'TaskUpdate':
      case 'TaskOutput':
      case 'TaskList':
        return { icon: ListTodo, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-200' };
      default:
        return { icon: Terminal, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };
    }
  };

  const config = getToolConfig(tool.name);
  const Icon = config.icon;

  // 格式化工具输入为友好显示
  const formatInput = () => {
    const input = tool.input;
    switch (tool.name) {
      case 'Bash':
        return input.command as string || '';
      case 'Read':
        return input.file_path as string || '';
      case 'Write':
        return input.file_path as string || '';
      case 'Edit':
        return input.file_path as string || '';
      case 'Grep':
        return `${input.pattern || ''} ${input.path ? `in ${input.path}` : ''}`;
      case 'Glob':
        return `${input.pattern || ''} ${input.path ? `in ${input.path}` : ''}`;
      case 'ExitPlanMode':
        // 显示 plan 的前60个字符作为摘要
        const plan = (input.plan as string) || '';
        return plan.replace(/\\r\\n|\\n|\r\n|\n/g, ' ').slice(0, 60) + (plan.length > 60 ? '...' : '');
      case 'Task':
        // 显示 description 或 prompt 摘要
        const desc = (input.description as string) || '';
        const prompt = (input.prompt as string) || '';
        const taskSummary = desc || prompt.replace(/\\r\\n|\\n|\r\n|\n/g, ' ');
        return taskSummary.slice(0, 60) + (taskSummary.length > 60 ? '...' : '');
      case 'WebFetch':
        return (input.url as string) || '';
      case 'WebSearch':
        return (input.query as string) || '';
      case 'AskUserQuestion':
        const questions = input.questions as Array<{question: string}> || [];
        return questions[0]?.question?.slice(0, 60) || '';
      case 'TodoWrite':
        const todos = input.todos as Array<{content: string}> || [];
        return `${todos.length} 个待办事项`;
      case 'TaskCreate':
        return (input.subject as string) || '';
      case 'TaskUpdate':
        return `#${input.taskId} → ${input.status || '更新'}`;
      default:
        // 其他工具显示简化的 JSON
        const entries = Object.entries(input).slice(0, 3);
        return entries.map(([k, v]) => {
          const val = typeof v === 'string' ? v : JSON.stringify(v);
          return `${k}: ${val.length > 50 ? val.slice(0, 50) + '...' : val}`;
        }).join(', ');
    }
  };

  const inputDisplay = formatInput();

  return (
    <div className={cn("rounded-lg border text-left", config.bg, config.border)}>
      {/* 工具调用头部 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-black/5 transition-colors rounded-t-lg"
      >
        <Icon className={cn("w-4 h-4 flex-shrink-0", config.color)} />
        <span className={cn("font-medium text-sm", config.color)}>{tool.name}</span>
        <span className="text-gray-600 text-sm font-mono truncate flex-1 text-left">
          {inputDisplay}
        </span>
        {hasResult && (
          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
        )}
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {/* 展开的内容 */}
      {expanded && (
        <div className="border-t border-gray-200">
          {/* Edit 工具：显示 Diff 视图 */}
          {tool.name === 'Edit' && tool.input.old_string && tool.input.new_string ? (
            <div className="p-2">
              <DiffViewer
                oldValue={tool.input.old_string as string}
                newValue={tool.input.new_string as string}
                fileName={tool.input.file_path as string}
              />
            </div>
          ) : tool.name === 'Write' && tool.input.content ? (
            /* Write 工具：显示写入的代码内容 */
            <div className="p-2">
              <CodeViewer
                code={tool.input.content as string}
                fileName={tool.input.file_path as string}
              />
            </div>
          ) : tool.name === 'Read' && hasResult ? (
            /* Read 工具：显示读取的文件内容（去除行号前缀） */
            <div className="p-2">
              <CodeViewer
                code={stripLineNumbers(tool.result as string)}
                fileName={tool.input.file_path as string}
              />
            </div>
          ) : tool.name === 'ExitPlanMode' && tool.input.plan ? (
            /* ExitPlanMode 工具：渲染 plan 为 Markdown */
            <div className="p-4 bg-white max-h-96 overflow-y-auto">
              <div className="markdown-content text-sm prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {normalizePlanContent(tool.input.plan as string)}
                </ReactMarkdown>
              </div>
            </div>
          ) : tool.name === 'Task' && tool.input.prompt ? (
            /* Task 工具：显示任务详情 */
            <div className="bg-white">
              {/* 任务元信息 */}
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-4 text-xs text-gray-600">
                {subagentType && (
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                    {subagentType}
                  </span>
                )}
                {description && (
                  <span className="font-medium">{description}</span>
                )}
              </div>
              {/* 任务 Prompt */}
              <div className="p-4 max-h-96 overflow-y-auto">
                <div className="markdown-content text-sm prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {normalizePlanContent(tool.input.prompt as string)}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (tool.name === 'Glob' || tool.name === 'Grep') && hasResult ? (
            /* Glob/Grep 工具：显示文件列表 */
            <div className="bg-gray-900 p-3 max-h-64 overflow-y-auto">
              <div className="space-y-0.5">
                {(tool.result as string).split('\n').filter(Boolean).map((file, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono">
                    <FileText className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span className="text-gray-300 truncate">{file}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : tool.name === 'WebFetch' ? (
            /* WebFetch 工具：显示 URL 和内容 */
            <div className="bg-white">
              <div className="px-3 py-2 bg-cyan-50 border-b border-cyan-200 flex items-center gap-2">
                <ExternalLink className="w-3 h-3 text-cyan-600" />
                <a
                  href={tool.input.url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-700 hover:underline truncate"
                >
                  {tool.input.url as string}
                </a>
              </div>
              {hasResult && (
                <div className="p-3 max-h-64 overflow-y-auto">
                  <div className="text-xs text-gray-700 whitespace-pre-wrap">
                    {tool.result}
                  </div>
                </div>
              )}
            </div>
          ) : tool.name === 'WebSearch' ? (
            /* WebSearch 工具：显示搜索查询和结果 */
            <div className="bg-white">
              <div className="px-3 py-2 bg-cyan-50 border-b border-cyan-200">
                <div className="flex items-center gap-2">
                  <Search className="w-3 h-3 text-cyan-600" />
                  <span className="text-xs font-medium text-cyan-700">
                    搜索: {tool.input.query as string}
                  </span>
                </div>
              </div>
              {hasResult && (
                <div className="p-3 max-h-64 overflow-y-auto">
                  <div className="markdown-content text-xs prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {tool.result as string}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ) : tool.name === 'AskUserQuestion' && tool.input.questions ? (
            /* AskUserQuestion 工具：显示问题和选项 */
            <div className="bg-white p-3 space-y-3">
              {(tool.input.questions as Array<{question: string; options?: Array<{label: string; description?: string}>}>).map((q, i) => (
                <div key={i} className="space-y-2">
                  <div className="text-sm font-medium text-gray-800">{q.question}</div>
                  {q.options && (
                    <div className="space-y-1 pl-2">
                      {q.options.map((opt, j) => (
                        <div key={j} className="flex items-start gap-2 text-xs">
                          <span className="w-4 h-4 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center flex-shrink-0 text-[10px]">
                            {j + 1}
                          </span>
                          <div>
                            <span className="font-medium text-gray-700">{opt.label}</span>
                            {opt.description && (
                              <span className="text-gray-500 ml-1">- {opt.description}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : tool.name === 'TodoWrite' && tool.input.todos ? (
            /* TodoWrite 工具：显示待办列表 */
            <div className="bg-white p-3 space-y-1">
              {(tool.input.todos as Array<{id?: string; content: string; status?: string; priority?: string}>).map((todo, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5",
                    todo.status === 'completed' ? "bg-green-100 border-green-300 text-green-600" : "border-gray-300"
                  )}>
                    {todo.status === 'completed' && <Check className="w-3 h-3" />}
                  </span>
                  <div className="flex-1">
                    <span className={cn(
                      "text-gray-700",
                      todo.status === 'completed' && "line-through text-gray-400"
                    )}>
                      {todo.content}
                    </span>
                    {todo.priority && (
                      <span className={cn(
                        "ml-2 px-1 py-0.5 rounded text-[10px]",
                        todo.priority === 'high' ? "bg-red-100 text-red-600" :
                        todo.priority === 'medium' ? "bg-yellow-100 text-yellow-600" :
                        "bg-gray-100 text-gray-600"
                      )}>
                        {todo.priority}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : tool.name === 'TaskCreate' ? (
            /* TaskCreate 工具：显示创建的任务 */
            <div className="bg-white p-3">
              <div className="flex items-start gap-2">
                <ListTodo className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-gray-800">{tool.input.subject as string}</div>
                  {description && (
                    <div className="text-xs text-gray-500 mt-1">{description}</div>
                  )}
                </div>
              </div>
            </div>
          ) : tool.name === 'TaskUpdate' ? (
            /* TaskUpdate 工具：显示任务更新 */
            <div className="bg-white p-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">任务</span>
                <span className="font-mono text-teal-600">#{tool.input.taskId as string}</span>
                {status && (
                  <>
                    <span className="text-gray-400">→</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-xs",
                      status === 'completed' ? "bg-green-100 text-green-700" :
                      status === 'in_progress' ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-700"
                    )}>
                      {status}
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* 其他工具：显示输入参数 */}
              {tool.name !== 'Bash' && Object.keys(tool.input).length > 0 && (
                <div className="px-3 py-2 bg-gray-800">
                  <div className="text-xs text-gray-400 mb-1">输入参数</div>
                  <pre className="text-xs text-gray-100 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                    {JSON.stringify(tool.input, null, 2)}
                  </pre>
                </div>
              )}

              {/* 输出结果 */}
              {hasResult && (
                <div className="px-3 py-2 bg-gray-900 rounded-b-lg">
                  <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                    <Terminal className="w-3 h-3" />
                    输出
                  </div>
                  <pre className="text-xs text-gray-100 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                    {tool.result}
                  </pre>
                </div>
              )}

              {!hasResult && tool.name !== 'Edit' && (
                <div className="px-3 py-2 text-xs text-gray-500 italic">
                  (无输出)
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
