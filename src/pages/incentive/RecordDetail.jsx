// ============================================================================
// RecordDetail.jsx — Single record view with lifecycle actions
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import incentiveApi from '../../utils/incentiveApi';
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, RotateCcw, RefreshCw,
  Edit, Trash2, Undo2, AlertTriangle,
} from 'lucide-react';

function formatINR(amount) {
  if (amount == null) return '\u20B90';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

const STATUS_STYLE = {
  draft: 'bg-dark-800 text-dark-300',
  approved: 'bg-blue-950 text-blue-300',
  paid: 'bg-emerald-950 text-emerald-300',
  cancelled: 'bg-red-950 text-red-300',
};

export default function RecordDetail() {
  const { currentOrg, isOrgAdmin, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { recordId } = useParams();
  const orgSlug = currentOrg?.slug;

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState('');
  const [hardDeleteReason, setHardDeleteReason] = useState('');

  const isAdmin = isOrgAdmin || getAppRole('incentive') === 'admin';

  useEffect(() => {
    if (orgSlug && recordId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, recordId]);

  async function load() {
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
  }

  async function act(fn, confirmMsg, successMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try {
      await fn();
      showToast(successMsg, 'success');
      await load();
    } catch (e) {
      showToast(e?.message || 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function actWithReason(promptMsg, apiFn, successMsg) {
    const reason = window.prompt(promptMsg);
    if (reason == null) return;
    const trimmed = String(reason).trim();
    if (!trimmed) {
      showToast('A reason is required', 'error');
      return;
    }
    setBusy(true);
    try {
      await apiFn(trimmed);
      showToast(successMsg, 'success');
      await load();
    } catch (e) {
      showToast(e?.message || 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  }

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

  const isSelfView = !isAdmin; // backend already projected
  const status = record.status;
  const canEdit = isAdmin && status === 'draft';
  const canDelete = isAdmin && status === 'draft';
  const canApprove = isAdmin && status === 'draft';
  const canUnapprove = isAdmin && status === 'approved';
  const canCancel = isAdmin && (status === 'draft' || status === 'approved');
  const canRefreshRate = isAdmin && status === 'draft';
  const canReverse = isAdmin && status === 'paid';
  const canHardDelete = isAdmin; // any status — admin cleanup / test data removal

  // Phrase the admin must type to confirm hard delete. Prefer invoice number
  // for recognition; fall back to the last 6 chars of the record id.
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

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              navigate(orgPath(isAdmin ? '/incentive/records' : '/incentive/my-earnings'))
            }
            className="text-dark-400 hover:text-white p-1"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {record.invoiceNumber || 'Incentive Record'}
            </h1>
            <p className="text-sm text-dark-400">
              {record.clientName} · {record.consultantName || 'Consultant'}
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

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <ActionBtn
              onClick={() =>
                navigate(orgPath(`/incentive/records/${recordId}/edit`))
              }
              icon={Edit}
            >
              Edit
            </ActionBtn>
          )}
          {canApprove && (
            <ActionBtn
              primary
              onClick={() =>
                act(
                  () => incentiveApi.approve(orgSlug, recordId),
                  'Approve this record? The rate snapshot becomes final.',
                  'Record approved'
                )
              }
              icon={CheckCircle2}
              disabled={busy}
            >
              Approve
            </ActionBtn>
          )}
          {canUnapprove && (
            <ActionBtn
              onClick={() =>
                actWithReason(
                  'Reason for unapproving? (required — audit trail)',
                  (reason) => incentiveApi.unapprove(orgSlug, recordId, { reason }),
                  'Returned to draft'
                )
              }
              icon={Undo2}
              disabled={busy}
            >
              Unapprove
            </ActionBtn>
          )}
          {canRefreshRate && (
            <ActionBtn
              onClick={() =>
                act(
                  () => incentiveApi.refreshRate(orgSlug, recordId),
                  null,
                  'Rate refreshed'
                )
              }
              icon={RefreshCw}
              disabled={busy}
            >
              Refresh Rate
            </ActionBtn>
          )}
          {canCancel && (
            <ActionBtn
              danger
              onClick={() =>
                actWithReason(
                  'Reason for cancelling? (required — audit trail)',
                  (reason) => incentiveApi.cancel(orgSlug, recordId, { reason }),
                  'Record cancelled'
                )
              }
              icon={XCircle}
              disabled={busy}
            >
              Cancel
            </ActionBtn>
          )}
          {canReverse && (
            <ActionBtn
              danger
              onClick={() =>
                actWithReason(
                  'Reason for reversal? (required — creates a negative adjustment record)',
                  (reason) => incentiveApi.reverse(orgSlug, recordId, { reason }),
                  'Adjustment created'
                )
              }
              icon={RotateCcw}
              disabled={busy}
            >
              Reverse (Adjustment)
            </ActionBtn>
          )}
          {canDelete && (
            <ActionBtn
              danger
              onClick={() =>
                act(
                  () => incentiveApi.deleteRecord(orgSlug, recordId),
                  'Permanently delete this draft?',
                  'Deleted'
                ).then(() => navigate(orgPath('/incentive/records')))
              }
              icon={Trash2}
              disabled={busy}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Invoice">
          <Row k="Invoice #" v={record.invoiceNumber} />
          <Row k="Client" v={record.clientName} />
          <Row k="Service month" v={record.serviceMonth} />
          <Row
            k="Payment received"
            v={
              record.paymentReceivedDate
                ? new Date(record.paymentReceivedDate).toLocaleDateString()
                : '—'
            }
          />
          <Row k="Payout month" v={record.payoutMonth} />
          {record.originalPayoutMonth &&
            record.originalPayoutMonth !== record.payoutMonth && (
              <Row
                k="Original payout"
                v={`${record.originalPayoutMonth} (rolled forward)`}
              />
            )}
        </Panel>

        {!isSelfView && (
          <Panel title="Financials">
            <Row k="Untaxed invoice" v={formatINR(record.untaxedInvoicedValue)} />
            <Row
              k="Consultant salary (snapshot)"
              v={formatINR(record.consultantSalarySnapshot)}
              note={record.salaryProvisional ? 'provisional' : null}
            />
            <Row
              k="Net profit"
              v={formatINR(record.netProfit)}
              strong
            />
          </Panel>
        )}

        <Panel title={isSelfView ? 'Your role' : 'Recruiter'}>
          {isSelfView ? (
            <>
              <Row
                k="Role"
                v={
                  record.yourRole === 'recruiter'
                    ? 'Recruiter'
                    : record.yourRole === 'account_manager'
                    ? 'Account Manager'
                    : '—'
                }
              />
              <Row k="Your incentive" v={formatINR(record.yourIncentive)} strong />
              {record.alsoRole && (
                <Row
                  k="Note"
                  v={`You are also the ${
                    record.alsoRole === 'recruiter' ? 'Recruiter' : 'AM'
                  } on this record.`}
                />
              )}
            </>
          ) : (
            <>
              <Row k="Name" v={record.recruiterName || '—'} />
              <Row
                k="Rate"
                v={
                  record.recruiterRateSnapshot != null
                    ? `${(record.recruiterRateSnapshot * 100).toFixed(2)}%`
                    : '—'
                }
              />
              <Row
                k="Incentive"
                v={formatINR(record.recruiterIncentive)}
                strong
              />
            </>
          )}
        </Panel>

        {!isSelfView && (
          <Panel title="Account Manager">
            <Row k="Name" v={record.accountManagerName || '—'} />
            <Row
              k="Rate"
              v={
                record.accountManagerRateSnapshot != null
                  ? `${(record.accountManagerRateSnapshot * 100).toFixed(2)}%`
                  : '—'
              }
            />
            <Row
              k="Incentive"
              v={formatINR(record.accountManagerIncentive)}
              strong
            />
          </Panel>
        )}
      </div>

      {record.remarks && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-dark-400 uppercase mb-2">
            Notes
          </h3>
          <p className="text-sm text-dark-200 whitespace-pre-wrap">
            {record.remarks}
          </p>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
      <h3 className="text-xs font-semibold text-dark-400 uppercase mb-3">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ k, v, strong, note }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-dark-400">{k}</span>
      <span
        className={`${strong ? 'font-semibold text-white' : 'text-dark-200'} text-right`}
      >
        {v || '—'}
        {note && (
          <span className="ml-1 text-xs text-amber-400">({note})</span>
        )}
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
