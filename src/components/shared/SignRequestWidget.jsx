/**
 * SignRequestWidget — Cross-app integration component
 *
 * Embeds into ATS, CRM, Employee, Contact detail pages.
 * Shows linked sign requests + "Send for Signature" button.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import signApi from '../../utils/signApi';
import {
  PenTool, Plus, FileText, Loader2, X,
  Send, ArrowRight, ArrowLeft, ExternalLink,
  CheckCircle2, Clock, XCircle,
} from 'lucide-react';

const STATE_COLORS = {
  sent: 'bg-blue-500/10 text-blue-400',
  signed: 'bg-emerald-500/10 text-emerald-400',
  cancelled: 'bg-red-500/10 text-red-400',
  expired: 'bg-orange-500/10 text-orange-400',
  refused: 'bg-red-500/10 text-red-400',
};

function StatusBadge({ status }) {
  const cls = STATE_COLORS[status] || 'bg-dark-700 text-dark-400';
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

export default function SignRequestWidget({ orgSlug, linkedModel, linkedId, prefillData }) {
  const navigate = useNavigate();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Modal state
  const [templates, setTemplates] = useState([]);
  const [roles, setRoles] = useState([]);
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [signers, setSigners] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!orgSlug || !linkedModel || !linkedId) return;
    (async () => {
      try {
        const res = await signApi.listRequests(orgSlug, { linkedModel, linkedId });
        if (res.requests) setRequests(res.requests);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [orgSlug, linkedModel, linkedId]);

  const openModal = async () => {
    setShowModal(true);
    setStep(1);
    setSelectedTemplate(null);
    setSubject('');
    setMessage('');
    setSending(false);

    // Init signer from prefill data
    const pf = prefillData || {};
    setSigners([{ name: pf.name || '', email: pf.email || '', roleId: null, roleName: '' }]);

    // Load templates + roles
    try {
      const [tmplRes, roleRes] = await Promise.all([
        signApi.listTemplates(orgSlug),
        signApi.listRoles(orgSlug),
      ]);
      if (tmplRes.templates) setTemplates(tmplRes.templates);
      if (roleRes.roles) setRoles(roleRes.roles);
    } catch { /* ignore */ }
  };

  const handleSend = async () => {
    if (!selectedTemplate || signers.some(s => !s.email)) return;
    setSending(true);
    try {
      const res = await signApi.createRequest(orgSlug, {
        templateId: selectedTemplate._id,
        signers: signers.map((s, i) => ({
          ...s,
          roleName: roles.find(r => r._id === s.roleId)?.name || `Signer ${i + 1}`,
        })),
        reference: selectedTemplate.name,
        subject: subject || `Signature Request - ${selectedTemplate.name}`,
        message,
        linkedModel,
        linkedId,
      });
      if (res.success !== false) {
        showToast('Signature request sent');
        setShowModal(false);
        // Refresh list
        const refreshed = await signApi.listRequests(orgSlug, { linkedModel, linkedId });
        if (refreshed.requests) setRequests(refreshed.requests);
      } else {
        showToast(res.error || 'Failed to send', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to send', 'error');
    } finally {
      setSending(false);
    }
  };

  const updateSigner = (idx, field, val) => setSigners(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  const addSigner = () => setSigners(prev => [...prev, { name: '', email: '', roleId: null }]);
  const removeSigner = (idx) => setSigners(prev => prev.filter((_, i) => i !== idx));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-dark-400 uppercase tracking-wide flex items-center gap-2">
          <PenTool size={14} className="text-indigo-400" />
          Signature Requests
        </h3>
        <button onClick={openModal} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
          <Plus size={12} /> Send for Signature
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-dark-500" /></div>
      ) : requests.length === 0 ? (
        <p className="text-dark-500 text-xs text-center py-4">No signature requests yet.</p>
      ) : (
        <div className="space-y-2">
          {requests.map(req => (
            <button
              key={req._id}
              onClick={() => navigate(orgPath(`/sign/requests/${req._id}`))}
              className="w-full text-left p-3 bg-dark-900 rounded-lg border border-dark-700 hover:border-dark-600 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={14} className="text-indigo-400 flex-shrink-0" />
                  <span className="text-sm text-white truncate">{req.reference || req.templateName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={req.state} />
                  <ExternalLink size={12} className="text-dark-500 group-hover:text-dark-300 transition-colors" />
                </div>
              </div>
              <p className="text-[11px] text-dark-500 mt-1 pl-6">
                {req.signers?.length || 0} signer(s) &middot; {new Date(req.createdAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Send for Signature Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <PenTool size={16} className="text-indigo-400" /> Send for Signature
              </h2>
              <button onClick={() => setShowModal(false)} className="text-dark-400 hover:text-white p-1 rounded-lg hover:bg-dark-700"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Step 1: Template */}
              {step === 1 && (
                <>
                  <p className="text-dark-400 text-sm">Choose a template.</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {templates.map(t => (
                      <button key={t._id} onClick={() => setSelectedTemplate(t)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${selectedTemplate?._id === t._id ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-dark-900 border-dark-700 hover:border-dark-600'}`}>
                        <div className="flex items-center gap-3">
                          <FileText size={14} className="text-indigo-400 flex-shrink-0" />
                          <span className="text-white text-sm">{t.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setStep(2)} disabled={!selectedTemplate} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40">
                    Next <ArrowRight size={14} />
                  </button>
                </>
              )}

              {/* Step 2: Signers + Options */}
              {step === 2 && (
                <>
                  <p className="text-dark-400 text-sm">Add signers and send.</p>
                  <div className="space-y-3">
                    {signers.map((s, idx) => (
                      <div key={idx} className="bg-dark-900 rounded-lg p-3 border border-dark-700 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-dark-500">Signer {idx + 1}</span>
                          {signers.length > 1 && <button onClick={() => removeSigner(idx)} className="text-dark-500 hover:text-red-400"><X size={14} /></button>}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={s.name} onChange={e => updateSigner(idx, 'name', e.target.value)} placeholder="Name" className="input-field text-sm" />
                          <input value={s.email} onChange={e => updateSigner(idx, 'email', e.target.value)} placeholder="Email *" type="email" className="input-field text-sm" />
                        </div>
                        {roles.length > 0 && (
                          <select value={s.roleId || ''} onChange={e => updateSigner(idx, 'roleId', e.target.value || null)} className="input-field text-sm w-full">
                            <option value="">No role</option>
                            {roles.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={addSigner} className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus size={14} /> Add Signer</button>
                  <div>
                    <label className="text-xs font-medium text-dark-400 mb-1 block">Subject (optional)</label>
                    <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={`Signature Request - ${selectedTemplate?.name}`} className="input-field w-full text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-dark-400 mb-1 block">Message (optional)</label>
                    <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} className="input-field w-full text-sm resize-none" />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setStep(1)} className="flex-1 btn-secondary flex items-center justify-center gap-2"><ArrowLeft size={14} /> Back</button>
                    <button onClick={handleSend} disabled={sending || signers.some(s => !s.email)} className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                      {sending ? <><Loader2 size={14} className="animate-spin" /> Sending...</> : <><Send size={14} /> Send</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
