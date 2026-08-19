// ============================================================================
// RecordDetailV2.jsx — Single-record view with inline editing & lifecycle
// actions, on ds
// ----------------------------------------------------------------------------
// Inline editing mirrors EmployeeDetail/ContactDetail: each main field is
// rendered through <InlineField>, save-on-blur, server response replaces local
// state so derived metrics (netProfit, incentives) refresh automatically.
//
// Confirmations & reason prompts use styled modals (no window.confirm/prompt)
// so the audit trail is auditable across automated/headless tests too.
//
// Six slices are carried across byte-identically: both money formatters,
// STATUS_LABEL, `toOptions`, the whole 141-line data layer, the capability
// flags + soft-warning derivations (`canApprove`, `negativeProfit`,
// `salaryExceedsInvoice`, `hardDeletePhrase`), and all nine lifecycle handlers.
// So is the hard-delete `canConfirm` guard, which requires a non-empty reason
// AND an exact match on the confirmation phrase.
//
// Three arithmetic expressions live inside the render and are spliced with it:
// the FX line (`Number(record.fxRate).toFixed(4)`) and the two rate-to-percent
// conversions (`* 100`). Splicing only above `return (` would have lost all
// three.
//
// This page can approve, unapprove, cancel, reverse, delete and hard-delete a
// commission record, and can cancel or restore one party's share
// independently. None of it was triggered.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import { validateRecordField } from '../../utils/incentiveValidate';
import { currencySymbol } from '../../utils/formatCurrency';
import InlineField from '../../components/shared/InlineField';
import InlineComboField from '../../components/shared/InlineComboField';
import useCompanyScoped404 from '../../hooks/useCompanyScoped404';
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, RotateCcw, RefreshCw,
  Trash2, Undo2, AlertTriangle,
} from 'lucide-react';
import {
  Panel, Chip, Button, Input, Textarea, Modal, Callout, EmptyState, PageSpinner,
} from '../../components/ds';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

// Reporting-currency formatter for `record.currency` amounts. The formatINR it
// replaces hard-coded the ₹ glyph and en-IN grouping, while the LABELS beside
// several of these values already read `(${record.currency || 'INR'})` — so a
// record reporting in anything but INR would print e.g. "Untaxed invoice (USD)"
// above a ₹ figure. Every staging record currently reports in INR, so this is a
// latent defect, not one I could reproduce; it is fixed here by construction.
// Native amounts keep using formatCurrency(..., record.nativeCurrency), which
// was already correct.
//
// Rounding, the null case and the grouping locale for INR are byte-identical to
// the old formatINR (2 dp, null -> "₹0", en-IN). Only non-INR behaviour is new.
function formatReported(amount, ccy) {
  const cur = String(ccy || 'INR').toUpperCase();
  if (amount == null) return `${currencySymbol(cur)}0`;
  try {
    return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown/garbage ISO code — Intl throws rather than degrading.
    return `${cur} ${Number(amount).toFixed(2)}`;
  }
}

