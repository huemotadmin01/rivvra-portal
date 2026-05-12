import { Rows3, Rows4 } from 'lucide-react';

/**
 * DensityToggle — two-icon button group for Comfortable / Compact.
 *
 * 2026-05-13 ATS list-view audit Q5 = B. Pairs with the useDensity
 * hook; pages own the state and pass {density, setDensity} as props.
 *
 *   const { density, setDensity } = useDensity('ats:candidates');
 *   <DensityToggle density={density} onChange={setDensity} />
 */
export default function DensityToggle({ density, onChange }) {
  const base = 'inline-flex items-center justify-center w-7 h-7 transition-colors';
  const active = 'bg-dark-700 text-white';
  const idle = 'text-dark-400 hover:text-dark-200';
  return (
    <div
      className="inline-flex items-center bg-dark-900 border border-dark-700 rounded-lg overflow-hidden"
      role="group"
      aria-label="Row density"
    >
      <button
        type="button"
        onClick={() => onChange('comfortable')}
        className={`${base} ${density === 'comfortable' ? active : idle}`}
        aria-pressed={density === 'comfortable'}
        title="Comfortable rows"
      >
        <Rows3 size={14} />
      </button>
      <button
        type="button"
        onClick={() => onChange('compact')}
        className={`${base} border-l border-dark-700 ${density === 'compact' ? active : idle}`}
        aria-pressed={density === 'compact'}
        title="Compact rows"
      >
        <Rows4 size={14} />
      </button>
    </div>
  );
}
