import { useState } from 'react';
import { Terminal, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface ResumeButtonProps {
  sessionId: string;
  /** compact mode for list items */
  compact?: boolean;
}

export function ResumeButton({ sessionId, compact }: ResumeButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await navigator.clipboard.writeText(`claude --resume ${sessionId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy resume command:', err);
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleCopy}
        title="复制 resume 命令"
        className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border transition-colors",
          copied
            ? "bg-green-50 text-green-600 border-green-200"
            : "bg-white text-gray-500 border-gray-200 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50"
        )}
      >
        {copied ? <Check className="w-3 h-3" /> : <Terminal className="w-3 h-3" />}
        <span>{copied ? '已复制' : 'Resume'}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      title={`claude --resume ${sessionId}`}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border transition-colors",
        copied
          ? "bg-green-50 text-green-600 border-green-200"
          : "bg-white text-gray-600 border-gray-200 hover:text-gray-900 hover:bg-gray-50"
      )}
    >
      {copied ? <Check className="w-4 h-4" /> : <Terminal className="w-4 h-4" />}
      <span>{copied ? '已复制' : 'Resume'}</span>
    </button>
  );
}
