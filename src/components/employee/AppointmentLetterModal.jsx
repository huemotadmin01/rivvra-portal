// ============================================================================
// AppointmentLetterModal — send the Full-Time appointment letter from the
// employee page (2026-10-12). Prefill comes from the employee record and its
// current salary (GET …/appointment-letter/prefill); the letter itself is
// rendered per send by the API (template.dynamicAppointment) with one
// Annexure A row per salary component. Director signs first, then the
// employee. The reference number is allocated by the API at send time.
// ============================================================================
import { useState, useEffect } from 'react';
import { Loader2, FileSignature, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import employeeApi from '../../utils/employeeApi';
import signApi from '../../utils/signApi';


// kind: 'appointment' (Full-Time appointment letter, rendered per send) or
// 'nda' (Employee Confidentiality, IP & Client Protection Agreement, static).
const KINDS = {
  appointment: { title: 'Send appointment letter', sub: 'Rendered from this employee’s record and current salary. Director signs first, then the employee.', templateRe: /appointment\s*letter/i, excludeRe: /intern/i, flag: 'dynamicAppointment', subtype: 'appointment_letter', reference: (n) => `Appointment Letter — ${n}`, subject: (n) => `Appointment Letter — ${n} · Huemot Technology Private Limited`, message: (f) => `Hi ${f},<br><br>Please review and sign your appointment letter. It sets out the terms of your employment with Huemot Technology Private Limited, including Annexure A (compensation breakup). Reach out to HR if anything needs correcting before you sign.`, noTemplate: 'No Sign template named “Appointment Letter” is active.' },
  nda: { title: 'Send confidentiality agreement (NDA)', sub: 'Employee Confidentiality, IP & Client Protection Agreement, prefilled from this employee’s record. Issued in the Director’s name; only the employee signs.', templateRe: /confidentiality|non-disclosure|\bNDA\b/i, excludeRe: /vendor|client|msa/i, flag: 'letterType', subtype: 'nda', reference: (n) => `NDA — ${n}`, subject: (n) => `Confidentiality Agreement — ${n} · Huemot Technology Private Limited`, message: (f) => `Hi ${f},<br><br>Please review and sign the Employee Confidentiality, Intellectual Property & Client Protection Agreement. It records the confidentiality and client-protection obligations that apply during and after your time with Huemot Technology Private Limited. Reach out to HR with any question before you sign.`, noTemplate: 'No Sign template for the Employee NDA is active.' },
};

export default function AppointmentLetterModal({ show, onClose, orgSlug, employee, onSent, kind = 'appointment' }) {
  const K = KINDS[kind] || KINDS.appointment;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [prefillRes, setPrefillRes] = useState(null);
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryDesignation, setSignatoryDesignation] = useState('');
  const [signatoryEmail, setSignatoryEmail] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!show || !orgSlug || !employee?._id) return;
    let cancelled = false;
    setLoading(true); setError(''); setPrefillRes(null);
    Promise.all([
      signApi.listTemplates(orgSlug),
      employeeApi.getLetterPrefill(orgSlug, employee._id, kind),
    ]).then(([tplRes, pr]) => {
      if (cancelled) return;
      const tpls = (tplRes?.templates || []).filter((t) => (kind === 'nda' ? String(t.letterType || '').toUpperCase() === 'NDA' : t.dynamicAppointment === true) || (K.templateRe.test(t?.name || '') && !K.excludeRe.test(t?.name || '')));
      setTemplates(tpls);
      setTemplateId(tpls[0] ? String(tpls[0]._id) : '');
      if (!pr?.success) throw new Error(pr?.error || 'Could not build the letter');
      setPrefillRes(pr);
      setSignatoryName(pr.signatory?.name || '');
      setSignatoryDesignation(pr.signatory?.designation || 'Director');
      setSignatoryEmail(pr.signatory?.email || '');
      setEmployeeEmail(pr.employee?.email || pr.employee?.privateEmail || '');
    }).catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [show, orgSlug, employee?._id, kind]);

  if (!show) return null;
  const p = prefillRes?.prefill || {};
  const terms = prefillRes?.terms || {};
  const existing = prefillRes?.existing || (kind === 'nda' ? prefillRes?.ndaAgreement : prefillRes?.appointmentLetter);
  const alreadySent = existing && !['cancelled', 'refused', 'expired'].includes(existing.state);
  const canSend = !loading && !sending && templateId && prefillRes?.hasSalary && signatoryName.trim() && (kind === 'nda' || signatoryEmail.trim()) && employeeEmail.trim();

  const handleSend = async () => {
    setError('');
    setSending(true);
    try {
      // Re-fetch with the signatory typed here so the printed name/designation match the signer
      const pr = await employeeApi.getLetterPrefill(orgSlug, employee._id, kind, { signatoryName: signatoryName.trim(), signatoryDesignation: signatoryDesignation.trim() });
      if (!pr?.success) throw new Error(pr?.error || 'Could not build the letter');
      const name = pr.employee?.name || employee.fullName || employee.name || 'Employee';
      const res = await signApi.createRequest(orgSlug, {
        templateId,
        reference: K.reference(name),
        subject: K.subject(name),
        message: K.message(name.split(' ')[0]),
        // 2026-10-13: the NDA is signed by the employee only — the company
        // side is a printed issuance line, so the Director is not a signer.
        signers: kind === 'nda'
          ? [{ name, email: employeeEmail.trim().toLowerCase(), roleName: 'Employee' }]
          : [
            { name: signatoryName.trim(), email: signatoryEmail.trim().toLowerCase(), roleName: 'Director' },
            { name, email: employeeEmail.trim().toLowerCase(), roleName: 'Employee' },
          ],
        linkedModel: 'employee',
        linkedId: employee._id,
        linkedSubtype: K.subtype,
        prefill: pr.prefill,
      });
      if (res?.success === false) throw new Error(res.error || 'Send failed');
      onSent?.(kind === 'nda' ? 'NDA sent for signature' : 'Appointment letter sent for signature');
      onClose?.();
    } catch (e) {
      setError(e?.message || 'Failed to send');
    } finally { setSending(false); }
  };

  const Row = ({ k, v }) => (<div className="flex justify-between gap-3 text-sm"><span className="text-dark-400">{k}</span><span className="text-dark-100 text-right">{v || '—'}</span></div>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { if (!sending) onClose?.(); }}>
      <div className="bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-dark-800 sticky top-0 bg-dark-900/95 backdrop-blur z-10">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20"><FileSignature size={18} /></div>
            <div>
              <h2 className="text-lg font-semibold text-white">{K.title}</h2>
              <p className="text-xs text-dark-400 mt-0.5">{K.sub}</p>
            </div>
          </div>
          <button onClick={() => { if (!sending) onClose?.(); }} className="p-1 rounded-md text-dark-400 hover:text-white hover:bg-dark-800"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {loading && <div className="flex items-center gap-2 text-sm text-dark-400"><Loader2 size={14} className="animate-spin" /> Building the letter…</div>}
          {error && <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div>{error}</div></div>}

          {!loading && prefillRes && (
            <>
              {alreadySent && (
                <div className="flex items-start gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>{kind === 'nda' ? 'An NDA' : 'An appointment letter'} {existing.refNo ? <span className="font-mono">{existing.refNo}</span> : null} was already sent on {new Date(existing.sentAt).toLocaleDateString('en-GB')} ({existing.state}). Sending again issues a new document with a new reference number.</div>
                </div>
              )}
              {kind === 'appointment' && !prefillRes.hasSalary && (
                <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>This employee has no salary breakup in Payroll yet. Set the CTC on the employee record first — Annexure A is built from it.</div>
                </div>
              )}
              {templates.length === 0 && (
                <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">{K.noTemplate}</div>
              )}
              {templates.length > 1 && (
                <div>
                  <label className="text-xs font-medium text-dark-300 mb-1 block">Sign template</label>
                  <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white">
                    {templates.map((t) => <option key={t._id} value={String(t._id)}>{t.name}</option>)}
                  </select>
                </div>
              )}

              <div className="rounded-xl border border-dark-700 bg-dark-800/30 p-3 space-y-1.5">
                <div className="text-xs font-medium text-dark-300 mb-1">What the letter will say</div>
                <Row k="Employee" v={p.employee_full_name} />
                <Row k="Designation" v={p.designation} />
                <Row k="Department" v={p.department} />
                <Row k="Date of joining" v={p.joining_date} />
                <Row k="Work location" v={p.work_location} />
                {kind === 'nda' ? (
                  <>
                    <Row k="Employee ID" v={p.employee_id} />
                    <Row k="Residential address" v={p.employee_address} />
                    <Row k="Registered office" v={p.registered_office} />
                    <Row k="Effective date" v={p.effective_date} />
                    <p className="text-[11px] text-dark-500 pt-1">Address comes from the employee record (permanent address first, else current). Fix it on the Address panel before sending if it is blank or stale.</p>
                  </>
                ) : (
                  <>
                    <Row k="Annual CTC" v={p.ctc_amount ? `INR ${p.ctc_amount}` : ''} />
                    <Row k="Salary structure" v={prefillRes.salaryStructure} />
                    <Row k="Probation" v={`${terms.probationMonths} months`} />
                    <Row k="Notice" v={`${terms.noticeDuringProbationDays} days during probation · ${terms.noticePeriodDays} days after confirmation`} />
                    <Row k="Non-solicitation" v={`${terms.nonSolicitMonths} months after exit`} />
                    <p className="text-[11px] text-dark-500 pt-1">Probation and notice come from the employee record (company default if blank). Edit them on the Work Information panel before sending if this hire agreed different terms.</p>
                  </>
                )}
              </div>

              <div className={`grid grid-cols-1 ${kind === 'nda' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-2`}>
                <div>
                  <label className="text-xs font-medium text-dark-300 mb-1 block">{kind === 'nda' ? 'Issued by (printed, no signature)' : 'Signs for the company'}</label>
                  <input value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} placeholder="Name" className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-dark-300 mb-1 block">Designation</label>
                  <input value={signatoryDesignation} onChange={(e) => setSignatoryDesignation(e.target.value)} placeholder="Director" className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white" />
                </div>
                {kind !== 'nda' && (
                  <div>
                    <label className="text-xs font-medium text-dark-300 mb-1 block">Signer email</label>
                    <input type="email" value={signatoryEmail} onChange={(e) => setSignatoryEmail(e.target.value)} className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white" />
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-dark-300 mb-1 block">Employee signs at</label>
                <input type="email" value={employeeEmail} onChange={(e) => setEmployeeEmail(e.target.value)} className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white" />
                {prefillRes.employee?.privateEmail && prefillRes.employee.privateEmail !== employeeEmail && (
                  <button type="button" onClick={() => setEmployeeEmail(prefillRes.employee.privateEmail)} className="text-[11px] text-blue-300 hover:text-blue-200 mt-1">Use personal email {prefillRes.employee.privateEmail}</button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-dark-800 sticky bottom-0 bg-dark-900/95 backdrop-blur">
          <button onClick={onClose} disabled={sending} className="px-4 py-2 rounded-lg text-sm text-dark-300 hover:text-white hover:bg-dark-800 disabled:opacity-50">Cancel</button>
          <button onClick={handleSend} disabled={!canSend} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 hover:bg-blue-400 text-white disabled:opacity-40 disabled:cursor-not-allowed">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {sending ? 'Sending…' : 'Send for signature'}
          </button>
        </div>
      </div>
    </div>
  );
}
