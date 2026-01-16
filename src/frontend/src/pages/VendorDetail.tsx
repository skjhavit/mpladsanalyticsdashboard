import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Calendar, MapPin, User, AlertCircle } from 'lucide-react';
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

type VendorInsights = {
  name: string;
  summary: {
    payments: number;
    mp_count: number;
    state_count: number;
    total_received: number;
    top_activity_share_pct: number;
    top3_activity_share_pct: number;
  };
  top_work_types: {
    activity: string;
    amount: number;
    payments: number;
    mp_count: number;
    share_pct: number;
  }[];
  monthly_received: { month: string; amount: number }[];
  top_mps: { mp: string; state: string; amount: number }[];
  top_states: { state: string; mp_count: number; amount: number }[];
};

export function VendorDetail() {
  const { name } = useParams();
  // Decode the vendor name component of the URL
  const decodedName = decodeURIComponent(name || '');

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  const { isPending, error, data } = useQuery({
    queryKey: ['vendor', decodedName],
    queryFn: () => fetch(API_BASE_URL + `/api/vendors/${encodeURIComponent(decodedName)}`).then((res) => res.json()),
  });

  const vendorInsightsQuery = useQuery({
    queryKey: ['vendorInsights', decodedName],
    queryFn: async () => {
      const res = await fetch(API_BASE_URL + `/api/vendors/${encodeURIComponent(decodedName)}/insights`);
      if (!res.ok) throw new Error('Failed to load vendor insights');
      return (await res.json()) as VendorInsights;
    },
  });

  if (isPending) return <div className="p-10 text-center">Loading Vendor Details...</div>;
  if (error) return <div className="p-10 text-red-500">Error: {error.message}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate mb-2">
          {data.name}
        </h2>
        <p className="text-gray-500">Vendor Expenditure Report</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Money received over time</h3>
          {vendorInsightsQuery.isPending ? (
            <div className="text-gray-600">Loading insights…</div>
          ) : vendorInsightsQuery.isError ? (
            <div className="text-red-500">Error: {vendorInsightsQuery.error.message}</div>
          ) : vendorInsightsQuery.data.monthly_received.length === 0 ? (
            <div className="text-gray-600 text-sm flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" /> No time series available.
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={vendorInsightsQuery.data.monthly_received}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${(Number(v) / 1e7).toFixed(1)}Cr`} />
                  <Tooltip formatter={(v: any) => `₹${(Number(v) / 1e7).toFixed(2)} Cr`} />
                  <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Specialization snapshot</h3>
          {vendorInsightsQuery.isPending ? (
            <div className="text-gray-600">Loading…</div>
          ) : vendorInsightsQuery.isError ? (
            <div className="text-red-500">Error: {vendorInsightsQuery.error.message}</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total received</span>
                <span className="text-sm font-mono text-gray-900">₹{(vendorInsightsQuery.data.summary.total_received / 1e7).toFixed(2)} Cr</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Payments</span>
                <span className="text-sm text-gray-900">{vendorInsightsQuery.data.summary.payments.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">MPs</span>
                <span className="text-sm text-gray-900">{vendorInsightsQuery.data.summary.mp_count}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">States</span>
                <span className="text-sm text-gray-900">{vendorInsightsQuery.data.summary.state_count}</span>
              </div>
              <div className="pt-2 border-t border-gray-100 text-xs text-gray-600">
                Top 3 activities share: <span className="font-semibold">{vendorInsightsQuery.data.summary.top3_activity_share_pct.toFixed(1)}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top work types (by amount)</h3>
          {vendorInsightsQuery.isPending ? (
            <div className="text-gray-600">Loading…</div>
          ) : vendorInsightsQuery.isError ? (
            <div className="text-red-500">Error: {vendorInsightsQuery.error.message}</div>
          ) : vendorInsightsQuery.data.top_work_types.length === 0 ? (
            <div className="text-gray-600 text-sm">No work-type breakdown available.</div>
          ) : (
            <div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vendorInsightsQuery.data.top_work_types} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `₹${(Number(v) / 1e7).toFixed(1)}Cr`} />
                    <YAxis type="category" dataKey="activity" width={180} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: any) => `₹${(Number(v) / 1e7).toFixed(2)} Cr`} />
                    <Bar dataKey="amount" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {vendorInsightsQuery.data.top_work_types.slice(0, 8).map((r) => (
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

        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top MPs (by amount)</h3>
            {vendorInsightsQuery.isPending ? (
              <div className="text-gray-600">Loading…</div>
            ) : vendorInsightsQuery.isError ? (
              <div className="text-red-500">Error: {vendorInsightsQuery.error.message}</div>
            ) : (
              <div className="space-y-2">
                {vendorInsightsQuery.data.top_mps.slice(0, 10).map((r) => (
                  <div key={`${r.mp}-${r.state}`} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{r.mp}</div>
                      <div className="text-xs text-gray-500">{r.state}</div>
                    </div>
                    <div className="text-sm font-mono text-gray-900 whitespace-nowrap">₹{(r.amount / 1e7).toFixed(2)} Cr</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top states (by MP reach)</h3>
            {vendorInsightsQuery.isPending ? (
              <div className="text-gray-600">Loading…</div>
            ) : vendorInsightsQuery.isError ? (
              <div className="text-red-500">Error: {vendorInsightsQuery.error.message}</div>
            ) : (
              <div className="space-y-2">
                {vendorInsightsQuery.data.top_states.slice(0, 10).map((r) => (
                  <div key={r.state} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{r.state}</div>
                      <div className="text-xs text-gray-500">MPs: {r.mp_count}</div>
                    </div>
                    <div className="text-sm font-mono text-gray-900 whitespace-nowrap">₹{(r.amount / 1e7).toFixed(2)} Cr</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Payment History (Recent 100)</h3>
        </div>
        <ul role="list" className="divide-y divide-gray-200">
          {data.works.map((work: any, idx: number) => (
            <li key={idx} className="hover:bg-gray-50">
              <div className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center text-sm font-medium text-blue-600 truncate">
                    <User className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                    MP: {work.mp_name}
                  </div>
                  <div className="ml-2 flex-shrink-0 flex">
                    <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      ₹{work.amount.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="mb-2">
                    <p className="text-sm text-gray-900">{work.activity}</p>
                </div>
                <div className="mt-2 sm:flex sm:justify-between">
                  <div className="sm:flex">
                    <p className="flex items-center text-sm text-gray-500 mr-4">
                      <MapPin className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                      {work.state}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                    <Calendar className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                    <time dateTime={work.date}>{work.date}</time>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
