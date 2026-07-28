// ============================================================================
// StatutoryRecordsModal — drill-down list behind one GST/TDS report cell
// (mirrors the Profitability drill-down): document rows + a total that must
// equal the cell clicked. Fetches on open from the statutory records APIs.
// ============================================================================
import { useState, useEffect } from 'react';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import { Loader2, X } from 'lucide-react';

export default function StatutoryRecordsModal({ orgSlug, report, bucket, monthKey, title, subtitle, onClose }) {
  const [records, setRecords] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fn = report === 'gst' ? invoicingApi.getGstReportRecords : invoicingApi.getTdsReportRecords;
    fn(orgSlug, { month: monthKey, bucket })
      .then((res) => { if (!cancelled) setRecords(res.data?.records || []); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load records'); });
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { cancelled = true; window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, report, bucket, monthKey]);

  const total = (records || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-dark-850 border border-dark-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-dark-700">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-dark-400 text-sm mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors"><X size={18} /></button>
        </div>

        {error && <div className="p-6 text-red-400 text-sm">{error}</div>}
        {!error && records === null && (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>
        )}
        {!error && records !== null && (
          <>
            <div className="overflow-y-auto divide-y divide-dark-700/50 flex-1">
              {records.length === 0 && <div className="py-12 text-center text-dark-500 text-sm">No records in this bucket.</div>}
              {records.map((r, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{r.label}</p>
                    <p className="text-xs text-dark-400 truncate">{r.sublabel}</p>
                  </div>
                  {r.date && (
                    <span className="text-xs text-dark-400 shrink-0">
                      {new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </span>
                  )}
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold tabular-nums ${r.amount < 0 ? 'text-red-400' : 'text-white'}`}>{formatCurrency(r.amount, 'INR')}</p>
                    {r.taxable != null && <p className="text-[11px] text-dark-500 tabular-nums">on {formatCurrency(r.taxable, 'INR')}</p>}
                    {r.nativeCurrency && <p className="text-[11px] text-dark-500 tabular-nums">{formatCurrency(r.nativeAmount, r.nativeCurrency)}</p>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-dark-700 bg-dark-800/40 rounded-b-2xl">
              <span className="text-sm text-dark-300">{records.length} record{records.length === 1 ? '' : 's'}</span>
              <span className="text-sm font-bold text-white tabular-nums">{formatCurrency(total, 'INR')}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
