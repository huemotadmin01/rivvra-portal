import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { useToast } from '../../context/ToastContext';
import expensesApi from '../../utils/expensesApi';
import { formatCurrency } from '../../utils/formatCurrency';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import { invalidateExpensesList } from './_listCache';
import {
  ArrowLeft, Save, Send, Trash2, CheckCircle2, XCircle, MessageSquare,
  Paperclip, Upload, Loader2, FileText, Eye, Wallet, AlertCircle, Clock,
  Download, X, Plus, Undo2, UserCheck, AlertTriangle,
} from 'lucide-react';

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'other', label: 'Other' },
];

const CURRENCY_OPTIONS = ['INR', 'USD', 'CAD', 'EUR', 'GBP', 'AUD', 'SGD', 'AED'];

const STATUS_META = {
  draft:     { bg: 'bg-dark-700',       text: 'text-dark-300',     dot: 'bg-dark-400',    label: 'Draft' },
  submitted: { bg: 'bg-amber-500/10',   text: 'text-amber-400',    dot: 'bg-amber-500',   label: 'Pending Approval' },
  approved:  { bg: 'bg-blue-500/10',    text: 'text-blue-400',     dot: 'bg-blue-500',    label: 'Approved' },
  synced:    { bg: 'bg-emerald-500/10', text: 'text-emerald-400',  dot: 'bg-emerald-500', label: 'Approved & Synced' },
  reimbursed:{ bg: 'bg-violet-500/10',  text: 'text-violet-400',   dot: 'bg-violet-500',  label: 'Reimbursed' },
  rejected:  { bg: 'bg-red-500/10',     text: 'text-red-400',      dot: 'bg-red-500',     label: 'Rejected' },
};

