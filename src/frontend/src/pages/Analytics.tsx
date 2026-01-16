import { useQuery } from '@tanstack/react-query';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';

export function Analytics() {
  const { data: topBottom } = useQuery({ queryKey: ['analytics-top'], queryFn: () => fetch((import.meta.env.VITE_API_URL || '') + '/api/analytics/top-bottom').then(r => r.json()) });
  const { data: states } = useQuery({ queryKey: ['analytics-states'], queryFn: () => fetch((import.meta.env.VITE_API_URL || '') + '/api/analytics/states').then(r => r.json()) });
  const { data: trends } = useQuery({ queryKey: ['analytics-trends'], queryFn: () => fetch((import.meta.env.VITE_API_URL || '') + '/api/analytics/trends').then(r => r.json()) });

  if (!topBottom || !states || !trends) return <div className="p-10 text-center">Loading Analytics...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Deep Insights & Trends</h1>

      {/* Section 1: Top Spenders vs Low Spenders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div className="bg-white p-6 shadow rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-green-700">Top 10 MPs by Spending</h2>
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
          <h2 className="text-xl font-semibold mb-4 text-red-700">Bottom 10 Spenders (Allocated &gt; 0)</h2>
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
        <h2 className="text-xl font-semibold mb-4">National Pace of Development (Last 12 Months)</h2>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="spent" stroke="#2563eb" name="Spending (₹)" dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="completed" stroke="#16a34a" name="Works Completed" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 3: State Performance Table */}
      <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">State-wise Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Allocated</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Spent</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Utilization %</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Works Completed</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {states.map((st: any) => (
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
