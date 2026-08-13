/**
 * SignRequestWidgetV2 — Cross-app integration component, on ds (phase 10)
 *
 * Embeds into ATS, CRM, Employee and Contact detail pages. Shows linked sign
 * requests + a "Send for Signature" flow.
 *
 * Copied from shared/SignRequestWidget.jsx. The boundary is `return (`:
 * everything above it — state, effects, and `handleSend`, which calls
 * createRequest and emails the signers — is byte-identical. Only the markup
 * below is on ds.
 *
 * The modal stays wrapped in createPortal(document.body). ds `Modal` positions
 * itself with an inline `position: fixed` and does NOT portal, so rendering it
 * in place here would reintroduce the exact bug the legacy comment documents:
 * an ancestor transform/filter creates a containing block, the "fixed" overlay
 * is trapped inside the widget, and the modal lands off-centre and clipped.
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../../context/PlatformContext';
import { useToast } from '../../../context/ToastContext';
import signApi from '../../../utils/signApi';
import {
  PenTool, Plus, FileText, X,
  Send, ArrowRight, ArrowLeft, ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import {
  Button, Chip, EmptyState, Field, Input, Modal, Panel, Select, Spinner, Textarea,
} from '../../ds';

const FONT = "'Inter', system-ui, sans-serif";

// Same vocabulary as the legacy colour map, as ds Chip tones.
const STATE_TONES = {
  sent: 'info',
  signed: 'brand',
  cancelled: 'danger',
  expired: 'warn',
  refused: 'danger',
};

function StatusBadge({ status }) {
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Draft';
  return <Chip tone={STATE_TONES[status] || 'neutral'}>{label}</Chip>;
}

export default function SignRequestWidgetV2({
  orgSlug,
  linkedModel,
  linkedId,
  prefillData,
  // Optional label overrides. Callers (e.g. ATS application detail,
  // where the dedicated Offer Details modal already owns "Send for
  // signature") can rename this section to disambiguate. Defaults
  // preserve the existing CRM / Employee / Contact wording.
  sectionTitle = 'Signature Requests',
  sendButtonLabel = 'Send for Signature',
  modalTitle = 'Send for Signature',
}) {
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
    <Panel
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <PenTool size={14} style={{ color: 'var(--a-sign)' }} />
          {sectionTitle}
        </span>
      }
      actions={
        <Button variant="ghost" size="sm" onClick={openModal} iconLeft={<Plus size={12} />}>
          {sendButtonLabel}
        </Button>
      }
    >
      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 16 }}><Spinner size={16} /></div>
      ) : requests.length === 0 ? (
        <p style={{ font: `450 12px/1.5 ${FONT}`, color: 'var(--fg-3)', textAlign: 'center', padding: '16px 0' }}>
          No signature requests yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {requests.map((req) => (
            <button
              key={req._id}
              type="button"
              onClick={() => navigate(orgPath(`/sign/requests/${req._id}`))}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: 12,
                borderRadius: 'var(--r-2)', background: 'var(--surface-2)',
                boxShadow: 'inset 0 0 0 1px var(--line)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <FileText size={14} style={{ color: 'var(--a-sign)', flexShrink: 0 }} />
                  <span style={{
                    font: `450 13px/1.4 ${FONT}`, color: 'var(--fg)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {req.reference || req.templateName}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <StatusBadge status={req.state} />
                  <ExternalLink size={12} style={{ color: 'var(--fg-4)' }} />
                </span>
              </span>
              <span style={{
                display: 'block', font: `450 11px/1.5 ${FONT}`, color: 'var(--fg-3)',
                marginTop: 4, paddingLeft: 22,
              }}>
                {req.signers?.length || 0} signer(s) &middot; {new Date(req.createdAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Portalled to document.body on purpose — see the note at the top of
          this file. ds Modal is position:fixed but does not portal itself, so
          without this an ancestor transform would trap and clip it. */}
      {showModal && createPortal(
        <Modal
          open
          onClose={sending ? undefined : () => setShowModal(false)}
          size="lg"
          icon={<PenTool size={18} style={{ color: 'var(--a-sign)' }} />}
          title={modalTitle}
          sub={`Step ${step} of 2 · ${step === 1 ? 'Choose a template' : 'Add signers and send'}`}
          footer={
            step === 1 ? (
              <>
                <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
                <span style={{ flex: 1 }} />
                <Button onClick={() => setStep(2)} disabled={!selectedTemplate} iconRight={<ArrowRight size={14} />}>
                  Next
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setStep(1)} iconLeft={<ArrowLeft size={14} />}>Back</Button>
                <span style={{ flex: 1 }} />
                {/* The only control that sends. handleSend is byte-identical
                    to legacy: createRequest emails the signers. */}
                <Button
                  onClick={handleSend}
                  disabled={sending || signers.some((sg) => !sg.email)}
                  iconLeft={sending ? <Spinner size={14} /> : <Send size={14} />}
                >
                  {sending ? 'Sending…' : 'Send'}
                </Button>
              </>
            )
          }
        >
          {step === 1 && (
            <Field label="Template">
              {templates.length === 0 ? (
                <EmptyState compact icon={<FileText size={22} />} title="No templates available" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                  {templates.map((t) => {
                    const picked = selectedTemplate?._id === t._id;
                    return (
                      <button
                        key={t._id}
                        type="button"
                        aria-pressed={picked}
                        onClick={() => setSelectedTemplate(t)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                          textAlign: 'left', padding: '9px 12px', borderRadius: 'var(--r-2)',
                          background: picked ? 'var(--brand-soft)' : 'var(--surface-2)',
                          boxShadow: `inset 0 0 0 1px ${picked ? 'var(--brand-line)' : 'var(--line)'}`,
                        }}
                      >
                        <FileText size={14} style={{ color: 'var(--a-sign)', flexShrink: 0 }} />
                        <span style={{
                          font: `450 13px/1.4 ${FONT}`, color: 'var(--fg)', minWidth: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {t.name}
                        </span>
                        {picked && <CheckCircle2 size={14} style={{ color: 'var(--brand-ink)', marginLeft: 'auto', flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Signers">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {signers.map((sg, idx) => (
                    <div key={idx} style={{
                      padding: 12, borderRadius: 'var(--r-2)', background: 'var(--surface-2)',
                      boxShadow: 'inset 0 0 0 1px var(--line)',
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ font: `500 11.5px/1 ${FONT}`, color: 'var(--fg-3)' }}>Signer {idx + 1}</span>
                        {signers.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSigner(idx)}
                            title="Remove signer"
                            aria-label={`Remove signer ${idx + 1}`}
                            style={{ padding: '0 6px', color: 'var(--fg-3)' }}
                          >
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                        <Input
                          value={sg.name}
                          onChange={(e) => updateSigner(idx, 'name', e.target.value)}
                          placeholder="Name"
                          aria-label={`Signer ${idx + 1} name`}
                        />
                        <Input
                          value={sg.email}
                          onChange={(e) => updateSigner(idx, 'email', e.target.value)}
                          placeholder="Email *"
                          type="email"
                          aria-label={`Signer ${idx + 1} email`}
                        />
                      </div>
                      {roles.length > 0 && (
                        <Select
                          value={sg.roleId || ''}
                          onChange={(e) => updateSigner(idx, 'roleId', e.target.value || null)}
                          aria-label={`Signer ${idx + 1} role`}
                        >
                          <option value="">No role</option>
                          {roles.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                        </Select>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addSigner}
                  iconLeft={<Plus size={14} />}
                  style={{ alignSelf: 'flex-start', marginTop: 8, color: 'var(--brand-ink)' }}
                >
                  Add signer
                </Button>
              </Field>

              <div style={{ paddingTop: 12, boxShadow: 'inset 0 1px 0 var(--line)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="Subject (optional)" htmlFor="srw-subject">
                  <Input
                    id="srw-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={`Signature Request - ${selectedTemplate?.name || ''}`}
                  />
                </Field>
                <Field label="Message (optional)" htmlFor="srw-message">
                  <Textarea
                    id="srw-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    placeholder="Add a short note for the signer(s)…"
                  />
                </Field>
              </div>
            </div>
          )}
        </Modal>,
        document.body,
      )}
    </Panel>
  );
}