function StatusBadge({ status }) {
  const s = STATUS_META[status] || STATUS_META.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function toDateInput(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function newLineId() {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyLine(claimCurrency) {
  return {
    _id: newLineId(),
    expenseDate: toDateInput(new Date()),
    categoryId: '',
    categoryName: '',
    merchant: '',
    description: '',
    paymentMode: 'other',
    originalAmount: '',
    originalCurrency: claimCurrency || 'INR',
    conversionRate: '1',
    receiptId: null,
    receiptFilename: null,
    receiptMimeType: null,
    receiptSize: null,
  };
}

function lineFromServer(l) {
  return {
    _id: l._id || newLineId(),
    expenseDate: toDateInput(l.expenseDate),
    categoryId: l.categoryId || '',
    categoryName: l.categoryName || '',
    merchant: l.merchant || '',
    description: l.description || '',
    paymentMode: l.paymentMode || 'other',
    originalAmount: l.originalAmount != null ? String(l.originalAmount) : '',
    originalCurrency: l.originalCurrency || 'INR',
    conversionRate: l.conversionRate != null ? String(l.conversionRate) : '1',
    receiptId: l.receiptId || null,
    receiptFilename: l.receiptFilename || null,
    receiptMimeType: l.receiptMimeType || null,
    receiptSize: l.receiptSize || null,
  };
}

function lineConverted(line, claimCurrency) {
  const amt = Number(line.originalAmount) || 0;
  const sameCcy = (line.originalCurrency || claimCurrency) === claimCurrency;
  const rate = sameCcy ? 1 : (Number(line.conversionRate) || 0);
  return Math.round(amt * rate * 100) / 100;
}

const EVENT_LABEL = {
  created:   { icon: FileText,     color: 'text-dark-400',    label: 'Created' },
  submitted: { icon: Send,         color: 'text-amber-400',   label: 'Submitted for approval' },
  withdrawn: { icon: Undo2,        color: 'text-dark-300',    label: 'Withdrawn back to draft' },
  approved:  { icon: CheckCircle2, color: 'text-blue-400',    label: 'Approved' },
  synced:    { icon: CheckCircle2, color: 'text-emerald-400', label: 'Synced to Employee Bill' },
  reimbursed:{ icon: CheckCircle2, color: 'text-violet-400',  label: 'Reimbursed' },
  reimbursement_reversed: { icon: Undo2, color: 'text-amber-400', label: 'Reimbursement reversed' },
  rejected:  { icon: XCircle,      color: 'text-red-400',     label: 'Rejected' },
  commented: { icon: MessageSquare,color: 'text-dark-300',    label: 'Comment' },
};

function ConfirmModal({ open, ...rest }) {
  if (!open) return null;
  return <ConfirmModalBody {...rest} />;
}

function ConfirmModalBody({ title, body, confirmLabel, confirmTone = 'rivvra', onConfirm, onCancel, requireReason = false, busy }) {
  const [reason, setReason] = useState('');
  const tones = {
    rivvra:  'bg-rivvra-500 hover:bg-rivvra-600',
    blue:    'bg-blue-500 hover:bg-blue-600',
    red:     'bg-red-500 hover:bg-red-600',
    emerald: 'bg-emerald-500 hover:bg-emerald-600',
  };
  const disabled = busy || (requireReason && !reason.trim());
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-dark-850 border border-dark-700 rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-dark-700 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onCancel} className="text-dark-400 hover:text-white"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {body && <p className="text-sm text-dark-300">{body}</p>}
          {requireReason && (
            <div>
              <label className="block text-xs font-medium text-dark-300 mb-1">Reason <span className="text-red-400">*</span></label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Tell the submitter why this is being rejected..."
                className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                autoFocus
              />
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-dark-700 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-dark-300 hover:text-white">Cancel</button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed ${tones[confirmTone] || tones.rivvra}`}
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Per-line receipt cell — handles upload / preview / remove for a single line.
// ============================================================================
function ReceiptCell({ line, expenseId, orgSlug, editable, onUploaded, onRemoved, onOpenPreview, busy, setBusy, onRequestSaveDraft }) {
  const inputRef = useRef(null);
  const [savingDraft, setSavingDraft] = useState(false);

  async function handleUpload(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return alert('File must be under 10 MB');
    if (!expenseId) return alert('Save the draft first to attach a receipt');
    try {
      setBusy(true);
      const res = await expensesApi.uploadReceipt(orgSlug, expenseId, file);
      const r = res?.receipt;
      if (r) {
        onUploaded({
          receiptId: r._id,
          receiptFilename: r.filename,
          receiptMimeType: r.mimeType,
          receiptSize: r.size,
        });
      }
    } catch (e) {
      alert(e.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!line.receiptId || !expenseId) return;
    try {
      setBusy(true);
      await expensesApi.removeReceipt(orgSlug, expenseId, line.receiptId);
      onRemoved();
    } catch (e) {
      alert(e.message || 'Failed to remove receipt');
    } finally {
      setBusy(false);
    }
  }

  // Chain: save draft (if needed), then open the file picker.
  async function handlePickerClick() {
    if (busy || savingDraft) return;
    if (expenseId) {
      inputRef.current?.click();
      return;
    }
    if (!onRequestSaveDraft) return;
    setSavingDraft(true);
    try {
      const ok = await onRequestSaveDraft();
      if (!ok) return; // toast already shown by parent
      // Defer to next tick so parent re-renders with the new expenseId.
      setTimeout(() => inputRef.current?.click(), 0);
    } finally {
      setSavingDraft(false);
    }
  }

  if (!line.receiptId) {
    if (!editable) return <p className="text-xs text-dark-500 italic">No receipt</p>;
    const disabled = busy || savingDraft;
    const needsSave = !expenseId;
    return (
      <>
        <button
          type="button"
          onClick={handlePickerClick}
          disabled={disabled}
          aria-label={needsSave ? 'Save draft and upload receipt' : 'Upload receipt'}
          className={`w-full border-2 border-dashed rounded-lg p-3 flex flex-col items-center justify-center gap-1 transition-colors ${
            disabled
              ? 'border-dark-700 text-dark-400 opacity-60 cursor-not-allowed'
              : needsSave
                ? 'border-amber-500/40 text-amber-300 hover:border-amber-400 hover:bg-amber-500/5 cursor-pointer'
                : 'border-dark-700 text-dark-400 hover:border-rivvra-500/60 hover:text-rivvra-400 cursor-pointer'
          }`}
        >
          {busy || savingDraft ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <div className="text-[10px] text-dark-500">{savingDraft ? 'Saving draft…' : 'Uploading…'}</div>
            </>
          ) : (
            <>
              <Upload size={16} />
              <div className="text-xs">{needsSave ? 'Click to save & upload receipt' : 'Click to upload receipt'}</div>
              <div className="text-[10px] text-dark-500">PDF, PNG, JPG · up to 10 MB</div>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ''; }}
          className="hidden"
        />
      </>
    );
  }

  const canPreview =
    !!expenseId &&
    !!line.receiptId &&
    (line.receiptMimeType?.startsWith('image/') || line.receiptMimeType === 'application/pdf');

  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-dark-800/50 border border-dark-700/50 group">
      <FileText size={14} className="text-dark-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-dark-100 truncate">{line.receiptFilename || 'Receipt'}</p>
        {line.receiptSize ? (
          <p className="text-[10px] text-dark-500">{Math.round(line.receiptSize / 1024)} KB</p>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {canPreview && (
          <button
            type="button"
            onClick={() => onOpenPreview({
              filename: line.receiptFilename || 'Receipt',
              mimeType: line.receiptMimeType,
              fetchUrl: expensesApi.receiptUrl(orgSlug, expenseId, line.receiptId),
            })}
            className="p-1 rounded hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
            title="Preview"
          >
            <Eye size={14} />
          </button>
        )}
        {editable && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="p-1 rounded hover:bg-dark-700 text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ExpenseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { orgRole } = useOrg();
  const { user } = useAuth();
  const { currentCompany } = useCompany();
  const { showToast } = useToast();

  const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
  const currentUserId = user?._id || user?.id || null;
  const isNew = !id || id === 'new';

  const companyDefaultCurrency = (currentCompany?.currency || 'INR').toUpperCase();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);

  const [expense, setExpense] = useState(null);
  const [categories, setCategories] = useState([]);
  const [comment, setComment] = useState('');
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [previewApprover, setPreviewApprover] = useState(null);
  const [previewWarning, setPreviewWarning] = useState(null);
  const [previewReceipt, setPreviewReceipt] = useState(null);

  const [form, setForm] = useState({
    title: '',
    claimCurrency: companyDefaultCurrency,
    lines: [emptyLine(companyDefaultCurrency)],
  });

  const status = expense?.status || 'draft';
  const isOwner = !!expense && currentUserId && expense.submittedBy === currentUserId;
  const isApprover = !!expense && currentUserId && expense.approverUserId === currentUserId;
  const editable = isNew || (isOwner && status === 'draft');
  // Q19: snapshotted approver OR any org admin/owner can approve
  const canApprove = !isNew && status === 'submitted' && (isApprover || isOrgAdmin);
  const canDelete = !isNew && isOwner && status === 'draft';
  const canWithdraw = !isNew && isOwner && status === 'submitted';

  const totalAmount = useMemo(
    () => form.lines.reduce((s, l) => s + lineConverted(l, form.claimCurrency), 0),
    [form.lines, form.claimCurrency],
  );

  // Tracks the last id we've already populated `expense` for. After
  // handleSaveDraft creates a new record and calls navigate(replace), the
  // URL changes from /expenses/new to /expenses/:id and this effect would
  // otherwise re-fetch data we already have in state. We skip the fetch
  // when the ref already matches the URL id.
  const loadedIdRef = useRef(null);

  const loadExpense = useCallback(async () => {
    if (!orgSlug || isNew) return;
    if (loadedIdRef.current === id) return;
    try {
      setLoading(true);
      const res = await expensesApi.get(orgSlug, id);
      const exp = res?.expense;
      if (!exp) throw new Error('Expense not found');
      loadedIdRef.current = exp._id;
      setExpense(exp);
      setForm({
        title: exp.title || '',
        claimCurrency: (exp.claimCurrency || 'INR').toUpperCase(),
        lines: (exp.lines || []).length
          ? exp.lines.map(lineFromServer)
          : [emptyLine(exp.claimCurrency || 'INR')],
      });
    } catch (err) {
      showToast(err.message || 'Failed to load expense', 'error');
      navigate(orgPath('/expenses'));
    } finally {
      setLoading(false);
    }
  }, [orgSlug, id, isNew, showToast, navigate, orgPath]);

  useEffect(() => { loadExpense(); }, [loadExpense]);

  useEffect(() => {
    if (!orgSlug) return;
    expensesApi.listCategories(orgSlug)
      .then((r) => setCategories(r?.categories || []))
      .catch(() => {});
  }, [orgSlug]);

  // Approver preview — show "Will be sent to X" (only for new/draft expenses)
  useEffect(() => {
    if (!orgSlug) return;
    if (!isNew && status !== 'draft') {
      setPreviewApprover(null);
      setPreviewWarning(null);
      return;
    }
    expensesApi.previewApprover(orgSlug)
      .then((r) => {
        setPreviewApprover(r?.approver || null);
        setPreviewWarning(r?.warning || null);
      })
      .catch(() => {
        setPreviewApprover(null);
        setPreviewWarning(null);
      });
  }, [orgSlug, isNew, status]);

  const updateForm = (patch) => setForm((f) => ({ ...f, ...patch }));

  const updateLine = (lineId, patch) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => (l._id === lineId ? { ...l, ...patch } : l)),
    }));
  };

  const addLine = () => {
    setForm((f) => ({ ...f, lines: [...f.lines, emptyLine(f.claimCurrency)] }));
  };

  const removeLine = async (lineId) => {
    const target = form.lines.find((l) => l._id === lineId);
    if (target?.receiptId && expense?._id) {
      try {
        await expensesApi.removeReceipt(orgSlug, expense._id, target.receiptId);
      } catch { /* ignore — line is being removed anyway */ }
    }
    setForm((f) => {
      const next = f.lines.filter((l) => l._id !== lineId);
      return { ...f, lines: next.length ? next : [emptyLine(f.claimCurrency)] };
    });
  };

  const buildPayload = () => {
    const claimCurrency = (form.claimCurrency || 'INR').toUpperCase();
    return {
      title: form.title.trim(),
      claimCurrency,
      lines: form.lines.map((l) => {
        const cat = categories.find((c) => c._id === l.categoryId);
        return {
          _id: typeof l._id === 'string' && l._id.startsWith('tmp-') ? null : l._id,
          expenseDate: l.expenseDate || null,
          categoryId: l.categoryId || null,
          categoryName: cat?.name || l.categoryName || null,
          merchant: l.merchant.trim(),
          description: l.description.trim(),
          paymentMode: l.paymentMode,
          originalAmount: Number(l.originalAmount) || 0,
          originalCurrency: (l.originalCurrency || claimCurrency).toUpperCase(),
          conversionRate: Number(l.conversionRate) || 1,
          receiptId: l.receiptId || null,
          receiptFilename: l.receiptFilename || null,
          receiptMimeType: l.receiptMimeType || null,
          receiptSize: l.receiptSize || null,
        };
      }),
    };
  };

  const validate = (forSubmit) => {
    const p = buildPayload();
    if (forSubmit) {
      if (!p.title) return 'Claim title is required';
      if (!p.lines.length) return 'Add at least one expense line';
      for (let i = 0; i < p.lines.length; i++) {
        const l = p.lines[i];
        const tag = `Line ${i + 1}`;
        if (!l.expenseDate) return `${tag}: date is required`;
        if (!l.categoryId && !l.categoryName) return `${tag}: category is required`;
        if (!l.originalAmount || l.originalAmount <= 0) return `${tag}: amount must be greater than zero`;
        if (!l.description) return `${tag}: description is required`;
        if (!l.receiptId) return `${tag}: a receipt is required`;
        if (l.originalCurrency !== p.claimCurrency && (!l.conversionRate || l.conversionRate <= 0)) {
          return `${tag}: conversion rate is required when currency differs from claim`;
        }
      }
    }
    return null;
  };

  const handleSaveDraft = async () => {
    const err = validate(false);
    if (err) {
      showToast(err, 'error');
      return false;
    }
    try {
      setSaving(true);
      const payload = buildPayload();
      if (isNew && !expense?._id) {
        const res = await expensesApi.create(orgSlug, payload);
        setExpense(res.expense);
        if (res.expense?.lines) {
          setForm((f) => ({ ...f, lines: res.expense.lines.map(lineFromServer) }));
        }
        // Mark this id as already loaded so the navigate(replace) below
        // doesn't trigger a redundant GET — we already have the response.
        loadedIdRef.current = res.expense._id;
        showToast('Draft saved');
        invalidateExpensesList(orgSlug);
        navigate(orgPath(`/expenses/${res.expense._id}`), { replace: true });
      } else {
        const res = await expensesApi.update(orgSlug, expense._id, payload);
        setExpense(res.expense);
        if (res.expense?.lines) {
          setForm((f) => ({ ...f, lines: res.expense.lines.map(lineFromServer) }));
        }
        showToast('Draft saved');
        invalidateExpensesList(orgSlug);
      }
      return true;
    } catch (e) {
      showToast(e.message || 'Failed to save', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    const err = validate(true);
    if (err) return showToast(err, 'error');
    try {
      setSubmitting(true);
      const payload = buildPayload();
      let expenseId = expense?._id;
      if (!expenseId) {
        const created = await expensesApi.create(orgSlug, payload);
        expenseId = created.expense._id;
        setExpense(created.expense);
      } else {
        await expensesApi.update(orgSlug, expenseId, payload);
      }
      const res = await expensesApi.submit(orgSlug, expenseId);
      setExpense(res.expense);
      loadedIdRef.current = expenseId;
      showToast('Submitted for approval');
      invalidateExpensesList(orgSlug);
      if (isNew || !expense?._id) {
        navigate(orgPath(`/expenses/${expenseId}`), { replace: true });
      }
    } catch (e) {
      showToast(e.message || 'Failed to submit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    try {
      setWithdrawing(true);
      const res = await expensesApi.withdraw(orgSlug, expense._id);
      setExpense(res.expense);
      if (res.expense?.lines) {
        setForm((f) => ({ ...f, lines: res.expense.lines.map(lineFromServer) }));
      }
      setShowWithdraw(false);
      showToast('Withdrawn back to draft');
      invalidateExpensesList(orgSlug);
    } catch (e) {
      showToast(e.message || 'Failed to withdraw', 'error');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await expensesApi.remove(orgSlug, expense._id);
      showToast('Expense deleted');
      invalidateExpensesList(orgSlug);
      navigate(orgPath('/expenses'));
    } catch (e) {
      showToast(e.message || 'Failed to delete', 'error');
      setDeleting(false);
    }
  };

  const handleApprove = async (note) => {
    try {
      setApproving(true);
      const res = await expensesApi.approve(orgSlug, expense._id, note || '');
      setExpense(res.expense);
      setShowApprove(false);
      showToast(res.alreadySynced ? 'Already approved' : 'Approved — bill created');
      invalidateExpensesList(orgSlug);
    } catch (e) {
      showToast(e.message || 'Failed to approve', 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (note) => {
    if (!note) return showToast('Reason is required', 'error');
    try {
      setRejecting(true);
      const res = await expensesApi.reject(orgSlug, expense._id, note);
      setExpense(res.expense);
      setShowReject(false);
      showToast('Expense rejected');
      invalidateExpensesList(orgSlug);
    } catch (e) {
      showToast(e.message || 'Failed to reject', 'error');
    } finally {
      setRejecting(false);
    }
  };

  const handlePostComment = async () => {
    const note = comment.trim();
    if (!note) return;
    try {
      setPosting(true);
      const res = await expensesApi.comment(orgSlug, expense._id, note);
      setExpense(res.expense);
      setComment('');
    } catch (e) {
      showToast(e.message || 'Failed to post', 'error');
    } finally {
      setPosting(false);
    }
  };

  const events = useMemo(() => (expense?.events || []).slice().reverse(), [expense?.events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-rivvra-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Header */}
      <div className="bg-dark-850 border-b border-dark-700 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-[1200px] mx-auto">
          <button
            onClick={() => navigate(orgPath('/expenses'))}
            className="inline-flex items-center gap-1.5 text-xs text-dark-400 hover:text-white mb-2"
          >
            <ArrowLeft size={12} />
            Back to expenses
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-white flex items-center gap-2">
                <Wallet size={20} className="text-rivvra-400" />
                {isNew ? 'New Expense Claim' : (expense?.title || 'Expense Claim')}
              </h1>
              {!isNew && <StatusBadge status={status} />}
              {currentCompany && (
                <span className="text-xs text-dark-400 hidden sm:inline">
                  · {currentCompany.name}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {editable && (
                <>
                  <button
                    onClick={handleSaveDraft}
                    disabled={saving || submitting || receiptBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg text-sm text-dark-200 disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save as Draft
                  </button>
                  <button
                    onClick={handleSubmitForApproval}
                    disabled={saving || submitting || receiptBusy || !!previewWarning}
                    title={previewWarning || ''}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Submit for Approval
                  </button>
                </>
              )}
              {canWithdraw && (
                <button
                  onClick={() => setShowWithdraw(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg text-sm text-dark-200"
                >
                  <Undo2 size={14} />
                  Withdraw
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => setShowDelete(true)}
                  aria-label="Delete draft"
                  title="Delete draft"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-dark-800 hover:bg-red-500/10 border border-dark-700 hover:border-red-500/40 hover:text-red-400 rounded-lg text-sm text-dark-200"
                >
                  <Trash2 size={14} />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              )}
              {canApprove && (
                <>
                  <button
                    onClick={() => setShowReject(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-dark-800 hover:bg-red-500/10 border border-dark-700 hover:border-red-500/40 text-red-400 rounded-lg text-sm font-medium"
                  >
                    <XCircle size={14} />
                    Reject
                  </button>
                  <button
                    onClick={() => setShowApprove(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium"
                  >
                    <CheckCircle2 size={14} />
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form / Detail */}
        <div className="lg:col-span-2 space-y-6">
          {/* Approver preview / warning banner */}
          {previewWarning && (
            <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-3 flex gap-2">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-200">{previewWarning}</div>
            </div>
          )}
          {!previewWarning && previewApprover && (isNew || status === 'draft') && (
            <div className="bg-blue-500/10 border border-blue-500/40 rounded-lg p-3 flex items-center gap-2">
              <UserCheck size={16} className="text-blue-400 shrink-0" />
              <div className="text-sm text-blue-200">
                Will be sent to <span className="font-semibold text-white">{previewApprover.name}</span>
                {previewApprover.email && <span className="text-blue-300"> ({previewApprover.email})</span>}
                {previewApprover.source === 'org_owner' && <span className="text-blue-300"> · Org owner (no manager set)</span>}
                {previewApprover.source === 'self_owner' && <span className="text-blue-300"> · Self-approval (org owner)</span>}
              </div>
            </div>
          )}

          {/* Claim header */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Claim Details</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-dark-300 mb-1">
                  Title {editable && <span className="text-red-400">*</span>}
                </label>
                {editable ? (
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => updateForm({ title: e.target.value })}
                    placeholder="e.g. October client visit, Conference travel"
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                  />
                ) : (
                  <div className="px-3 py-2 text-sm text-white">{expense?.title || '-'}</div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-300 mb-1">Claim Currency</label>
                {editable ? (
                  <select
                    value={form.claimCurrency}
                    onChange={(e) => updateForm({ claimCurrency: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                  >
                    {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <div className="px-3 py-2 text-sm text-white">{expense?.claimCurrency || 'INR'}</div>
                )}
                <p className="text-[11px] text-dark-500 mt-1">
                  {editable
                    ? `Default from active company (${companyDefaultCurrency})`
                    : 'Reimbursement currency'}
                </p>
              </div>
            </div>

            {/* Submitter / Bill linkage (read-only) */}
            {!isNew && (
              <div className="pt-3 border-t border-dark-700/60 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-[11px] text-dark-500 uppercase tracking-wide">Submitter</div>
                  <div className="text-white mt-0.5">{expense?.submittedByName || '-'}</div>
                  {expense?.submittedByEmail && <div className="text-[11px] text-dark-500">{expense.submittedByEmail}</div>}
                </div>
                <div>
                  <div className="text-[11px] text-dark-500 uppercase tracking-wide">Approver</div>
                  <div className="text-white mt-0.5">{expense?.approverName || <span className="text-dark-500 italic">Not assigned</span>}</div>
                  {expense?.approverEmail && <div className="text-[11px] text-dark-500">{expense.approverEmail}</div>}
                </div>
                <div>
                  <div className="text-[11px] text-dark-500 uppercase tracking-wide">Employee Bill</div>
                  {expense?.billId ? (
                    <button
                      onClick={() => navigate(orgPath(`/invoicing/employee-bills/${expense.billId}`))}
                      className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 text-sm mt-0.5"
                    >
                      <CheckCircle2 size={14} />
                      {expense.billNumber || 'View bill'}
                    </button>
                  ) : status === 'rejected' ? (
                    <div className="text-dark-500 text-sm mt-0.5">Not created</div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 text-dark-400 text-sm mt-0.5">
                      <Clock size={14} />
                      Pending approval
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rejection reason banner */}
            {status === 'rejected' && expense?.rejectionReason && (
              <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 flex gap-2">
                <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-red-400 uppercase tracking-wide">Rejection reason</div>
                  <div className="text-sm text-red-200 mt-0.5">{expense.rejectionReason}</div>
                </div>
              </div>
            )}
          </div>

          {/* Lines */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Expense Lines</h2>
              <div className="text-sm text-dark-300">
                Total: <span className="font-semibold text-white">{formatCurrency(totalAmount, form.claimCurrency)}</span>
              </div>
            </div>

            {form.lines.map((line, idx) => {
              const sameCcy = line.originalCurrency === form.claimCurrency;
              const converted = lineConverted(line, form.claimCurrency);
              return (
                <div key={line._id} className="bg-dark-900 border border-dark-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-dark-300 uppercase tracking-wide">Line {idx + 1}</div>
                    {editable && form.lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line._id)}
                        className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1"
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-dark-300 mb-1">Date {editable && <span className="text-red-400">*</span>}</label>
                      {editable ? (
                        <input
                          type="date"
                          value={line.expenseDate}
                          onChange={(e) => updateLine(line._id, { expenseDate: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-dark-800 border border-dark-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                        />
                      ) : (
                        <div className="px-2.5 py-1.5 text-sm text-white">{line.expenseDate ? new Date(line.expenseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-dark-300 mb-1">Category {editable && <span className="text-red-400">*</span>}</label>
                      {editable ? (
                        <select
                          value={line.categoryId}
                          onChange={(e) => updateLine(line._id, { categoryId: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-dark-800 border border-dark-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                        >
                          <option value="">Select…</option>
                          {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                        </select>
                      ) : (
                        <div className="px-2.5 py-1.5 text-sm text-white">{line.categoryName || <span className="text-dark-500 italic">Uncategorized</span>}</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-dark-300 mb-1">Amount {editable && <span className="text-red-400">*</span>}</label>
                      <div className="flex">
                        {editable ? (
                          <>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.originalAmount}
                              onChange={(e) => updateLine(line._id, { originalAmount: e.target.value })}
                              placeholder="0.00"
                              className="flex-1 min-w-0 px-2.5 py-1.5 bg-dark-800 border border-dark-700 rounded-l text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                            />
                            <select
                              value={line.originalCurrency}
                              onChange={(e) => updateLine(line._id, { originalCurrency: e.target.value, conversionRate: e.target.value === form.claimCurrency ? '1' : line.conversionRate })}
                              className="px-2 py-1.5 bg-dark-700 border border-l-0 border-dark-700 rounded-r text-xs text-white focus:outline-none"
                            >
                              {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </>
                        ) : (
                          <div className="px-2.5 py-1.5 text-sm text-white">{formatCurrency(Number(line.originalAmount) || 0, line.originalCurrency)}</div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-dark-300 mb-1">
                        Rate → {form.claimCurrency}
                        {editable && !sameCcy && <span className="text-red-400"> *</span>}
                      </label>
                      {editable ? (
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={sameCcy ? '1' : line.conversionRate}
                          disabled={sameCcy}
                          onChange={(e) => updateLine(line._id, { conversionRate: e.target.value })}
                          placeholder="1.0"
                          className="w-full px-2.5 py-1.5 bg-dark-800 border border-dark-700 rounded text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500 disabled:opacity-60"
                        />
                      ) : (
                        <div className="px-2.5 py-1.5 text-sm text-white">{line.conversionRate || '1'}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-dark-300 mb-1">Converted ({form.claimCurrency})</label>
                      <div className="px-2.5 py-1.5 text-sm font-semibold text-white">
                        {formatCurrency(converted, form.claimCurrency)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-dark-300 mb-1">Merchant</label>
                      {editable ? (
                        <input
                          type="text"
                          value={line.merchant}
                          onChange={(e) => updateLine(line._id, { merchant: e.target.value })}
                          placeholder="e.g. Uber, Indigo"
                          className="w-full px-2.5 py-1.5 bg-dark-800 border border-dark-700 rounded text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                        />
                      ) : (
                        <div className="px-2.5 py-1.5 text-sm text-white">{line.merchant || <span className="text-dark-500 italic">—</span>}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-dark-300 mb-1">Payment Mode</label>
                      {editable ? (
                        <select
                          value={line.paymentMode}
                          onChange={(e) => updateLine(line._id, { paymentMode: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-dark-800 border border-dark-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                        >
                          {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      ) : (
                        <div className="px-2.5 py-1.5 text-sm text-white capitalize">{(line.paymentMode || 'other').replace('_', ' ')}</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-dark-300 mb-1">Description {editable && <span className="text-red-400">*</span>}</label>
                    {editable ? (
                      <textarea
                        value={line.description}
                        onChange={(e) => updateLine(line._id, { description: e.target.value })}
                        rows={2}
                        placeholder="What was this expense for?"
                        className="w-full px-2.5 py-1.5 bg-dark-800 border border-dark-700 rounded text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                      />
                    ) : (
                      <div className="px-2.5 py-1.5 text-sm text-white whitespace-pre-wrap">{line.description || '-'}</div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-dark-300 mb-1 flex items-center gap-1">
                      <Paperclip size={11} /> Receipt {editable && <span className="text-red-400">*</span>}
                    </label>
                    <ReceiptCell
                      line={line}
                      expenseId={expense?._id || null}
                      orgSlug={orgSlug}
                      editable={editable}
                      busy={receiptBusy}
                      setBusy={setReceiptBusy}
                      onUploaded={(patch) => updateLine(line._id, patch)}
                      onRemoved={() => updateLine(line._id, { receiptId: null, receiptFilename: null, receiptMimeType: null, receiptSize: null })}
                      onOpenPreview={setPreviewReceipt}
                      onRequestSaveDraft={handleSaveDraft}
                    />
                  </div>
                </div>
              );
            })}

            {editable && (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg text-sm text-dark-200"
                >
                  <Plus size={14} />
                  Add Line
                </button>
                {!expense?._id && (
                  <p className="text-[11px] text-dark-500 self-center">
                    Tip: clicking a receipt area auto-saves the draft, then opens the file picker.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Activity */}
        {!isNew && (
          <div className="space-y-6">
            <div className="bg-dark-850 border border-dark-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wide flex items-center gap-1.5 mb-4">
                <Eye size={14} className="text-rivvra-400" />
                Activity
              </h2>

              {/* Comment composer */}
              <div className="mb-4">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder="Add a comment..."
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handlePostComment}
                    disabled={posting || !comment.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                  >
                    {posting ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                    Post
                  </button>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-3">
                {events.length === 0 && (
                  <p className="text-xs text-dark-500 italic">No activity yet</p>
                )}
                {events.map((ev, i) => {
                  const meta = EVENT_LABEL[ev.type] || EVENT_LABEL.commented;
                  const Icon = meta.icon;
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="shrink-0 w-7 h-7 rounded-full bg-dark-800 border border-dark-700 flex items-center justify-center">
                        <Icon size={12} className={meta.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-dark-200">
                          <span className="font-medium text-white">{ev.actorName || 'Someone'}</span>
                          <span className="text-dark-400"> · {meta.label}</span>
                        </div>
                        <div className="text-[11px] text-dark-500">{fmtDateTime(ev.at)}</div>
                        {ev.note && (
                          <div className="mt-1 text-xs text-dark-200 bg-dark-900 border border-dark-700 rounded px-2 py-1.5 whitespace-pre-wrap">
                            {ev.note}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={showApprove}
        title="Approve claim"
        body="This will create an Employee Bill in Invoicing and mark the claim as synced. The submitter will be notified."
        confirmLabel="Approve & create bill"
        confirmTone="emerald"
        busy={approving}
        onConfirm={handleApprove}
        onCancel={() => setShowApprove(false)}
      />
      <ConfirmModal
        open={showReject}
        title="Reject claim"
        body="The submitter will see this reason and can revise and resubmit."
        confirmLabel="Reject"
        confirmTone="red"
        requireReason
        busy={rejecting}
        onConfirm={handleReject}
        onCancel={() => setShowReject(false)}
      />
      <ConfirmModal
        open={showWithdraw}
        title="Withdraw claim?"
        body="The claim returns to draft and you can edit it. The approver will no longer see it as pending."
        confirmLabel="Withdraw"
        confirmTone="rivvra"
        busy={withdrawing}
        onConfirm={handleWithdraw}
        onCancel={() => setShowWithdraw(false)}
      />
      <ConfirmModal
        open={showDelete}
        title="Delete this draft?"
        body="This permanently removes the draft and any attached receipts."
        confirmLabel="Delete"
        confirmTone="red"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />

      {previewReceipt && (
        <DocumentPreviewModal
          filename={previewReceipt.filename}
          mimeType={previewReceipt.mimeType}
          fetchUrl={previewReceipt.fetchUrl}
          onClose={() => setPreviewReceipt(null)}
        />
      )}
    </div>
  );
}
