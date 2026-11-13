// ============================================================================
// FullTimeOfferModal — send the Full-Time offer letter to an EXISTING employee
// (intern / consultant moving to full-time), 2026-11-13. Same Sign template
// and Annexure A math as an ATS offer, but built from the employee record +
// the new terms typed here (re-running them through ATS would create a second
// employee at Hire). Director signs first, then the employee.
// Sending changes nothing about pay or employment type — HR applies the new
// terms in Payroll once the letter is signed (banner on the employee page).
// ============================================================================
import { useState, useEffect } from 'react';
import { Loader2, FileSignature, X, AlertTriangle, CheckCircle2, Calculator } from 'lucide-react';
import employeeApi from '../../utils/employeeApi';
import signApi from '../../utils/signApi';

const inr = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
const ymd = (d) => { const x = new Date(d); return Number.isNaN(x.getTime()) ? '' : x.toISOString().slice(0, 10); };
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

export default function FullTimeOfferModal({ show, onClose, orgSlug, employee, onSent }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState(null);
  const [f, setF] = useState({});
  const [breakup, setBreakup] = useState(null);
  const [breakupKey, setBreakupKey] = useState('');
  const [computing, setComputing] = useState(false);
  const [sending, setSending] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (!show || !orgSlug || !employee?._id) return;
    let cancelled = false;
    setLoading(true); setError(''); setSetup(null); setBreakup(null); setBreakupKey('');
    employeeApi.getConversionOfferSetup(orgSlug, employee._id).then((s) => {
      if (cancelled) return;
      if (!s?.success) throw new Error(s?.error || 'Could not load the offer form');
      setSetup(s);
      const last = s.lastTerms || {};
      setF({
        ctcAnnual: last.ctcAnnual ? String(last.ctcAnnual) : '',
        structureId: last.structureId || (s.structures.find((x) => x.isDefault) || s.structures[0] || {})._id || '',
        variablePayAnnual: last.variablePayAnnual ? String(last.variablePayAnnual) : '',
        effectiveDate: last.effectiveDate ? ymd(last.effectiveDate) : '',
        designation: last.designation || s.employee.designation || '',
        probationMonths: String(last.probationMonths ?? s.defaults.probationMonths ?? 6),
        noticePeriodDays: String(last.noticePeriodDays ?? s.defaults.noticePeriodDays ?? 60),
        workLocation: last.workLocation || '',
        reportingManager: last.reportingManager || s.employee.manager || '',
        acceptanceDeadline: plusDays(7),
        templateId: s.templates[0]?._id || '',
        signatoryName: s.signatory.name || '',
        signatoryDesignation: s.signatory.designation || 'Director',
        signatoryEmail: s.signatory.email || '',
        employeeEmail: s.employee.email || s.employee.privateEmail || '',
      });
    }).catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [show, orgSlug, employee?._id]);

  if (!show) return null;

  const termsBody = (save = false) => ({
    ctcAnnual: Number(f.ctcAnnual), structureId: f.structureId, variablePayAnnual: Number(f.variablePayAnnual) || 0,
    effectiveDate: f.effectiveDate, designation: f.designation, probationMonths: Number(f.probationMonths), noticePeriodDays: Number(f.noticePeriodDays),
    workLocation: f.workLocation, reportingLocation: f.workLocation, reportingManager: f.reportingManager, acceptanceDeadline: f.acceptanceDeadline || null,
    signatoryName: f.signatoryName, signatoryDesignation: f.signatoryDesignation, save,
  });
  // Breakup is stale as soon as anything that feeds it changes.
  const currentKey = [f.ctcAnnual, f.structureId, f.variablePayAnnual].join('|');
  const breakupFresh = breakup && breakupKey === currentKey;

  const compute = async () => {
    setError(''); setComputing(true);
    try {
      const r = await employeeApi.getConversionOfferPrefill(orgSlug, employee._id, termsBody(false));
      if (!r?.success) throw new Error(r?.error || 'Could not compute');
      setBreakup(r.breakup); setBreakupKey(currentKey);
    } catch (e) { setError(e?.message || 'Could not compute'); setBreakup(null); }
    finally { setComputing(false); }
  };

  const fromType = setup?.employee?.employmentType || '';
  const canSend = !loading && !sending && setup && breakupFresh && f.templateId && f.effectiveDate && f.designation?.trim()
    && f.signatoryName?.trim() && f.signatoryEmail?.trim() && f.employeeEmail?.trim();

  const send = async () => {
    setError(''); setSending(true);
    try {
      const r = await employeeApi.getConversionOfferPrefill(orgSlug, employee._id, termsBody(true));
      if (!r?.success) throw new Error(r?.error || 'Could not build the letter');
      const name = setup.employee.name || employee.fullName || 'Employee';
      const first = name.split(' ')[0];
      const res = await signApi.createRequest(orgSlug, {
        templateId: f.templateId,
        reference: `Full-time Offer — ${name} · ${f.designation.trim()}`,
        subject: `Full-time Offer — ${name} · ${setup.companyName || 'Huemot Technology Private Limited'}`,
        message: `Hi ${first},<br><br>We're delighted to offer you a full-time role as ${f.designation.trim()} with ${setup.companyName || 'Huemot Technology Private Limited'}, effective ${r.prefill.joining_date || f.effectiveDate}.<br><br>Please review the offer letter, including Annexure A (compensation breakup), and sign at your earliest convenience. Reach out to HR if you have any questions.`,
        signers: [
          { name: f.signatoryName.trim(), email: f.signatoryEmail.trim().toLowerCase(), roleName: 'Director' },
          { name, email: f.employeeEmail.trim().toLowerCase(), roleName: 'Candidate' },
        ],
        linkedModel: 'employee',
        linkedId: employee._id,
        linkedSubtype: 'conversion_offer',
        prefill: r.prefill,
      });
      if (res?.success === false) throw new Error(res.error || 'Send failed');
      onSent?.('Full-time offer sent for signature');
      onClose?.();
    } catch (e) { setError(e?.message || 'Failed to send'); }
    finally { setSending(false); }
  };

  const existing = setup?.existing;
  const outstanding = existing && !['cancelled', 'refused', 'expired'].includes(existing.state);
  const L = ({ children, req }) => <label className="text-xs font-medium text-dark-300 mb-1 block">{children}{req && <span className="text-red-400"> *</span>}</label>;
  const inputCls = 'w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { if (!sending) onClose?.(); }}>
      <div className="bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-dark-800 sticky top-0 bg-dark-900/95 backdrop-blur z-10">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"><FileSignature size={18} /></div>
            <div>
              <h2 className="text-lg font-semibold text-white">Send full-time offer</h2>
              <p className="text-xs text-dark-400 mt-0.5">The Full-Time offer letter with Annexure A, filled from this employee’s record and the terms below. Director signs first, then the employee.</p>
            </div>
          </div>
          <button onClick={() => { if (!sending) onClose?.(); }} className="p-1 rounded-md text-dark-400 hover:text-white hover:bg-dark-800"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {loading && <div className="flex items-center gap-2 text-sm text-dark-400"><Loader2 size={14} className="animate-spin" /> Loading…</div>}
          {error && <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div>{error}</div></div>}

          {!loading && setup && (
            <>
              {outstanding && (
                <div className="flex items-start gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>A full-time offer was already sent on {new Date(existing.sentAt).toLocaleDateString('en-GB')} ({existing.state}). Sending again issues a second letter — cancel the first one in Sign if it is being replaced.</div>
                </div>
              )}
              {fromType === 'confirmed' && (
                <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">This employee is already Full-time. For a pay change on an existing full-time employee use the appointment letter / a salary revision instead.</div>
              )}
              {setup.templates.length === 0 && (
                <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">No active Full-Time offer letter template (one with an Annexure A) for this company.</div>
              )}

              <div className="rounded-xl border border-dark-700 bg-dark-800/30 p-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
                <span><span className="text-dark-400">Employee </span><span className="text-dark-100">{setup.employee.name}</span></span>
                <span><span className="text-dark-400">Now </span><span className="text-dark-100 capitalize">{(fromType || '—').replace(/_/g, ' ')}</span></span>
                {setup.currentSalary?.ctcAnnual ? <span><span className="text-dark-400">Current pay </span><span className="text-dark-100">₹{inr(setup.currentSalary.ctcAnnual)}/yr ({setup.currentSalary.structureName})</span></span> : null}
              </div>

              <div className="text-[10px] font-semibold text-dark-500 uppercase tracking-wider">New terms</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><L req>Annual CTC (₹)</L><input type="number" min="1" value={f.ctcAnnual} onChange={set('ctcAnnual')} placeholder="e.g. 300000" className={inputCls} /></div>
                <div><L req>Salary structure</L>
                  <select value={f.structureId} onChange={set('structureId')} className={inputCls}>
                    {setup.structures.map((s) => <option key={s._id} value={s._id}>{s.name}{s.isDefault ? ' (default)' : ''}</option>)}
                  </select>
                </div>
                <div><L>Variable pay (₹/yr, part of CTC)</L><input type="number" min="0" value={f.variablePayAnnual} onChange={set('variablePayAnnual')} placeholder="0" className={inputCls} /></div>
                <div><L req>Full-time from</L><input type="date" value={f.effectiveDate} onChange={set('effectiveDate')} className={inputCls} /></div>
                <div><L req>Designation</L><input value={f.designation} onChange={set('designation')} className={inputCls} /></div>
                <div><L>Work location</L><input value={f.workLocation} onChange={set('workLocation')} placeholder="e.g. Bhopal" className={inputCls} /></div>
                <div><L>Reporting manager</L><input value={f.reportingManager} onChange={set('reportingManager')} className={inputCls} /></div>
                <div><L>Accept by</L><input type="date" value={f.acceptanceDeadline} onChange={set('acceptanceDeadline')} className={inputCls} /></div>
                <div><L req>Probation (months)</L><input type="number" min="0" value={f.probationMonths} onChange={set('probationMonths')} className={inputCls} /></div>
                <div><L req>Notice period (days)</L><input type="number" min="0" value={f.noticePeriodDays} onChange={set('noticePeriodDays')} className={inputCls} /></div>
              </div>

              <div className="rounded-xl border border-dark-700 bg-dark-800/30 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-xs font-medium text-dark-300">Annexure A — compensation breakup</div>
                  <button type="button" onClick={compute} disabled={computing || !f.ctcAnnual || !f.structureId} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-dark-600 text-dark-200 hover:bg-dark-700 disabled:opacity-40">
                    {computing ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />} {breakup ? 'Recompute' : 'Compute breakup'}
                  </button>
                </div>
                {breakup && breakupFresh ? (
                  <table className="w-full text-sm">
                    <thead><tr className="text-dark-400 text-xs"><th className="text-left font-normal">Component</th><th className="text-right font-normal">Monthly</th><th className="text-right font-normal">Annual</th></tr></thead>
                    <tbody>
                      {breakup.rows.filter((r) => r.kind !== 'variable' || r.annual > 0).map((r) => (
                        <tr key={r.name} className="text-dark-100"><td>{r.name}</td><td className="text-right">₹{inr(r.monthly)}</td><td className="text-right">₹{inr(r.annual)}</td></tr>
                      ))}
                      <tr className="text-white font-medium border-t border-dark-700"><td className="pt-1">Total CTC</td><td className="text-right pt-1">₹{inr(breakup.ctcMonthly)}</td><td className="text-right pt-1">₹{inr(breakup.ctcAnnual)}</td></tr>
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-dark-500">{breakup ? 'Terms changed — press Recompute.' : 'Enter the CTC and press Compute breakup. Same calculation Payroll uses, so the letter matches the first payslip.'}</p>
                )}
              </div>

              {setup.templates.length > 1 && (
                <div><L>Sign template</L>
                  <select value={f.templateId} onChange={set('templateId')} className={inputCls}>
                    {setup.templates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><L req>Signs for the company</L><input value={f.signatoryName} onChange={set('signatoryName')} className={inputCls} /></div>
                <div><L>Designation</L><input value={f.signatoryDesignation} onChange={set('signatoryDesignation')} className={inputCls} /></div>
                <div><L req>Signer email</L><input type="email" value={f.signatoryEmail} onChange={set('signatoryEmail')} className={inputCls} /></div>
              </div>
              <div><L req>Employee signs at</L>
                <input type="email" value={f.employeeEmail} onChange={set('employeeEmail')} className={inputCls} />
                {setup.employee.privateEmail && setup.employee.privateEmail !== f.employeeEmail && (
                  <button type="button" onClick={() => setF((p) => ({ ...p, employeeEmail: setup.employee.privateEmail }))} className="text-[11px] text-blue-300 hover:text-blue-200 mt-1">Use personal email {setup.employee.privateEmail}</button>
                )}
              </div>
              <p className="text-[11px] text-dark-500">Sending does not change pay or employment type. Once signed, change the employment type to Full-time and set the new CTC in Payroll from the start date.</p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-dark-800 sticky bottom-0 bg-dark-900/95 backdrop-blur">
          <button onClick={onClose} disabled={sending} className="px-4 py-2 rounded-lg text-sm text-dark-300 hover:text-white hover:bg-dark-800 disabled:opacity-50">Cancel</button>
          <button onClick={send} disabled={!canSend} title={!breakupFresh ? 'Compute the breakup first' : ''} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {sending ? 'Sending…' : 'Send for signature'}
          </button>
        </div>
      </div>
    </div>
  );
}
