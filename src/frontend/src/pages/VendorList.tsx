import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ScatterChart,
  Scatter,
} from 'recharts';

function formatCr(v: number) {
  return `₹${(Number(v) / 1e7).toFixed(2)} Cr`;
}

export function VendorList() {
  const [selectedState, setSelectedState] = useState<string>('All');

  const { data: statesData } = useQuery({
    queryKey: ['states'],
    queryFn: () =>
      fetch((import.meta.env.VITE_API_URL || '') + '/api/analytics/states', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      }).then((res) => res.json()),
    staleTime: 60_000,
  });

  const { isPending, error, data } = useQuery({
    queryKey: ['vendors', selectedState],
    queryFn: () => {
      const base = import.meta.env.VITE_API_URL || '';
      const stateParam = selectedState !== 'All' ? `&state=${encodeURIComponent(selectedState)}` : '';
      return fetch(`${base}/api/vendors?limit=500${stateParam}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      }).then((res) => res.json());
    },
  });

  const insights = useMemo(() => {
    if (!data || !Array.isArray(data) || data.length === 0) return null;

    const vendors = data
      .map((v: any) => ({
        name: v.name,
        total_received: Number(v.total_received ?? 0),
        mp_count: Math.max(1, Number(v.mp_count ?? 0)),
      }))
      .filter((v: any) => v.total_received > 0);

    if (vendors.length === 0) return null;

    const totalPaid = vendors.reduce((s: number, v: any) => s + v.total_received, 0);
    const top = [...vendors].sort((a, b) => b.total_received - a.total_received);
    const topVendor = top[0];
    const top5 = top.slice(0, 5);
    const top10 = top.slice(0, 10);
    const top5Share = totalPaid ? (top5.reduce((s, v) => s + v.total_received, 0) / totalPaid) * 100 : 0;

    const points = vendors.slice(0, 350).map((v: any) => ({
      name: v.name,
      total_received: v.total_received,
      mp_count: v.mp_count,
      amt_per_mp: v.total_received / v.mp_count,
    }));

    const suspicious = [...vendors]
      .map((v: any) => ({
        ...v,
        amt_per_mp: v.total_received / v.mp_count,
      }))
      .sort((a: any, b: any) => b.amt_per_mp - a.amt_per_mp)
      .slice(0, 5);

    const lowSpreadHighAmt = vendors.filter((v: any) => v.mp_count <= 2 && v.total_received >= 2e7).length;

    return {
      vendorCount: vendors.length,
      totalPaid,
      topVendor,
      top5Share,
      lowSpreadHighAmt,
      top10,
      points,
      suspicious,
    };
  }, [data]);

  if (isPending) return <div className="p-10 text-center">Loading Vendors...</div>;
  if (error) return <div className="p-10 text-red-500">Error: {error.message}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Top Vendors by Funds Received</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">State</label>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
          >
            <option value="All">All</option>
            {(Array.isArray(statesData) ? statesData : []).map((s: any) => (
              <option key={s.state} value={s.state}>
                {s.state}
              </option>
            ))}
          </select>
        </div>
      </div>

      {insights ? (
        <div className="mb-8 space-y-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-xs text-gray-500">Selection summary • {selectedState === 'All' ? 'All India' : selectedState}</div>
                <div className="text-lg font-semibold text-gray-900">{insights.vendorCount.toLocaleString()} vendors</div>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500">Total paid (in list)</div>
                  <div className="font-mono text-gray-900">{formatCr(insights.totalPaid)}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-gray-500">Top vendor share</div>
                  <div className="font-semibold text-gray-900">{insights.totalPaid ? ((insights.topVendor.total_received / insights.totalPaid) * 100).toFixed(1) : '0.0'}%</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-yellow-800">Top 5 vendor share</div>
                  <div className="font-semibold text-yellow-900">{insights.top5Share.toFixed(1)}%</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
                  <div className="text-[11px] text-yellow-800">High amount, low MP spread</div>
                  <div className="font-semibold text-yellow-900">{insights.lowSpreadHighAmt}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
              <div className="text-sm font-semibold text-gray-900 mb-3">Top vendors (amount received)</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={insights.top10} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${(Number(v) / 1e7).toFixed(1)}Cr`} />
                    <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: any) => formatCr(Number(v))}
                      labelFormatter={(label: any) => String(label)}
                    />
                    <Bar dataKey="total_received" fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
              <div className="text-sm font-semibold text-gray-900 mb-3">Outliers (amount per MP)</div>
              <div className="space-y-2">
                {insights.suspicious.map((v: any) => (
                  <Link
                    key={v.name}
                    to={`/vendors/${encodeURIComponent(v.name)}`}
                    className="block p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
                  >
                    <div className="text-sm font-semibold text-gray-900 truncate" title={v.name}>{v.name}</div>
                    <div className="text-xs text-gray-600 mt-1">Per MP: <span className="font-mono">{formatCr(v.amt_per_mp)}</span></div>
                    <div className="text-xs text-gray-600">Total: <span className="font-mono">{formatCr(v.total_received)}</span> • MPs: <span className="font-semibold">{v.mp_count}</span></div>
                  </Link>
                ))}
              </div>
              <div className="text-[11px] text-gray-500 mt-3">Heuristic: high funds with limited MP spread can be worth auditing.</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <div className="text-sm font-semibold text-gray-900 mb-3">Correlation: Vendor amount vs MP spread</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="mp_count" name="MPs" allowDecimals={false} />
                  <YAxis type="number" dataKey="total_received" name="Amount" tickFormatter={(v) => `${(Number(v) / 1e7).toFixed(0)}Cr`} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const p: any = payload[0].payload;
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2">
                          <div className="text-xs font-semibold text-gray-900 max-w-[260px] truncate">{p.name}</div>
                          <div className="text-[11px] text-gray-700 mt-1">Total: <span className="font-mono">{formatCr(p.total_received)}</span></div>
                          <div className="text-[11px] text-gray-700">MPs: <span className="font-semibold">{p.mp_count}</span></div>
                          <div className="text-[11px] text-gray-700">Per MP: <span className="font-mono">{formatCr(p.amt_per_mp)}</span></div>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={insights.points} fill="#16a34a" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : null}
      
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((vendor: any, idx: number) => (
          <Link to={`/vendors/${encodeURIComponent(vendor.name)}`} key={idx} className="block group">
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow h-full border border-transparent group-hover:border-blue-300">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
                    <Building2 className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dt className="text-sm font-medium text-gray-500 truncate" title={vendor.name}>
                      {vendor.name}
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        ₹{(vendor.total_received / 10000000).toFixed(4)} Cr
                      </div>
                    </dd>
                  </div>
                </div>
                <div className="mt-4">
                   <div className="text-sm text-gray-500">
                      Works for <span className="font-bold text-gray-900">{vendor.mp_count}</span> different MPs
                   </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
