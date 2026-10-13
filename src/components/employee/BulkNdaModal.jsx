// BulkNdaModal — one-time / batch send of the Employee NDA to many payroll
// employees at once (2026-10-13). Opens with a DRY RUN from the API
// (POST …/employees/letters/nda/bulk, dryRun:true): every current payroll
// employee of the active company with the reason it would be skipped.
// The admin unticks anyone, then "Send" posts the ticked ids with
// dryRun:false. The API sends each letter through the same path as the
// employee-page modal (reference number per letter, employee mirror).
import { useEffect, useMemo, useState } from 'react';
import { Loader2, FileSignature, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import employeeApi from '../../utils/employeeApi';

export default function BulkNdaModal({ show, onClose, orgSlug, onSent }) {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [checked, setChecked] = useState({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!show) return undefined;
    let cancelled = false;
    setLoading(true); setError(''); setResult(null); setPlan(null);
    employeeApi.bulkNda(orgSlug, { dryRun: true }).then((r) => {
      if (cancelled) return;
      if (!r?.success) throw new Error(r?.error || 'Could not build the plan');
      setPlan(r);
      const init = {};
      for (const row of r.rows || []) init[row.employeeId] = !row.skipReason;
      setChecked(init);
    }).catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [show, orgSlug]);

  const selected = useMemo(() => (plan?.rows || []).filter((r) => checked[r.employeeId] && !r.skipReason), [plan, checked]);
  const noAddress = selected.filter((r) => !r.hasAddress).length;

  const handleSend = async () => {
    setError(''); setSending(true);
    try {
      const r = await employeeApi.bulkNda(orgSlug, { dryRun: false, employeeIds: selected.map((x) => x.employeeId) });
      if (!r?.success) throw new Error(r?.error || 'Send failed');
      setResult(r);
      onSent?.(`NDA sent to ${r.sent} employee${r.sent === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}`);
    } catch (e) { setError(e?.message || 'Failed to send'); }
    finally { setSending(false); }
  };

  if (!show) return null;
  const TYPE = { confirmed: 'Full-time', intern: 'Intern', internal_consultant: 'Internal consultant' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { if (!sending) onClose?.(); }}>
      <div className="bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-dark-800 sticky top-0 bg-dark-900/95 backdrop-blur z-10">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20"><FileSignature size={18} /></div>
            <div>
              <h2 className="text-lg font-semibold text-white">Send NDA to payroll employees</h2>
              <p className="text-xs text-dark-400 mt-0.5">Employee Confidentiality, IP &amp; Client Protection Agreement — one letter per ticked employee, each with its own reference number. Only the employee signs.</p>
            </div>
          </div>
          <button onClick={() => { if (!sending) onClose?.(); }} className="p-1 rounded-md text-dark-400 hover:text-white hover:bg-dark-800"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {loading && <div className="flex items-center gap-2 text-sm text-dark-400"><Loader2 size={14} className="animate-spin" /> Checking every payroll employee…</div>}
          {error && <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div>{error}</div></div>}

          {result && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3"><CheckCircle2 size={16} className="mt-0.5 shrink-0" /><div>Sent {result.sent}, failed {result.failed}, skipped {result.skipped}. Each employee has been emailed a signing link; progress shows on their employee page under Signature Requests.</div></div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-dark-400"><th className="py-1 pr-3">Employee</th><th className="py-1 pr-3">Reference</th><th className="py-1">Outcome</th></tr></thead>
                <tbody>
                  {result.results.map((r) => (
                    <tr key={r.employeeId} className="border-t border-dark-800">
                      <td className="py-1.5 pr-3 text-dark-100">{r.name}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs text-dark-200">{r.refNo || '—'}</td>
                      <td className={`py-1.5 text-xs ${r.error ? 'text-red-300' : r.skipped ? 'text-dark-400' : 'text-emerald-300'}`}>{r.error ? `Failed: ${r.error}` : r.skipped ? `Skipped: ${r.skipped}` : 'Sent'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && plan && !result && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <Stat k="Template" v={plan.template?.name} />
                <Stat k="Issued by" v={`${plan.signatory?.name || '—'}${plan.signatory?.designation ? `, ${plan.signatory.designation}` : ''}`} />
                <Stat k="Will send" v={`${selected.length} of ${plan.rows.length}`} />
                <Stat k="Without address" v={String(noAddress)} warn={noAddress > 0} />
              </div>
              {noAddress > 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><div>{noAddress} ticked employee{noAddress === 1 ? ' has' : 's have'} no address on record — their letter prints a blank address line. Untick them and add the address on the employee page first, or send as is.</div></div>
              )}
              <div className="overflow-x-auto rounded-lg border border-dark-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-dark-400 bg-dark-950/60">
                      <th className="py-2 px-2 w-8"><input type="checkbox" aria-label="Select all eligible" checked={selected.length > 0 && selected.length === plan.rows.filter((r) => !r.skipReason).length} onChange={(e) => { const n = {}; for (const r of plan.rows) n[r.employeeId] = e.target.checked && !r.skipReason; setChecked(n); }} /></th>
                      <th className="py-2 px-2">Employee</th><th className="py-2 px-2">Type</th><th className="py-2 px-2">Designation</th><th className="py-2 px-2">Email</th><th className="py-2 px-2">Address</th><th className="py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((r) => (
                      <tr key={r.employeeId} className={`border-t border-dark-800 ${r.skipReason ? 'opacity-60' : ''}`}>
                        <td className="py-1.5 px-2"><input type="checkbox" aria-label={`Send to ${r.name}`} disabled={!!r.skipReason} checked={!!checked[r.employeeId] && !r.skipReason} onChange={(e) => setChecked((c) => ({ ...c, [r.employeeId]: e.target.checked }))} /></td>
                        <td className="py-1.5 px-2 text-dark-100 whitespace-nowrap">{r.name}</td>
                        <td className="py-1.5 px-2 text-dark-300 whitespace-nowrap">{TYPE[r.employmentType] || r.employmentType}</td>
                        <td className={`py-1.5 px-2 ${r.hasDesignation ? 'text-dark-300' : 'text-amber-300'}`}>{r.designation || 'missing'}</td>
                        <td className="py-1.5 px-2 text-dark-300 text-xs">{r.email || <span className="text-red-300">missing</span>}</td>
                        <td className={`py-1.5 px-2 text-xs ${r.hasAddress ? 'text-dark-300' : 'text-amber-300'}`}>{r.hasAddress ? 'on record' : 'missing'}</td>
                        <td className="py-1.5 px-2 text-xs text-dark-400">{r.skipReason || 'Ready'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-dark-800 sticky bottom-0 bg-dark-900/95 backdrop-blur">
          <button type="button" onClick={() => { if (!sending) onClose?.(); }} className="px-3 py-1.5 text-sm rounded-md text-dark-300 hover:text-white hover:bg-dark-800">{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button type="button" disabled={loading || sending || selected.length === 0} onClick={handleSend} className="px-3 py-1.5 text-sm rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2">
              {sending ? <Loader2 size={14} className="animate-spin" /> : <FileSignature size={14} />} Send NDA to {selected.length} employee{selected.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, warn }) {
  return (<div className="rounded-lg border border-dark-800 bg-dark-950/40 px-3 py-2"><div className="text-[11px] uppercase tracking-wide text-dark-500">{k}</div><div className={`text-sm mt-0.5 ${warn ? 'text-amber-300' : 'text-dark-100'}`}>{v || '—'}</div></div>);
}
