// ============================================================================
// SignRequestsV2.jsx — Signature request list, on ds (phase 10)
// ============================================================================
// Copied from SignRequests.jsx, then edited leaf-first.
//
// The three modals (NewRequest, QuickSend, BulkSend) hold every outward-facing
// path on this page: createRequest, createEnvelopeRequest, quickSendPrepare,
// bulkSend. Their PRESENTATION is migrated here; their logic is not. In each
// one the boundary is the `return (` — everything above it (state, effects,
// validation, and every handler that talks to the API) is byte-identical to
// legacy, so "the send behaviour did not change" stays provable by diff. Each
// form control keeps its exact value/onChange binding; a dropped binding here
// would be a broken send, not a cosmetic bug.
//
// Migrated: page chrome, filters, the bulk bar, the table, pagination, and the
// three modals' markup.
// Unchanged: filters stay LOCAL state (not URL params) exactly as in legacy,
// the debounced search + fetch-sequence guard, the page-clamp guard, the
// ?create / ?quicksend / ?template deep links, the signAdmin gate on bulk
// delete, and every row action handler including cancel and remind.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import signApi from '../../utils/signApi';
import { downloadFile } from '../../utils/download';
import { API_BASE_URL } from '../../utils/config';
import {
  Loader2, Plus, FileText, Search, X,
  ChevronLeft, ChevronRight, ChevronDown,
  Bell, XCircle, Send, User, Calendar, Clock,
  ArrowRight, ArrowLeft, Check, Mail,
  MessageSquare, GripVertical, Upload, Zap, Users, Download,
  ArchiveRestore,
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatDateUTC, formatDateTime } from '../../utils/dateUtils';
import { useAuth } from '../../context/AuthContext';
import {
  BulkActionBar, Button, Chip, DataTable, EmptyState, Field, FileDrop, FilterBar,
  Input, Meter, Modal, PageHeader, Pagination, SearchInput, Select, SelectChip, Spinner, Textarea,
} from '../../components/ds';

const FONT = "'Inter', system-ui, sans-serif";

/** Icon-only row action. Ghost Button, square, with an accessible name —
 *  a `title` alone is not one. */
function RowAction({ title, tone, children, ...rest }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      title={title}
      aria-label={title}
      style={{ padding: '0 7px', color: tone === 'danger' ? 'var(--danger)' : 'var(--fg-3)' }}
      {...rest}
    >
      {children}
    </Button>
  );
}

/** One labelled line on the review step: icon, caps label, value. */
function ReviewRow({ icon: Icon, label, children, accent = false, align = 'center' }) {
  return (
    <div style={{ display: 'flex', alignItems: align, gap: 12 }}>
      <Icon
        size={16}
        style={{ color: accent ? 'var(--a-sign)' : 'var(--fg-4)', flexShrink: 0, marginTop: align === 'flex-start' ? 2 : 0 }}
      />
      <div style={{ minWidth: 0 }}>
        <p style={{
          font: `600 10.5px/1 ${FONT}`, textTransform: 'uppercase',
          letterSpacing: '.08em', color: 'var(--fg-4)',
        }}>
          {label}
        </p>
        <p style={{
          font: `${accent ? 550 : 450} 13px/1.45 ${FONT}`,
          color: accent ? 'var(--fg)' : 'var(--fg-2)', marginTop: 3,
        }}>
          {children}
        </p>
      </div>
    </div>
  );
}

/* ── Status badge helper ──────────────────────────────────────────────── */
// Same vocabulary as the legacy map, re-expressed as ds Chip tones. `expired`
// joins `in_progress` on warn: ds has no separate orange, and the two never
// appear together in one row.
const STATUS_TONES = {
  sent:        'info',
  in_progress: 'warn',
  signed:      'brand',
  cancelled:   'danger',
  expired:     'warn',
  draft:       'neutral',
  refused:     'danger',
};

const STATUS_LABELS = {
  sent: 'Sent',
  in_progress: 'In progress',
  signed: 'Signed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  draft: 'Draft',
  refused: 'Refused',
};

// Derive a virtual `in_progress` for `sent` rows where some signers have
// already completed. Keeps the badge in sync with the new "In progress"
// filter — otherwise those rows still read "Sent" which doesn't match the
// filter the user picked.
function deriveStatus(req) {
  if (req?.state === 'sent') {
    const completed = (req.signers || []).filter((s) => s.state === 'completed').length;
    if (completed > 0) return 'in_progress';
  }
  return req?.state || 'draft';
}

function StatusBadge({ status }) {
  return <Chip tone={STATUS_TONES[status] || 'neutral'}>{STATUS_LABELS[status] || status}</Chip>;
}

