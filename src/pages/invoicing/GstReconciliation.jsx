// ============================================================================
// GstReconciliation.jsx — GSTR-2B (ITC) reconciliation. India companies only.
// Upload the portal's GSTR-2B JSON, match it against vendor bills, surface
// ITC-at-risk. Read-only — nothing is filed to the GST portal.
// ============================================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import { formatCurrency } from '../../utils/formatCurrency';
import { Loader2, ArrowLeft, Upload, AlertTriangle, Download, ShieldCheck, Pencil, X } from 'lucide-react';
import { HowToRead } from '../../components/invoicing/TermHint';

// ---------------------------------------------------------------------------
// Inline editor for a bill's vendor-reference (the 2B matching key). Opened
// from mismatch / missing-in-2B rows — the two buckets a typo'd reference
// lands in. Saving re-reconciles the period so the row re-buckets instantly.
// ---------------------------------------------------------------------------
function EditReferenceModal({ row, suggestion, saving, onSave, onClose }) {
  const [ref, setRef] = useState(row.vendorInvoiceNumber || '');
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-dark-850 border border-dark-700 rounded-2xl w-full max-w-md p-6 space-y-4" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Edit bill reference</h3>
            <p className="text-dark-400 text-sm mt-0.5">{row.number} · {row.contactName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors"><X size={18} /></button>
        </div>
        <div>
          <label className="block text-dark-300 text-xs font-medium mb-1.5 uppercase tracking-wider">Vendor invoice number (as printed on their invoice)</label>
          <input ref={inputRef} type="text" value={ref} onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && ref.trim()) onSave(ref.trim()); }}
            className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors" />
          {suggestion && suggestion !== (row.vendorInvoiceNumber || '') && (
            <button onClick={() => setRef(suggestion)}
              className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
              Use 2B's number: {suggestion}
            </button>
          )}
        </div>
        <p className="text-dark-500 text-xs">
          This is the GSTR-2B matching key. Amounts, numbering and payments are not affected; the period re-reconciles after saving.
        </p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-dark-300 hover:text-white transition-colors">Cancel</button>
          <button onClick={() => onSave(ref.trim())} disabled={saving || !ref.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save &amp; re-reconcile
          </button>
        </div>
      </div>
    </div>
  );
}

