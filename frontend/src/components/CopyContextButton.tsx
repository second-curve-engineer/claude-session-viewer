import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { getSessionContext } from '../lib/api';
import { cn } from '../lib/utils';

interface CopyContextButtonProps {
  sessionId: string;
}

export function CopyContextButton({ sessionId }: CopyContextButtonProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = async () => {
    setLoading(true);
    setError(null);

    try {
      const { context } = await getSessionContext(sessionId);
      await navigator.clipboard.writeText(context);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy context:', err);
      setError('复制失败');
      setTimeout(() => setError(null), 2000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCopy}
      disabled={loading}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border",
        "transition-colors",
        copied
          ? "bg-green-50 text-green-600 border-green-200"
          : error
          ? "bg-red-50 text-red-600 border-red-200"
          : "bg-white text-gray-600 border-gray-200 hover:text-gray-900 hover:bg-gray-50"
      )}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      ) : copied ? (
        <Check className="w-4 h-4" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
      <span>{copied ? '已复制' : error ? error : '复制上下文'}</span>
    </button>
  );
}
