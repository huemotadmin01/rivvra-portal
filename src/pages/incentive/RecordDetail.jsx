// ============================================================================
// RecordDetail.jsx — Single-record view with inline editing & lifecycle actions
// ----------------------------------------------------------------------------
// Inline editing mirrors EmployeeDetail/ContactDetail: each main field is
// rendered through <InlineField>, save-on-blur, server response replaces local
// state so derived metrics (netProfit, incentives) refresh automatically.
//
// Confirmations & reason prompts use styled modals (no window.confirm/prompt)
// so the audit trail is auditable across automated/headless tests too.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import incentiveApi from '../../utils/incentiveApi';
import InlineField from '../../components/shared/InlineField';
import InlineComboField from '../../components/shared/InlineComboField';
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, RotateCcw, RefreshCw,
  Trash2, Undo2, AlertTriangle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatINR(amount) {
  if (amount == null) return '\u20B90';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
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

const STATUS_STYLE = {
  draft: 'bg-dark-800 text-dark-300',
  approved: 'bg-blue-950 text-blue-300',
  paid: 'bg-emerald-950 text-emerald-300',
  partially_paid: 'bg-emerald-950/60 text-emerald-300',
  cancelled: 'bg-red-950 text-red-300',
};

// Fields whose value is a non-negative number. We validate these client-side
// so the user sees the error before the round-trip.
const NUMERIC_FIELDS = new Set([
  'untaxedInvoicedValue',
  'consultantSalarySnapshot',
  'recruiterAmountOverride',
  'accountManagerAmountOverride',
]);

// Fields that nullify on empty (vs. clamping to 0). Override fields are the
// canonical "leave blank to use rate engine" knob — clearing them must send
// `null`, not `0`.
const NULLABLE_NUMERIC_FIELDS = new Set([
  'recruiterAmountOverride',
  'accountManagerAmountOverride',
]);

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RecordDetail() {
  const { currentOrg, isOrgAdmin, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { recordId } = useParams();
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
      showToast('Failed to load record', 'error');
      console.error(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, recordId]);

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

    let val = rawVal;

    // YYYY-MM month fields
    if (field === 'serviceMonth' || field === 'payoutMonth') {
      if (val && !YM_RE.test(val)) {
        throw new Error('Use YYYY-MM (e.g. 2026-04)');
      }
      // serviceMonth is required server-side; payoutMonth empty re-derives.
      if (field === 'serviceMonth' && !val) {
        throw new Error('Service month is required');
      }
    }

    // Numeric fields
    if (NUMERIC_FIELDS.has(field)) {
      if (val === '' || val == null) {
        val = NULLABLE_NUMERIC_FIELDS.has(field) ? null : 0;
      } else {
        const n = Number(val);
        if (!Number.isFinite(n)) throw new Error('Must be a number');
        if (n < 0) throw new Error('Must be ≥ 0');
        val = n;
      }
    }

    // Required FK selects: client must stay set; consultant must stay set.
    if (field === 'clientContactId' && !val) {
      throw new Error('Client is required');
    }
    if (field === 'consultantEmployeeId' && !val) {
      throw new Error('Consultant is required');
    }

    // Recruiter / AM: at least one must remain.
    if (field === 'recruiterEmployeeId' && !val
        && !(record?.accountManagerEmployeeId)) {
      throw new Error('At least one of Recruiter / AM is required');
    }
    if (field === 'accountManagerEmployeeId' && !val
        && !(record?.recruiterEmployeeId)) {
      throw new Error('At least one of Recruiter / AM is required');
    }

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
  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c._id, label: c.name })),
    [clients]
  );
  // Single employee pool for Recruiter / AM / Consultant — keeps the search
  // experience identical across all three fields.
  const employeeOptions = useMemo(
    () => employees.map((e) => ({ value: e._id, label: e.name })),
    [employees]
  );

  // ---------- Loading state ----------
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-dark-500" size={32} />
      </div>
    );
  }
  if (!record) {
    return (
      <div className="p-6 text-center text-dark-400">Record not found.</div>
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

  return (
    <div className="p-6 max-w-5xl space-y-5">
      {/* ----- Header ----- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              navigate(orgPath(isAdmin ? '/incentive/records' : '/incentive/my-earnings'))
            }
            className="text-dark-400 hover:text-white p-1"
            title="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {record.invoiceNumber
                ? `${record.invoiceNumber} · ${record.consultantName || 'Consultant'}`
                : [record.clientName, record.serviceMonth, record.consultantName]
                    .filter(Boolean)
                    .join(' · ') || 'Incentive Record'}
            </h1>
            <p className="text-sm text-dark-400">
              {record.clientName} · {record.serviceMonth || '—'}
            </p>
          </div>
        </div>
        <span
          className={`inline-block px-3 py-1 rounded text-xs font-medium ${
            STATUS_STYLE[status] || 'bg-dark-800 text-dark-300'
          }`}
        >
          {status}
        </span>
      </div>

      {/* ----- FX missing banner ----- */}
      {record.fxMissing && (
        <div className="flex items-start gap-3 bg-amber-950/40 border border-amber-900/60 rounded-xl p-4">
          <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-200 space-y-1">
            <div className="font-semibold">
              FX rate not configured for {record.nativeCurrency} → {record.currency || 'INR'}
            </div>
            <div className="text-xs text-amber-300/80">
              This invoice is in {record.nativeCurrency} but no conversion rate
              is set. The untaxed invoice value shows as 0 and the record
              cannot be approved. Add a rate under{' '}
              <strong>Incentive Settings → FX conversion rates</strong> —
              drafts will refresh automatically.
            </div>
          </div>
        </div>
      )}

      {/* ----- Soft warning banners (draft only) ----- */}
      {canEdit && (negativeProfit || salaryExceedsInvoice || noRecruiterOrAm) && (
        <div className="flex items-start gap-3 bg-amber-950/30 border border-amber-900/50 rounded-xl p-4">
          <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-200 space-y-1.5">
            <div className="font-semibold">Heads up</div>
            <ul className="text-xs text-amber-300/90 space-y-1 list-disc list-inside">
              {salaryExceedsInvoice && (
                <li>
                  Consultant salary ({formatINR(record.consultantSalarySnapshot)})
                  exceeds invoice value ({formatINR(record.untaxedInvoicedValue)})
                  — net profit is negative.
                </li>
              )}
              {negativeProfit && !salaryExceedsInvoice && (
                <li>Net profit is negative ({formatINR(record.netProfit)}).</li>
              )}
              {noRecruiterOrAm && (
                <li>No Recruiter or AM assigned — record cannot be approved.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* ----- Action buttons ----- */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
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
            <ActionBtn danger onClick={onCancelClick} icon={XCircle} disabled={busy}>
              Cancel
            </ActionBtn>
          )}
          {canReverse && (
            <ActionBtn danger onClick={onReverseClick} icon={RotateCcw} disabled={busy}>
              Reverse (Adjustment)
            </ActionBtn>
          )}
          {canDelete && (
            <ActionBtn danger onClick={onDeleteClick} icon={Trash2} disabled={busy}>
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
        <div className="text-xs text-dark-400 italic">
          Tip: click any field below to edit inline. Changes save on blur.
        </div>
      )}

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

      {/* ----- Field panels ----- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Invoice">
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
        </Panel>

        {!isSelfView && (
          <Panel title="Consultant">
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
                      {formatINR(record.consultantSalarySnapshot)}
                      {record.salaryProvisional && (
                        <span className="ml-1 text-xs text-amber-400">(provisional)</span>
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
                v={formatINR(record.consultantSalarySnapshot)}
                note={record.salaryProvisional ? 'provisional' : null}
              />
            )}
          </Panel>
        )}

        {!isSelfView && (
          <Panel title="Financials">
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
                displayValue={formatINR(record.untaxedInvoicedValue)}
                placeholder="0"
                onSave={handleFieldSave}
              />
            ) : (
              <ReadRow
                k={`Untaxed invoice${record.nativeCurrency ? ` (${record.currency || 'INR'})` : ''}`}
                v={formatINR(record.untaxedInvoicedValue)}
              />
            )}
            <ReadRow
              k="Net profit"
              v={
                <span className={negativeProfit ? 'text-red-400' : ''}>
                  {formatINR(record.netProfit)}
                </span>
              }
              strong
            />
          </Panel>
        )}

        <Panel title={isSelfView ? 'Your role' : 'Recruiter'}>
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
              <ReadRow k="Your incentive" v={formatINR(record.yourIncentive)} strong />
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
                      ? formatINR(record.recruiterAmountOverride)
                      : null
                  }
                  onSave={handleFieldSave}
                />
              ) : null}
              <ReadRow k="Incentive" v={formatINR(record.recruiterIncentive)} strong />
            </>
          )}
        </Panel>

        {!isSelfView && (
          <Panel title="Account Manager">
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
            {canEdit && (
              <InlineField
                label="Override (₹)"
                field="accountManagerAmountOverride"
                value={record.accountManagerAmountOverride}
                editable
                placeholder="Blank = use rate"
                displayValue={
                  record.accountManagerAmountOverride != null
                    ? formatINR(record.accountManagerAmountOverride)
                    : null
                }
                onSave={handleFieldSave}
              />
            )}
            <ReadRow k="Incentive" v={formatINR(record.accountManagerIncentive)} strong />
          </Panel>
        )}
      </div>

      {/* ----- Notes ----- */}
      {(canEdit || record.remarks) && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-dark-400 uppercase mb-3">
            Notes
          </h3>
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
            <p className="text-sm text-dark-200 whitespace-pre-wrap">
              {record.remarks}
            </p>
          )}
        </div>
      )}

      {/* ----- Audit-trail footer ----- */}
      <div className="text-[11px] text-dark-500 pt-2">
        Last updated{' '}
        {record.updatedAt
          ? new Date(record.updatedAt).toLocaleString()
          : '—'}
        {record.updatedByName ? ` by ${record.updatedByName}` : ''}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Panel({ title, children }) {
  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
      <h3 className="text-xs font-semibold text-dark-400 uppercase mb-3">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// Read-only row used for fields the current viewer can't edit (or shouldn't —
// derived numbers, audit-trail values, etc.). Kept visually compatible with
// InlineField's idle layout (label column 140px, value right-aligned but
// flexible) so a panel mixing both stays aligned.
function ReadRow({ k, v, strong, note }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
      <span className="text-dark-400 text-sm">{k}</span>
      <span
        className={`text-sm ${strong ? 'font-semibold text-white' : 'text-dark-200'}`}
      >
        {(v ?? '') === '' ? <span className="text-dark-600">—</span> : v}
        {note && <span className="ml-1 text-xs text-amber-400">({note})</span>}
      </span>
    </div>
  );
}

function ActionBtn({ onClick, icon: Icon, children, primary, danger, disabled, title }) {
  const base =
    'px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50';
  const cls = primary
    ? 'bg-fuchsia-600 hover:bg-fuchsia-700 text-white'
    : danger
    ? 'bg-red-950 hover:bg-red-900 text-red-300'
    : 'bg-dark-800 hover:bg-dark-700 text-dark-100';
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`${base} ${cls}`}>
      <Icon size={14} />
      {children}
    </button>
  );
}

