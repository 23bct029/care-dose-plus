// src/components/PatientSearch.tsx - Searchable patient dropdown
import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, User } from 'lucide-react';

interface PatientSearchProps {
  patients: { id: string; name: string; email?: string; age?: number; bloodGroup?: string }[];
  value: string; // selected patient id
  onChange: (id: string, name: string) => void;
  placeholder?: string;
  className?: string;
}

const PatientSearch = ({ patients, value, onChange, placeholder = 'Search or select patient...', className = '' }: PatientSearchProps) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedPatient = patients.find(p => p.id === value);

  useEffect(() => {
    if (selectedPatient) setQuery(selectedPatient.name);
  }, [value, patients]);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (!containerRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const filtered = patients.filter(p =>
    !query || p.name.toLowerCase().includes(query.toLowerCase()) ||
    (p.email || '').toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"/>
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('', ''); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9 border-gray-300 bg-white h-10 text-sm"
          autoComplete="off"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto">
          {filtered.map(p => (
            <button key={p.id} type="button"
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left ${value === p.id ? 'bg-blue-50' : ''}`}
              onMouseDown={() => { onChange(p.id, p.name); setQuery(p.name); setOpen(false); }}>
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                {p.name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                {(p.email || p.age || p.bloodGroup) && (
                  <p className="text-xs text-gray-400 truncate">
                    {[p.email, p.age && `Age ${p.age}`, p.bloodGroup].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              {value === p.id && <span className="text-blue-500 text-xs shrink-0">✓</span>}
            </button>
          ))}
        </div>
      )}
      {open && query && filtered.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 px-4 py-3 text-sm text-gray-500">
          No patients match "{query}"
        </div>
      )}
    </div>
  );
};

export default PatientSearch;
