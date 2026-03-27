import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ChevronRight, RefreshCw } from 'lucide-react';
import { getUsageSummary, type UsageSummary, type SourceFilter } from '../lib/api';

// 模块级缓存，页面导航时保持数据
const cachedUsage: Record<string, UsageSummary | null> = {};

function formatTokens(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toString();
}

function formatCost(cost: number): string {
  return '$' + cost.toFixed(2);
}

interface UsageStatsProps {
  source: SourceFilter;
}

export function UsageStats({ source }: UsageStatsProps) {
  const [usage, setUsage] = useState<UsageSummary | null>(cachedUsage[source] || null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(cachedUsage[source]));

  useEffect(() => {
    setUsage(cachedUsage[source] || null);
    setLoaded(Boolean(cachedUsage[source]));
  }, [source]);

  const handleLoad = async () => {
    setLoading(true);
    try {
      const data = await getUsageSummary(source);
      cachedUsage[source] = data; // 更新缓存
      setUsage(data);
      setLoaded(true);
    } catch (error) {
      console.error('Failed to load usage stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // 首次进入自动加载
  useEffect(() => {
    if (!loaded && !loading) {
      handleLoad();
    }
  }, [loaded, loading, source]);

  // 加载中状态
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-medium text-gray-700">Token 统计</span>
        </div>
        <div className="flex items-center justify-center py-4 text-sm text-gray-500">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          正在统计...
        </div>
      </div>
    );
  }

  if (!usage) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-medium text-gray-700">Token 统计</span>
          <button
            onClick={handleLoad}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title="刷新统计"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        <Link
          to={`/usage?source=${source}`}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
        >
          详情
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">今日</span>
          <div className="text-right">
            <span className="font-medium text-gray-900">{formatTokens(usage.today.total_tokens)}</span>
            <span className="text-gray-400 ml-2">{formatCost(usage.today.cost_usd)}</span>
          </div>
        </div>

        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">本月</span>
          <div className="text-right">
            <span className="font-medium text-gray-900">{formatTokens(usage.this_month.total_tokens)}</span>
            <span className="text-gray-400 ml-2">{formatCost(usage.this_month.cost_usd)}</span>
          </div>
        </div>

        <div className="flex justify-between items-center text-sm border-t border-gray-100 pt-3">
          <span className="text-gray-500">总计</span>
          <div className="text-right">
            <span className="font-medium text-gray-900">{formatTokens(usage.total.total_tokens)}</span>
            <span className="text-gray-400 ml-2">{formatCost(usage.total.cost_usd)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
