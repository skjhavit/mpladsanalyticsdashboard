import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, AlertCircle, ArrowUp, ArrowDown, Filter, Search } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useIsMobile } from '../hooks/useMediaQuery';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
} from 'recharts';

function formatCr(amount: number) {
  return `₹${(Number(amount) / 1e7).toFixed(2)} Cr`;
}

function pearsonCorrelation(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;

  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
  }

  const denom = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  if (!Number.isFinite(denom) || denom === 0) return null;
  const r = (n * sumXY - sumX * sumY) / denom;
  if (!Number.isFinite(r)) return null;
  return r;
}

function renderTopSpenderMetricsLabel(item: any) {
  const transparency = Number(item?.transparency_pct ?? 0);
  const completion = Number(item?.completion_pct ?? 0);
  return `T ${Number.isFinite(transparency) ? transparency.toFixed(0) : '0'}% • C ${Number.isFinite(completion) ? completion.toFixed(0) : '0'}%`;
}

export function MPList() {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();

  const { isPending, error, data } = useQuery({
    queryKey: ['mps'],
    queryFn: () => fetch((import.meta.env.VITE_API_URL || '') + '/api/mps?limit=1000').then((res) => res.json()),
  });

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const initialState = searchParams.get('state') || 'All';
  const [selectedState, setSelectedState] = useState<string>(initialState);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const uniqueStates = useMemo(() => {
    if (!data) return [];
    const states = new Set(data.map((mp: any) => mp.state));
    return ['All', ...Array.from(states).sort()];
  }, [data]);

  const filteredData = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    const query = searchQuery.toLowerCase();
    return data.filter((mp: any) => {
      const matchesState = selectedState === 'All' || mp.state === selectedState;
      const name = mp.name ? String(mp.name).toLowerCase() : '';
      const constituency = mp.constituency ? String(mp.constituency).toLowerCase() : '';
      const matchesSearch = name.includes(query) || constituency.includes(query);
      return matchesState && matchesSearch;
    });
  }, [data, selectedState, searchQuery]);

  const sortedData = useMemo(() => {
    if (!filteredData || !Array.isArray(filteredData)) return [];
    let sortableItems = [...filteredData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  const highlights = useMemo(() => {
    if (!filteredData || !Array.isArray(filteredData) || filteredData.length === 0) return null;

    const byMax = (key: string) =>
      filteredData.reduce(
        (best: any, cur: any) => (Number(cur[key] ?? 0) > Number(best?.[key] ?? 0) ? cur : best),
        filteredData[0]
      );
    const byMin = (key: string) =>
      filteredData.reduce(
        (best: any, cur: any) => (Number(cur[key] ?? 0) < Number(best?.[key] ?? 0) ? cur : best),
        filteredData[0]
      );

    const totalSpent = filteredData.reduce((s: number, x: any) => s + Number(x.spent ?? 0), 0);
    const avg = (key: string) =>
      filteredData.reduce((s: number, x: any) => s + Number(x[key] ?? 0), 0) / (filteredData.length || 1);

    const lowTransparencyCount = filteredData.filter((x: any) => Number(x.transparency_score ?? 0) < 20).length;
    const lowCompletionCount = filteredData.filter((x: any) => Number(x.completion_rate ?? 0) < 30).length;

    // Distribution buckets for transparency score
    const buckets = [
      { label: '0-20', min: 0, max: 20 },
      { label: '20-40', min: 20, max: 40 },
      { label: '40-60', min: 40, max: 60 },
      { label: '60-80', min: 60, max: 80 },
      { label: '80-100', min: 80, max: 101 },
    ];
    const transparencyDistribution = buckets.map((b) => ({
      bucket: b.label,
      count: filteredData.filter((x: any) => {
        const v = Number(x.transparency_score ?? 0);
        return v >= b.min && v < b.max;
      }).length,
    }));

    const topSpenders = [...filteredData]
      .sort((a: any, b: any) => Number(b.spent ?? 0) - Number(a.spent ?? 0))
      .slice(0, 5)
      .map((x: any) => ({
        name: x.name,
        spent: Number(x.spent ?? 0),
        transparency_pct: Number(x.transparency_score ?? 0),
        completion_pct: Number(x.completion_rate ?? 0),
      }));

    const scatterPoints = [...filteredData]
      .filter((x: any) => Number(x.spent ?? 0) > 0)
      .sort((a: any, b: any) => Number(b.spent ?? 0) - Number(a.spent ?? 0))
      .slice(0, 300)
      .map((x: any) => ({
        name: x.name,
        spent: Number(x.spent ?? 0),
        transparency: Number(x.transparency_score ?? 0),
        completion: Number(x.completion_rate ?? 0),
        state: x.state,
      }));

    const xs = scatterPoints.map((p) => p.spent);
    const rTrans = pearsonCorrelation(xs, scatterPoints.map((p) => p.transparency));
    const rComp = pearsonCorrelation(xs, scatterPoints.map((p) => p.completion));

    const worstTransparency = byMin('transparency_score');
    const worstCompletion = byMin('completion_rate');
    const topSpender = byMax('spent');

    return {
      count: filteredData.length,
      contextLabel: selectedState === 'All' ? 'All states' : selectedState,
      totalSpent,
      avgUtil: avg('utilization_rate'),
      avgComp: avg('completion_rate'),
      avgTrans: avg('transparency_score'),
      lowTransparencyCount,
      lowCompletionCount,
      transparencyDistribution,
      topSpenders,
      scatterPoints,
      rTrans,
      rComp,
      topSpender,
      worstTransparency,
      worstCompletion,
    };
  }, [filteredData, selectedState]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc'; // Default to desc for metrics
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
     if (sortConfig?.key !== columnKey) return <ArrowUpDown className="ml-1 w-3 h-3 text-gray-400" />;
     return sortConfig.direction === 'asc' 
        ? <ArrowUp className="ml-1 w-3 h-3 text-blue-600" />
        : <ArrowDown className="ml-1 w-3 h-3 text-blue-600" />;
  };

  if (isPending) return <div className="p-10 text-center">Loading MPs...</div>;
  if (error) return <div className="p-10 text-red-500">Error: {error.message}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur -mx-4 px-4 py-3 sm:static sm:bg-transparent sm:backdrop-blur-0 sm:mx-0 sm:px-0 sm:py-0 border-b border-gray-100 sm:border-0 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Member of Parliament Performance</h1>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {/* Local Search */}
            <div className="relative flex-grow sm:flex-grow-0">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                    type="text"
                    placeholder="Search MP or Constituency..."
                    className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* State Filter */}
            <div className="flex items-center bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                <Filter className="w-4 h-4 text-gray-500 ml-2" />
                <select 
                    className="block w-full sm:w-48 pl-2 pr-8 py-2 text-sm border-none focus:ring-0 rounded-md"
                    value={selectedState}
                    onChange={(e) => setSelectedState(e.target.value)}
                >
                    {uniqueStates.map((state: any) => (
                        <option key={state} value={state}>{state}</option>
                    ))}
                </select>
            </div>
        </div>
      </div>

      {highlights ? (
        <div className="mb-6 space-y-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <div className="text-xs text-gray-500">Selection summary</div>
                <div className="text-lg font-semibold text-gray-900">
                  {highlights.contextLabel} • {highlights.count.toLocaleString()} MPs
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500">Total spent</div>
                  <div className="font-mono text-gray-900">₹{(highlights.totalSpent / 1e7).toFixed(2)} Cr</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500">Avg utilization</div>
                  <div className="font-semibold text-gray-900">{highlights.avgUtil.toFixed(1)}%</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500">Avg completion</div>
                  <div className="font-semibold text-gray-900">{highlights.avgComp.toFixed(1)}%</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500">Avg transparency</div>
                  <div className="font-semibold text-gray-900">{highlights.avgTrans.toFixed(1)}%</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-yellow-800">Low transparency (&lt;20%)</div>
                  <div className="font-semibold text-yellow-900">{highlights.lowTransparencyCount}</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-yellow-800">Low completion (&lt;30%)</div>
                  <div className="font-semibold text-yellow-900">{highlights.lowCompletionCount}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
              <div className="text-sm font-semibold text-gray-900 mb-3">Top 5 spenders (current selection)</div>
              <div className="text-xs text-gray-500 mb-2">{isMobile ? 'Tap a bar to see Transparency (T) and Completion (C).' : 'Spend bar + Transparency (T) and Completion (C) shown on-chart.'}</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={highlights.topSpenders} layout="vertical" margin={{ left: isMobile ? 16 : 40, right: isMobile ? 16 : 90 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `₹${(Number(v) / 1e7).toFixed(1)}Cr`} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={isMobile ? 120 : 160}
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      tickFormatter={(v) => (isMobile ? String(v).slice(0, 16) : String(v))}
                    />
                    <Tooltip
                      formatter={(v: any, name: any) => {
                        if (name === 'spent') return [formatCr(Number(v)), 'Spent'];
                        if (name === 'transparency_pct') return [`${Number(v).toFixed(1)}%`, 'Transparency'];
                        if (name === 'completion_pct') return [`${Number(v).toFixed(1)}%`, 'Completion'];
                        return [v, name];
                      }}
                    />
                    <Bar dataKey="spent" fill="#2563eb">
                      {!isMobile ? (
                        <LabelList
                          position="right"
                          content={(p: any) => {
                            const item = highlights.topSpenders[p.index];
                            const tx = Number(p.x) + Number(p.width) + 10;
                            const ty = Number(p.y) + Number(p.height) / 2;
                            return (
                              <text x={tx} y={ty} dy={4} fontSize={11} fill="#374151">
                                {renderTopSpenderMetricsLabel(item)}
                              </text>
                            );
                          }}
                        />
                      ) : null}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
              <div className="text-sm font-semibold text-gray-900 mb-3">Transparency distribution</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={highlights.transparencyDistribution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#16a34a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 text-xs text-gray-600">
                Worst transparency: <span className="font-semibold">{highlights.worstTransparency.name}</span> ({Number(highlights.worstTransparency.transparency_score).toFixed(1)}%)
              </div>
              <div className="text-xs text-gray-600">
                Worst completion: <span className="font-semibold">{highlights.worstCompletion.name}</span> ({Number(highlights.worstCompletion.completion_rate).toFixed(1)}%)
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Correlation (Spend vs %) — current selection</div>
                <div className="text-xs text-gray-500">Uses up to top 300 MPs by spend in this selection.</div>
              </div>
              <div className="flex gap-3 text-xs text-gray-700">
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500">r (Spend vs Transparency)</div>
                  <div className="font-semibold">{highlights.rTrans === null ? '—' : highlights.rTrans.toFixed(2)}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500">r (Spend vs Completion)</div>
                  <div className="font-semibold">{highlights.rComp === null ? '—' : highlights.rComp.toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-64">
                <div className="text-xs font-semibold text-gray-700 mb-2">Spend vs Transparency</div>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="spent"
                      tickFormatter={(v) => `${(Number(v) / 1e7).toFixed(0)}Cr`}
                      name="Spent"
                    />
                    <YAxis type="number" dataKey="transparency" domain={[0, 100]} name="Transparency" unit="%" />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      formatter={(v: any, name: any) => {
                        if (name === 'spent') return [formatCr(Number(v)), 'Spent'];
                        if (name === 'transparency') return [`${Number(v).toFixed(1)}%`, 'Transparency'];
                        return [v, name];
                      }}
                      labelFormatter={() => ''}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const p: any = payload[0].payload;
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2">
                            <div className="text-xs font-semibold text-gray-900 max-w-[240px] truncate">{p.name}</div>
                            <div className="text-[11px] text-gray-600">{p.state}</div>
                            <div className="text-[11px] text-gray-700 mt-1">Spent: <span className="font-mono">{formatCr(p.spent)}</span></div>
                            <div className="text-[11px] text-gray-700">Transparency: <span className="font-semibold">{Number(p.transparency).toFixed(1)}%</span></div>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={highlights.scatterPoints} fill="#16a34a" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              <div className="h-64">
                <div className="text-xs font-semibold text-gray-700 mb-2">Spend vs Completion</div>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="spent"
                      tickFormatter={(v) => `${(Number(v) / 1e7).toFixed(0)}Cr`}
                      name="Spent"
                    />
                    <YAxis type="number" dataKey="completion" domain={[0, 100]} name="Completion" unit="%" />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const p: any = payload[0].payload;
                        return (
                          <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2">
                            <div className="text-xs font-semibold text-gray-900 max-w-[240px] truncate">{p.name}</div>
                            <div className="text-[11px] text-gray-600">{p.state}</div>
                            <div className="text-[11px] text-gray-700 mt-1">Spent: <span className="font-mono">{formatCr(p.spent)}</span></div>
                            <div className="text-[11px] text-gray-700">Completion: <span className="font-semibold">{Number(p.completion).toFixed(1)}%</span></div>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={highlights.scatterPoints} fill="#f59e0b" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      
      <div className="bg-white shadow border-b border-gray-200 sm:rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="min-w-[250px] px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('name')}>
                <div className="flex items-center">MP Name / Constituency <SortIcon columnKey="name"/></div>
              </th>
              <th scope="col" className="min-w-[150px] px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('state')}>
                <div className="flex items-center">State <SortIcon columnKey="state"/></div>
              </th>
              <th scope="col" className="min-w-[120px] px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('spent')}>
                <div className="flex justify-end items-center">Spent (₹) <SortIcon columnKey="spent"/></div>
              </th>
              <th scope="col" className="min-w-[120px] px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('utilization_rate')}>
                <div className="flex justify-end items-center">Utilized % <SortIcon columnKey="utilization_rate"/></div>
              </th>
              <th scope="col" className="min-w-[120px] px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('completion_rate')}>
                <div className="flex justify-end items-center">Comp. % <SortIcon columnKey="completion_rate"/></div>
              </th>
              <th scope="col" className="min-w-[100px] px-4 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('transparency_score')}>
                 <div className="flex justify-center items-center">Trans. <SortIcon columnKey="transparency_score"/></div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.map((mp: any) => (
              <tr key={mp.name + mp.constituency} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 sm:px-6 py-4">
                  <div className="text-sm font-medium text-blue-600 hover:underline">
                    <Link to={`/mps/${encodeURIComponent(mp.name)}`}>{mp.name}</Link>
                  </div>
                  <div className="text-xs text-gray-500">{mp.constituency}</div>
                </td>
                <td className="px-4 sm:px-6 py-4">
                  <span className="text-xs text-gray-800">{mp.state}</span>
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 font-mono">
                  ₹{(mp.spent / 10000000).toFixed(2)} Cr
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                  <div className="flex items-center justify-end">
                    <div className="w-16 bg-gray-200 rounded-full h-1.5 mr-2">
                      <div className={`h-1.5 rounded-full ${mp.utilization_rate > 70 ? 'bg-green-600' : 'bg-yellow-400'}`} style={{ width: `${Math.min(mp.utilization_rate, 100)}%` }}></div>
                    </div>
                    <span>{mp.utilization_rate}%</span>
                  </div>
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                  {mp.completion_rate}%
                </td>
                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-center text-sm">
                   {mp.transparency_score < 20 ? (
                       <span className="text-red-500 flex justify-center items-center font-bold">
                           <AlertCircle className="w-3 h-3 mr-1" /> {mp.transparency_score}%
                       </span>
                   ) : (
                       <span className="text-green-600 font-medium">{mp.transparency_score}%</span>
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
