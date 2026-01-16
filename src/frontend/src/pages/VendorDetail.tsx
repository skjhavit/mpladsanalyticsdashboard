import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Calendar, MapPin, User } from 'lucide-react';

export function VendorDetail() {
  const { name } = useParams();
  // Decode the vendor name component of the URL
  const decodedName = decodeURIComponent(name || '');

  const { isPending, error, data } = useQuery({
    queryKey: ['vendor', decodedName],
    queryFn: () => fetch(`/api/vendors/${encodeURIComponent(decodedName)}`).then((res) => res.json()),
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
