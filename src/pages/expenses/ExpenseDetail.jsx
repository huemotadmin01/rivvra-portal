import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import expensesApi from '../../utils/expensesApi';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  ArrowLeft, Save, Send, Trash2, CheckCircle2, XCircle, MessageSquare,
  Paperclip, Upload, Loader2, FileText, Eye, Wallet, AlertCircle, Clock,
  Download, X,
} from 'lucide-react';

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'other', label: 'Other' },
];

const STATUS_META = {
  draft:     { bg: 'bg-dark-700',       text: 'text-dark-300',     dot: 'bg-dark-400',    label: 'Draft' },
  submitted: { bg: 'bg-amber-500/10',   text: 'text-amber-400',    dot: 'bg-amber-500',   label: 'Pending Approval' },
  approved:  { bg: 'bg-blue-500/10',    text: 'text-blue-400',     dot: 'bg-blue-500',    label: 'Approved' },
  synced:    { bg: 'bg-emerald-500/10', text: 'text-emerald-400',  dot: 'bg-emerald-500', label: 'Approved & Synced' },
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

const EVENT_LABEL = {
  created:   { icon: FileText,     color: 'text-dark-400',    label: 'Created' },
  submitted: { icon: Send,         color: 'text-amber-400',   label: 'Submitted for approval' },
  approved:  { icon: CheckCircle2, color: 'text-blue-400',    label: 'Approved' },
  synced:    { icon: CheckCircle2, color: 'text-emerald-400', label: 'Synced to Employee Bill' },
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

export default function ExpenseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { getAppRole } = useOrg();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isManager = getAppRole('expenses') === 'admin' || getAppRole('expenses') === 'team_lead';
  const currentUserId = user?._id || user?.id || null;
  const isNew = !id || id === 'new';

  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);

  const [expense, setExpense] = useState(null);
  const [categories, setCategories] = useState([]);
  const [comment, setComment] = useState('');
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState(null);

  const [form, setForm] = useState({
    expenseDate: toDateInput(new Date()),
    categoryId: '',
    amount: '',
    currency: 'INR',
    description: '',
    merchant: '',
    paymentMode: 'other',
  });

  const status = expense?.status || 'draft';
  const isOwner = !!expense && currentUserId && expense.submittedBy === currentUserId;
  const editable = isNew || (isOwner && status === 'draft');
  const canApprove = !isNew && isManager && status === 'submitted';
  const canDelete = !isNew && isOwner && status === 'draft';
  const canSubmit = !isNew && isOwner && status === 'draft';

  const loadExpense = useCallback(async () => {
    if (!orgSlug || isNew) return;
    try {
      setLoading(true);
      const res = await expensesApi.get(orgSlug, id);
      const exp = res?.expense;
      if (!exp) throw new Error('Expense not found');
      setExpense(exp);
      setForm({
        expenseDate: toDateInput(exp.expenseDate),
        categoryId: exp.categoryId || '',
        amount: exp.amount != null ? String(exp.amount) : '',
        currency: exp.currency || 'INR',
        description: exp.description || '',
        merchant: exp.merchant || '',
        paymentMode: exp.paymentMode || 'other',
      });
    } catch (err) {
      showToast(err.message || 'Failed to load expense', 'error');
      navigate(`${orgPath}/expenses`);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, id, isNew, showToast, navigate, orgPath]);

  useEffect(() => { loadExpense(); }, [loadExpense]);

  useEffect(() => {
    if (!orgSlug) return;
    expensesApi.listCategories(orgSlug)
      .then((r) => setCategories(r?.categories || []))
      .catch(() => { /* non-blocking */ });
  }, [orgSlug]);

  // Auth-fetched receipt preview (works for images and PDFs)
  useEffect(() => {
    let revoke = null;
    setReceiptPreviewUrl(null);
    if (!expense?.receiptId) return;
    const token = localStorage.getItem('rivvra_token');
    const url = expensesApi.receiptUrl(orgSlug, expense._id);
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob) return;
        const obj = URL.createObjectURL(blob);
        setReceiptPreviewUrl(obj);
        revoke = obj;
      })
      .catch(() => { /* preview is best-effort */ });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [expense?.receiptId, expense?._id, orgSlug]);

  const updateForm = (patch) => setForm((f) => ({ ...f, ...patch }));

  const buildPayload = () => {
    const cat = categories.find((c) => c._id === form.categoryId);
    return {
      expenseDate: form.expenseDate || null,
      categoryId: form.categoryId || null,
      categoryName: cat?.name || null,
      amount: Number(form.amount) || 0,
      currency: form.currency || 'INR',
      description: form.description.trim(),
      merchant: form.merchant.trim(),
      paymentMode: form.paymentMode,
    };
  };

  const validate = (forSubmit) => {
    const p = buildPayload();
    if (forSubmit) {
      if (!p.expenseDate) return 'Expense date is required';
      if (!p.categoryId && !p.categoryName) return 'Category is required';
      if (!p.amount || p.amount <= 0) return 'Amount must be greater than zero';
      if (!p.description) return 'Description is required';
    }
    return null;
  };

  const handleSaveDraft = async () => {
    const err = validate(false);
    if (err) return showToast(err, 'error');
    try {
      setSaving(true);
      const payload = buildPayload();
      if (isNew) {
        const res = await expensesApi.create(orgSlug, payload);
        showToast('Draft saved');
        navigate(`${orgPath}/expenses/${res.expense._id}`, { replace: true });
      } else {
        const res = await expensesApi.update(orgSlug, expense._id, payload);
        setExpense(res.expense);
        showToast('Draft saved');
      }
    } catch (e) {
      showToast(e.message || 'Failed to save', 'error');
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
      if (isNew) {
        const res = await expensesApi.create(orgSlug, { ...payload, action: 'submit' });
        showToast('Submitted for approval');
        navigate(`${orgPath}/expenses/${res.expense._id}`, { replace: true });
      } else {
        await expensesApi.update(orgSlug, expense._id, payload);
        const res = await expensesApi.submit(orgSlug, expense._id);
        setExpense(res.expense);
        showToast('Submitted for approval');
      }
    } catch (e) {
      showToast(e.message || 'Failed to submit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await expensesApi.remove(orgSlug, expense._id);
      showToast('Expense deleted');
      navigate(`${orgPath}/expenses`);
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
    } catch (e) {
      showToast(e.message || 'Failed to reject', 'error');
    } finally {
      setRejecting(false);
    }
  };

  const handleUploadReceipt = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return showToast('File must be under 10 MB', 'error');
    if (isNew) return showToast('Save the draft first', 'error');
    try {
      setUploading(true);
      await expensesApi.uploadReceipt(orgSlug, expense._id, file);
      showToast('Receipt uploaded');
      await loadExpense();
    } catch (e) {
      showToast(e.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveReceipt = async () => {
    if (!expense?.receiptId) return;
    try {
      await expensesApi.removeReceipt(orgSlug, expense._id);
      showToast('Receipt removed');
      await loadExpense();
    } catch (e) {
      showToast(e.message || 'Failed to remove receipt', 'error');
    }
  };

  const handleDownloadReceipt = async () => {
    if (!expense?.receiptId) return;
    try {
      const token = localStorage.getItem('rivvra_token');
      const url = expensesApi.receiptUrl(orgSlug, expense._id);
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = expense.receiptFilename || 'receipt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(obj), 1000);
    } catch (e) {
      showToast(e.message || 'Download failed', 'error');
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
            onClick={() => navigate(`${orgPath}/expenses`)}
            className="inline-flex items-center gap-1.5 text-xs text-dark-400 hover:text-white mb-2"
          >
            <ArrowLeft size={12} />
            Back to expenses
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-white flex items-center gap-2">
                <Wallet size={20} className="text-rivvra-400" />
                {isNew ? 'New Expense' : (expense?.description?.slice(0, 60) || 'Expense')}
              </h1>
              {!isNew && <StatusBadge status={status} />}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {editable && (
                <>
                  <button
                    onClick={handleSaveDraft}
                    disabled={saving || submitting}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg text-sm text-dark-200 disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save as Draft
                  </button>
                  <button
                    onClick={handleSubmitForApproval}
                    disabled={saving || submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Submit for Approval
                  </button>
                </>
              )}
              {canSubmit && !editable && (
                <button
                  onClick={handleSubmitForApproval}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-rivvra-500 hover:bg-rivvra-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Submit
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => setShowDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-dark-800 hover:bg-red-500/10 border border-dark-700 hover:border-red-500/40 hover:text-red-400 rounded-lg text-sm text-dark-200"
                >
                  <Trash2 size={14} />
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
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Expense Details</h2>

            {/* Date / Category row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-dark-300 mb-1">Date {editable && <span className="text-red-400">*</span>}</label>
                {editable ? (
                  <input
                    type="date"
                    value={form.expenseDate}
                    onChange={(e) => updateForm({ expenseDate: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                  />
                ) : (
                  <div className="px-3 py-2 text-sm text-white">{expense?.expenseDate ? new Date(expense.expenseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-300 mb-1">Category {editable && <span className="text-red-400">*</span>}</label>
                {editable ? (
                  <select
                    value={form.categoryId}
                    onChange={(e) => updateForm({ categoryId: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                  >
                    <option value="">Select a category…</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2 text-sm text-white">{expense?.categoryName || <span className="text-dark-500 italic">Uncategorized</span>}</div>
                )}
                {editable && categories.length === 0 && (
                  <p className="text-[11px] text-dark-500 mt-1">
                    No categories yet. An admin can create them in Invoicing → Settings → Expense Categories.
                  </p>
                )}
              </div>
            </div>

            {/* Amount / Currency / Payment Mode row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-dark-300 mb-1">Amount {editable && <span className="text-red-400">*</span>}</label>
                {editable ? (
                  <div className="flex">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.amount}
                      onChange={(e) => updateForm({ amount: e.target.value })}
                      placeholder="0.00"
                      className="flex-1 px-3 py-2 bg-dark-900 border border-dark-700 rounded-l-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                    />
                    <select
                      value={form.currency}
                      onChange={(e) => updateForm({ currency: e.target.value })}
                      className="px-3 py-2 bg-dark-800 border border-l-0 border-dark-700 rounded-r-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                    >
                      <option value="INR">INR</option>
                      <option value="USD">USD</option>
                      <option value="CAD">CAD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                ) : (
                  <div className="px-3 py-2 text-base font-semibold text-white">{formatCurrency(expense?.amount || 0, expense?.currency || 'INR')}</div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-300 mb-1">Payment Mode</label>
                {editable ? (
                  <select
                    value={form.paymentMode}
                    onChange={(e) => updateForm({ paymentMode: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                  >
                    {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                ) : (
                  <div className="px-3 py-2 text-sm text-white capitalize">{(expense?.paymentMode || 'other').replace('_', ' ')}</div>
                )}
              </div>
            </div>

            {/* Merchant */}
            <div>
              <label className="block text-xs font-medium text-dark-300 mb-1">Merchant</label>
              {editable ? (
                <input
                  type="text"
                  value={form.merchant}
                  onChange={(e) => updateForm({ merchant: e.target.value })}
                  placeholder="e.g. Uber, Starbucks, Indigo"
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                />
              ) : (
                <div className="px-3 py-2 text-sm text-white">{expense?.merchant || <span className="text-dark-500 italic">—</span>}</div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-dark-300 mb-1">Description {editable && <span className="text-red-400">*</span>}</label>
              {editable ? (
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  rows={3}
                  placeholder="What was this expense for?"
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-1 focus:ring-rivvra-500"
                />
              ) : (
                <div className="px-3 py-2 text-sm text-white whitespace-pre-wrap">{expense?.description || '-'}</div>
              )}
            </div>

            {/* Submitter / Bill linkage (read-only) */}
            {!isNew && (
              <div className="pt-3 border-t border-dark-700/60 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[11px] text-dark-500 uppercase tracking-wide">Submitter</div>
                  <div className="text-white mt-0.5">{expense?.submittedByName || '-'}</div>
                  {expense?.submittedByEmail && <div className="text-[11px] text-dark-500">{expense.submittedByEmail}</div>}
                </div>
                <div>
                  <div className="text-[11px] text-dark-500 uppercase tracking-wide">Employee Bill</div>
                  {expense?.billId ? (
                    <button
                      onClick={() => navigate(`${orgPath}/invoicing/employee-bills/${expense.billId}`)}
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

          {/* Receipt */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wide flex items-center gap-1.5">
                <Paperclip size={14} className="text-rivvra-400" />
                Receipt
              </h2>
              {expense?.receiptId && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleDownloadReceipt}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-dark-300 hover:text-white"
                    title="Download"
                  >
                    <Download size={12} />
                  </button>
                  {editable && (
                    <button
                      onClick={handleRemoveReceipt}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300"
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {expense?.receiptId ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-dark-200">
                  <FileText size={14} className="text-dark-400" />
                  <span className="truncate">{expense.receiptFilename || 'Receipt'}</span>
                  {expense.receiptSize && (
                    <span className="text-xs text-dark-500">({Math.round(expense.receiptSize / 1024)} KB)</span>
                  )}
                </div>
                {receiptPreviewUrl && expense.receiptMimeType?.startsWith('image/') && (
                  <img
                    src={receiptPreviewUrl}
                    alt="Receipt"
                    className="max-h-80 rounded-lg border border-dark-700"
                  />
                )}
                {receiptPreviewUrl && expense.receiptMimeType === 'application/pdf' && (
                  <iframe
                    src={receiptPreviewUrl}
                    title="Receipt PDF"
                    className="w-full h-80 rounded-lg border border-dark-700 bg-white"
                  />
                )}
              </div>
            ) : editable ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || isNew}
                className="w-full border-2 border-dashed border-dark-700 hover:border-rivvra-500/60 rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-dark-400 hover:text-rivvra-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    <Upload size={20} />
                    <div className="text-sm">{isNew ? 'Save the draft to attach a receipt' : 'Click to upload receipt'}</div>
                    <div className="text-[11px] text-dark-500">PDF, PNG, JPG · up to 10 MB</div>
                  </>
                )}
              </button>
            ) : (
              <p className="text-sm text-dark-500 italic">No receipt attached</p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => { handleUploadReceipt(e.target.files?.[0]); e.target.value = ''; }}
              className="hidden"
            />
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
        title="Approve expense"
        body="This will create an Employee Bill in Invoicing and mark the expense as synced. The submitter will be notified."
        confirmLabel="Approve & create bill"
        confirmTone="emerald"
        busy={approving}
        onConfirm={handleApprove}
        onCancel={() => setShowApprove(false)}
      />
      <ConfirmModal
        open={showReject}
        title="Reject expense"
        body="The submitter will see this reason and can revise and resubmit (after editing as a new draft)."
        confirmLabel="Reject"
        confirmTone="red"
        requireReason
        busy={rejecting}
        onConfirm={handleReject}
        onCancel={() => setShowReject(false)}
      />
      <ConfirmModal
        open={showDelete}
        title="Delete this draft?"
        body="This permanently removes the draft and any attached receipt."
        confirmLabel="Delete"
        confirmTone="red"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
