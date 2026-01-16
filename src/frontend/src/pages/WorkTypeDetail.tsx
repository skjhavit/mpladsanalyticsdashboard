import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

type WorkTypeInsights = {
  activity: string;
  total_spent: number;
  top_vendors: { vendor: string; amount: number; payments: number }[];
  top_mps: { mp: string; state: string; constituency: string; amount: number }[];
  monthly_spent: { month: string; spent: number }[];
};

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function WorkTypeDetail() {
  const params = useParams();
  const activity = params.activity ? decodeURIComponent(params.activity) : '';

  const { isPending, error, data } = useQuery({
    queryKey: ['workTypeInsights', activity],
    enabled: activity.length > 0,
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/work-types/${encodeURIComponent(activity)}`);
      if (!res.ok) throw new Error('Failed to load work-type insights');
      return (await res.json()) as WorkTypeInsights;
    },
  });

  if (isPending) return <div className="p-10 text-center">Loading work type…</div>;
  if (error) return <div className="p-10 text-red-500">Error: {error.message}</div>;
  if (!data) return <div className="p-10 text-center">No data.</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Work Type</h1>
        <p className="text-gray-600 mt-1">{data.activity}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly spending trend</h2>
          {data.monthly_spent.length === 0 ? (
            <div className="text-gray-600 text-sm flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" /> No time series available.
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.monthly_spent}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `₹${(Number(v) / 1e7).toFixed(1)}Cr`}
                  />
                  <Tooltip
                    formatter={(v: any) => `₹${(Number(v) / 1e7).toFixed(2)} Cr`}
                  />
                  <Line type="monotone" dataKey="spent" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top vendors (by spend)</h2>
          <div className="space-y-2">
            {data.top_vendors.slice(0, 10).map((v) => (
              <div key={v.vendor} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{v.vendor}</div>
                  <div className="text-xs text-gray-500">Payments: {v.payments}</div>
                </div>
                <div className="text-sm font-mono text-gray-900 whitespace-nowrap">
                  ₹{(v.amount / 1e7).toFixed(2)} Cr
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top MPs (by spend)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MP</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Spent</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Works</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {data.top_mps.slice(0, 20).map((mp) => (
                  <tr key={`${mp.mp}-${mp.constituency}-${mp.state}`}>
                    <td className="px-4 py-2 text-sm text-gray-900">{mp.mp}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{mp.state}</td>
                    <td className="px-4 py-2 text-sm text-right font-mono text-gray-900">₹{(mp.amount / 1e7).toFixed(2)} Cr</td>
                    <td className="px-4 py-2 text-sm text-right text-gray-700">-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