// Match buckets → label, colour, and short help.
const BUCKETS = {
  matched:          { label: 'Matched',         color: 'emerald', help: 'In 2B with matching amounts — ITC safe' },
  probable:         { label: 'Probable',        color: 'blue',    help: 'Amounts match but invoice number differs — verify' },
  mismatch:         { label: 'Mismatch',        color: 'amber',   help: 'Invoice number matches but amounts differ' },
  missing_in_2b:    { label: 'Missing in 2B',   color: 'red',     help: 'In your books, not filed by vendor — ITC at risk' },
  no_gstin:         { label: 'No GSTIN',         color: 'orange',  help: 'Bill has no vendor GSTIN — cannot reconcile' },
  missing_in_books: { label: 'Missing in books', color: 'purple', help: 'In 2B, not recorded in your books' },
  // Cross-period pass: vendor filed late/early, invoice found in another
  // uploaded period's 2B (or the 2B row belongs to a bill from another month).
  matched_other_period: { label: 'Matched · other period', color: 'cyan', help: 'Vendor reported this in a different month\'s 2B — ITC claimable in that month, not at risk' },
  in_books_other_month: { label: 'Booked other month', color: 'cyan', help: 'This 2B invoice matches a bill dated in another month — nothing to enter' },
};
// Buckets whose summary card only appears when non-zero (cross-period cases).
const OPTIONAL_BUCKETS = ['matched_other_period', 'in_books_other_month'];
const CHIP = {
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  blue:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  amber:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  red:     'bg-red-500/10 text-red-400 border-red-500/20',
  orange:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
  purple:  'bg-purple-500/10 text-purple-400 border-purple-500/20',
  cyan:    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

// "2026-04" (month input) <-> "042026" (GST return period MMYYYY)
const toPeriod = (ym) => { const [y, m] = (ym || '').split('-'); return y && m ? `${m}${y}` : ''; };
const fromPeriod = (p) => (p && p.length === 6 ? `${p.slice(2)}-${p.slice(0, 2)}` : '');
const periodLabel = (p) => {
  if (!p || p.length !== 6) return p || '';
  const d = new Date(Date.UTC(+p.slice(2), +p.slice(0, 2) - 1, 1));
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export default function GstReconciliation() {
  const { orgSlug, getAppRole } = useOrg();
  const isAdmin = getAppRole('invoicing') === 'admin';
  const { orgPath } = usePlatform();
  const { currentCompany, companyCountry } = useCompany();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const thisMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const [monthInput, setMonthInput] = useState(thisMonth);
  const period = toPeriod(monthInput);

  const [loading, setLoading] = useState(true);
  const [indiaBlocked, setIndiaBlocked] = useState(false);
  const [imports, setImports] = useState([]);
  const [recon, setRecon] = useState(null);   // { _id, results, summary, generatedDate }
  const [uploading, setUploading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [filter, setFilter] = useState('all');
  // Monotonic sequence: every recon-state writer takes a ticket, and stale
  // async responses (slow load racing an upload+reconcile, rapid period
  // switches on the throttled cluster) are dropped instead of clobbering
  // newer state.
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    if (!orgSlug || !period) return;
    const seq = ++seqRef.current;
    setLoading(true);
    // Reset on company switch so the previous company's imports/recon don't
    // linger if the new fetch returns nothing.
    setImports([]);
    setRecon(null);
    setFilter('all'); // a bucket filter from another period may not exist here
    try {
      const [impRes, recRes] = await Promise.all([
        invoicingApi.listGstr2bImports(orgSlug),
        invoicingApi.getGstr2bRecon(orgSlug, period),
      ]);
      if (seq !== seqRef.current) return; // superseded by a newer load/reconcile
      setImports(impRes?.imports || []);
      setRecon(recRes?.recon || null);
      setIndiaBlocked(false);
    } catch (e) {
      if (seq !== seqRef.current) return;
      if (/indian companies/i.test(e.message || '')) setIndiaBlocked(true);
      else showToast(e.message || 'Failed to load', 'error');
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, period, showToast, currentCompany?._id]);

  useEffect(() => { load(); }, [load]);

  const runReconcile = useCallback(async (p) => {
    setReconciling(true);
    try {
      const res = await invoicingApi.reconcileGstr2b(orgSlug, p);
      seqRef.current += 1; // invalidate any in-flight load so it can't overwrite this
      setRecon({ _id: res.reconId, results: res.results, summary: res.summary, generatedDate: res.generatedDate });
      setLoading(false);
      showToast('Reconciliation complete', 'success');
    } catch (e) {
      showToast(e.message || 'Reconcile failed', 'error');
    } finally {
      setReconciling(false);
    }
  }, [orgSlug, showToast]);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await invoicingApi.importGstr2b(orgSlug, fd);
      showToast(`Imported 2B for ${periodLabel(res.returnPeriod)} (${res.counts?.invoices || 0} records)`, 'success');
      // Snap the picker to the uploaded file's period, then reconcile it.
      setMonthInput(fromPeriod(res.returnPeriod));
      await invoicingApi.listGstr2bImports(orgSlug).then((r) => setImports(r?.imports || [])).catch(() => {});
      await runReconcile(res.returnPeriod);
    } catch (e) {
      showToast(e.message || 'Import failed', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const [editRef, setEditRef] = useState(null); // recon row being edited
  const [savingRef, setSavingRef] = useState(false);
  const saveReference = async (ref) => {
    if (!editRef?.billId) return;
    setSavingRef(true);
    try {
      // Both fields — vendorInvoiceNumber is canonical, vendorBillRef legacy;
      // keeping them identical means every reader agrees.
      await invoicingApi.updateBillReference(orgSlug, editRef.billId, { vendorInvoiceNumber: ref, vendorBillRef: ref });
      showToast('Reference updated — re-reconciling…', 'success');
      setEditRef(null);
      await runReconcile(period);
    } catch (e) {
      showToast(e.message || 'Failed to update reference', 'error');
    } finally {
      setSavingRef(false);
    }
  };

  const toggleReviewed = async (row) => {
    if (!recon?._id || !row.billId) return;
    try {
      await invoicingApi.annotateGstr2bRow(orgSlug, recon._id, { billId: row.billId, reviewed: !row.reviewed });
      setRecon((prev) => ({ ...prev, results: prev.results.map((r) => r.billId === row.billId ? { ...r, reviewed: !r.reviewed } : r) }));
    } catch (e) { showToast(e.message || 'Failed to update', 'error'); }
  };

  const exportCsv = () => {
    if (!recon?.results?.length) return;
    const head = ['Status', 'Bill #', 'Vendor', 'Vendor GSTIN', 'Bill Inv No', 'Bill Taxable', 'Bill Tax', '2B Inv No', '2B Taxable', '2B Tax', 'Taxable Δ', 'Tax Δ'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = recon.results.map((r) => [
      BUCKETS[r.match]?.label || r.match, r.number || '', r.contactName || '', r.vendorGstin || '',
      r.vendorInvoiceNumber || '', r.billTaxable ?? '', r.billTax ?? '',
      r.twoB?.inum || '', r.twoB?.txval ?? '', r.twoB?.tax ?? '',
      r.deltas?.taxable ?? '', r.deltas?.tax ?? '',
    ].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gstr2b_recon_${period}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // Block on the client-side company-country check too, so the guard doesn't
  // depend solely on regexing the server's error-message wording.
  if (indiaBlocked || companyCountry !== 'IN') {
    return (
      <div className="bg-dark-900 min-h-screen p-3 sm:p-6">
        <button onClick={() => navigate(orgPath('/invoicing/dashboard'))} className="flex items-center gap-2 text-dark-400 hover:text-white mb-6 text-sm">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="max-w-md mx-auto mt-20 text-center">
          <ShieldCheck size={40} className="mx-auto mb-4 text-dark-600" />
          <h2 className="text-lg font-semibold text-white mb-2">India-only feature</h2>
          <p className="text-dark-400 text-sm">GSTR-2B reconciliation is available only for companies registered in India. Switch to an Indian company to use it.</p>
        </div>
      </div>
    );
  }

  const summary = recon?.summary;
  const results = recon?.results || [];
  const shown = filter === 'all' ? results : results.filter((r) => r.match === filter);
  const importedPeriods = imports.map((i) => i.returnPeriod);
  const hasImportForPeriod = importedPeriods.includes(period);

  return (
    <div className="bg-dark-900 min-h-screen p-3 sm:p-6">
      <button onClick={() => navigate(orgPath('/invoicing/dashboard'))} className="flex items-center gap-2 text-dark-400 hover:text-white mb-4 text-sm">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">GST 2B Reconciliation</h1>
          <p className="text-dark-400 text-sm mt-1">Match vendor bills against your GSTR-2B to confirm ITC eligibility.</p>
        </div>
        <div className="flex items-end gap-3">
          <label className="text-xs text-dark-400">
            Return period
            <input type="month" value={monthInput} onChange={(e) => setMonthInput(e.target.value)}
              className="block mt-1 bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white" />
          </label>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
            onChange={(e) => handleUpload(e.target.files?.[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading || reconciling}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium disabled:opacity-50">
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Upload GSTR-2B JSON
          </button>
          {hasImportForPeriod && (
            <button onClick={() => runReconcile(period)} disabled={reconciling || uploading}
              className="px-4 py-2 rounded-lg border border-dark-600 hover:bg-dark-800 text-white text-sm font-medium disabled:opacity-50">
              {reconciling ? 'Reconciling…' : 'Re-reconcile'}
            </button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <HowToRead storageKey="gst-2b-recon">
          <p>
            <span className="text-white">GSTR-2B</span> is a statement the GST portal generates around the
            14th of every month, listing all the purchases your vendors reported against your GSTIN. If a
            vendor bill you recorded is in it, your tax credit (ITC) for that bill is confirmed and safe to
            claim. If it isn't, the vendor hasn't filed — claiming that credit is risky.
          </p>
          <p>
            <span className="text-white">Monthly routine:</span> download the month's 2B JSON from the GST
            portal → upload it here → every vendor bill lands in a bucket (matched, missing, mismatch…).
            Chase vendors for anything <span className="text-red-400">missing in 2B</span>, and book bills for
            credit that's <span className="text-purple-400">missing in your books</span>. Once a period is
            uploaded, bill edits re-reconcile automatically — the buckets and the GST Report stay current
            without re-running anything.
          </p>
          <p className="text-dark-400">
            Tap a bucket card to filter its rows. Nothing here is filed to the GST portal — this is a
            read-only check. The confirmed total feeds the ITC (2B) column of the GST Report.
          </p>
        </HowToRead>
      </div>

      {imports.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-xs text-dark-500 self-center">Uploaded:</span>
          {imports.map((i) => (
            <button key={i._id} onClick={() => setMonthInput(fromPeriod(i.returnPeriod))}
              className={`text-xs px-2.5 py-1 rounded-full border ${i.returnPeriod === period ? 'bg-rivvra-500/15 text-rivvra-300 border-rivvra-500/30' : 'border-dark-700 text-dark-300 hover:bg-dark-800'}`}>
              {periodLabel(i.returnPeriod)}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-20 justify-center text-dark-400"><Loader2 className="animate-spin" size={18} /> Loading…</div>
      ) : !hasImportForPeriod ? (
        <div className="text-center py-20 text-dark-500">
          <Upload size={36} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No GSTR-2B uploaded for {periodLabel(period)}.</p>
          <p className="text-xs mt-1">Download the GSTR-2B JSON from the GST portal for this period and upload it above.</p>
        </div>
      ) : !summary ? (
        <div className="text-center py-20 text-dark-500">
          <p className="text-sm">2B uploaded for {periodLabel(period)} — run the reconciliation.</p>
          <button onClick={() => runReconcile(period)} disabled={reconciling}
            className="mt-4 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium disabled:opacity-50">
            {reconciling ? 'Reconciling…' : 'Reconcile now'}
          </button>
        </div>
      ) : (
        <>
          {/* ITC at risk banner */}
          {summary.itcAtRiskAmount > 0 && (
            <div className="flex items-center gap-3 mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4">
              <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
              <div>
                <p className="text-red-300 font-semibold">{formatCurrency(summary.itcAtRiskAmount, 'INR')} ITC at risk</p>
                <p className="text-red-400/80 text-xs">From bills missing in 2B or with mismatched amounts. Follow up with these vendors before claiming.</p>
              </div>
            </div>
          )}

          {/* Summary cards (clickable filters) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {Object.entries(BUCKETS).map(([key, cfg]) => {
              const count = summary[{
                matched: 'matched', probable: 'probable', mismatch: 'mismatch',
                missing_in_2b: 'missingIn2b', no_gstin: 'noGstin', missing_in_books: 'missingInBooks',
                matched_other_period: 'matchedOtherPeriod', in_books_other_month: 'inBooksOtherMonth',
              }[key]] || 0;
              if (OPTIONAL_BUCKETS.includes(key) && count === 0) return null;
              const active = filter === key;
              return (
                <button key={key} onClick={() => setFilter(active ? 'all' : key)}
                  title={cfg.help}
                  className={`rounded-xl border p-4 text-left transition ${CHIP[cfg.color]} ${active ? 'ring-2 ring-offset-1 ring-offset-dark-900 ring-current' : ''}`}>
                  <span className="text-xs font-medium opacity-80 uppercase tracking-wide">{cfg.label}</span>
                  <p className="text-2xl font-bold mt-1">{count}</p>
                  <p className="text-[10px] leading-snug mt-1">{cfg.help}</p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-dark-400">
              {filter !== 'all' && <button onClick={() => setFilter('all')} className="text-rivvra-400 hover:underline mr-2">Clear filter</button>}
              Showing {shown.length} of {results.length}
              {recon?.generatedDate && <span className="ml-2 text-dark-500">· 2B generated {recon.generatedDate}</span>}
            </div>
            <button onClick={exportCsv} className="flex items-center gap-1.5 text-sm text-dark-300 hover:text-white">
              <Download size={14} /> Export CSV
            </button>
          </div>

          <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 text-dark-300 text-left">
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Bill / Vendor</th>
                  <th className="px-4 py-3 font-medium">Vendor GSTIN</th>
                  <th className="px-4 py-3 font-medium text-right">Bill (taxable / tax)</th>
                  <th className="px-4 py-3 font-medium text-right">2B (taxable / tax)</th>
                  <th className="px-4 py-3 font-medium text-right">Δ</th>
                  <th className="px-4 py-3 font-medium text-center">Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-dark-500">No rows in this bucket.</td></tr>
                ) : shown.map((r, i) => {
                  const cfg = BUCKETS[r.match] || { label: r.match, color: 'blue' };
                  const inBooks = r.match !== 'missing_in_books' && r.match !== 'in_books_other_month';
                  return (
                    <tr key={r.billId || `mib-${i}`} className="border-b border-dark-800 hover:bg-dark-800/40">
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${CHIP[cfg.color]}`}>{cfg.label}</span></td>
                      <td className="px-4 py-3">
                        {inBooks ? (
                          <>
                            <div className="text-white">{r.number || '—'}</div>
                            <div className="text-dark-400 text-xs flex items-center gap-1">
                              {r.contactName} · inv {r.vendorInvoiceNumber || '—'}
                              {isAdmin && r.billId && (r.match === 'mismatch' || r.match === 'missing_in_2b') && (
                                <button onClick={() => setEditRef(r)}
                                  title="Edit the vendor invoice number (2B matching key)"
                                  className="p-0.5 rounded text-dark-500 hover:text-white hover:bg-dark-700 transition-colors">
                                  <Pencil size={11} />
                                </button>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-white">{r.twoB?.supplierName || '—'}</div>
                            <div className="text-dark-400 text-xs">2B inv {r.twoB?.inum || '—'}</div>
                            {r.bookBill?.number && (
                              <div className="text-cyan-400 text-xs mt-0.5">
                                Booked as {r.bookBill.number}
                                {r.bookBill.date ? ` (${new Date(r.bookBill.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})` : ''}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-dark-300 font-mono text-xs">{inBooks ? (r.vendorGstin || '—') : (r.twoB?.ctin || '—')}</td>
                      <td className="px-4 py-3 text-right text-dark-200">{inBooks ? `${formatCurrency(r.billTaxable, 'INR')} / ${formatCurrency(r.billTax, 'INR')}` : '—'}</td>
                      <td className="px-4 py-3 text-right text-dark-200">
                        {r.twoB ? `${formatCurrency(r.twoB.txval, 'INR')} / ${formatCurrency(r.twoB.tax, 'INR')}` : '—'}
                        {r.twoBPeriod && <div className="text-cyan-400 text-xs">in {periodLabel(r.twoBPeriod)} 2B</div>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {r.deltas ? (
                          <span className={Math.abs(r.deltas.tax) > 1 || Math.abs(r.deltas.taxable) > 1 ? 'text-amber-400' : 'text-dark-500'}>
                            {formatCurrency(r.deltas.taxable, 'INR')} / {formatCurrency(r.deltas.tax, 'INR')}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {inBooks && (
                          <input type="checkbox" checked={!!r.reviewed} onChange={() => toggleReviewed(r)}
                            className="accent-rivvra-500 cursor-pointer" title="Mark reviewed (removes from ITC-at-risk)" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editRef && (
        <EditReferenceModal
          row={editRef}
          suggestion={editRef.twoB?.inum || null}
          saving={savingRef}
          onSave={saveReference}
          onClose={() => setEditRef(null)}
        />
      )}
    </div>
  );
}
