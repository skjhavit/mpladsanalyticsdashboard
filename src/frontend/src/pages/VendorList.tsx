import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function VendorList() {
  const { isPending, error, data } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => fetch((import.meta.env.VITE_API_URL || '') + '/api/vendors?limit=100').then((res) => res.json()),
  });

  if (isPending) return <div className="p-10 text-center">Loading Vendors...</div>;
  if (error) return <div className="p-10 text-red-500">Error: {error.message}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Top Vendors by Funds Received</h1>
      
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
