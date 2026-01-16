import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpDown, AlertCircle, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { useState, useMemo } from 'react';

export function MPList() {
  const { isPending, error, data } = useQuery({
    queryKey: ['mps'],
    queryFn: () => fetch(import.meta.env.VITE_API_URL || '' + '/api/mps?limit=1000').then((res) => res.json()),
  });

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [selectedState, setSelectedState] = useState<string>('All');

  const uniqueStates = useMemo(() => {
    if (!data) return [];
    const states = new Set(data.map((mp: any) => mp.state));
    return ['All', ...Array.from(states).sort()];
  }, [data]);

  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter((mp: any) => selectedState === 'All' || mp.state === selectedState);
  }, [data, selectedState]);

  const sortedData = useMemo(() => {
    let sortableItems = [...filteredData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc'; // Default to desc for metrics
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
     if (sortConfig?.key !== columnKey) return <ArrowUpDown className="ml-1 w-3 h-3 text-gray-400" />;
     return sortConfig.direction === 'asc' 
        ? <ArrowUp className="ml-1 w-3 h-3 text-blue-600" />
        : <ArrowDown className="ml-1 w-3 h-3 text-blue-600" />;
  };

  if (isPending) return <div className="p-10 text-center">Loading MPs...</div>;
  if (error) return <div className="p-10 text-red-500">Error: {error.message}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Member of Parliament Performance</h1>
        
        <div className="flex items-center">
            <Filter className="w-5 h-5 text-gray-500 mr-2" />
            <select 
                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
            >
                {uniqueStates.map((state: any) => (
                    <option key={state} value={state}>{state}</option>
                ))}
            </select>
        </div>
      </div>
      
      <div className="bg-white shadow border-b border-gray-200 sm:rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-gray-50">
            <tr>
              <th 
                scope="col" 
                className="w-[30%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => requestSort('name')}
              >
                <div className="flex items-center">MP Name / Constituency <SortIcon columnKey="name"/></div>
              </th>
              <th 
                scope="col" 
                className="w-[15%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => requestSort('state')}
              >
                <div className="flex items-center">State <SortIcon columnKey="state"/></div>
              </th>
              <th 
                scope="col" 
                className="w-[15%] px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => requestSort('spent')}
              >
                <div className="flex justify-end items-center">Spent (₹) <SortIcon columnKey="spent"/></div>
              </th>
              <th 
                scope="col" 
                className="w-[15%] px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => requestSort('utilization_rate')}
              >
                <div className="flex justify-end items-center">Utilized % <SortIcon columnKey="utilization_rate"/></div>
              </th>
              <th 
                scope="col" 
                className="w-[15%] px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => requestSort('completion_rate')}
              >
                <div className="flex justify-end items-center">Comp. % <SortIcon columnKey="completion_rate"/></div>
              </th>
              <th 
                scope="col" 
                className="w-[10%] px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => requestSort('transparency_score')}
              >
                 <div className="flex justify-center items-center">Trans. <SortIcon columnKey="transparency_score"/></div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.map((mp: any) => (
              <tr key={mp.name + mp.constituency} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-blue-600 hover:underline truncate">
                    <Link to={`/mps/${encodeURIComponent(mp.name)}`}>{mp.name}</Link>
                  </div>
                  <div className="text-xs text-gray-500 truncate">{mp.constituency}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs text-gray-800 break-words">
                    {mp.state}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 font-mono">
                  ₹{(mp.spent / 10000000).toFixed(2)} Cr
                </td>
                <td className="px-6 py-4 text-right text-sm text-gray-500">
                  <div className="flex items-center justify-end">
                    <div className="w-16 bg-gray-200 rounded-full h-1.5 mr-2 hidden md:block">
                      <div className={`h-1.5 rounded-full ${mp.utilization_rate > 70 ? 'bg-green-600' : 'bg-yellow-400'}`} style={{ width: `${Math.min(mp.utilization_rate, 100)}%` }}></div>
                    </div>
                    <span>{mp.utilization_rate}%</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                  {mp.completion_rate}%
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                   {mp.transparency_score < 20 && (
                       <span className="text-red-500 flex justify-center items-center font-bold" title="Low Proof Uploads">
                           <AlertCircle className="w-3 h-3 mr-1" /> {mp.transparency_score}%
                       </span>
                   )}
                   {mp.transparency_score >= 20 && (
                       <span className="text-green-600 font-medium">{mp.transparency_score}%</span>
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
