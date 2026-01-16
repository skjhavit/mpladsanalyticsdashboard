import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { MPList } from './pages/MPList';
import { MPDetail } from './pages/MPDetail';
import { VendorList } from './pages/VendorList';
import { VendorDetail } from './pages/VendorDetail';
import { Analytics } from './pages/Analytics';
import { Info, CheckCircle, Eye, Wallet } from 'lucide-react';

const queryClient = new QueryClient()

// Determine API URL based on environment
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/mps" element={<MPList />} />
            <Route path="/mps/:name" element={<MPDetail />} />
            <Route path="/vendors" element={<VendorList />} />
            <Route path="/vendors/:name" element={<VendorDetail />} />
            <Route path="/analytics" element={<Analytics />} />
          </Routes>
        </div>
      </Router>
    </QueryClientProvider>
  )
}

function Dashboard() {
  const { isPending, error, data } = useQuery({
    queryKey: ['globalStats'],
    queryFn: () =>
      fetch(`${API_BASE_URL}/api/stats`).then((res) =>
        res.json()
      ),
  })

  if (isPending) return <div className="p-10 text-center">Loading Dashboard Data...</div>

  if (error) return <div className="p-10 text-red-500">Error connecting to API: {error.message}</div>

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">National Overview</h1>
        <p className="text-gray-600 mt-2">Analysis of Public Funds & Development Works</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Total Allocated" value={`₹${(data.total_allocated / 10000000).toFixed(2)} Cr`} />
        <StatCard title="Total Spent" value={`₹${(data.total_spent / 10000000).toFixed(2)} Cr`} />
        <StatCard title="Works Recommended" value={data.total_works_recommended.toLocaleString()} />
        <StatCard title="Works Completed" value={data.total_works_completed.toLocaleString()} />
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Key Performance Indicators</h2>
        <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600 font-medium">Fund Utilization</p>
                <p className="text-3xl font-bold text-blue-900">{data.utilization_percentage.toFixed(1)}%</p>
                <p className="text-xs text-blue-500 mt-1">of allocated funds have been spent</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                <p className="text-sm text-green-600 font-medium">Work Completion Rate</p>
                <p className="text-3xl font-bold text-green-900">{data.completion_percentage.toFixed(1)}%</p>
                <p className="text-xs text-green-500 mt-1">of recommended works are finished</p>
            </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 mb-8">
        <h2 className="text-xl font-semibold mb-6 text-gray-900 flex items-center">
          <Info className="w-5 h-5 mr-2 text-blue-600" /> 
          What do these metrics mean?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Wallet className="w-5 h-5 text-blue-700" />
              </div>
              <h3 className="font-bold text-gray-900">Fund Utilization</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Measures how much of the <strong>allocated budget</strong> has actually reached the ground as expenditure. Low scores indicate administrative delays or lack of project initiation.
            </p>
            <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider bg-gray-50 px-2 py-1 rounded inline-block">
              Formula: (Spent / Allocated) × 100
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-700" />
              </div>
              <h3 className="font-bold text-gray-900">Completion Rate</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              The ratio of <strong>finished works</strong> against total recommended projects. This tracks the speed and efficiency of local administrative authorities in executing MP requests.
            </p>
            <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider bg-gray-50 px-2 py-1 rounded inline-block">
              Formula: (Completed / Recommended) × 100
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Eye className="w-5 h-5 text-purple-700" />
              </div>
              <h3 className="font-bold text-gray-900">Transparency Score</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Our <strong>Accountability Metric</strong>. It checks how many completed works have actual photographic or documentary proof uploaded to the portal.
            </p>
            <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider bg-gray-50 px-2 py-1 rounded inline-block">
              Formula: (Works with Proof / Total Completed) × 100
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string, value: string }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <p className="text-sm text-gray-500 font-medium">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

export default App
