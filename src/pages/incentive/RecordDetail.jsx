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
  Edit, Trash2, Undo2,
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
        </div>
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

function ActionBtn({ onClick, icon: Icon, children, primary, danger, disabled }) {
  const base =
    'px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50';
  const cls = primary
    ? 'bg-fuchsia-600 hover:bg-fuchsia-700 text-white'
    : danger
    ? 'bg-red-950 hover:bg-red-900 text-red-300'
    : 'bg-dark-800 hover:bg-dark-700 text-dark-100';
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${cls}`}>
      <Icon size={14} />
      {children}
    </button>
  );
}
