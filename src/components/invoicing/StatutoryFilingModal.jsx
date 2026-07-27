// ============================================================================
// StatutoryFilingModal — record a GSTR-1 / GSTR-3B filing or a TDS deposit
// for one tax period (month). Upserts via /invoicing/statutory/filings.
// ============================================================================
import { useState, useEffect, useRef } from 'react';
import invoicingApi from '../../utils/invoicingApi';
import { useToast } from '../../context/ToastContext';
import { Loader2, X, Trash2 } from 'lucide-react';

const KIND_LABELS = {
  gstr1: 'GSTR-1 filing',
  gstr3b: 'GSTR-3B filing',
  tds26q: 'TDS deposit (non-salary / 26Q)',
  tds24q: 'TDS deposit (salary / 24Q)',
};
// GSTR-1 is a return with no payment; the rest carry an amount.
const HAS_AMOUNT = { gstr1: false, gstr3b: true, tds26q: true, tds24q: true };

function toLocalYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StatutoryFilingModal({ orgSlug, kind, year, month, periodLabel, existing, suggestedAmount, initialDate, onClose, onSaved }) {
  const { showToast } = useToast();
  // Priority: saved entry date → GSTN's date-of-filing (initialDate) → today.
  const [filedOn, setFiledOn] = useState(
    existing?.filedOn ? toLocalYMD(new Date(existing.filedOn))
      : initialDate || toLocalYMD(new Date()),
  );
  const [amountPaid, setAmountPaid] = useState(
    existing?.amountPaid != null ? String(existing.amountPaid)
      : suggestedAmount != null && suggestedAmount > 0 ? String(suggestedAmount) : '',
  );
  const [challanNo, setChallanNo] = useState(existing?.challanNo || '');
  const [note, setNote] = useState(existing?.note || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const firstFieldRef = useRef(null);

  // Escape closes; first field gets focus on open. Backdrop clicks deliberately
  // do NOT close — a stray click must not discard typed challan details.
  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!filedOn) {
      showToast(kind.startsWith('tds') ? 'Deposit date is required' : 'Filing date is required', 'error');
      return;
    }
    if (HAS_AMOUNT[kind] && amountPaid !== '' && (!Number.isFinite(Number(amountPaid)) || Number(amountPaid) < 0)) {
      showToast('Amount must be a non-negative number', 'error');
      return;
    }
    setSaving(true);
    try {
      await invoicingApi.saveStatutoryFiling(orgSlug, {
        kind, year, month, filedOn,
        amountPaid: HAS_AMOUNT[kind] && amountPaid !== '' ? Number(amountPaid) : null,
        challanNo, note,
      });
      showToast('Filing recorded', 'success');
      onSaved?.();
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to save filing', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing?.id) return;
    setDeleting(true);
    try {
      await invoicingApi.deleteStatutoryFiling(orgSlug, existing.id);
      showToast('Filing entry removed', 'success');
      onSaved?.();
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to delete filing', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors';
  const labelCls = 'block text-dark-300 text-xs font-medium mb-1.5 uppercase tracking-wider';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-dark-850 border border-dark-700 rounded-2xl w-full max-w-md p-6 space-y-4" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{KIND_LABELS[kind] || kind}</h3>
            <p className="text-dark-400 text-sm mt-0.5">Period: {periodLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div>
          <label className={labelCls}>{kind.startsWith('tds') ? 'Deposited on' : 'Filed on'}</label>
          <input ref={firstFieldRef} type="date" value={filedOn} onChange={(e) => setFiledOn(e.target.value)} className={inputCls} />
        </div>
        {HAS_AMOUNT[kind] && (
          <div>
            <label className={labelCls}>Amount paid (₹)</label>
            <input type="number" min="0" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className={inputCls} placeholder="0.00" />
          </div>
        )}
        <div>
          <label className={labelCls}>Challan / ARN no.</label>
          <input type="text" value={challanNo} onChange={(e) => setChallanNo(e.target.value)} className={inputCls} placeholder="Optional" />
        </div>
        <div>
          <label className={labelCls}>Note</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Optional" />
        </div>

        <div className="flex items-center justify-between pt-2">
          {existing?.id ? (
            <button onClick={remove} disabled={deleting} className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors">
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Remove
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-dark-300 hover:text-white transition-colors">Cancel</button>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
