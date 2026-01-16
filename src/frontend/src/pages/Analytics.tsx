import { useQuery } from '@tanstack/react-query';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

type BiasResponse = {
  vendor_concentration: { mp: string; total_spent: number; top3_spent: number; top3_pct: number }[];
  spend_without_proof: { mp: string; total_spent: number; no_proof_spent: number; no_proof_pct: number }[];
};

export function Analytics() {
  const [selectedState, setSelectedState] = useState<string>('All');

  const { data: topBottom } = useQuery({
    queryKey: ['analytics-top', selectedState],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedState !== 'All') params.set('state', selectedState);
      const qs = params.toString();
      return fetch(API_BASE_URL + `/api/analytics/top-bottom${qs ? `?${qs}` : ''}`).then(r => r.json());
    }
  });
  const { data: states } = useQuery({ queryKey: ['analytics-states'], queryFn: () => fetch(API_BASE_URL + '/api/analytics/states').then(r => r.json()) });
  const { data: trends } = useQuery({
    queryKey: ['analytics-trends', 12, selectedState],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('months', '12');
      if (selectedState !== 'All') params.set('state', selectedState);
      return fetch(API_BASE_URL + `/api/analytics/trends?${params.toString()}`).then(r => r.json());
    }
  });
  const { data: bias } = useQuery({
    queryKey: ['analytics-bias', selectedState],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedState !== 'All') params.set('state', selectedState);
      const qs = params.toString();
      const res = await fetch(API_BASE_URL + `/api/analytics/bias${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error('Failed to load bias rankings');
      return (await res.json()) as BiasResponse;
    }
  });

  const [stateSort, setStateSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>({ key: 'utilization', dir: 'desc' });

  const sortedStates = useMemo(() => {
    if (!states || !Array.isArray(states)) return [];
    if (!stateSort) return states;
    const copy = [...states];
    copy.sort((a: any, b: any) => {
      const av = a[stateSort.key];
      const bv = b[stateSort.key];
      if (av < bv) return stateSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return stateSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [states, stateSort]);

  const toggleStateSort = (key: string) => {
    setStateSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'desc' };
      return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
    });
  };

  if (!topBottom || !states || !trends || !bias) return <div className="p-10 text-center">Loading Analytics...</div>;

  const scopeLabel = selectedState === 'All' ? 'National' : selectedState;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Deep Insights & Trends</h1>
          <div className="text-sm text-gray-600 mt-1">Scope: <span className="font-semibold text-gray-900">{scopeLabel}</span></div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700">Filter</label>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="All">All states</option>
            {(states ?? []).map((s: any) => s.state).filter(Boolean).sort().map((s: string) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Section 1: Top Spenders vs Low Spenders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div className="bg-white p-6 shadow rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-green-700">Top 10 MPs by Spending ({scopeLabel})</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topBottom.top_spenders} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 10}} />
                <Tooltip formatter={(value: number) => `₹${(value/10000000).toFixed(2)} Cr`} />
                <Bar dataKey="spent" fill="#15803d" radius={[0, 4, 4, 0]} name="Spent" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 shadow rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-red-700">Bottom 10 Spenders (Allocated &gt; 0) ({scopeLabel})</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topBottom.zero_spenders} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 10}} />
                <Tooltip formatter={(value: number) => `₹${(value/10000000).toFixed(2)} Cr`} />
                <Bar dataKey="spent" fill="#b91c1c" radius={[0, 4, 4, 0]} name="Spent" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Section 2: Monthly Trends */}
      <div className="bg-white p-6 shadow rounded-lg mb-12">
        <h2 className="text-xl font-semibold mb-4">Pace of Development ({scopeLabel}, Last 12 Months)</h2>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip formatter={(value: any, name: any) => {
                if (name === 'spent') return [`₹${(Number(value) / 1e7).toFixed(2)} Cr`, 'Spending'];
                return [value, name];
              }} />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="spent" stroke="#2563eb" name="Spending (₹)" dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="completed" stroke="#16a34a" name="Works Completed" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 3: Bias / Pattern Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div className="bg-white p-6 shadow rounded-lg">
          <h2 className="text-xl font-semibold mb-4">High vendor concentration (Top 3 vendor share)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MP</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Top 3 %</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total spent</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {bias.vendor_concentration.map((r) => (
                  <tr key={r.mp} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm">
                      <Link to={`/mps/${encodeURIComponent(r.mp)}`} className="text-blue-600 hover:underline">
                        {r.mp}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-semibold">{r.top3_pct.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-sm text-right font-mono">₹{(r.total_spent / 1e7).toFixed(2)} Cr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-6 shadow rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Spend on completed works without proof</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MP</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">No-proof %</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">No-proof spent</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {bias.spend_without_proof.map((r) => (
                  <tr key={r.mp} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm">
                      <Link to={`/mps/${encodeURIComponent(r.mp)}`} className="text-blue-600 hover:underline">
                        {r.mp}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-semibold">{r.no_proof_pct.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-sm text-right font-mono">₹{(r.no_proof_spent / 1e7).toFixed(2)} Cr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Section 4: State Performance Table */}
      <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">State-wise Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th onClick={() => toggleStateSort('state')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">State</th>
                <th onClick={() => toggleStateSort('allocated')} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Total Allocated</th>
                <th onClick={() => toggleStateSort('spent')} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Total Spent</th>
                <th onClick={() => toggleStateSort('utilization')} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Utilization %</th>
                <th onClick={() => toggleStateSort('works_completed')} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">Works Completed</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedStates.map((st: any) => (
                <tr key={st.state} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{st.state}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">₹{(st.allocated/10000000).toFixed(2)} Cr</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">₹{(st.spent/10000000).toFixed(2)} Cr</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${st.utilization > 50 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {st.utilization.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">{st.works_completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
