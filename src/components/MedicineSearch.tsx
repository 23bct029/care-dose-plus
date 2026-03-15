// src/components/MedicineSearch.tsx
// Medicine autocomplete using RxNorm API + local common medicines
import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Pill } from 'lucide-react';

interface MedicineSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Common medicines for instant offline suggestions
const COMMON_MEDICINES = [
  'Paracetamol','Ibuprofen','Aspirin','Amoxicillin','Metformin',
  'Atorvastatin','Lisinopril','Amlodipine','Omeprazole','Metoprolol',
  'Losartan','Simvastatin','Azithromycin','Ciprofloxacin','Clopidogrel',
  'Pantoprazole','Cetirizine','Montelukast','Glimepiride','Ramipril',
  'Telmisartan','Enalapril','Warfarin','Digoxin','Furosemide',
  'Spironolactone','Prednisolone','Dexamethasone','Tramadol','Gabapentin',
  'Levothyroxine','Insulin','Glipizide','Rosuvastatin','Valsartan',
  'Bisoprolol','Carvedilol','Diltiazem','Verapamil','Nifedipine',
  'Clonazepam','Alprazolam','Sertraline','Fluoxetine','Amitriptyline',
  'Cefixime','Doxycycline','Clindamycin','Metronidazole','Fluconazole',
  'Salbutamol','Budesonide','Montelukast','Folic Acid','Iron Supplement',
  'Vitamin D3','Calcium Carbonate','Multivitamin','Zinc','Magnesium',
];

interface Suggestion { name: string; rxcui?: string; source: 'local' | 'rxnorm' }

const MedicineSearch = ({ value, onChange, placeholder = 'Search medicine name...', className = '' }: MedicineSearchProps) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!value || value.length < 2) { setSuggestions([]); setOpen(false); return; }

    // Instant local results
    const local = COMMON_MEDICINES
      .filter(m => m.toLowerCase().includes(value.toLowerCase()))
      .slice(0, 5)
      .map(m => ({ name: m, source: 'local' as const }));

    setSuggestions(local);
    if (local.length > 0) setOpen(true);

    // Debounced RxNorm API lookup
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (value.length < 3) return;
      setLoading(true);
      try {
        const res = await fetch(
          `https://rxnav.nlm.nih.gov/REST/spellingsuggestions.json?name=${encodeURIComponent(value)}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (!res.ok) return;
        const data = await res.json();
        const apiSuggestions: string[] = data.suggestionGroup?.suggestionList?.suggestion || [];

        // Also try approximate match
        const res2 = await fetch(
          `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(value)}&maxEntries=5`,
          { signal: AbortSignal.timeout(4000) }
        );
        const data2 = await res2.json();
        const approx: string[] = (data2.approximateGroup?.candidate || [])
          .map((c: any) => c.name)
          .filter(Boolean);

        const allNames = [...new Set([...apiSuggestions, ...approx])].slice(0, 8);
        const rxSuggestions = allNames.map(name => ({ name, source: 'rxnorm' as const }));
        const merged = [...local];
        rxSuggestions.forEach(s => { if (!merged.find(m => m.name.toLowerCase() === s.name.toLowerCase())) merged.push(s); });
        setSuggestions(merged.slice(0, 10));
        if (merged.length > 0) setOpen(true);
      } catch {
        // Keep local results
      } finally {
        setLoading(false);
      }
    }, 400);
  }, [value]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"/>
        <Input
          value={value}
          onChange={e => { onChange(e.target.value); }}
          onFocus={() => value.length >= 2 && suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="pl-9 border-gray-300 bg-white h-10 text-sm"
          autoComplete="off"
        />
        {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button key={i} type="button"
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left group"
              onMouseDown={() => { onChange(s.name); setOpen(false); }}>
              <Pill className="h-4 w-4 text-purple-500 shrink-0"/>
              <span className="flex-1 text-sm text-gray-800 font-medium">{s.name}</span>
              {s.source === 'rxnorm' && (
                <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">RxNorm</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MedicineSearch;
