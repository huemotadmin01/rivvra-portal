// BulkNdaModal — batch send + tracker for the Employee NDA (2026-10-13).
// Opens with a DRY RUN from the API (POST …/employees/letters/nda/bulk,
// dryRun:true): every current payroll employee of the active company with
// its NDA state (not sent / pending / signed) and the reason a row would
// be skipped. The admin ticks who gets a letter and clicks Send; pending
// rows get a Remind button (same endpoint as the Sign app). After a send
// the plan is re-fetched so the tracker shows the live state.
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2, FileSignature, X, AlertTriangle, CheckCircle2, BellRing } from 'lucide-react';
import employeeApi from '../../utils/employeeApi';
import signApi from '../../utils/signApi';

const TYPE = { confirmed: 'Full-time', intern: 'Intern', internal_consultant: 'Internal consultant' };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function BulkNdaModal({ show, onClose, orgSlug, onSent }) {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [checked, setChecked] = useState({});
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState('');
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryDesignation, setSignatoryDesignation] = useState('');
  const [reminding, setReminding] = useState({});
  const [reminded, setReminded] = useState({});
  const [view, setView] = useState('all'); // all | pending | signed | notSent

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await employeeApi.bulkNda(orgSlug, { dryRun: true });
      if (!r?.success) throw new Error(r?.error || 'Could not build the plan');
      setPlan(r);
      setSignatoryName((v) => v || r.signatory?.name || '');
      setSignatoryDesignation((v) => v || r.signatory?.designation || '');
      // Nothing is pre-ticked: this dialog doubles as the tracker, so a send
      // must be an explicit choice (the 'not sent' rows are usually the
      // people deliberately left out).
      setChecked({});
    } catch (e) { setError(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [orgSlug]);

  useEffect(() => { if (show) { setLastResult(null); setReminded({}); load(); } }, [show, load]);

  const selected = useMemo(() => (plan?.rows || []).filter((r) => checked[r.employeeId] && !r.skipReason), [plan, checked]);
  const noAddress = selected.filter((r) => !r.hasAddress).length;
  const S = plan?.summary || {};

  const visibleRows = useMemo(() => {
    const rows = plan?.rows || [];
    if (view === 'pending') return rows.filter((r) => r.alreadySent?.state === 'sent');
    if (view === 'signed') return rows.filter((r) => r.alreadySent?.state === 'signed');
    if (view === 'notSent') return rows.filter((r) => !r.alreadySent && !r.skipReason);
    return rows;
  }, [plan, view]);

  const handleSend = async () => {
    setError(''); setSending(true);
    try {
      const r = await employeeApi.bulkNda(orgSlug, { dryRun: false, employeeIds: selected.map((x) => x.employeeId), signatoryName: signatoryName.trim(), signatoryDesignation: signatoryDesignation.trim() });
      if (!r?.success) throw new Error(r?.error || 'Send failed');
      setLastResult(r);
      onSent?.(`NDA sent to ${r.sent} employee${r.sent === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}`);
      await load();
    } catch (e) { setError(e?.message || 'Failed to send'); }
    finally { setSending(false); }
  };

  const handleRemind = async (row) => {
    const id = row.alreadySent?.envelopeId; if (!id) return;
    setReminding((m) => ({ ...m, [row.employeeId]: true }));
    try {
      const r = await signApi.remindSigners(orgSlug, id);
      if (r?.success === false) throw new Error(r.error || 'Reminder failed');
      setReminded((m) => ({ ...m, [row.employeeId]: true }));
    } catch (e) { setError(`${row.name}: ${e?.message || 'reminder failed'}`); }
    finally { setReminding((m) => ({ ...m, [row.employeeId]: false })); }
  };

  if (!show) return null;

  const statusCell = (r) => {
    if (r.alreadySent?.state === 'signed') return <span className="text-emerald-300">Signed {fmt(r.alreadySent.signedAt)}{r.alreadySent.refNo ? <span className="block font-mono text-[10px] text-dark-500">{r.alreadySent.refNo}</span> : null}</span>;
    if (r.alreadySent?.state === 'sent') {
      return (
        <span className="text-amber-300 inline-flex items-center gap-2 flex-wrap">
          <span>Pending · sent {fmt(r.alreadySent.sentAt)}{r.alreadySent.refNo ? <span className="block font-mono text-[10px] text-dark-500">{r.alreadySent.refNo}</span> : null}</span>
          {r.alreadySent.envelopeId && (
            reminded[r.employeeId]
              ? <span className="text-[11px] text-dark-400 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Reminded</span>
              : <button type="button" disabled={!!reminding[r.employeeId]} onClick={() => handleRemind(r)} className="text-[11px] px-2 py-0.5 rounded border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50 inline-flex items-center gap-1">{reminding[r.employeeId] ? <Loader2 size={11} className="animate-spin" /> : <BellRing size={11} />} Remind</button>
          )}
        </span>
      );
    }
    if (r.skipReason) return <span className="text-dark-500">{r.skipReason}</span>;
    return <span className="text-dark-300">Not sent · ready</span>;
  };

  const Tab = ({ k, label, n }) => (
    <button type="button" onClick={() => setView(k)} className={`px-2.5 py-1 rounded-md text-xs border ${view === k ? 'bg-dark-700 border-dark-600 text-white' : 'border-dark-800 text-dark-400 hover:text-dark-200'}`}>{label} <span className="font-mono">{n}</span></button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { if (!sending) onClose?.(); }}>
      <div className="bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-dark-800 sticky top-0 bg-dark-900/95 backdrop-blur z-10">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20"><FileSignature size={18} /></div>
            <div>
              <h2 className="text-lg font-semibold text-white">Employee NDA — send &amp; track</h2>
              <p className="text-xs text-dark-400 mt-0.5">Employee Confidentiality, IP &amp; Client Protection Agreement. One letter per ticked employee, each with its own reference number; only the employee signs. Pending rows can be reminded from here.</p>
            </div>
          </div>
          <button onClick={() => { if (!sending) onClose?.(); }} className="p-1 rounded-md text-dark-400 hover:text-white hover:bg-dark-800"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {loading && !plan && <div className="flex items-center gap-2 text-sm text-dark-400"><Loader2 size={14} className="animate-spin" /> Checking every payroll employee…</div>}
          {error && <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div>{error}</div></div>}
          {lastResult && (
            <div className="flex items-start gap-2 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3"><CheckCircle2 size={16} className="mt-0.5 shrink-0" /><div>Sent {lastResult.sent}, failed {lastResult.failed}, skipped {lastResult.skipped}. Each employee has been emailed a signing link.{lastResult.results?.some((x) => x.error) ? ` Failed: ${lastResult.results.filter((x) => x.error).map((x) => `${x.name} (${x.error})`).join(', ')}` : ''}</div></div>
          )}

          {plan && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                <Stat k="Signed" v={String(S.signed ?? 0)} tone="ok" />
                <Stat k="Pending" v={String(S.pending ?? 0)} tone={(S.pending ?? 0) > 0 ? 'warn' : undefined} />
                <Stat k="Not sent" v={String(S.notSent ?? 0)} />
                <Stat k="Will send now" v={`${selected.length}`} />
                <Stat k="Template" v={plan.template?.name} small />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-dark-300 mb-1 block">Issued by (printed, no signature)</label>
                  <input value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} placeholder="Name" className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-dark-300 mb-1 block">Designation</label>
                  <input value={signatoryDesignation} onChange={(e) => setSignatoryDesignation(e.target.value)} placeholder="Director" className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white" />
                  {!signatoryDesignation.trim() && <div className="text-[11px] text-amber-300 mt-1">Empty — the letter prints a blank designation line. Set it in Company settings to make it the default.</div>}
                </div>
              </div>

              {noAddress > 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><div>{noAddress} ticked employee{noAddress === 1 ? ' has' : 's have'} no address on record — their letter prints a blank address line. Untick them and add the address on the employee page first, or send as is.</div></div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <Tab k="all" label="All" n={plan.rows.length} />
                <Tab k="notSent" label="Not sent" n={S.notSent ?? 0} />
                <Tab k="pending" label="Pending" n={S.pending ?? 0} />
                <Tab k="signed" label="Signed" n={S.signed ?? 0} />
                {loading && <Loader2 size={14} className="animate-spin text-dark-400" />}
                <button type="button" onClick={load} className="ml-auto text-xs text-dark-400 hover:text-dark-200">Refresh</button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-dark-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-dark-400 bg-dark-950/60">
                      <th className="py-2 px-2 w-8"><input type="checkbox" aria-label="Select all eligible" checked={selected.length > 0 && selected.length === plan.rows.filter((r) => !r.skipReason).length} onChange={(e) => { const n = {}; for (const r of plan.rows) n[r.employeeId] = e.target.checked && !r.skipReason; setChecked(n); }} /></th>
                      <th className="py-2 px-2">Employee</th><th className="py-2 px-2">Type</th><th className="py-2 px-2">Designation</th><th className="py-2 px-2">Email</th><th className="py-2 px-2">Address</th><th className="py-2 px-2">NDA status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr key={r.employeeId} className={`border-t border-dark-800 ${r.skipReason && !r.alreadySent ? 'opacity-60' : ''}`}>
                        <td className="py-1.5 px-2"><input type="checkbox" aria-label={`Send to ${r.name}`} disabled={!!r.skipReason} checked={!!checked[r.employeeId] && !r.skipReason} onChange={(e) => setChecked((c) => ({ ...c, [r.employeeId]: e.target.checked }))} /></td>
                        <td className="py-1.5 px-2 text-dark-100 whitespace-nowrap">{r.name}</td>
                        <td className="py-1.5 px-2 text-dark-300 whitespace-nowrap">{TYPE[r.employmentType] || r.employmentType}</td>
                        <td className={`py-1.5 px-2 ${r.hasDesignation ? 'text-dark-300' : 'text-amber-300'}`}>{r.designation || 'missing'}</td>
                        <td className="py-1.5 px-2 text-dark-300 text-xs">{r.email || <span className="text-red-300">missing</span>}</td>
                        <td className={`py-1.5 px-2 text-xs ${r.hasAddress ? 'text-dark-300' : 'text-amber-300'}`}>{r.hasAddress ? 'on record' : 'missing'}</td>
                        <td className="py-1.5 px-2 text-xs">{statusCell(r)}</td>
                      </tr>
                    ))}
                    {visibleRows.length === 0 && <tr><td colSpan={7} className="py-4 px-2 text-center text-xs text-dark-500">Nothing in this view.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-dark-800 sticky bottom-0 bg-dark-900/95 backdrop-blur">
          <button type="button" onClick={() => { if (!sending) onClose?.(); }} className="px-3 py-1.5 text-sm rounded-md text-dark-300 hover:text-white hover:bg-dark-800">Close</button>
          <button type="button" disabled={loading || sending || selected.length === 0 || !signatoryName.trim()} onClick={handleSend} className="px-3 py-1.5 text-sm rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <FileSignature size={14} />} Send NDA to {selected.length} employee{selected.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, tone, small }) {
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-dark-100';
  return (<div className="rounded-lg border border-dark-800 bg-dark-950/40 px-3 py-2"><div className="text-[11px] uppercase tracking-wide text-dark-500">{k}</div><div className={`${small ? 'text-xs' : 'text-lg font-semibold'} mt-0.5 ${color}`}>{v || '—'}</div></div>);
}