// ---------- Confirm modal (replaces window.confirm) ----------
function ConfirmModal({ modal, onCancel, onConfirm }) {
  const { title, message, confirmLabel, primary, danger, busy } = modal;
  const cls = danger
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : primary
    ? 'bg-fuchsia-600 hover:bg-fuchsia-700 text-white'
    : 'bg-dark-700 hover:bg-dark-600 text-white';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md bg-dark-900 border border-dark-800 rounded-xl shadow-2xl">
        <div className="p-5 border-b border-dark-800">
          <h3 className="text-base font-semibold text-white">{title}</h3>
        </div>
        <div className="p-5">
          <p className="text-sm text-dark-300">{message}</p>
        </div>
        <div className="p-5 border-t border-dark-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-dark-800 hover:bg-dark-700 text-dark-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 ${cls}`}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Reason modal (replaces window.prompt for audit-trail prompts) ----------
function ReasonModal({ modal, setReason, onCancel, onConfirm }) {
  const { title, message, placeholder, busy, reason } = modal;
  const trimmed = String(reason || '').trim();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md bg-dark-900 border border-dark-800 rounded-xl shadow-2xl">
        <div className="p-5 border-b border-dark-800">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          {message && (
            <p className="text-xs text-dark-400 mt-1.5">{message}</p>
          )}
        </div>
        <div className="p-5">
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={placeholder || 'Reason (audit trail) — required'}
            className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-fuchsia-600"
          />
        </div>
        <div className="p-5 border-t border-dark-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-dark-800 hover:bg-dark-700 text-dark-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!trimmed || busy}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-fuchsia-600 hover:bg-fuchsia-700 text-white disabled:opacity-40 flex items-center gap-1.5"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Confirm
          </button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg bg-dark-900 border border-red-900/60 rounded-xl shadow-2xl">
        <div className="p-5 border-b border-dark-800 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-950 text-red-400">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white">Hard delete record</h3>
            <p className="text-xs text-dark-400 mt-1">
              This removes the record from the database. There is no soft-undo —
              only the audit log keeps a snapshot.
            </p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-amber-950/30 border border-amber-900/40 rounded-lg p-3 text-xs text-amber-200">
            You are deleting a record in <strong className="uppercase">{status}</strong> status
            {invoiceNumber ? <> for invoice <strong>{invoiceNumber}</strong></> : null}.
            Use <strong>Cancel</strong> (for approved) or <strong>Reverse</strong> (for paid) for normal lifecycle changes.
            Use this only for test data, duplicates, or GDPR erasure.
          </div>

          <label className="block text-xs font-medium text-dark-300">
            Reason (audit trail, required)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Test record created during April QA"
              className="mt-1 w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-fuchsia-600"
            />
          </label>

          <label className="block text-xs font-medium text-dark-300">
            Type <code className="px-1.5 py-0.5 bg-dark-800 rounded text-fuchsia-300">{phrase}</code> to confirm
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={phrase}
              autoComplete="off"
              className="mt-1 w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-fuchsia-600"
            />
          </label>
        </div>
        <div className="p-5 border-t border-dark-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-dark-800 hover:bg-dark-700 text-dark-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Trash2 size={14} />
            {busy ? 'Deleting…' : 'Hard Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
