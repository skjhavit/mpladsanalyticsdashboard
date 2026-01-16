import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { ExternalLink, CheckCircle2, Clock, AlertTriangle, AlertCircle } from 'lucide-react';
import { useIsMobile } from '../hooks/useMediaQuery';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';

type MpInsights = {
  info: { name: string; state: string; constituency: string; allocated: number };
  stats: {
    spent: number;
    utilization_rate: number;
    recommended_works: number;
    completed_works: number;
    completion_rate: number;
    proofs: number;
    transparency_score: number;
    recommended_amount: number;
    completed_amount: number;
  };
  top_vendors: { vendor: string; amount: number; payments: number; share_pct: number }[];
  vendor_concentration_top3_pct: number;
  top_work_types_by_spend: { activity: string; amount: number; share_pct: number }[];
  top_work_types_by_completed: { activity: string; amount: number }[];
  spending_trend: { month: string; spent: number }[];
  signals: { code: string; title: string; detail: string; severity: 'warning' | 'high' }[];
};

export function MPDetail() {
  const { name } = useParams();
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';
  const isMobile = useIsMobile();
  const { isPending, error, data } = useQuery({
    queryKey: ['mp', name],
    queryFn: () => fetch((import.meta.env.VITE_API_URL || '') + `/api/mps/${encodeURIComponent(name || '')}`).then((res) => res.json()),
  });

  const insightsQuery = useQuery({
    queryKey: ['mpInsights', name],
    enabled: Boolean(name),
    queryFn: async () => {
      const res = await fetch(API_BASE_URL + `/api/mps/${encodeURIComponent(name || '')}/insights`);
      if (!res.ok) throw new Error('Failed to load MP insights');
      return (await res.json()) as MpInsights;
    },
  });

  if (isPending) return <div className="p-10 text-center">Loading MP Details...</div>;
  if (error) return <div className="p-10 text-red-500">Error: {error.message}</div>;

  const { info, stats, recent_works } = data;

  const recommendedWorks = insightsQuery.data?.stats.recommended_works;
  const completionRate = insightsQuery.data?.stats.completion_rate;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              {info.name}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {info.constituency}, {info.state}
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <span className="inline-flex w-full justify-center sm:w-auto items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600">
              Allocated: ₹{(info.allocated / 10000000).toFixed(2)} Cr
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-6 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
           <dt className="text-sm font-medium text-gray-500 truncate">Total Spent</dt>
           <dd className="mt-1 text-2xl sm:text-3xl font-semibold text-gray-900">₹{(stats.spent / 10000000).toFixed(2)} Cr</dd>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-gray-500 truncate">Works Recommended</dt>
          <dd className="mt-1 text-2xl sm:text-3xl font-semibold text-gray-900">
            {typeof recommendedWorks === 'number' ? recommendedWorks.toLocaleString() : '-'}
          </dd>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-gray-500 truncate">Works Completed</dt>
          <dd className="mt-1 text-2xl sm:text-3xl font-semibold text-gray-900">
            {stats.works_completed.toLocaleString()}
          </dd>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-gray-500 truncate">Completion Rate</dt>
          <dd className="mt-1 text-2xl sm:text-3xl font-semibold text-gray-900">
            {typeof completionRate === 'number' ? `${completionRate.toFixed(1)}%` : '-'}
          </dd>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
           <dt className="text-sm font-medium text-gray-500 truncate">Proofs Uploaded</dt>
           <dd className="mt-1 text-2xl sm:text-3xl font-semibold text-gray-900">{stats.proofs_uploaded}</dd>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
           <dt className="text-sm font-medium text-gray-500 truncate">Transparency Score</dt>
           <dd className={`mt-1 text-2xl sm:text-3xl font-semibold ${stats.transparency_score > 50 ? 'text-green-600' : 'text-red-600'}`}>
             {stats.transparency_score.toFixed(1)}%
           </dd>
        </div>
      </div>

      {/* Insights (shown before individual works) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending trend</h3>
          {insightsQuery.isPending ? (
            <div className="text-gray-600">Loading insights…</div>
          ) : insightsQuery.isError ? (
            <div className="text-red-500">Error: {insightsQuery.error.message}</div>
          ) : insightsQuery.data.spending_trend.length === 0 ? (
            <div className="text-gray-600 text-sm flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" /> No time series available.
            </div>
          ) : (
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={insightsQuery.data.spending_trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: isMobile ? 10 : 12 }} minTickGap={isMobile ? 20 : 10} />
                  <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} tickFormatter={(v) => `₹${(Number(v) / 1e7).toFixed(1)}Cr`} />
                  <Tooltip formatter={(v: any) => `₹${(Number(v) / 1e7).toFixed(2)} Cr`} />
                  <Line type="monotone" dataKey="spent" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Signals</h3>
          {insightsQuery.isPending ? (
            <div className="text-gray-600">Loading…</div>
          ) : insightsQuery.isError ? (
            <div className="text-red-500">Error: {insightsQuery.error.message}</div>
          ) : insightsQuery.data.signals.length === 0 ? (
            <div className="text-sm text-gray-600">No notable signals detected from current rules.</div>
          ) : (
            <div className="space-y-3">
              {insightsQuery.data.signals.map((s) => (
                <div key={s.code} className="p-3 rounded-lg border border-gray-100 bg-gray-50">
                  <div className="flex items-start gap-2">
                    {s.severity === 'high' ? (
                      <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{s.title}</div>
                      <div className="text-xs text-gray-600 mt-1">{s.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-3 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Top vendors</h3>
            {insightsQuery.data ? (
              <div className="text-sm text-gray-600">Top 3 vendor share: <span className="font-semibold">{insightsQuery.data.vendor_concentration_top3_pct.toFixed(1)}%</span></div>
            ) : null}
          </div>
          {insightsQuery.isPending ? (
            <div className="text-gray-600">Loading…</div>
          ) : insightsQuery.isError ? (
            <div className="text-red-500">Error: {insightsQuery.error.message}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Share</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Payments</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {insightsQuery.data.top_vendors.slice(0, 10).map((v) => (
                    <tr key={v.vendor}>
                      <td className="px-4 py-2 text-sm">
                        <Link to={`/vendors/${encodeURIComponent(v.vendor)}`} className="text-blue-600 hover:underline">
                          {v.vendor}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono">₹{(v.amount / 1e7).toFixed(2)} Cr</td>
                      <td className="px-4 py-2 text-sm text-right">{v.share_pct.toFixed(1)}%</td>
                      <td className="px-4 py-2 text-sm text-right">{v.payments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top work types (by spend)</h3>
          {insightsQuery.isPending ? (
            <div className="text-gray-600">Loading…</div>
          ) : insightsQuery.isError ? (
            <div className="text-red-500">Error: {insightsQuery.error.message}</div>
          ) : insightsQuery.data.top_work_types_by_spend.length === 0 ? (
            <div className="text-sm text-gray-600">No work-type breakdown available.</div>
          ) : (
            <div>
              <div className="h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={insightsQuery.data.top_work_types_by_spend} layout="vertical" margin={{ left: isMobile ? 16 : 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `₹${(Number(v) / 1e7).toFixed(1)}Cr`} />
                    <YAxis
                      type="category"
                      dataKey="activity"
                      width={isMobile ? 140 : 220}
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      tickFormatter={(v) => (isMobile ? String(v).slice(0, 18) : String(v))}
                    />
                    <Tooltip formatter={(v: any) => `₹${(Number(v) / 1e7).toFixed(2)} Cr`} />
                    <Bar dataKey="amount" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {insightsQuery.data.top_work_types_by_spend.slice(0, 10).map((r) => (
                  <Link
                    key={r.activity}
                    to={`/work-types/${encodeURIComponent(r.activity)}`}
                    className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    {r.activity}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Works Table */}
      <div className="mt-8 bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Recent Works & Status</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Est. Cost</th>
                <th scope="col" className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actual Cost</th>
                <th scope="col" className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proof</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recent_works.map((work: any) => (
                <tr key={work.id} className="hover:bg-gray-50">
                  <td className="px-4 sm:px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-[220px] sm:max-w-md truncate" title={work.description}>{work.description}</div>
                    <div className="text-xs text-gray-500 mt-1">ID: {work.id} • {work.date}</div>
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                    {work.status === 'Completed' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Clock className="w-3 h-3 mr-1" /> In Progress
                      </span>
                    )}
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                    ₹{work.recommended_amount?.toLocaleString()}
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 font-medium">
                    {work.actual_amount ? `₹${work.actual_amount.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                    {work.attach_id ? (
                      <a
                        href={`${API_BASE_URL}/api/proxy/proof/${work.attach_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center hover:underline"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" /> View Proof
                      </a>
                    ) : (
                      <span className="text-gray-400 text-xs">No Upload</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
