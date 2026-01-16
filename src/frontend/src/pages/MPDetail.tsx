import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { ExternalLink, CheckCircle2, Clock } from 'lucide-react';

export function MPDetail() {
  const { name } = useParams();
  const API_BASE_URL = import.meta.env.VITE_API_URL || '';
  const { isPending, error, data } = useQuery({
    queryKey: ['mp', name],
    queryFn: () => fetch((import.meta.env.VITE_API_URL || '') + `/api/mps/${encodeURIComponent(name || '')}`).then((res) => res.json()),
  });

  if (isPending) return <div className="p-10 text-center">Loading MP Details...</div>;
  if (error) return <div className="p-10 text-red-500">Error: {error.message}</div>;

  const { info, stats, recent_works } = data;

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
            <span className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600">
              Allocated: ₹{(info.allocated / 10000000).toFixed(2)} Cr
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
           <dt className="text-sm font-medium text-gray-500 truncate">Total Spent</dt>
           <dd className="mt-1 text-3xl font-semibold text-gray-900">₹{(stats.spent / 10000000).toFixed(2)} Cr</dd>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
           <dt className="text-sm font-medium text-gray-500 truncate">Works Completed</dt>
           <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats.works_completed}</dd>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
           <dt className="text-sm font-medium text-gray-500 truncate">Proofs Uploaded</dt>
           <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats.proofs_uploaded}</dd>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
           <dt className="text-sm font-medium text-gray-500 truncate">Transparency Score</dt>
           <dd className={`mt-1 text-3xl font-semibold ${stats.transparency_score > 50 ? 'text-green-600' : 'text-red-600'}`}>
             {stats.transparency_score.toFixed(1)}%
           </dd>
        </div>
      </div>

      {/* Recent Works Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 border-b border-gray-200 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Recent Works & Status</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Est. Cost</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actual Cost</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proof</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recent_works.map((work: any) => (
                <tr key={work.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-md truncate" title={work.description}>{work.description}</div>
                    <div className="text-xs text-gray-500 mt-1">ID: {work.id} • {work.date}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
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
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                    ₹{work.recommended_amount?.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 font-medium">
                    {work.actual_amount ? `₹${work.actual_amount.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
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
