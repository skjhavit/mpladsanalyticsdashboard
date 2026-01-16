import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Filter, Search } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from 'recharts';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

type CategoryRow = {
  activity: string;
  spent: number;
  share_pct: number;
  mp_count: number;
  vendor_count: number;
  recommended_works: number;
  completed_works: number;
  completion_pct: number;
  proofs: number;
  transparency_pct: number;
  top1_vendor_pct: number;
  top3_vendor_pct: number;
  lift_vs_national: number | null;
};

type RadarResponse = {
  filters: { state?: string | null; mp?: string | null; vendor?: string | null; months?: number | null };
  totals: { total_spent: number; mp_count: number };
  categories: CategoryRow[];
  flags: { code: string; severity: 'warning' | 'high'; activity: string; title: string; detail: string }[];
};

type DrilldownResponse = {
  activity: string;
  summary: {
    spent: number;
    recommended_works: number;
    completed_works: number;
    completion_pct: number;
    proofs: number;
    transparency_pct: number;
  };
  monthly_spent: { month: string; spent: number }[];
  top_mps: { mp: string; spent: number }[];
  top_vendors: { vendor: string; spent: number }[];
};

function formatCr(v: number) {
  return `₹${(Number(v) / 1e7).toFixed(2)} Cr`;
}

export function CategoryRadar() {
  const [state, setState] = useState<string>('All');
  const [months, setMonths] = useState<number>(12);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const statesQuery = useQuery({
    queryKey: ['states'],
    queryFn: async () => {
      const res = await fetch(API_BASE_URL + '/api/analytics/states');
      if (!res.ok) throw new Error('Failed to load states');
      return (await res.json()) as { state: string }[];
    },
  });

  const radarQuery = useQuery({
    queryKey: ['categoryRadar', state, months],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (state !== 'All') params.set('state', state);
      params.set('months', String(months));
      const res = await fetch(API_BASE_URL + `/api/analytics/category-radar?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load category radar');
      return (await res.json()) as RadarResponse;
    },
  });

  const filteredCategories = useMemo(() => {
    const rows = radarQuery.data?.categories ?? [];
    const query = q.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) => r.activity.toLowerCase().includes(query));
  }, [radarQuery.data, q]);

  const drilldownQuery = useQuery({
    queryKey: ['categoryRadarDrilldown', selected, state, months],
    enabled: Boolean(selected),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('activity', selected || '');
      if (state !== 'All') params.set('state', state);
      params.set('months', String(months));
      const res = await fetch(API_BASE_URL + `/api/analytics/category-radar/drilldown?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load drilldown');
      return (await res.json()) as DrilldownResponse;
    },
  });

  const shareVsTransparency = useMemo(() => {
    return filteredCategories
      .slice(0, 25)
      .map((r) => ({
        activity: r.activity,
        share_pct: Number(r.share_pct.toFixed(2)),
        transparency_pct: Number(r.transparency_pct.toFixed(1)),
        spent: r.spent,
      }))
      .sort((a, b) => b.spent - a.spent);
  }, [filteredCategories]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Category Radar</h1>
        <p className="text-gray-600 mt-2">
          Spot unusual category spending patterns and concentration, correlated with transparency/completion.
        </p>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <label className="text-sm text-gray-700">State</label>
            <select
              className="ml-2 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setSelected(null);
              }}
              disabled={statesQuery.isPending || statesQuery.isError}
            >
              <option value="All">All</option>
              {(statesQuery.data ?? [])
                .map((s: any) => s.state)
                .filter(Boolean)
                .sort()
                .map((s: string) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Time</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={months}
              onChange={(e) => {
                setMonths(Number(e.target.value));
                setSelected(null);
              }}
            >
              <option value={12}>Last 12 months</option>
              <option value={24}>Last 24 months</option>
              <option value={36}>Last 36 months</option>
              <option value={120}>All (approx)</option>
            </select>
          </div>

          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter categories (e.g., Laboratory)…"
                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {radarQuery.isPending ? <div className="p-6 text-center">Loading radar…</div> : null}
      {radarQuery.isError ? <div className="p-6 text-red-500">Error: {radarQuery.error.message}</div> : null}

      {radarQuery.data ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Highlights</h2>
            <p className="text-xs text-gray-500 mb-4">Auto-flags based on lift, transparency, and vendor concentration.</p>
            {radarQuery.data.flags.length === 0 ? (
              <div className="text-sm text-gray-600">No flags triggered for current selection.</div>
            ) : (
              <div className="space-y-3">
                {radarQuery.data.flags.slice(0, 8).map((f, idx) => (
                  <button
                    key={`${f.code}-${idx}`}
                    className="w-full text-left p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
                    onClick={() => setSelected(f.activity)}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={`w-4 h-4 mt-0.5 ${f.severity === 'high' ? 'text-red-600' : 'text-yellow-600'}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{f.activity}</div>
                        <div className="text-xs text-gray-700 font-medium">{f.title}</div>
                        <div className="text-xs text-gray-600 mt-1">{f.detail}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Big categories vs transparency</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={shareVsTransparency} layout="vertical" margin={{ left: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
                  <YAxis type="category" dataKey="activity" width={180} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: any, name: any) => {
                      if (name === 'share_pct') return [`${Number(v).toFixed(1)}%`, 'Spend share'];
                      if (name === 'transparency_pct') return [`${Number(v).toFixed(1)}%`, 'Transparency'];
                      return [v, name];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="share_pct" fill="#2563eb" name="Spend share %" />
                  <Bar dataKey="transparency_pct" fill="#16a34a" name="Transparency %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-xs text-gray-600">Click a category in the table to drill down.</div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white shadow-sm border border-gray-100 rounded-lg overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Categories</h2>
            <div className="text-xs text-gray-500">
              {radarQuery.data ? `${filteredCategories.length} shown` : ''}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Spent</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Share</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Lift</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Trans</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Comp</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">MPs</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Top3 vend</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredCategories.map((c) => (
                  <tr
                    key={c.activity}
                    className={`hover:bg-gray-50 cursor-pointer ${selected === c.activity ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelected(c.activity)}
                  >
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{c.activity}</td>
                    <td className="px-4 py-2 text-sm text-right font-mono">{formatCr(c.spent)}</td>
                    <td className="px-4 py-2 text-sm text-right">{c.share_pct.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-sm text-right">
                      {c.lift_vs_national ? `${c.lift_vs_national.toFixed(1)}×` : '-'}
                    </td>
                    <td className={`px-4 py-2 text-sm text-right ${c.transparency_pct < 20 ? 'text-red-600 font-semibold' : ''}`}>
                      {c.transparency_pct.toFixed(1)}%
                    </td>
                    <td className={`px-4 py-2 text-sm text-right ${c.completion_pct < 30 ? 'text-red-600 font-semibold' : ''}`}>
                      {c.completion_pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-sm text-right">{c.mp_count}</td>
                    <td className={`px-4 py-2 text-sm text-right ${c.top3_vendor_pct >= 70 ? 'text-yellow-700 font-semibold' : ''}`}>
                      {c.top3_vendor_pct.toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white shadow-sm border border-gray-100 rounded-lg overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Drilldown</h2>
            <div className="text-xs text-gray-500">{selected ? selected : 'Pick a category'}</div>
          </div>

          {!selected ? (
            <div className="p-4 text-sm text-gray-600">Select a category from the table to see top MPs, vendors, and time series.</div>
          ) : drilldownQuery.isPending ? (
            <div className="p-4 text-sm text-gray-600">Loading drilldown…</div>
          ) : drilldownQuery.isError ? (
            <div className="p-4 text-sm text-red-500">Error: {drilldownQuery.error.message}</div>
          ) : drilldownQuery.data ? (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-[11px] text-gray-500">Spent</div>
                  <div className="text-sm font-mono text-gray-900">{formatCr(drilldownQuery.data.summary.spent)}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-[11px] text-gray-500">Transparency</div>
                  <div className="text-sm font-semibold text-gray-900">{drilldownQuery.data.summary.transparency_pct.toFixed(1)}%</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-[11px] text-gray-500">Completion</div>
                  <div className="text-sm font-semibold text-gray-900">{drilldownQuery.data.summary.completion_pct.toFixed(1)}%</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-[11px] text-gray-500">Works</div>
                  <div className="text-sm text-gray-900">Rec {drilldownQuery.data.summary.recommended_works} • Comp {drilldownQuery.data.summary.completed_works}</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-900 mb-2">Monthly spend</div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={drilldownQuery.data.monthly_spent}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(Number(v) / 1e7).toFixed(1)}Cr`} />
                      <Tooltip formatter={(v: any) => formatCr(Number(v))} />
                      <Line type="monotone" dataKey="spent" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-900 mb-2">Top MPs</div>
                <div className="space-y-1">
                  {drilldownQuery.data.top_mps.slice(0, 8).map((r) => (
                    <div key={r.mp} className="flex items-center justify-between gap-3">
                      <div className="text-xs text-gray-900 truncate">{r.mp}</div>
                      <div className="text-xs font-mono text-gray-900 whitespace-nowrap">{formatCr(r.spent)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-900 mb-2">Top Vendors</div>
                <div className="space-y-1">
                  {drilldownQuery.data.top_vendors.slice(0, 8).map((r) => (
                    <div key={r.vendor} className="flex items-center justify-between gap-3">
                      <div className="text-xs text-gray-900 truncate">{r.vendor}</div>
                      <div className="text-xs font-mono text-gray-900 whitespace-nowrap">{formatCr(r.spent)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
