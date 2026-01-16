import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

type SearchItem =
  | { type: 'mp'; label: string; mp_name: string; state?: string; constituency?: string }
  | { type: 'vendor'; label: string; vendor_name: string; mp_count?: number; total_received?: number }
  | { type: 'work_type'; label: string; activity: string; total_spent?: number }
  | { type: 'state'; label: string; state: string; spent?: number };

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function GlobalSearch({ apiBaseUrl }: { apiBaseUrl: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 200);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    enabled: debounced.trim().length >= 2,
    queryFn: async () => {
      const res = await fetch(`${apiBaseUrl}/api/search?q=${encodeURIComponent(debounced.trim())}`);
      if (!res.ok) throw new Error('Search failed');
      return (await res.json()) as SearchItem[];
    },
  });

  const items = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const go = (item: SearchItem) => {
    setOpen(false);
    setQ('');

    if (item.type === 'mp') {
      navigate(`/mps/${encodeURIComponent(item.mp_name)}`);
      return;
    }
    if (item.type === 'vendor') {
      navigate(`/vendors/${encodeURIComponent(item.vendor_name)}`);
      return;
    }
    if (item.type === 'work_type') {
      navigate(`/work-types/${encodeURIComponent(item.activity)}`);
      return;
    }
    if (item.type === 'state') {
      navigate(`/mps?state=${encodeURIComponent(item.state)}`);
      return;
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search MP, vendor, work type, state…"
          className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
        />
      </div>

      {open && q.trim().length >= 2 ? (
        <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 flex items-center justify-between">
            <span>{isFetching ? 'Searching…' : `${items.length} results`}</span>
            <span className="text-[10px]">Enter 2+ chars</span>
          </div>

          {items.length === 0 && !isFetching ? (
            <div className="px-3 py-3 text-sm text-gray-600">No matches.</div>
          ) : null}

          <ul className="max-h-80 overflow-auto">
            {items.map((item, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => go(item)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50"
                >
                  <div className="text-sm font-medium text-gray-900 truncate">{item.label}</div>
                  <div className="text-xs text-gray-500">
                    {item.type === 'mp' ? `MP • ${item.state || ''} ${item.constituency ? `• ${item.constituency}` : ''}` : null}
                    {item.type === 'vendor' ? `Vendor • MPs: ${item.mp_count ?? '-'}` : null}
                    {item.type === 'work_type' ? 'Work type (activity)' : null}
                    {item.type === 'state' ? 'State' : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