function formatCurrency(amount, ccy) {
  if (amount == null) return '—';
  const code = String(ccy || 'INR').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${Number(amount).toFixed(2)}`;
  }
}

// Pretty label per status — keeps the header badge consistent with the
// list view (which uses Title Case via SHORT_STATUS).  Without this the
// detail page renders raw "draft"/"approved" while the list shows
// "Draft"/"Approved" — minor but jarring inconsistency.
const STATUS_LABEL = {
  draft: 'Draft',
  approved: 'Approved',
  paid: 'Paid',
  partially_paid: 'Partially paid',
  cancelled: 'Cancelled',
  'n/a': 'N/A',
};

// Same six states the legacy pill palette carried, as ds Chip tones.
const STATUS_TONE = {
  draft: 'neutral',
  approved: 'info',
  paid: 'brand',
  partially_paid: 'warn',
  cancelled: 'danger',
  'n/a': 'neutral',
};

// Small inline status pill for the per-party (recruiter / AM) status shown
// inside each role panel.  Falls back gracefully when older records don't
// have a per-party status field yet.
function PartyStatusBadge({ status }) {
  if (!status) return null;
  return <Chip tone={STATUS_TONE[status] || 'neutral'}>{status}</Chip>;
}

// Tiny adapter: lookup arrays → InlineComboField options. Used for the
// client picker and the employee picker (Recruiter / AM / Consultant all
// share the same employee pool).
const toOptions = (arr) =>
  (arr || []).map((x) => ({ value: x._id, label: x.name }));

// (Validation rules + numeric/nullable field sets + YM_RE live in
// utils/incentiveValidate.js so RecordDetail and RecordForm stay in sync.)

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function RecordDetailV2() {
  const { currentOrg, isOrgAdmin, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { recordId } = useParams();
  const handleScoped404 = useCompanyScoped404('incentive record');
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);

  // Lookups for entity pickers (loaded lazily once we know the user is admin).
  // Recruiter / AM / Consultant all pick from the same `employees` pool so
  // the search experience is identical across the three fields.
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [lookupsLoaded, setLookupsLoaded] = useState(false);

  // Modal state
  const [confirmModal, setConfirmModal] = useState(null);
  const [reasonModal, setReasonModal] = useState(null);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState('');
  const [hardDeleteReason, setHardDeleteReason] = useState('');

  const isAdmin = isOrgAdmin || getAppRole('incentive') === 'admin';

  // ---------- Load record ----------
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await incentiveApi.getRecord(orgSlug, recordId);
      setRecord(resp?.record || resp);
    } catch (e) {
      if (handleScoped404(e)) return;
      showToast('Failed to load record', 'error');
      console.error(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, recordId, handleScoped404]);

  useEffect(() => {
    if (orgSlug && recordId) load();
  }, [orgSlug, recordId, load]);

  // ---------- Load lookups (admin only) ----------
  useEffect(() => {
    if (!orgSlug || !isAdmin || lookupsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const [emps, cl] = await Promise.all([
          incentiveApi.lookupEmployees(orgSlug),
          incentiveApi.lookupClients(orgSlug),
        ]);
        if (cancelled) return;
        setEmployees(emps?.employees || emps || []);
        setClients(cl?.clients || cl || []);
        setLookupsLoaded(true);
      } catch (e) {
        console.error('Failed to load lookups', e);
        if (!cancelled) showToast('Failed to load employees / clients', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [orgSlug, isAdmin, lookupsLoaded, showToast]);

  // ---------- Inline-edit save handler ----------
  // Validates client-side, normalises empties, fires PUT, and replaces local
  // state with the server response so all derived fields (netProfit,
  // recruiterIncentive, etc.) refresh in one go.
  const handleFieldSave = useCallback(async (field, rawVal) => {
    if (!orgSlug || !recordId) throw new Error('Missing context');
    const val = validateRecordField(field, rawVal, record);
    const payload = { [field]: val };
    const res = await incentiveApi.updateRecord(orgSlug, recordId, payload);
    if (res && res.success === false) {
      throw new Error(res.error || 'Update failed');
    }
    if (res?.record) setRecord(res.record);
  }, [orgSlug, recordId, record]);

  // ---------- Confirm/reason modal helpers ----------
  function openConfirm(opts) {
    setConfirmModal({ ...opts, busy: false });
  }
  function openReason(opts) {
    setReasonModal({ ...opts, busy: false, reason: '' });
  }

  async function runConfirmAction() {
    if (!confirmModal) return;
    setConfirmModal((c) => ({ ...c, busy: true }));
    setBusy(true);
    try {
      await confirmModal.action();
      showToast(confirmModal.successMsg || 'Done', 'success');
      setConfirmModal(null);
      if (confirmModal.afterAction) {
        await confirmModal.afterAction();
      } else {
        await load();
      }
    } catch (e) {
      showToast(e?.message || 'Action failed', 'error');
      setConfirmModal((c) => (c ? { ...c, busy: false } : null));
    } finally {
      setBusy(false);
    }
  }

  async function runReasonAction() {
    if (!reasonModal) return;
    const reason = String(reasonModal.reason || '').trim();
    if (!reason) {
      showToast('A reason is required', 'error');
      return;
    }
    setReasonModal((r) => ({ ...r, busy: true }));
    setBusy(true);
    try {
      await reasonModal.action(reason);
      showToast(reasonModal.successMsg || 'Done', 'success');
      setReasonModal(null);
      await load();
    } catch (e) {
      showToast(e?.message || 'Action failed', 'error');
      setReasonModal((r) => (r ? { ...r, busy: false } : null));
    } finally {
      setBusy(false);
    }
  }

  // ---------- Lookup-derived option arrays ----------
  const clientOptions = useMemo(() => toOptions(clients), [clients]);
  // Single employee pool for Recruiter / AM / Consultant — keeps the search
  // experience identical across all three fields.
  const employeeOptions = useMemo(() => toOptions(employees), [employees]);

  // ---------- Loading state ----------
  if (loading) return <PageSpinner label="Loading record…" />;
  if (!record) {
    return (
      <Panel>
        <EmptyState title="Record not found." />
      </Panel>
    );
  }

  const isSelfView = !isAdmin;
  const status = record.status;
  const canEdit = isAdmin && status === 'draft';
  const canDelete = isAdmin && status === 'draft';
  const canApprove = isAdmin && status === 'draft';
  const canUnapprove = isAdmin && status === 'approved';
  const canCancel = isAdmin && (status === 'draft' || status === 'approved');
  const canRefreshRate = isAdmin && status === 'draft';
  const canReverse = isAdmin && status === 'paid';
  const canHardDelete = isAdmin;

  // ---------- Computed soft warnings ----------
  const negativeProfit = Number(record.netProfit) < 0;
  const salaryExceedsInvoice =
    Number(record.consultantSalarySnapshot) > Number(record.untaxedInvoicedValue) &&
    Number(record.untaxedInvoicedValue) > 0;
  const noRecruiterOrAm =
    !record.recruiterEmployeeId && !record.accountManagerEmployeeId;

  const hardDeletePhrase =
    (record.invoiceNumber && String(record.invoiceNumber).trim()) ||
    (recordId ? `DELETE-${String(recordId).slice(-6)}` : 'DELETE');

  async function runHardDelete() {
    const reason = hardDeleteReason.trim();
    if (!reason) return;
    if (hardDeleteConfirm.trim() !== hardDeletePhrase) return;
    setBusy(true);
    try {
      await incentiveApi.forceDeleteRecord(orgSlug, recordId, { reason });
      showToast('Record hard-deleted', 'success');
      setHardDeleteOpen(false);
      navigate(orgPath('/incentive/records'));
    } catch (e) {
      showToast(e?.message || 'Hard delete failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  // ---------- Action wiring ----------
  function onApproveClick() {
    if (negativeProfit || salaryExceedsInvoice) {
      openConfirm({
        title: 'Approve with negative profit?',
        message:
          'This record has a negative net profit (consultant salary exceeds invoice value). Approving locks the FX rate and incentive amounts. Are you sure?',
        confirmLabel: 'Approve anyway',
        primary: true,
        action: () => incentiveApi.approve(orgSlug, recordId),
        successMsg: 'Record approved',
      });
      return;
    }
    openConfirm({
      title: 'Approve this record?',
      message:
        'The FX rate and incentive amounts will be snapshotted and locked. The record will be folded into the next payroll re-process for its payout month.',
      confirmLabel: 'Approve',
      primary: true,
      action: () => incentiveApi.approve(orgSlug, recordId),
      successMsg: 'Record approved',
    });
  }

  function onUnapproveClick() {
    openReason({
      title: 'Unapprove record',
      message: 'Returning to draft so you can edit it. The next payroll re-process for the payout month will fold the change in.',
      placeholder: 'Reason for unapproving (audit trail) — required',
      action: (reason) => incentiveApi.unapprove(orgSlug, recordId, { reason }),
      successMsg: 'Returned to draft',
    });
  }

  function onCancelClick() {
    openReason({
      title: 'Cancel record',
      message: 'Cancellation is final — the record will not produce any incentive payout. Use Reverse instead if it has already been paid.',
      placeholder: 'Reason for cancelling (audit trail) — required',
      action: (reason) => incentiveApi.cancel(orgSlug, recordId, { reason }),
      successMsg: 'Record cancelled',
    });
  }

  function onReverseClick() {
    openReason({
      title: 'Reverse paid record',
      message: 'This creates a negative-amount adjustment record so the next payroll claws back the original payout. The original record is preserved for the audit trail.',
      placeholder: 'Reason for reversal (audit trail) — required',
      action: (reason) => incentiveApi.reverse(orgSlug, recordId, { reason }),
      successMsg: 'Adjustment created',
    });
  }

  function onRefreshRateClick() {
    openConfirm({
      title: 'Refresh rate snapshot?',
      message:
        'Re-pulls the live FX rate, recruiter %, AM %, and consultant salary. Only allowed on drafts. Approved records stay locked to their original snapshot (FX-1).',
      confirmLabel: 'Refresh',
      primary: true,
      action: () => incentiveApi.refreshRate(orgSlug, recordId),
      successMsg: 'Rate refreshed',
    });
  }

  function onDeleteClick() {
    openConfirm({
      title: 'Delete this draft?',
      message: 'The record will be removed permanently. There is no soft-undo.',
      confirmLabel: 'Delete',
      danger: true,
      action: () => incentiveApi.deleteRecord(orgSlug, recordId),
      successMsg: 'Deleted',
      afterAction: async () => navigate(orgPath('/incentive/records')),
    });
  }

  // Cancel one party only (recruiter OR accountManager).  The other party
  // continues through the lifecycle untouched — useful when a single side was
  // accidentally approved or assigned.  Server enforces all guards (already
  // paid, already cancelled, share folded into a processed run, etc.) and
  // returns a clear error message that we surface via toast.
  function onCancelPartyClick(party) {
    const label = party === 'recruiter' ? 'Recruiter' : 'Account Manager';
    openReason({
      title: `Cancel ${label} share`,
      message:
        `Voids only the ${label.toLowerCase()}'s share on this record. The other party stays approved and will still be paid normally.  This is final — use Reverse if the share has already been paid.`,
      placeholder: `Reason for cancelling the ${label.toLowerCase()} share — required`,
      action: (reason) => incentiveApi.cancelParty(orgSlug, recordId, party, reason),
      successMsg: `${label} share cancelled`,
    });
  }

  // Inverse of cancel-party — restore a previously cancelled share. The
  // server picks the target state (approved vs draft) based on the OTHER
  // party's lifecycle stage, so the admin doesn't have to reason about it.
  function onRestorePartyClick(party) {
    const label = party === 'recruiter' ? 'Recruiter' : 'Account Manager';
    openConfirm({
      title: `Restore ${label} share?`,
      message:
        `Brings the ${label.toLowerCase()}'s share back to a live state. If the other party is already approved or paid, this share will be restored to "approved" so it flows into the next payroll re-process. Otherwise it goes back to "draft" so you can review before re-approving.`,
      confirmLabel: 'Restore',
      primary: true,
      action: () => incentiveApi.restoreParty(orgSlug, recordId, party),
      successMsg: `${label} share restored`,
    });
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* ----- Header ----- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Button
            variant="ghost" size="sm" title="Back" aria-label="Back"
            onClick={() =>
              navigate(orgPath(isAdmin ? '/incentive/records' : '/incentive/my-earnings'))
            }
            iconLeft={<ArrowLeft size={17} />}
          />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ font: "700 18px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>
              {record.invoiceNumber
                ? `${record.invoiceNumber} · ${record.consultantName || 'Consultant'}`
                : [record.clientName, record.serviceMonth, record.consultantName]
                    .filter(Boolean)
                    .join(' · ') || 'Incentive Record'}
            </h1>
            <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
              {record.clientName} · {record.serviceMonth || '—'}
            </p>
          </div>
        </div>
        <Chip tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABEL[status] || status}</Chip>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        {/* ----- FX missing banner ----- */}
        {record.fxMissing && (
          <Callout tone="warn" icon={<AlertTriangle size={16} />}>
            <div style={{ font: "600 12.5px/1.4 'Inter', system-ui, sans-serif" }}>
              FX rate not configured for {record.nativeCurrency} → {record.currency || 'INR'}
            </div>
            <div style={{ font: "400 11.5px/1.6 'Inter', system-ui, sans-serif", marginTop: 3 }}>
              This invoice is in {record.nativeCurrency} but no conversion rate
              is set. The untaxed invoice value shows as 0 and the record
              cannot be approved. Add a rate under{' '}
              <strong>Incentive Settings → FX conversion rates</strong> —
              drafts will refresh automatically.
            </div>
          </Callout>
        )}

        {/* ----- Soft warning banners (draft only) ----- */}
        {canEdit && (negativeProfit || salaryExceedsInvoice || noRecruiterOrAm) && (
          <Callout tone="warn" icon={<AlertTriangle size={16} />}>
            <div style={{ font: "600 12.5px/1.4 'Inter', system-ui, sans-serif" }}>Heads up</div>
            <ul style={{ margin: '5px 0 0', paddingLeft: 18, display: 'grid', gap: 3, font: "400 11.5px/1.6 'Inter', system-ui, sans-serif" }}>
              {salaryExceedsInvoice && (
                <li>
                  Consultant salary ({formatReported(record.consultantSalarySnapshot, record.currency)})
                  exceeds invoice value ({formatReported(record.untaxedInvoicedValue, record.currency)})
                  — net profit is negative.
                </li>
              )}
              {negativeProfit && !salaryExceedsInvoice && (
                <li>Net profit is negative ({formatReported(record.netProfit, record.currency)}).</li>
              )}
              {noRecruiterOrAm && (
                <li>No Recruiter or AM assigned — record cannot be approved.</li>
              )}
            </ul>
          </Callout>
        )}

        {/* ----- Action buttons ----- */}
        {isAdmin && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {canApprove && (
              <ActionBtn primary onClick={onApproveClick} icon={CheckCircle2} disabled={busy}>
                Approve
              </ActionBtn>
            )}
            {canUnapprove && (
              <ActionBtn onClick={onUnapproveClick} icon={Undo2} disabled={busy}>
                Unapprove
              </ActionBtn>
            )}
            {canRefreshRate && (
              <ActionBtn onClick={onRefreshRateClick} icon={RefreshCw} disabled={busy}>
                Refresh Rate
              </ActionBtn>
            )}
            {canCancel && (
              <ActionBtn
                danger
                onClick={onCancelClick}
                icon={XCircle}
                disabled={busy}
                title="Mark the record as cancelled (preserves it in history). Requires a reason."
              >
                Cancel
              </ActionBtn>
            )}
            {canReverse && (
              <ActionBtn danger onClick={onReverseClick} icon={RotateCcw} disabled={busy}>
                Reverse (Adjustment)
              </ActionBtn>
            )}
            {canDelete && (
              <ActionBtn
                danger
                onClick={onDeleteClick}
                icon={Trash2}
                disabled={busy}
                title="Permanently remove this draft record. Available on drafts only — use Cancel for approved records."
              >
                Delete
              </ActionBtn>
            )}
            {canHardDelete && (
              <ActionBtn
                danger
                onClick={() => {
                  setHardDeleteReason('');
                  setHardDeleteConfirm('');
                  setHardDeleteOpen(true);
                }}
                icon={AlertTriangle}
                disabled={busy}
                title="Permanently delete this record regardless of status. Audit-logged."
              >
                Hard Delete
              </ActionBtn>
            )}
          </div>
        )}

        {/* ----- Inline-edit hint (draft only) ----- */}
        {canEdit && (
          <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', fontStyle: 'italic', margin: 0 }}>
            Tip: click any field below to edit inline. Changes save on blur.
          </p>
        )}

        {/* ----- Field panels ----- */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          <FieldPanel title="Invoice">
            <ReadRow k="Invoice #" v={record.invoiceNumber} />
            {canEdit ? (
              <InlineComboField
                label="Client"
                field="clientContactId"
                value={record.clientContactId}
                required
                editable
                options={clientOptions}
                displayValue={record.clientName}
                placeholder="Search client…"
                onSave={handleFieldSave}
              />
            ) : (
              <ReadRow k="Client" v={record.clientName} />
            )}
            {canEdit ? (
              <InlineField
                label="Service month"
                field="serviceMonth"
                value={record.serviceMonth}
                required
                editable
                placeholder="2026-04"
                onSave={handleFieldSave}
              />
            ) : (
              <ReadRow k="Service month" v={record.serviceMonth} />
            )}
            {canEdit ? (
              <InlineField
                label="Payment received"
                field="paymentReceivedDate"
                value={record.paymentReceivedDate}
                type="date"
                editable
                onSave={handleFieldSave}
              />
            ) : (
              <ReadRow
                k="Payment received"
                v={
                  record.paymentReceivedDate
                    ? new Date(record.paymentReceivedDate).toLocaleDateString()
                    : '—'
                }
              />
            )}
            {canEdit ? (
              <InlineField
                label="Payout month"
                field="payoutMonth"
                value={record.payoutMonth}
                editable
                placeholder="2026-04 (auto if blank)"
                warn={
                  record.originalPayoutMonth &&
                  record.originalPayoutMonth !== record.payoutMonth
                    ? `Rolled forward from ${record.originalPayoutMonth}`
                    : ''
                }
                onSave={handleFieldSave}
              />
            ) : (
              <>
                <ReadRow k="Payout month" v={record.payoutMonth} />
                {record.originalPayoutMonth &&
                  record.originalPayoutMonth !== record.payoutMonth && (
                    <ReadRow
                      k="Original payout"
                      v={`${record.originalPayoutMonth} (rolled forward)`}
                    />
                  )}
              </>
            )}
          </FieldPanel>

          {!isSelfView && (
            <FieldPanel title="Consultant">
              {canEdit ? (
                <InlineComboField
                  label="Name"
                  field="consultantEmployeeId"
                  value={record.consultantEmployeeId}
                  required
                  editable
                  options={employeeOptions}
                  displayValue={record.consultantName}
                  placeholder="Search employee…"
                  onSave={handleFieldSave}
                />
              ) : (
                <ReadRow k="Name" v={record.consultantName} />
              )}
              {canEdit ? (
                <InlineField
                  label="Salary (₹)"
                  field="consultantSalarySnapshot"
                  value={record.consultantSalarySnapshot}
                  editable
                  placeholder="Leave blank to pull from payroll"
                  displayValue={
                    record.consultantSalarySnapshot != null ? (
                      <span>
                        {formatReported(record.consultantSalarySnapshot, record.currency)}
                        {record.salaryProvisional && (
                          <span style={{ marginLeft: 4, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--warn-ink)' }}>(provisional)</span>
                        )}
                      </span>
                    ) : null
                  }
                  warn={
                    salaryExceedsInvoice
                      ? 'Salary > invoice — net profit will be negative'
                      : record.consultantSalarySource === 'pending_payroll' ||
                        record.consultantSalarySource === 'salary_hold'
                        ? 'Payroll not yet released for this month'
                        : ''
                  }
                  onSave={handleFieldSave}
                />
              ) : (
                <ReadRow
                  k="Salary (snapshot)"
                  v={formatReported(record.consultantSalarySnapshot, record.currency)}
                  note={record.salaryProvisional ? 'provisional' : null}
                />
              )}
            </FieldPanel>
          )}

          {!isSelfView && (
            <FieldPanel title="Financials">
              {record.nativeCurrency && (
                <>
                  <ReadRow
                    k={`Invoice (${record.nativeCurrency})`}
                    v={formatCurrency(
                      record.untaxedInvoicedValueNative,
                      record.nativeCurrency,
                    )}
                  />
                  <ReadRow
                    k="FX rate"
                    v={
                      record.fxRate
                        ? `1 ${record.nativeCurrency} = ${Number(record.fxRate).toFixed(4)} ${record.currency || 'INR'}`
                        : 'not configured'
                    }
                    note={record.fxMissing ? 'missing' : null}
                  />
                </>
              )}
              {canEdit ? (
                <InlineField
                  label={`Untaxed invoice${record.nativeCurrency ? ` (${record.currency || 'INR'})` : ' (₹)'}`}
                  field="untaxedInvoicedValue"
                  value={record.untaxedInvoicedValue}
                  required
                  editable
                  displayValue={formatReported(record.untaxedInvoicedValue, record.currency)}
                  placeholder="0"
                  onSave={handleFieldSave}
                />
              ) : (
                <ReadRow
                  k={`Untaxed invoice${record.nativeCurrency ? ` (${record.currency || 'INR'})` : ''}`}
                  v={formatReported(record.untaxedInvoicedValue, record.currency)}
                />
              )}
              <ReadRow
                k="Net profit"
                v={
                  <span style={negativeProfit ? { color: 'var(--danger)' } : undefined}>
                    {formatReported(record.netProfit, record.currency)}
                  </span>
                }
                strong
              />
            </FieldPanel>
          )}

          <FieldPanel title={isSelfView ? 'Your role' : 'Recruiter'}>
            {isSelfView ? (
              <>
                <ReadRow
                  k="Role"
                  v={
                    record.yourRole === 'recruiter'
                      ? 'Recruiter'
                      : record.yourRole === 'account_manager'
                      ? 'Account Manager'
                      : '—'
                  }
                />
                <ReadRow k="Your incentive" v={formatReported(record.yourIncentive, record.currency)} strong />
                {record.alsoRole && (
                  <ReadRow
                    k="Note"
                    v={`You are also the ${
                      record.alsoRole === 'recruiter' ? 'Recruiter' : 'AM'
                    } on this record.`}
                  />
                )}
              </>
            ) : (
              <>
                {canEdit ? (
                  <InlineComboField
                    label="Name"
                    field="recruiterEmployeeId"
                    value={record.recruiterEmployeeId}
                    editable
                    options={employeeOptions}
                    displayValue={record.recruiterName}
                    placeholder="Search recruiter…"
                    onSave={handleFieldSave}
                  />
                ) : (
                  <ReadRow k="Name" v={record.recruiterName || '—'} />
                )}
                <ReadRow
                  k="Rate"
                  v={
                    record.recruiterRateSnapshot != null
                      ? `${(record.recruiterRateSnapshot * 100).toFixed(2)}%`
                      : '—'
                  }
                />
                {canEdit ? (
                  <InlineField
                    label="Override (₹)"
                    field="recruiterAmountOverride"
                    value={record.recruiterAmountOverride}
                    editable
                    placeholder="Blank = use rate"
                    displayValue={
                      record.recruiterAmountOverride != null
                        ? formatReported(record.recruiterAmountOverride, record.currency)
                        : null
                    }
                    onSave={handleFieldSave}
                  />
                ) : record.recruiterAmountOverride != null ? (
                  // Read-only view: only render the row when an override is
                  // actually present.  Surfacing it on approved/paid records is
                  // important — the override changes the incentive amount and
                  // the audit reader needs to know it was applied.
                  <ReadRow
                    k="Override (₹)"
                    v={formatReported(record.recruiterAmountOverride, record.currency)}
                    note="manual override"
                  />
                ) : null}
                <ReadRow k="Incentive" v={formatReported(record.recruiterIncentive, record.currency)} strong />
                {/* Per-party status: visible whenever a per-party status is
                    present (skipped on legacy pre-Phase-2 records that only have
                    the record-level status). */}
                {record.recruiterEmployeeId && record.recruiterStatus &&
                  record.recruiterStatus !== 'n/a' && (
                    <ReadRow
                      k="Status"
                      v={<PartyStatusBadge status={record.recruiterStatus} />}
                    />
                  )}
                {isAdmin &&
                  record.recruiterEmployeeId &&
                  ['draft', 'approved'].includes(record.recruiterStatus) && (
                    <div style={{ paddingTop: 8 }}>
                      <ActionBtn
                        danger
                        icon={XCircle}
                        onClick={() => onCancelPartyClick('recruiter')}
                        disabled={busy}
                        title="Cancel only the recruiter's share. The AM (if any) is unaffected."
                      >
                        Cancel Recruiter share
                      </ActionBtn>
                    </div>
                  )}
                {isAdmin &&
                  record.recruiterEmployeeId &&
                  record.recruiterStatus === 'cancelled' && (
                    <div style={{ paddingTop: 8 }}>
                      <ActionBtn
                        icon={RotateCcw}
                        onClick={() => onRestorePartyClick('recruiter')}
                        disabled={busy}
                        title="Bring the recruiter's share back. Target state (approved vs draft) is decided based on the other party's status."
                      >
                        Restore Recruiter share
                      </ActionBtn>
                    </div>
                  )}
              </>
            )}
          </FieldPanel>

          {!isSelfView && (
            <FieldPanel title="Account Manager">
              {canEdit ? (
                <InlineComboField
                  label="Name"
                  field="accountManagerEmployeeId"
                  value={record.accountManagerEmployeeId}
                  editable
                  options={employeeOptions}
                  displayValue={record.accountManagerName}
                  placeholder="Search account manager…"
                  onSave={handleFieldSave}
                />
              ) : (
                <ReadRow k="Name" v={record.accountManagerName || '—'} />
              )}
              <ReadRow
                k="Rate"
                v={
                  record.accountManagerRateSnapshot != null
                    ? `${(record.accountManagerRateSnapshot * 100).toFixed(2)}%`
                    : '—'
                }
              />
              {canEdit ? (
                <InlineField
                  label="Override (₹)"
                  field="accountManagerAmountOverride"
                  value={record.accountManagerAmountOverride}
                  editable
                  placeholder="Blank = use rate"
                  displayValue={
                    record.accountManagerAmountOverride != null
                      ? formatReported(record.accountManagerAmountOverride, record.currency)
                      : null
                  }
                  onSave={handleFieldSave}
                />
              ) : record.accountManagerAmountOverride != null ? (
                // Read-only view: only show when override exists. (Same
                // rationale as the Recruiter panel — preserves the audit-
                // visible signal that an override was applied at approval.)
                <ReadRow
                  k="Override (₹)"
                  v={formatReported(record.accountManagerAmountOverride, record.currency)}
                  note="manual override"
                />
              ) : null}
              <ReadRow k="Incentive" v={formatReported(record.accountManagerIncentive, record.currency)} strong />
              {record.accountManagerEmployeeId && record.accountManagerStatus &&
                record.accountManagerStatus !== 'n/a' && (
                  <ReadRow
                    k="Status"
                    v={<PartyStatusBadge status={record.accountManagerStatus} />}
                  />
                )}
              {isAdmin &&
                record.accountManagerEmployeeId &&
                ['draft', 'approved'].includes(record.accountManagerStatus) && (
                  <div style={{ paddingTop: 8 }}>
                    <ActionBtn
                      danger
                      icon={XCircle}
                      onClick={() => onCancelPartyClick('accountManager')}
                      disabled={busy}
                      title="Cancel only the AM's share. The recruiter (if any) is unaffected."
                    >
                      Cancel AM share
                    </ActionBtn>
                  </div>
                )}
              {isAdmin &&
                record.accountManagerEmployeeId &&
                record.accountManagerStatus === 'cancelled' && (
                  <div style={{ paddingTop: 8 }}>
                    <ActionBtn
                      icon={RotateCcw}
                      onClick={() => onRestorePartyClick('accountManager')}
                      disabled={busy}
                      title="Bring the AM's share back. Target state (approved vs draft) is decided based on the other party's status."
                    >
                      Restore AM share
                    </ActionBtn>
                  </div>
                )}
            </FieldPanel>
          )}
        </div>

        {/* ----- Notes ----- */}
        {(canEdit || record.remarks) && (
          <FieldPanel title="Notes">
            {canEdit ? (
              <InlineField
                label="Remarks"
                field="remarks"
                value={record.remarks}
                type="textarea"
                editable
                placeholder="Internal notes…"
                onSave={handleFieldSave}
              />
            ) : (
              <p style={{ font: "400 12.5px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0, whiteSpace: 'pre-wrap' }}>
                {record.remarks}
              </p>
            )}
          </FieldPanel>
        )}

        {/* ----- Audit-trail footer ----- */}
        <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>
          Last updated{' '}
          {record.updatedAt
            ? new Date(record.updatedAt).toLocaleString()
            : '—'}
          {record.updatedByName ? ` by ${record.updatedByName}` : ''}
        </p>
      </div>

      {/* ----- Modals ----- */}
      {hardDeleteOpen && (
        <HardDeleteModal
          phrase={hardDeletePhrase}
          reason={hardDeleteReason}
          setReason={setHardDeleteReason}
          confirmText={hardDeleteConfirm}
          setConfirmText={setHardDeleteConfirm}
          status={status}
          invoiceNumber={record.invoiceNumber}
          busy={busy}
          onCancel={() => setHardDeleteOpen(false)}
          onConfirm={runHardDelete}
        />
      )}
      {confirmModal && (
        <ConfirmModal
          modal={confirmModal}
          onCancel={() => setConfirmModal(null)}
          onConfirm={runConfirmAction}
        />
      )}
      {reasonModal && (
        <ReasonModal
          modal={reasonModal}
          setReason={(v) => setReasonModal((r) => (r ? { ...r, reason: v } : r))}
          onCancel={() => setReasonModal(null)}
          onConfirm={runReasonAction}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Named FieldPanel because `Panel` is now the ds primitive it renders inside.
function FieldPanel({ title, children }) {
  return (
    <Panel>
      <div style={{ padding: 4 }}>
        <h3 style={{
          font: "600 10.5px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '.06em',
          textTransform: 'uppercase', color: 'var(--fg-4)', margin: '0 0 12px',
        }}>
          {title}
        </h3>
        <div style={{ display: 'grid', gap: 2 }}>{children}</div>
      </div>
    </Panel>
  );
}

// Read-only row used for fields the current viewer can't edit (or shouldn't —
// derived numbers, audit-trail values, etc.). Kept visually compatible with
// InlineField's idle layout (label column 140px, value right-aligned but
// flexible) so a panel mixing both stays aligned.
function ReadRow({ k, v, strong, note }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 140px) 1fr', gap: 8, padding: '7px 0' }}>
      <span style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{k}</span>
      <span style={{
        font: `${strong ? 600 : 400} 12.5px/1.5 'Inter', system-ui, sans-serif`,
        color: strong ? 'var(--fg)' : 'var(--fg-2)',
      }}>
        {(v ?? '') === '' ? <span style={{ color: 'var(--fg-4)' }}>—</span> : v}
        {note && <span style={{ marginLeft: 4, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--warn-ink)' }}>({note})</span>}
      </span>
    </div>
  );
}

function ActionBtn({ onClick, icon: Glyph, children, primary, danger, disabled, title }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={primary ? 'primary' : 'secondary'}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={danger ? { color: 'var(--danger)' } : undefined}
      iconLeft={<Glyph size={14} />}
    >
      {children}
    </Button>
  );
}

// ---------- Confirm modal (replaces window.confirm) ----------
function ConfirmModal({ modal, onCancel, onConfirm }) {
  const { title, message, confirmLabel, danger, busy } = modal;
  return (
    <Modal
      open
      onClose={busy ? () => {} : onCancel}
      size="sm"
      tone={danger ? 'danger' : 'neutral'}
      title={title}
      footer={(
        <>
          <Button variant="secondary" size="sm" type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            size="sm" type="button" block onClick={onConfirm} disabled={busy}
            variant={danger ? 'secondary' : 'primary'}
            style={danger ? { color: 'var(--danger)' } : undefined}
            iconLeft={busy ? <Loader2 size={14} className="animate-spin" /> : undefined}
          >
            {confirmLabel || 'Confirm'}
          </Button>
        </>
      )}
    >
      <p style={{ font: "400 12.5px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0 }}>{message}</p>
    </Modal>
  );
}

// ---------- Reason modal (replaces window.prompt for audit-trail prompts) ----------
function ReasonModal({ modal, setReason, onCancel, onConfirm }) {
  const { title, message, placeholder, busy, reason } = modal;
  const trimmed = String(reason || '').trim();
  return (
    <Modal
      open
      onClose={busy ? () => {} : onCancel}
      size="sm"
      title={title}
      sub={message}
      footer={(
        <>
          <Button variant="secondary" size="sm" type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button size="sm" type="button" block onClick={onConfirm} disabled={!trimmed || busy}
            iconLeft={busy ? <Loader2 size={14} className="animate-spin" /> : undefined}>
            Confirm
          </Button>
        </>
      )}
    >
      <Textarea
        autoFocus
        aria-label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder={placeholder || 'Reason (audit trail) — required'}
      />
    </Modal>
  );
}

// ---------- Hard delete modal (kept from previous version) ----------
function HardDeleteModal({
  phrase, reason, setReason, confirmText, setConfirmText,
  status, invoiceNumber, busy, onCancel, onConfirm,
}) {
  const canConfirm =
    reason.trim().length > 0 &&
    confirmText.trim() === phrase &&
    !busy;

  return (
    <Modal
      open
      onClose={busy ? () => {} : onCancel}
      size="md"
      tone="danger"
      icon={<AlertTriangle size={16} />}
      title="Hard delete record"
      sub="This removes the record from the database. There is no soft-undo — only the audit log keeps a snapshot."
      footer={(
        <>
          <Button variant="secondary" size="sm" type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="secondary" size="sm" type="button" block onClick={onConfirm} disabled={!canConfirm}
            style={{ color: 'var(--danger)' }} iconLeft={<Trash2 size={14} />}>
            {busy ? 'Deleting…' : 'Hard Delete'}
          </Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <Callout tone="warn">
          You are deleting a record in <strong style={{ textTransform: 'uppercase' }}>{status}</strong> status
          {invoiceNumber ? <> for invoice <strong>{invoiceNumber}</strong></> : null}.
          Use <strong>Cancel</strong> (for approved) or <strong>Reverse</strong> (for paid) for normal lifecycle changes.
          Use this only for test data, duplicates, or GDPR erasure.
        </Callout>

        <div>
          <label htmlFor="rd-hd-reason" style={{ display: 'block', font: "500 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 5 }}>
            Reason (audit trail, required)
          </label>
          <Textarea
            id="rd-hd-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. Test record created during April QA"
          />
        </div>

        <div>
          <label htmlFor="rd-hd-confirm" style={{ display: 'block', font: "500 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 5 }}>
            Type{' '}
            <code style={{
              padding: '1px 5px', borderRadius: 5, background: 'var(--surface-3)',
              color: 'var(--brand-ink)', font: "500 11px/1.5 ui-monospace, monospace",
            }}>{phrase}</code>{' '}
            to confirm
          </label>
          <Input
            id="rd-hd-confirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={phrase}
            autoComplete="off"
          />
        </div>
      </div>
    </Modal>
  );
}