function SortableSignerCard({ signer, idx, totalSigners, updateSigner, removeSigner, roles }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: signer._dragId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-dark-900 rounded-xl p-4 border border-dark-700 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-dark-500 hover:text-dark-300 transition-colors touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
          <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold flex items-center justify-center">
            {idx + 1}
          </span>
          <span className="text-xs font-semibold text-dark-400 uppercase tracking-wide">
            Signer {idx + 1}
            {signer.roleName ? ` \u2014 ${signer.roleName}` : ''}
          </span>
        </div>
        {totalSigners > 1 && (
          <button
            onClick={() => removeSigner(idx)}
            className="text-dark-500 hover:text-red-400 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
            value={signer.name}
            onChange={(e) => updateSigner(idx, 'name', e.target.value)}
            placeholder="John Doe"
            className="input-field text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1">
            Email <span className="text-red-400">*</span>
          </label>
          <input
            type="email"
            required
            value={signer.email}
            onChange={(e) => updateSigner(idx, 'email', e.target.value)}
            placeholder="john@example.com"
            className="input-field text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-dark-400 mb-1">
          Role
          {roles.length > 0 && <span className="text-red-400"> *</span>}
        </label>
        <select
          value={signer.roleId || ''}
          onChange={(e) => {
            const role = roles.find((r) => (r._id || r.id) === e.target.value);
            updateSigner(idx, 'roleId', e.target.value || '');
            updateSigner(idx, 'roleName', role?.name || '');
          }}
          className="input-field text-sm"
        >
          {/* Role picks the slice of fields this signer can fill — leaving
              it unset silently sends a blank document. Force a choice when
              the template has roles defined. */}
          <option value="">{roles.length > 0 ? 'Select role' : 'Select role (optional)'}</option>
          {roles.map((r) => (
            <option key={r._id || r.id} value={r._id || r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ── New Request Modal ────────────────────────────────────────────────── */
let _signerIdCounter = 0;
const makeSignerId = () => `signer_${++_signerIdCounter}_${Date.now()}`;
const EMPTY_SIGNER = () => ({ _dragId: makeSignerId(), name: '', email: '', roleId: '', roleName: '' });

function NewRequestModal({ show, onClose, onSaved, orgSlug, preSelectedTemplateId }) {
  const { showToast } = useToast();

  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [envelopeDocs, setEnvelopeDocs] = useState([]); // For multi-doc envelope
  const [signers, setSigners] = useState([EMPTY_SIGNER()]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [validityDate, setValidityDate] = useState('');
  const [reminderDays, setReminderDays] = useState(7);
  const [ccEmails, setCcEmails] = useState('');
  const [parallelSign, setParallelSign] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEnvelope = envelopeDocs.length > 1;

  useEffect(() => {
    if (show && orgSlug) {
      setStep(1);
      setSelectedTemplate(null);
      setEnvelopeDocs([]);
      setSigners([EMPTY_SIGNER()]);
      setSubject('');
      setMessage('');
      setValidityDate('');
      setReminderDays(7);
      setCcEmails('');
      setParallelSign(false);
      setLoadingTemplates(true);
      Promise.all([
        signApi.listTemplates(orgSlug).then((res) => res.templates || []).catch(() => []),
        signApi.listRoles(orgSlug).then((res) => res.roles || []).catch(() => []),
      ]).then(async ([tmpls, rls]) => {
        setTemplates(tmpls);
        setRoles(rls);
        // Auto-select template if preSelectedTemplateId is provided. Only
        // advance to step 2 once we actually have the template object —
        // landing on step 2 with selectedTemplate null crashes at send.
        if (preSelectedTemplateId) {
          const match = tmpls.find(t => (t._id || t.id) === preSelectedTemplateId);
          if (match) {
            setSelectedTemplate(match);
            setStep(2);
          } else {
            // Not in the first page of templates — fetch it directly.
            try {
              const res = await signApi.getTemplate(orgSlug, preSelectedTemplateId);
              const tpl = res?.template || null;
              if (res?.success !== false && tpl?._id) {
                setSelectedTemplate(tpl);
                setStep(2);
              } else {
                showToast('Could not load the selected template — please pick one from the list.', 'error');
              }
            } catch {
              showToast('Could not load the selected template — please pick one from the list.', 'error');
            }
          }
        }
      }).finally(() => setLoadingTemplates(false));
    }
  }, [show, orgSlug]);

  // When template is selected, prefill signers from template's signItem roles
  useEffect(() => {
    if (selectedTemplate) {
      // Extract unique roleIds from this template's signItems
      const roleIdSet = new Set();
      (selectedTemplate.signItems || []).forEach((item) => {
        if (item.roleId) roleIdSet.add(item.roleId);
      });
      const uniqueRoleIds = [...roleIdSet];

      if (uniqueRoleIds.length > 0) {
        setSigners(uniqueRoleIds.map((rid) => {
          const role = roles.find((r) => (r._id || r.id) === rid);
          return { _dragId: makeSignerId(), name: '', email: '', roleId: rid, roleName: role?.name || 'Signer' };
        }));
      } else {
        setSigners([EMPTY_SIGNER()]);
      }
      setSubject(selectedTemplate.name ? `Please sign: ${selectedTemplate.name}` : '');
    }
  }, [selectedTemplate, roles]);

  const updateSigner = (idx, field, value) => {
    setSigners((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  // Roles to expose in the per-signer dropdown.
  //
  // When a template has fields scoped to specific roles, only those roles
  // are useful as signer assignments — picking a role the template doesn't
  // reference would silently leave that signer with nothing to fill out.
  // Fall back to the full org roles list when the template has no role
  // assignments yet (e.g. quick-send / brand-new template) so the dropdown
  // still has options to choose from.
  const templateRoleIds = selectedTemplate
    ? [...new Set((selectedTemplate.signItems || []).map((it) => it.roleId).filter(Boolean))]
    : [];
  const selectableRoles = templateRoleIds.length > 0
    ? roles.filter((r) => templateRoleIds.includes(r._id || r.id))
    : roles;

  const addSigner = () => {
    setSigners((prev) => [...prev, EMPTY_SIGNER()]);
  };

  // dnd-kit sensors — require 8px drag before activating (prevents accidental drags)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSigners((prev) => {
      const oldIdx = prev.findIndex((s) => s._dragId === active.id);
      const newIdx = prev.findIndex((s) => s._dragId === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(oldIdx, 1);
      updated.splice(newIdx, 0, moved);
      return updated;
    });
  };

  const removeSigner = (idx) => {
    if (signers.length <= 1) return;
    setSigners((prev) => prev.filter((_, i) => i !== idx));
  };

  const canGoNext = () => {
    if (step === 1) return isEnvelope ? envelopeDocs.length >= 2 : !!selectedTemplate;
    if (step === 2) {
      // Require role assignment when the selected template defines roles —
      // an unassigned signer has no fields to fill and silently receives a
      // blank document.
      const requireRole = selectableRoles.length > 0;
      return signers.every((s) =>
        s.name.trim() &&
        s.email.trim() &&
        (!requireRole || !!s.roleId),
      );
    }
    if (step === 3) return true;
    return true;
  };

  const addToEnvelope = (tmpl) => {
    if (!envelopeDocs.find(d => d._id === tmpl._id)) {
      setEnvelopeDocs(prev => [...prev, tmpl]);
    }
  };
  const removeFromEnvelope = (id) => {
    setEnvelopeDocs(prev => prev.filter(d => d._id !== id));
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);
      const signerData = signers.map((s) => ({
        name: s.name.trim(),
        email: s.email.trim(),
        roleId: s.roleId || undefined,
        roleName: s.roleName || undefined,
      }));
      const commonData = {
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
        validity: validityDate || undefined,
        // Send 0 explicitly — the backend honors 0 as "no reminders";
        // omitting the field would fall back to the server default cadence.
        reminderDays: Number(reminderDays) >= 0 ? Number(reminderDays) : undefined,
        ccEmails: ccEmails.split(',').map((e) => e.trim()).filter(Boolean),
        parallel: parallelSign,
      };

      let res;
      if (isEnvelope) {
        res = await signApi.createEnvelopeRequest(orgSlug, {
          ...commonData,
          documents: envelopeDocs.map(d => ({ templateId: d._id })),
          signers: signerData,
          reference: envelopeDocs.map(d => d.name).join(' + '),
        });
      } else {
        res = await signApi.createRequest(orgSlug, {
          ...commonData,
          templateId: selectedTemplate._id,
          signers: signerData,
        });
      }

      if (res.success !== false) {
        showToast(isEnvelope ? 'Envelope sent for signature' : 'Signature request created and sent');
        onSaved();
        onClose();
      } else {
        showToast(res.message || 'Failed to create request', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to create request', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  const stepLabels = ['Select Template', 'Add Signers', 'Options', 'Review & Send'];

  return (
    <Modal
      open={show}
      onClose={saving ? undefined : onClose}
      size="lg"
      title="New Signature Request"
      footer={
        <>
          {step > 1 && (
            <Button variant="secondary" onClick={() => setStep((s) => s - 1)} iconLeft={<ArrowLeft size={14} />}>
              Back
            </Button>
          )}
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {step < 4 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canGoNext()} iconRight={<ArrowRight size={14} />}>
              Next
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={saving}
              iconLeft={saving ? <Spinner size={14} /> : <Send size={14} />}
            >
              Send Request
            </Button>
          )}
        </>
      }
    >
      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        {stepLabels.map((label, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === step;
          const isDone = stepNum < step;
          return (
            <div key={stepNum} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <span
                style={{
                  width: 26, height: 26, flexShrink: 0, display: 'grid', placeItems: 'center',
                  borderRadius: '50%', font: `700 11px/1 ${FONT}`,
                  // The active pip was white on indigo-500 — 4.07 against a
                  // 4.5 floor, and indigo is not a colour the bridge remaps.
                  // --brand-fg on --brand is the ds pairing built for this.
                  background: isActive ? 'var(--brand)' : isDone ? 'var(--brand-soft)' : 'var(--surface-3)',
                  color: isActive ? 'var(--brand-fg)' : isDone ? 'var(--brand-ink)' : 'var(--fg-4)',
                }}
              >
                {isDone ? <Check size={12} /> : stepNum}
              </span>
              <span
                style={{
                  font: `550 11.5px/1.3 ${FONT}`,
                  color: isActive ? 'var(--fg)' : 'var(--fg-4)',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
              {i < stepLabels.length - 1 && (
                <span style={{ flex: 1, height: 1, background: 'var(--line-2)', minWidth: 8 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Select Template */}
      {step === 1 && (
        <Field label="Choose a template" required>
          {loadingTemplates ? (
            <div style={{ display: 'grid', placeItems: 'center', padding: 32 }}><Spinner /></div>
          ) : templates.length === 0 ? (
            <EmptyState compact icon={<FileText size={22} />} title="No templates available">
              Upload a template first.
            </EmptyState>
          ) : (
            <>
              {/* Envelope docs list */}
              {envelopeDocs.length > 0 && (
                <div style={{
                  marginBottom: 12, padding: 12, borderRadius: 'var(--r-2)',
                  background: 'var(--brand-soft)',
                  boxShadow: 'inset 0 0 0 1px var(--brand-line)',
                }}>
                  <p style={{ font: `600 11px/1 ${FONT}`, color: 'var(--brand-ink)', marginBottom: 8 }}>
                    Envelope ({envelopeDocs.length} documents)
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {envelopeDocs.map((d, idx) => (
                      <div key={d._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ font: `450 13px/1.4 ${FONT}`, color: 'var(--fg-2)' }}>{idx + 1}. {d.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromEnvelope(d._id)}
                          aria-label={`Remove ${d.name} from envelope`}
                          style={{ padding: '0 6px', color: 'var(--fg-3)' }}
                        >
                          <X size={12} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {templates.map((tpl) => {
                  const inEnvelope = envelopeDocs.some((d) => d._id === tpl._id);
                  const picked = selectedTemplate?._id === tpl._id || inEnvelope;
                  return (
                    <button
                      key={tpl._id}
                      type="button"
                      aria-pressed={picked}
                      onClick={() => {
                        if (isEnvelope || envelopeDocs.length > 0) {
                          if (!inEnvelope) addToEnvelope(tpl);
                        } else {
                          setSelectedTemplate(tpl);
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                        textAlign: 'left', padding: 14, borderRadius: 'var(--r-3)',
                        background: picked ? 'var(--brand-soft)' : 'var(--surface-2)',
                        boxShadow: `inset 0 0 0 1px ${picked ? 'var(--brand-line)' : 'var(--line)'}`,
                        transition: 'background 120ms var(--e-out), box-shadow 180ms var(--e-out)',
                      }}
                    >
                      <span style={{
                        width: 38, height: 38, flexShrink: 0, display: 'grid', placeItems: 'center',
                        borderRadius: 'var(--r-2)', background: 'color-mix(in srgb, var(--a-sign) 14%, transparent)',
                      }}>
                        <FileText size={17} style={{ color: 'var(--a-sign)' }} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'block', font: `550 13.5px/1.4 ${FONT}`, color: 'var(--fg)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {tpl.name}
                        </span>
                        <span style={{ display: 'block', font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)', marginTop: 2 }}>
                          {tpl.numPages || tpl.pageCount || tpl.pages || 0} pages
                          {tpl.signItems?.length ? ` • ${tpl.signItems.length} fields` : ''}
                        </span>
                      </span>
                      {picked && <Check size={17} style={{ color: 'var(--brand-ink)', flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>

              {/* Add document to envelope */}
              {selectedTemplate && !isEnvelope && envelopeDocs.length === 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { addToEnvelope(selectedTemplate); setSelectedTemplate(null); }}
                  iconLeft={<Plus size={12} />}
                  style={{ marginTop: 8, alignSelf: 'flex-start', color: 'var(--brand-ink)' }}
                >
                  Add another document (create envelope)
                </Button>
              )}
            </>
          )}
        </Field>
      )}

      {/* Step 2: Add Signers (drag to reorder) */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-3)' }}>
            {parallelSign
              ? 'Add signers. Everyone will receive the email at the same time and can sign in any order.'
              : 'Add signers and drag to reorder. They will sign in this order.'}
          </p>
          {signers.length > 1 && (
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px',
              borderRadius: 'var(--r-2)', background: 'var(--surface-2)',
              boxShadow: 'inset 0 0 0 1px var(--line)', cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={parallelSign}
                onChange={(e) => setParallelSign(e.target.checked)}
                style={{ marginTop: 2, width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer' }}
              />
              <span>
                <span style={{ display: 'block', font: `550 12.5px/1.4 ${FONT}`, color: 'var(--fg)' }}>
                  Send to everyone at once (parallel)
                </span>
                <span style={{ display: 'block', font: `450 11.5px/1.5 ${FONT}`, color: 'var(--fg-3)', marginTop: 2 }}>
                  Off = sequential — each signer is emailed only after the previous one finishes.
                </span>
              </span>
            </label>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={signers.map((s) => s._dragId)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
                {signers.map((signer, idx) => (
                  <SortableSignerCard
                    key={signer._dragId}
                    signer={signer}
                    idx={idx}
                    totalSigners={signers.length}
                    updateSigner={updateSigner}
                    removeSigner={removeSigner}
                    roles={selectableRoles}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <Button
            variant="ghost"
            size="sm"
            onClick={addSigner}
            iconLeft={<Plus size={14} />}
            style={{ alignSelf: 'flex-start', color: 'var(--brand-ink)' }}
          >
            Add another signer
          </Button>
        </div>
      )}

      {/* Step 3: Options */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Subject" htmlFor="srq-subject">
            <Input
              id="srq-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Please sign: NDA Agreement"
            />
          </Field>
          <Field label="Message" htmlFor="srq-message">
            <Textarea
              id="srq-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional message to include in the signing email…"
              rows={3}
              style={{ resize: 'none' }}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Field label="Validity Date" htmlFor="srq-validity">
              <Input
                id="srq-validity"
                type="date"
                value={validityDate}
                onChange={(e) => setValidityDate(e.target.value)}
              />
            </Field>
            <Field label="Remind every" htmlFor="srq-reminder">
              <Select
                id="srq-reminder"
                value={reminderDays}
                onChange={(e) => setReminderDays(Number(e.target.value))}
              >
                <option value={1}>Daily</option>
                <option value={2}>Every 2 days</option>
                <option value={3}>Every 3 days</option>
                <option value={7}>Weekly (default)</option>
                <option value={14}>Every 2 weeks</option>
                <option value={0}>No reminders</option>
              </Select>
            </Field>
          </div>
          <Field label="CC Emails" htmlFor="srq-cc">
            <Input
              id="srq-cc"
              type="text"
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="comma separated emails"
            />
          </Field>
        </div>
      )}

      {/* Step 4: Review & Send */}
      {step === 4 && (
        <div style={{
          padding: 18, borderRadius: 'var(--r-3)', background: 'var(--surface-2)',
          boxShadow: 'inset 0 0 0 1px var(--line)',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <ReviewRow icon={FileText} label="Template" accent>
            {selectedTemplate?.name || 'None'}
          </ReviewRow>

          {subject && <ReviewRow icon={Mail} label="Subject">{subject}</ReviewRow>}

          {message && (
            <ReviewRow icon={MessageSquare} label="Message" align="flex-start">
              <span style={{ whiteSpace: 'pre-wrap' }}>{message}</span>
            </ReviewRow>
          )}

          {/* Validity — formatted as "9 May 2026" to match the detail page,
              rather than leaking the ISO yyyy-mm-dd the input stores. */}
          {validityDate && (
            <ReviewRow icon={Calendar} label="Valid Until">
              {formatDateUTC(validityDate) || validityDate}
            </ReviewRow>
          )}

          <ReviewRow icon={Clock} label="Reminders">
            {reminderDays === 0
              ? 'No reminders'
              : reminderDays === 1
                ? 'Every day until signed'
                : `Every ${reminderDays} days until signed`}
          </ReviewRow>

          <div>
            <p style={{
              font: `600 10.5px/1 ${FONT}`, textTransform: 'uppercase',
              letterSpacing: '.08em', color: 'var(--fg-4)', marginBottom: 8,
            }}>
              Signing Order ({signers.length} {signers.length === 1 ? 'signer' : 'signers'})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {signers.map((sg, i) => (
                <div key={sg._dragId || i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                  borderRadius: 'var(--r-2)', background: 'var(--surface-3)',
                }}>
                  {/* Solid accent, not accent-on-its-own-tint: over surface-3
                      that pairing measured 3.95 against a 4.5 floor. The
                      numeral is the signing order, so it has to be readable. */}
                  <span style={{
                    width: 24, height: 24, flexShrink: 0, display: 'grid', placeItems: 'center',
                    borderRadius: '50%', background: 'var(--a-sign)',
                    font: `700 11px/1 ${FONT}`, color: 'var(--bg)',
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block', font: `550 13px/1.35 ${FONT}`, color: 'var(--fg)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {sg.name}
                    </span>
                    <span style={{
                      display: 'block', font: `450 11.5px/1.35 ${FONT}`, color: 'var(--fg-3)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {sg.email}
                    </span>
                  </span>
                  {sg.roleName && <Chip>{sg.roleName}</Chip>}
                </div>
              ))}
            </div>
          </div>

          {ccEmails && (
            <div>
              <p style={{
                font: `600 10.5px/1 ${FONT}`, textTransform: 'uppercase',
                letterSpacing: '.08em', color: 'var(--fg-4)', marginBottom: 4,
              }}>
                CC
              </p>
              <p style={{ font: `450 13px/1.4 ${FONT}`, color: 'var(--fg-2)' }}>{ccEmails}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ── Quick Send Modal ─────────────────────────────────────────────────── */
function QuickSendModal({ show, onClose, onSaved, orgSlug }) {
  const { showToast } = useToast();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=upload, 2=signers
  const [file, setFile] = useState(null);
  const [reference, setReference] = useState('');
  const [signers, setSigners] = useState([{ name: '', email: '' }]);
  const [preparing, setPreparing] = useState(false);
  const [qsParallel, setQsParallel] = useState(false);

  const reset = () => { setStep(1); setFile(null); setReference(''); setSigners([{ name: '', email: '' }]); setQsParallel(false); };

  // Soft close — preserve the draft (file, reference, signers) so re-opening
  // the modal lands the user back where they were. Reset only happens after
  // a successful prepare or when the user explicitly clicks Discard.
  const hasDraft = !!file || reference.trim().length > 0 || signers.some(s => s.name?.trim() || s.email?.trim());

  const handleFile = (e) => {
    const f = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    // Reset the input so picking the same file again (after removing it or a
    // validation reject) still fires onChange.
    if (e.target?.files) e.target.value = '';
    if (!f) return;
    const type = (f.type || '').toLowerCase();
    const lname = (f.name || '').toLowerCase();
    const isPdf = type === 'application/pdf' || lname.endsWith('.pdf');
    const isImg = type === 'image/png' || type === 'image/jpeg' ||
      lname.endsWith('.png') || lname.endsWith('.jpg') || lname.endsWith('.jpeg');
    const isDoc = type === 'application/msword' ||
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lname.endsWith('.doc') || lname.endsWith('.docx');
    if (isDoc) {
      showToast('Word docs aren\'t supported yet — save as PDF first.', 'error');
      return;
    }
    if (!isPdf && !isImg) {
      showToast('Upload a PDF, PNG, or JPG.', 'error');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      showToast('File is over 10 MB. Please compress and try again.', 'error');
      return;
    }
    setFile(f);
    if (!reference) {
      const cleaned = f.name
        .replace(/\.(pdf|png|jpe?g)$/i, '')
        .replace(/\s*\(\d+\)\s*$/, '')
        .replace(/_+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      setReference(cleaned);
    }
  };

  const addSigner = () => setSigners(prev => [...prev, { name: '', email: '' }]);
  const removeSigner = (idx) => setSigners(prev => prev.filter((_, i) => i !== idx));
  const updateSigner = (idx, field, val) => setSigners(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));

  const handlePrepare = async () => {
    if (!file) return;
    // Per-signer validation: name + email required, email must look valid.
    // Server only checks for presence and Resend rejects malformed addresses
    // with a cryptic 422; doing it here gives the user a clear inline error.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (let i = 0; i < signers.length; i++) {
      const s = signers[i];
      if (!s.name || !s.name.trim()) {
        showToast(`Signer ${i + 1}: name is required.`, 'error');
        return;
      }
      if (!s.email || !s.email.trim()) {
        showToast(`Signer ${i + 1}: email is required.`, 'error');
        return;
      }
      if (!emailRegex.test(s.email.trim())) {
        showToast(`Signer ${i + 1}: "${s.email}" doesn't look like a valid email.`, 'error');
        return;
      }
    }
    setPreparing(true);
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      fd.append('reference', reference);
      fd.append('signers', JSON.stringify(signers.map((s, i) => ({
        ...s,
        roleName: `Signer ${i + 1}`,
      }))));
      const res = await signApi.quickSendPrepare(orgSlug, fd);
      if (res.success && res.template) {
        const templateId = res.template._id;
        const signerData = encodeURIComponent(JSON.stringify(res.signers || []));
        reset();
        onClose();
        const parallelParam = qsParallel ? '&parallel=true' : '';
        navigate(orgPath(`/sign/templates/${templateId}/edit?quickSend=true&signers=${signerData}${parallelParam}`));
      } else {
        showToast(res.error || 'Failed to prepare document', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to prepare document', 'error');
    } finally {
      setPreparing(false);
    }
  };

  if (!show) return null;

  return (
    <Modal
      open={show}
      onClose={preparing ? undefined : () => onClose()}
      size="md"
      icon={<Zap size={18} style={{ color: 'var(--warn)' }} />}
      tone="warn"
      title="Quick Send"
      footer={
        step === 1 ? (
          <>
            {hasDraft && (
              <Button
                variant="ghost"
                size="sm"
                title="Throw away the current draft and start over"
                onClick={() => {
                  if (window.confirm('Discard the file and signer details you entered?')) reset();
                }}
                style={{ color: 'var(--danger)' }}
              >
                Discard
              </Button>
            )}
            <span style={{ flex: 1 }} />
            <Button
              onClick={() => setStep(2)}
              disabled={!file}
              title={!file ? 'Upload a file first.' : ''}
              iconRight={<ArrowRight size={14} />}
            >
              Next
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep(1)} iconLeft={<ArrowLeft size={14} />}>Back</Button>
            <span style={{ flex: 1 }} />
            <Button
              onClick={handlePrepare}
              disabled={preparing || signers.some((sg) => !sg.email?.trim() || !sg.name?.trim())}
              title={signers.some((sg) => !sg.email?.trim() || !sg.name?.trim()) ? 'Each signer needs a name and email.' : ''}
              iconLeft={preparing ? <Spinner size={14} /> : undefined}
              iconRight={preparing ? undefined : <ArrowRight size={14} />}
            >
              {preparing ? 'Preparing…' : 'Continue to Editor'}
            </Button>
          </>
        )
      }
    >
      {/* Step 1: Upload */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* handleFile takes the raw event and reads e.dataTransfer or
              e.target itself, so FileDrop's chosen File is handed back in the
              shape it expects rather than being re-plumbed. */}
          <FileDrop
            filled={!!file}
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            aria-label="Choose a PDF, PNG or JPG to send"
            onSelect={(picked) => handleFile({ target: { files: [picked] } })}
          >
            {file ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <FileText size={22} style={{ color: 'var(--brand)' }} />
                <div style={{ textAlign: 'left' }}>
                  <p style={{ font: `550 13px/1.4 ${FONT}`, color: 'var(--fg)' }}>{file.name}</p>
                  <p style={{ font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)' }}>
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove file"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  style={{ padding: '0 6px', color: 'var(--danger)' }}
                >
                  <X size={14} />
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Upload size={28} style={{ color: 'var(--fg-4)' }} />
                <p style={{ font: `550 13px/1.4 ${FONT}`, color: 'var(--fg-2)' }}>
                  Drop a file here or click to upload
                </p>
                <p style={{ font: `450 11.5px/1 ${FONT}`, color: 'var(--fg-3)' }}>
                  PDF, PNG, or JPG &middot; up to 10 MB
                </p>
              </div>
            )}
          </FileDrop>

          <Field label="Document Name" htmlFor="qs-reference">
            <Input
              id="qs-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. NDA Agreement"
            />
          </Field>
        </div>
      )}

      {/* Step 2: Signers */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-3)' }}>
            Add people who need to sign this document. Signer 1 signs first, then Signer 2, and so on.
            Next you&rsquo;ll drop signature / text fields onto the document in the editor before it actually sends.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                      aria-label={`Remove signer ${idx + 1}`}
                      onClick={() => removeSigner(idx)}
                      style={{ padding: '0 6px', color: 'var(--fg-3)' }}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
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
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={addSigner}
            iconLeft={<Plus size={14} />}
            style={{ alignSelf: 'flex-start', color: 'var(--brand-ink)' }}
          >
            Add Signer
          </Button>

          {/* Sequential vs parallel — only meaningful with 2+ signers. Off =
              sequential (default). Carries through to the editor and from
              there to POST /sign/requests via URL query param. */}
          {signers.length > 1 && (
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px',
              borderRadius: 'var(--r-2)', background: 'var(--surface-2)',
              boxShadow: 'inset 0 0 0 1px var(--line)', cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={qsParallel}
                onChange={(e) => setQsParallel(e.target.checked)}
                style={{ marginTop: 2, width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer' }}
              />
              <span>
                <span style={{ display: 'block', font: `550 12.5px/1.4 ${FONT}`, color: 'var(--fg)' }}>
                  Send to everyone at once
                </span>
                <span style={{ display: 'block', font: `450 11.5px/1.5 ${FONT}`, color: 'var(--fg-3)', marginTop: 2 }}>
                  {qsParallel
                    ? 'All signers get the email immediately and can sign in any order.'
                    : 'Sequential — each signer is emailed only after the previous one finishes.'}
                </span>
              </span>
            </label>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ── Bulk Send Modal ──────────────────────────────────────────────────── */
function BulkSendModal({ show, onClose, onSaved, orgSlug }) {
  const { showToast } = useToast();
  const [step, setStep] = useState(1); // 1=template, 2=csv, 3=preview, 4=options, 5=send
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewErrors, setPreviewErrors] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [validity, setValidity] = useState('');
  const [bulkReminderDays, setBulkReminderDays] = useState(7);
  const [bulkCcEmails, setBulkCcEmails] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

  useEffect(() => {
    if (show && orgSlug) {
      signApi.listTemplates(orgSlug).then(res => { if (res.templates) setTemplates(res.templates); }).catch(() => {});
    }
  }, [show, orgSlug]);

  const reset = () => {
    setStep(1); setSelectedTemplate(null); setCsvFile(null); setPreviewRows([]);
    setPreviewErrors([]); setSubject(''); setMessage(''); setValidity('');
    setBulkReminderDays(7); setBulkCcEmails(''); setSendResult(null);
    setTemplateSearch('');
  };

  // Tiny built-in CSV so users have a known-good starting point. Held as a
  // data: URL so the download button works without a server round-trip.
  const sampleCsvHref = (() => {
    const csv = [
      'name,email,phone,company',
      'Alice Example,alice@example.com,+1 555 0100,Acme Inc',
      'Bob Sample,bob@example.com,,',
    ].join('\n');
    return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  })();

  const filteredTemplates = templates.filter((t) =>
    !templateSearch.trim() || (t.name || '').toLowerCase().includes(templateSearch.trim().toLowerCase())
  );

  // Shared by the file input's onChange and the dropzone's onDrop so both
  // paths validate identically.
  const handleCsvFile = (f) => {
    if (!f) return;
    const lname = (f.name || '').toLowerCase();
    if (!lname.endsWith('.csv') && f.type !== 'text/csv') {
      showToast('Bulk send needs a .csv file (you uploaded ' + (f.type || 'an unknown type') + ').', 'error');
      return;
    }
    setCsvFile(f);
  };

  const handlePreview = async () => {
    if (!csvFile) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('csv', csvFile);
      fd.append('templateId', selectedTemplate._id);
      const res = await signApi.bulkSendPreview(orgSlug, fd);
      if (res.success !== false) {
        setPreviewRows(res.rows || []);
        setPreviewErrors(res.errors || []);
        setStep(3);
      } else {
        showToast(res.error || 'Failed to parse CSV', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to parse CSV', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkSend = async () => {
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('csv', csvFile);
      fd.append('templateId', selectedTemplate._id);
      fd.append('subject', subject || `Signature Request - ${selectedTemplate.name}`);
      if (message) fd.append('message', message);
      if (validity) fd.append('validity', validity);
      if (Number(bulkReminderDays) >= 0) fd.append('reminderDays', String(bulkReminderDays));
      const ccList = bulkCcEmails.split(',').map((e) => e.trim()).filter(Boolean);
      if (ccList.length > 0) fd.append('ccEmails', JSON.stringify(ccList));
      const res = await signApi.bulkSend(orgSlug, fd);
      if (res.success !== false) {
        setSendResult(res);
        setStep(5);
        onSaved?.();
      } else {
        showToast(res.error || 'Failed', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed', 'error');
    } finally {
      setSending(false);
    }
  };

  if (!show) return null;

  const bulkFooter = {
    1: (
      <>
        <span style={{ flex: 1 }} />
        <Button onClick={() => setStep(2)} disabled={!selectedTemplate} iconRight={<ArrowRight size={14} />}>Next</Button>
      </>
    ),
    2: (
      <>
        <Button variant="secondary" onClick={() => setStep(1)} iconLeft={<ArrowLeft size={14} />}>Back</Button>
        <span style={{ flex: 1 }} />
        <Button
          onClick={handlePreview}
          disabled={!csvFile || loading}
          iconLeft={loading ? <Spinner size={14} /> : undefined}
          iconRight={loading ? undefined : <ArrowRight size={14} />}
        >
          {loading ? 'Parsing…' : 'Preview'}
        </Button>
      </>
    ),
    3: (
      <>
        <Button variant="secondary" onClick={() => setStep(2)} iconLeft={<ArrowLeft size={14} />}>Back</Button>
        <span style={{ flex: 1 }} />
        <Button onClick={() => setStep(4)} iconRight={<ArrowRight size={14} />}>Next</Button>
      </>
    ),
    4: (
      <>
        <Button variant="secondary" onClick={() => setStep(3)} iconLeft={<ArrowLeft size={14} />}>Back</Button>
        <span style={{ flex: 1 }} />
        <Button
          onClick={handleBulkSend}
          disabled={sending}
          iconLeft={sending ? <Spinner size={14} /> : <Send size={14} />}
        >
          {sending ? 'Sending…' : `Send ${previewRows.length} Requests`}
        </Button>
      </>
    ),
    5: (
      <>
        <span style={{ flex: 1 }} />
        <Button onClick={() => { reset(); onClose(); }}>Done</Button>
      </>
    ),
  }[step];

  return (
    <Modal
      open={show}
      onClose={sending ? undefined : () => { reset(); onClose(); }}
      size="lg"
      icon={<Users size={18} style={{ color: 'var(--info)' }} />}
      tone="info"
      title="Bulk Send"
      footer={bulkFooter}
    >
      {/* Step 1: Select Template */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-3)' }}>
            Choose a template to send to multiple recipients.
          </p>
          <SearchInput
            value={templateSearch}
            onChange={setTemplateSearch}
            placeholder="Search templates…"
            aria-label="Search templates"
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
            {filteredTemplates.length === 0 ? (
              <p style={{ font: `450 12px/1.5 ${FONT}`, color: 'var(--fg-3)', textAlign: 'center', padding: '16px 0' }}>
                {templateSearch ? 'No templates match that search.' : 'No templates yet.'}
              </p>
            ) : (
              filteredTemplates.map((t) => {
                const picked = selectedTemplate?._id === t._id;
                return (
                  <button
                    key={t._id}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => setSelectedTemplate(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      textAlign: 'left', padding: 12, borderRadius: 'var(--r-2)',
                      background: picked ? 'var(--brand-soft)' : 'var(--surface-2)',
                      boxShadow: `inset 0 0 0 1px ${picked ? 'var(--brand-line)' : 'var(--line)'}`,
                    }}
                  >
                    <FileText size={16} style={{ color: 'var(--a-sign)', flexShrink: 0 }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{
                        display: 'block', font: `550 13px/1.4 ${FONT}`, color: 'var(--fg)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {t.name}
                      </span>
                      <span style={{ display: 'block', font: `450 11.5px/1.4 ${FONT}`, color: 'var(--fg-3)' }}>
                        {t.numPages || 1} page(s) &middot; {(t.signItems || []).length} field(s)
                      </span>
                    </span>
                    {picked && <Check size={16} style={{ color: 'var(--brand-ink)', flexShrink: 0, marginLeft: 'auto' }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Step 2: Upload CSV */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-3)' }}>
            Upload a CSV with columns: <strong style={{ color: 'var(--fg-2)' }}>name, email</strong> (required),
            phone, company (optional).{' '}
            <a
              href={sampleCsvHref}
              download="rivvra-bulk-send-sample.csv"
              style={{ color: 'var(--brand-ink)', textDecoration: 'underline' }}
            >
              Download sample
            </a>
          </p>
          <FileDrop
            filled={!!csvFile}
            accept=".csv,text/csv"
            aria-label="Choose a CSV of recipients"
            onSelect={handleCsvFile}
          >
            {csvFile ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <FileText size={19} style={{ color: 'var(--brand)' }} />
                <span style={{ font: `500 13px/1.4 ${FONT}`, color: 'var(--fg)' }}>{csvFile.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove CSV"
                  onClick={(e) => { e.stopPropagation(); setCsvFile(null); }}
                  style={{ padding: '0 6px', color: 'var(--danger)' }}
                >
                  <X size={14} />
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Upload size={26} style={{ color: 'var(--fg-4)' }} />
                <p style={{ font: `450 13px/1.4 ${FONT}`, color: 'var(--fg-2)' }}>Drop CSV here or click to upload</p>
              </div>
            )}
          </FileDrop>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ font: `450 13px/1.5 ${FONT}`, color: 'var(--fg-3)' }}>
            {previewRows.length} valid recipients found.
          </p>
          {previewErrors.length > 0 && (
            <div style={{
              padding: 12, borderRadius: 'var(--r-2)', background: 'var(--danger-soft)',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--danger) 30%, transparent)',
            }}>
              <p style={{ font: `600 11.5px/1.4 ${FONT}`, color: 'var(--danger)', marginBottom: 4 }}>
                {previewErrors.length} error(s):
              </p>
              {previewErrors.slice(0, 5).map((e, i) => (
                <p key={i} style={{ font: `450 11.5px/1.5 ${FONT}`, color: 'var(--fg-2)' }}>{e}</p>
              ))}
            </div>
          )}
          <div style={{ maxHeight: 220, overflow: 'auto' }}>
            <DataTable
              resizable={false}
              density="compact"
              columns={[
                { key: 'name', header: 'Name', width: 150 },
                { key: 'email', header: 'Email', width: 200 },
                { key: 'phone', header: 'Phone', width: 120, muted: true },
                { key: 'company', header: 'Company', width: 140, muted: true },
              ]}
              rows={previewRows.slice(0, 20)}
              rowKey={(r, i) => `${r.email || 'row'}-${i}`}
            />
            {previewRows.length > 20 && (
              <p style={{ font: `450 11.5px/1.5 ${FONT}`, color: 'var(--fg-3)', textAlign: 'center', marginTop: 8 }}>
                …and {previewRows.length - 20} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Options */}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Subject" htmlFor="bs-subject">
            <Input
              id="bs-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`Signature Request - ${selectedTemplate?.name}`}
            />
          </Field>
          <Field label="Message (optional)" htmlFor="bs-message">
            <Textarea
              id="bs-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Add a message…"
              style={{ resize: 'none' }}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Field label="Valid Until (optional)" htmlFor="bs-validity">
              <Input id="bs-validity" type="date" value={validity} onChange={(e) => setValidity(e.target.value)} />
            </Field>
            <Field label="Remind every" htmlFor="bs-reminder">
              <Select
                id="bs-reminder"
                value={bulkReminderDays}
                onChange={(e) => setBulkReminderDays(Number(e.target.value))}
              >
                <option value={1}>Daily</option>
                <option value={2}>Every 2 days</option>
                <option value={3}>Every 3 days</option>
                <option value={7}>Weekly (default)</option>
                <option value={14}>Every 2 weeks</option>
                <option value={0}>No reminders</option>
              </Select>
            </Field>
          </div>
          <Field label="CC Emails (optional)" htmlFor="bs-cc">
            <Input
              id="bs-cc"
              type="text"
              value={bulkCcEmails}
              onChange={(e) => setBulkCcEmails(e.target.value)}
              placeholder="comma separated emails — applied to every request"
            />
          </Field>
        </div>
      )}

      {/* Step 5: Result */}
      {step === 5 && sendResult && (
        <EmptyState
          compact
          tone="brand"
          icon={<Check size={22} />}
          title="Bulk Send Complete"
        >
          {sendResult.created} request(s) created
          {sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ''}.
        </EmptyState>
      )}
    </Modal>
  );
}

/* ── Main SignRequests Component ───────────────────────────────────────── */
export default function SignRequestsV2() {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const orgSlug = currentOrg?.slug;
  // Same app-role gate SignConfig uses — destructive bulk actions are
  // admin-only on the backend, so don't show them to members at all.
  const isAdmin = getAppRole('sign') === 'admin';

  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  // Dropdown data
  const [templates, setTemplates] = useState([]);
  const [tags, setTags] = useState([]);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showQuickSend, setShowQuickSend] = useState(false);
  const [showBulkSend, setShowBulkSend] = useState(false);
  const [preSelectedTemplateId, setPreSelectedTemplateId] = useState(null);

  // Action loading
  const [cancellingId, setCancellingId] = useState(null);
  const [remindingId, setRemindingId] = useState(null);
  const [unarchivingId, setUnarchivingId] = useState(null);

  // Bulk selection — Set of request IDs ticked on the current page. Cleared
  // on filter change, page change, and after a successful bulk action so
  // checkboxes never carry over a stale selection that the user can't see.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const debounceRef = useRef(null);
  // searchRef carries the latest search value into the otherwise-stable
  // fetchRequests callback. Keeping `search` out of fetchRequests' deps
  // means typing doesn't re-fire the useEffect-driven fetch on every
  // keystroke (the debounce is the sole path to fetch on search change).
  const searchRef = useRef('');
  useEffect(() => { searchRef.current = search; }, [search]);
  // Track in-flight fetch sequence to discard stale responses if a newer
  // fetch overtakes an older slow one.
  const fetchSeqRef = useRef(0);

  // Check if ?create=true or ?quicksend=true in URL
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowModal(true);
      searchParams.delete('create');
      setSearchParams(searchParams, { replace: true });
    }
    if (searchParams.get('quicksend') === 'true') {
      setShowQuickSend(true);
      searchParams.delete('quicksend');
      setSearchParams(searchParams, { replace: true });
    }
    if (searchParams.get('template')) {
      setPreSelectedTemplateId(searchParams.get('template'));
      setShowModal(true);
      searchParams.delete('template');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const activeFilterCount = [statusFilter, templateFilter, tagFilter].filter(Boolean).length;

  // Clamp page when filters shrink the result set, otherwise the table
  // goes blank because we're sitting on a page index that no longer
  // exists. Mirrors the guard in AtsApplications.jsx:341.
  useEffect(() => {
    if (!loading && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [loading, totalPages, page]);

  // ── Fetch requests ─────────────────────────────────────────────────────
  // Don't clear `requests`/`total` on fetch start — the previous data stays
  // visible while we load, so changing a filter doesn't flash the table to
  // empty. The render below switches to a top-bar progress indicator while
  // loading instead of replacing the entire table with a spinner.
  const fetchRequests = useCallback(async (params = {}) => {
    if (!orgSlug) return;
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      // Sort is URL-driven via SortableHeader. Fall back to server default
      // (newest first by createdAt) when no column is selected.
      const sort = searchParams.get('sort') || '';
      const dir = searchParams.get('dir') || '';
      // 'archived' is a virtual status option: it doesn't map to a DB state,
      // it flips the archived flag the backend filters on (default view
      // excludes archived rows entirely).
      const status = params.status !== undefined ? params.status : statusFilter;
      const isArchivedView = status === 'archived';
      const res = await signApi.listRequests(orgSlug, {
        page: params.page || page,
        limit: 20,
        search: params.search !== undefined ? params.search : searchRef.current,
        state: isArchivedView ? '' : status,
        templateId: params.templateId !== undefined ? params.templateId : templateFilter,
        tagId: params.tagId !== undefined ? params.tagId : tagFilter,
        ...(isArchivedView && { archived: '1' }),
        ...(sort && { sort, dir: dir || 'asc' }),
      });
      // Discard stale responses if a newer fetch has been kicked off.
      if (seq !== fetchSeqRef.current) return;
      if (res.success !== false) {
        setRequests(res.requests || []);
        setTotal(res.total || 0);
        setTotalPages(res.pages || res.totalPages || 1);
      }
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      console.error('Failed to load requests:', err);
      showToast('Failed to load requests', 'error');
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, page, statusFilter, templateFilter, tagFilter, showToast, currentCompany?._id, searchParams.get('sort'), searchParams.get('dir')]);

  const fetchTemplates = useCallback(async () => {
    if (!orgSlug) return;
    setTemplates([]);
    try {
      const res = await signApi.listTemplates(orgSlug);
      if (res.success !== false) setTemplates(res.templates || []);
    } catch {
      /* ignore */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id]);

  const fetchTags = useCallback(async () => {
    if (!orgSlug) return;
    try {
      const res = await signApi.listTags(orgSlug);
      if (res.success !== false) setTags(res.tags || []);
    } catch {
      /* ignore */
    }
  }, [orgSlug]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  useEffect(() => { fetchTags(); }, [fetchTags]);

  // Debounced search
  const handleSearchChange = (value) => {
    setSearch(value);
    setSelectedIds(new Set());
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchRequests({ search: value, page: 1 });
    }, 300);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleFilterSelect = (setter) => (val) => {
    setter(val);
    setPage(1);
    setSelectedIds(new Set());
  };

  const clearAllFilters = () => {
    setStatusFilter('');
    setTemplateFilter('');
    setTagFilter('');
    setPage(1);
    setSelectedIds(new Set());
  };

  // Reset selection whenever the page actually changes — switching pages
  // would otherwise carry the previous page's IDs and silently delete them.
  useEffect(() => { setSelectedIds(new Set()); }, [page]);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const togglePageSelected = () => {
    setSelectedIds((prev) => {
      const allChecked = requests.length > 0 && requests.every((r) => prev.has(r._id));
      if (allChecked) return new Set();
      const next = new Set(prev);
      requests.forEach((r) => next.add(r._id));
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Permanently remove ${count} signature request${count === 1 ? '' : 's'} from this list? Signed PDFs and audit certificates already generated will remain accessible via their direct links.`)) return;
    setBulkDeleting(true);
    try {
      const res = await signApi.bulkDeleteRequests(orgSlug, Array.from(selectedIds));
      if (res.success !== false) {
        const n = typeof res.deleted === 'number' ? res.deleted : count;
        showToast(`Deleted ${n} request${n === 1 ? '' : 's'}`);
        setSelectedIds(new Set());
        fetchRequests();
      } else {
        showToast(res.message || 'Failed to delete requests', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to delete requests', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  // CSV export — mirrors fetchRequests' filter chain so export rows match
  // what's on screen. Companion to API endpoint /sign/requests/export.csv.
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (!orgSlug) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter === 'archived') params.set('archived', '1');
      else if (statusFilter) params.set('state', statusFilter);
      if (templateFilter) params.set('templateId', templateFilter);
      if (tagFilter) params.set('tagId', tagFilter);
      const qs = params.toString();
      const today = new Date().toISOString().slice(0, 10);
      await downloadFile(
        `/api/org/${orgSlug}/sign/requests/export.csv${qs ? '?' + qs : ''}`,
        `sign_requests_${today}.csv`,
      );
    } catch (err) {
      showToast(err?.message || 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Actions
  const handleCancel = async (e, requestId) => {
    e.stopPropagation();
    if (!window.confirm('Cancel this signature request? This cannot be undone.')) return;
    try {
      setCancellingId(requestId);
      const res = await signApi.cancelRequest(orgSlug, requestId);
      if (res.success !== false) {
        showToast('Request cancelled');
        fetchRequests();
      } else {
        showToast(res.message || 'Failed to cancel', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to cancel request', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  const handleRemind = async (e, requestId) => {
    e.stopPropagation();
    try {
      setRemindingId(requestId);
      const res = await signApi.remindSigners(orgSlug, requestId);
      if (res.success !== false) {
        // The backend returns `reminded` = number of pending signers actually
        // emailed. If 0, the toast claiming success would be misleading —
        // surface the truthful count so the user knows whether anything went
        // out (e.g. all signers may already have completed).
        const count = typeof res.reminded === 'number' ? res.reminded : null;
        if (count === 0 && res.skipped > 0) {
          // Cooldown: pending signers exist but were all reminded in the
          // last 10 min — mirror the detail page's message.
          showToast(res.message || 'Reminder already sent recently — try again in a few minutes.', 'error');
        } else if (count === 0) {
          showToast('No pending signers to remind', 'info');
        } else if (count != null) {
          showToast(`Reminder sent to ${count} signer${count === 1 ? '' : 's'}`);
        } else {
          showToast('Reminder sent to pending signers');
        }
      } else {
        showToast(res.message || 'Failed to send reminder', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to send reminder', 'error');
    } finally {
      setRemindingId(null);
    }
  };

  // Unarchive — only surfaced in the Archived view (rows elsewhere are
  // never archived). Mirrors the detail page's Unarchive action.
  const handleUnarchive = async (e, requestId) => {
    e.stopPropagation();
    try {
      setUnarchivingId(requestId);
      const res = await signApi.unarchiveRequest(orgSlug, requestId);
      if (res.success !== false) {
        showToast('Request unarchived');
        fetchRequests();
      } else {
        showToast(res.message || 'Failed to unarchive', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to unarchive', 'error');
    } finally {
      setUnarchivingId(null);
    }
  };

  // Open the signed PDF (or audit certificate) via the auth-protected
  // backend proxy — same pattern as the detail page's openProxyPdf, lifted
  // here so the row-level Download button doesn't require navigating away.
  const openSignedPdf = async (e, requestId) => {
    e.stopPropagation();
    const newTab = window.open('about:blank', '_blank');
    try {
      const token = localStorage.getItem('rivvra_token');
      const resp = await fetch(
        `${API_BASE_URL}/api/org/${orgSlug}/sign/requests/${requestId}/signed-pdf`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!resp.ok) throw new Error('Failed to fetch');
      const blob = await resp.blob();
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      if (newTab) newTab.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      if (newTab) newTab.close();
      showToast('Failed to open signed PDF', 'error');
    }
  };

  // Filter options
  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'sent', label: 'Sent' },
    // "In progress" is a virtual filter the backend resolves as
    // state==='sent' AND at least one signer already completed. There's no
    // distinct DB state — many requests sit in 'sent' for days while one
    // party signs and the other lags, and the user wants those isolated.
    { value: 'in_progress', label: 'In progress' },
    { value: 'signed', label: 'Signed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'expired', label: 'Expired' },
    { value: 'refused', label: 'Refused' },
    // Virtual option — archived rows are excluded from every other view, so
    // this is the only way to reach (and unarchive) them.
    { value: 'archived', label: 'Archived' },
  ];

  const templateOptions = [
    { value: '', label: 'All Templates' },
    ...templates.map((t) => ({ value: t._id, label: t.name })),
  ];

  const tagOptions = [
    { value: '', label: 'All Tags' },
    ...tags.map((t) => ({ value: t._id, label: t.name })),
  ];

  const formatDate = (dateStr) => formatDateTime(dateStr, { user, dateOnly: true }) || '\u2014';

  // Sort is URL-driven, same `sort` + `dir` params the legacy SortableHeader
  // wrote, mapped onto DataTable's {key, dir}. Keeping the param names means
  // an existing bookmarked sort still resolves.
  const dsSort = searchParams.get('sort')
    ? { key: searchParams.get('sort'), dir: searchParams.get('dir') === 'desc' ? 'desc' : 'asc' }
    : null;
  const onSortChange = (next) => {
    const np = new URLSearchParams(searchParams);
    if (!next) { np.delete('sort'); np.delete('dir'); }
    else { np.set('sort', next.key); np.set('dir', next.dir); }
    np.delete('page');     // a new sort order invalidates the page index
    setSearchParams(np);
  };

  const allChecked = requests.length > 0 && requests.every((r) => selectedIds.has(r._id));
  const someChecked = requests.some((r) => selectedIds.has(r._id));

  const columns = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          aria-label="Select all rows on this page"
          ref={(el) => {
            if (!el) return;
            el.checked = allChecked;
            el.indeterminate = !allChecked && someChecked;
          }}
          onChange={togglePageSelected}
          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--brand)' }}
        />
      ),
      width: 46,
      align: 'center',
      render: (req) => (
        <input
          type="checkbox"
          aria-label={`Select ${req.reference || 'request'}`}
          checked={selectedIds.has(req._id)}
          onChange={() => toggleSelected(req._id)}
          onClick={(e) => e.stopPropagation()}   // ticking must not open the row
          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--brand)' }}
        />
      ),
    },
    {
      key: 'reference',
      header: 'Document',
      width: 280,
      render: (req) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, width: '100%' }}>
          <span style={{
            width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-1)', background: 'color-mix(in srgb, var(--a-sign) 14%, transparent)',
          }}>
            <FileText size={13} style={{ color: 'var(--a-sign)' }} />
          </span>
          {/* 2026-05-23 Sign table UX: no hard width cap, so the cell flexes
              with the viewport; title= surfaces the full string on hover. */}
          <span
            title={req.reference || req.name || 'Untitled'}
            style={{
              font: `550 13px/1.4 ${FONT}`, color: 'var(--fg)', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {req.reference || req.name || 'Untitled'}
          </span>
        </span>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      width: 118,
      sortable: true,
      render: (req) => <StatusBadge status={deriveStatus(req)} />,
    },
    {
      key: 'signers',
      header: 'Signers',
      width: 100,
      render: (req) => {
        const totalSigners = req.signers?.length || 0;
        const signedCount = req.signers?.filter((s) => s.state === 'completed').length || 0;
        return (
          <Meter
            value={signedCount}
            max={totalSigners || 1}
            size="sm"
            label={undefined}
            readout={`${signedCount}/${totalSigners}`}
            aria-label={`${signedCount} of ${totalSigners} signers completed`}
          />
        );
      },
    },
    {
      key: 'templateName',
      header: 'Template',
      width: 140,
      muted: true,
      render: (req) => (
        <span
          title={req.templateName || req.template?.name || ''}
          style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {req.templateName || req.template?.name || '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      width: 140,
      sortable: true,
      render: (req) => {
        const by = req.createdByName || req.createdBy?.name || '';
        return (
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', font: `450 12.5px/1.35 ${FONT}`, color: 'var(--fg-2)' }}>
              {formatDate(req.createdAt)}
            </span>
            <span
              title={by || undefined}
              style={{
                display: 'block', font: `450 11.5px/1.35 ${FONT}`, color: 'var(--fg-3)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {by || '\u2014'}
            </span>
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 96,
      align: 'right',
      render: (req) => (
        <span
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}
          onClick={(e) => e.stopPropagation()}
        >
          {statusFilter === 'archived' && (
            <RowAction
              title="Unarchive request"
              onClick={(e) => handleUnarchive(e, req._id)}
              disabled={unarchivingId === req._id}
            >
              {unarchivingId === req._id ? <Spinner size={14} /> : <ArchiveRestore size={14} />}
            </RowAction>
          )}
          {req.state === 'sent' && (
            <>
              <RowAction
                title="Send reminder"
                onClick={(e) => handleRemind(e, req._id)}
                disabled={remindingId === req._id}
              >
                {remindingId === req._id ? <Spinner size={14} /> : <Bell size={14} />}
              </RowAction>
              <RowAction
                title="Cancel request"
                tone="danger"
                onClick={(e) => handleCancel(e, req._id)}
                disabled={cancellingId === req._id}
              >
                {cancellingId === req._id ? <Spinner size={14} /> : <XCircle size={14} />}
              </RowAction>
            </>
          )}
          {req.state === 'signed' && req.signedPdfUrl && (
            <RowAction title="Open signed PDF" onClick={(e) => openSignedPdf(e, req._id)}>
              <Download size={14} />
            </RowAction>
          )}
        </span>
      ),
    },
  ];

  const hasFilters = !!(search || statusFilter || templateFilter || tagFilter);

  return (
    <div style={{ padding: 'clamp(12px, 2vw, 24px)' }}>
      <PageHeader
        title="Signature Requests"
        sub={`${total} ${total === 1 ? 'request' : 'requests'} total`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              onClick={() => setShowQuickSend(true)}
              iconLeft={<Zap size={14} style={{ color: 'var(--warn)' }} />}
            >
              Quick Send
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowBulkSend(true)}
              iconLeft={<Users size={14} style={{ color: 'var(--info)' }} />}
            >
              Bulk Send
            </Button>
            <Button onClick={() => setShowModal(true)} iconLeft={<Plus size={15} />}>
              New Request
            </Button>
          </div>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search by document name or signer…"
        resultCount={total}
        noun="request"
        onClearAll={activeFilterCount > 0 ? clearAllFilters : undefined}
        filters={[]}
        left={
          <>
            {/* Filters stay LOCAL state, as in legacy — they are not URL
                params here, and making them so would change what a shared
                link means. */}
            <SelectChip
              label="Status"
              value={statusFilter}
              options={statusOptions.filter((o) => o.value !== '')}
              onChange={handleFilterSelect(setStatusFilter)}
            />
            <SelectChip
              label="Template"
              value={templateFilter}
              options={templateOptions.filter((o) => o.value !== '')}
              placeholder="No templates"
              onChange={handleFilterSelect(setTemplateFilter)}
            />
            <SelectChip
              label="Tag"
              value={tagFilter}
              options={tagOptions.filter((o) => o.value !== '')}
              placeholder="No tags"
              onChange={handleFilterSelect(setTagFilter)}
            />
          </>
        }
        style={{ marginBottom: 14 }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExport}
          disabled={exporting || total === 0}
          title="Download the current filtered list as a CSV file"
          iconLeft={exporting ? <Spinner size={14} /> : <Download size={14} />}
        >
          Export CSV
        </Button>
      </FilterBar>

      {/* Bulk delete is a signAdmin-only endpoint — hide it from members
          instead of letting the click 403. */}
      <BulkActionBar
        count={selectedIds.size}
        noun="request"
        onClear={() => setSelectedIds(new Set())}
        actions={isAdmin ? [{
          label: bulkDeleting ? 'Deleting…' : 'Delete selected',
          tone: 'danger',
          icon: <X size={14} />,
          disabled: bulkDeleting,
          onClick: handleBulkDelete,
        }] : []}
      />

      <DataTable
        columns={columns}
        rows={requests}
        rowKey="_id"
        loading={loading && requests.length === 0}
        sort={dsSort}
        onSortChange={onSortChange}
        onRowClick={(req) => navigate(orgPath(`/sign/requests/${req._id}`))}
        selected={Array.from(selectedIds)}
        empty={
          <EmptyState
            icon={<FileText size={22} />}
            title="No requests found"
            actions={hasFilters && (
              <Button variant="secondary" size="sm" onClick={clearAllFilters}>Clear all filters</Button>
            )}
          >
            {hasFilters
              ? 'Try adjusting your search or filters.'
              : 'Create your first signature request to get started.'}
          </EmptyState>
        }
      />

      {total > 0 && (
        <Pagination
          page={page}
          pageSize={20}
          total={total}
          noun="request"
          onPageChange={setPage}
          style={{ marginTop: 12 }}
        />
      )}

      {/* New Request Modal */}
      <NewRequestModal
        show={showModal}
        onClose={() => { setShowModal(false); setPreSelectedTemplateId(null); }}
        onSaved={() => fetchRequests({ page: 1 })}
        orgSlug={orgSlug}
        preSelectedTemplateId={preSelectedTemplateId}
      />

      {/* Quick Send Modal */}
      <QuickSendModal
        show={showQuickSend}
        onClose={() => setShowQuickSend(false)}
        onSaved={() => fetchRequests({ page: 1 })}
        orgSlug={orgSlug}
      />

      {/* Bulk Send Modal */}
      <BulkSendModal
        show={showBulkSend}
        onClose={() => setShowBulkSend(false)}
        onSaved={() => fetchRequests({ page: 1 })}
        orgSlug={orgSlug}
      />
    </div>
  );
}
