import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Activity, Calendar, Cpu } from 'lucide-react';
import { getUsageDetail, getUsageSummary, type UsageDetail, type UsageSummary, type SourceFilter } from '../lib/api';
import { cn } from '../lib/utils';

const SOURCE_FILTER_KEY = 'claude-session-viewer-source';

function formatTokens(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

function formatCost(cost: number): string {
  return '$' + cost.toFixed(4);
}

function formatDate(dateStr: string): string {
  return dateStr; // 直接返回 YYYY-MM-DD 格式
}

function formatModelName(model: string): string {
  // claude-opus-4-5-20251101 -> Opus 4.5
  // claude-sonnet-4-5-20250929 -> Sonnet 4.5
  // claude-3-5-haiku-20241022 -> Haiku 3.5
  if (model.includes('opus-4-5')) return 'Opus 4.5';
  if (model.includes('sonnet-4-5')) return 'Sonnet 4.5';
  if (model.includes('sonnet-4-')) return 'Sonnet 4';
  if (model.includes('haiku')) return 'Haiku';
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  return model;
}

export function Usage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [detail, setDetail] = useState<UsageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const requestIdRef = useRef(0);
  const [source, setSource] = useState<SourceFilter>(() => {
    const param = searchParams.get('source');
    if (param === 'claude' || param === 'codex' || param === 'gemini') return param;
    const saved = localStorage.getItem(SOURCE_FILTER_KEY);
    return (saved === 'claude' || saved === 'codex' || saved === 'gemini') ? saved : 'claude';
  });

  const handleSourceChange = (next: SourceFilter) => {
    setSource(next);
    localStorage.setItem(SOURCE_FILTER_KEY, next);
    setSearchParams({ source: next });
  };

  useEffect(() => {
    const param = searchParams.get('source');
    if (param === 'claude' || param === 'codex' || param === 'gemini') {
      if (param !== source) {
        setSource(param);
        localStorage.setItem(SOURCE_FILTER_KEY, param);
      }
    }
  }, [searchParams, source]);

  useEffect(() => {
    async function load() {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const [summaryData, detailData] = await Promise.all([
          getUsageSummary(source),
          getUsageDetail(days, source),
        ]);
        if (requestId !== requestIdRef.current) {
          return;
        }
        setSummary(summaryData);
        setDetail(detailData);
      } catch (error) {
        console.error('Failed to load usage data:', error);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }
    load();
  }, [days, source]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-orange-500" />
              <h1 className="text-xl font-semibold text-gray-900">
                Token 使用统计
              </h1>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1 bg-gray-50">
              <button
                onClick={() => handleSourceChange('claude')}
                className={cn(
                  "px-3 py-1 text-sm rounded",
                  source === 'claude'
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
                  source === 'codex'
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
                  source === 'gemini'
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                Gemini
              </button>
            </div>
            {source === 'claude' && (
              <a
                href="https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
              >
                定价来源: LiteLLM (2026-01-26)
              </a>
            )}
            {source === 'codex' && (
              <a
                href="https://platform.openai.com/docs/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
              >
                定价来源: OpenAI Pricing
              </a>
            )}
            {source === 'gemini' && (
              <span className="ml-auto text-xs text-gray-400">
                定价来源: 暂无（仅统计 token）
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 摘要卡片 */}
            {summary && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <div className="text-sm text-gray-500 mb-1">今日用量</div>
                  <div className="text-2xl font-semibold text-gray-900">
                    {formatTokens(summary.today.total_tokens)}
                  </div>
                  <div className="text-sm text-orange-600 mt-1">
                    {formatCost(summary.today.cost_usd)}
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <div className="text-sm text-gray-500 mb-1">本月用量</div>
                  <div className="text-2xl font-semibold text-gray-900">
                    {formatTokens(summary.this_month.total_tokens)}
                  </div>
                  <div className="text-sm text-orange-600 mt-1">
                    {formatCost(summary.this_month.cost_usd)}
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <div className="text-sm text-gray-500 mb-1">总计用量</div>
                  <div className="text-2xl font-semibold text-gray-900">
                    {formatTokens(summary.total.total_tokens)}
                  </div>
                  <div className="text-sm text-orange-600 mt-1">
                    {formatCost(summary.total.cost_usd)}
                  </div>
                </div>
              </div>
            )}

            {/* 按模型统计 */}
            {detail && Object.keys(detail.by_model).length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200">
                  <h2 className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Cpu className="w-4 h-4" />
                    按模型统计
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="text-left px-5 py-3 font-medium">模型</th>
                        <th className="text-right px-5 py-3 font-medium">Input</th>
                        <th className="text-right px-5 py-3 font-medium">Output</th>
                        <th className="text-right px-5 py-3 font-medium">Cache Create</th>
                        <th className="text-right px-5 py-3 font-medium">Cache Read</th>
                        <th className="text-right px-5 py-3 font-medium">Total</th>
                        <th className="text-right px-5 py-3 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.entries(detail.by_model)
                        .sort((a, b) => b[1].total_tokens - a[1].total_tokens)
                        .map(([model, data]) => (
                          <tr key={model} className="hover:bg-gray-50">
                            <td className="px-5 py-3 font-medium text-gray-900">{formatModelName(model)}</td>
                            <td className="px-5 py-3 text-right text-gray-600">
                              {formatTokens(data.input_tokens)}
                            </td>
                            <td className="px-5 py-3 text-right text-gray-600">
                              {formatTokens(data.output_tokens)}
                            </td>
                            <td className="px-5 py-3 text-right text-gray-600">
                              {formatTokens(data.cache_creation_tokens)}
                            </td>
                            <td className="px-5 py-3 text-right text-gray-600">
                              {formatTokens(data.cache_read_tokens)}
                            </td>
                            <td className="px-5 py-3 text-right font-medium text-gray-900">
                              {formatTokens(data.total_tokens)}
                            </td>
                            <td className="px-5 py-3 text-right text-orange-600">
                              {formatCost(data.cost_usd)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 每日统计 */}
            {detail && detail.daily_usage.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Calendar className="w-4 h-4" />
                    每日统计
                  </h2>
                  <select
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    <option value={7}>最近 7 天</option>
                    <option value={30}>最近 30 天</option>
                    <option value={90}>最近 90 天</option>
                    <option value={365}>最近 1 年</option>
                  </select>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="text-left px-5 py-3 font-medium">日期</th>
                        <th className="text-left px-5 py-3 font-medium">模型</th>
                        <th className="text-right px-5 py-3 font-medium">Input</th>
                        <th className="text-right px-5 py-3 font-medium">Output</th>
                        <th className="text-right px-5 py-3 font-medium">Cache Create</th>
                        <th className="text-right px-5 py-3 font-medium">Cache Read</th>
                        <th className="text-right px-5 py-3 font-medium">Total</th>
                        <th className="text-right px-5 py-3 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detail.daily_usage.map((day) => (
                        <tr key={day.date} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-900 whitespace-nowrap">
                            {formatDate(day.date)}
                          </td>
                          <td className="px-5 py-3 text-gray-600">
                            <div className="flex flex-wrap gap-1">
                              {day.models.map((model) => (
                                <span
                                  key={model}
                                  className="px-1.5 py-0.5 bg-gray-100 rounded text-xs"
                                >
                                  {formatModelName(model)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600">
                            {formatTokens(day.input_tokens)}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600">
                            {formatTokens(day.output_tokens)}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600">
                            {formatTokens(day.cache_creation_tokens)}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600">
                            {formatTokens(day.cache_read_tokens)}
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-gray-900">
                            {formatTokens(day.total_tokens)}
                          </td>
                          <td className="px-5 py-3 text-right text-orange-600">
                            {formatCost(day.cost_usd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
