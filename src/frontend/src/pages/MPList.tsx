import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpDown, AlertCircle, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { useState, useMemo } from 'react';

export function MPList() {
  const { isPending, error, data } = useQuery({
    queryKey: ['mps'],
    queryFn: () => fetch((import.meta.env.VITE_API_URL || '') + '/api/mps?limit=1000').then((res) => res.json()),
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Member of Parliament Performance</h1>
        
        <div className="flex items-center bg-white p-1 rounded-lg border border-gray-200 shadow-sm w-full sm:w-auto">
            <Filter className="w-4 h-4 text-gray-500 ml-2" />
            <select 
                className="block w-full sm:w-48 pl-2 pr-8 py-2 text-sm border-none focus:ring-0 rounded-md"
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
            >
                {uniqueStates.map((state: any) => (
                    <option key={state} value={state}>{state}</option>
                ))}
            </select>
        </div>
      </div>
      
      {/* Desktop View: Table */}
      <div className="hidden md:block bg-white shadow border-b border-gray-200 sm:rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="w-[30%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('name')}>
                <div className="flex items-center">MP Name / Constituency <SortIcon columnKey="name"/></div>
              </th>
              <th scope="col" className="w-[15%] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('state')}>
                <div className="flex items-center">State <SortIcon columnKey="state"/></div>
              </th>
              <th scope="col" className="w-[15%] px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('spent')}>
                <div className="flex justify-end items-center">Spent (₹) <SortIcon columnKey="spent"/></div>
              </th>
              <th scope="col" className="w-[15%] px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('utilization_rate')}>
                <div className="flex justify-end items-center">Utilized % <SortIcon columnKey="utilization_rate"/></div>
              </th>
              <th scope="col" className="w-[15%] px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('completion_rate')}>
                <div className="flex justify-end items-center">Comp. % <SortIcon columnKey="completion_rate"/></div>
              </th>
              <th scope="col" className="w-[10%] px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => requestSort('transparency_score')}>
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
                  <span className="text-xs text-gray-800 break-words">{mp.state}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 font-mono">
                  ₹{(mp.spent / 10000000).toFixed(2)} Cr
                </td>
                <td className="px-6 py-4 text-right text-sm text-gray-500">
                  <div className="flex items-center justify-end">
                    <div className="w-16 bg-gray-200 rounded-full h-1.5 mr-2">
                      <div className={`h-1.5 rounded-full ${mp.utilization_rate > 70 ? 'bg-green-600' : 'bg-yellow-400'}`} style={{ width: `${Math.min(mp.utilization_rate, 100)}%` }}></div>
                    </div>
                    <span>{mp.utilization_rate}%</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                  {mp.completion_rate}%
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                   {mp.transparency_score < 20 ? (
                       <span className="text-red-500 flex justify-center items-center font-bold">
                           <AlertCircle className="w-3 h-3 mr-1" /> {mp.transparency_score}%
                       </span>
                   ) : (
                       <span className="text-green-600 font-medium">{mp.transparency_score}%</span>
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile View: Cards */}
      <div className="md:hidden space-y-4">
        {sortedData.map((mp: any) => (
          <div key={mp.name + mp.constituency} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-3">
              <div>
                <Link to={`/mps/${encodeURIComponent(mp.name)}`} className="text-base font-bold text-blue-700 hover:underline block">
                  {mp.name}
                </Link>
                <div className="text-xs text-gray-500">{mp.constituency} • {mp.state}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">₹{(mp.spent / 10000000).toFixed(2)} Cr</div>
                <div className="text-[10px] text-gray-400 uppercase font-mono">Total Spent</div>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2 border-t border-gray-50 pt-3">
              <div className="text-center">
                <div className="text-xs text-gray-400 mb-1">Utilized</div>
                <div className={`text-sm font-bold ${mp.utilization_rate > 70 ? 'text-green-600' : 'text-yellow-600'}`}>{mp.utilization_rate}%</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400 mb-1">Comp.</div>
                <div className="text-sm font-bold text-gray-900">{mp.completion_rate}%</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400 mb-1">Trans.</div>
                <div className={`text-sm font-bold ${mp.transparency_score > 50 ? 'text-green-600' : 'text-blue-600'}`}>{mp.transparency_score}%</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
    </div>
  );
}
