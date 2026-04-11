// ============================================================================
// InvoiceDetail.jsx — Invoice detail / view page with actions
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  ArrowLeft, Edit3, Send, Trash2, Download, Mail, Copy,
  CreditCard, XCircle, RotateCcw, Loader2, X, FileText,
  Calendar, Building2, User, Clock, AlertTriangle, Check,
  ChevronRight, ExternalLink, RefreshCw, BellRing,
} from 'lucide-react';

// ── Status badge config ──
const STATUS_CONFIG = {
  draft: { label: 'Draft', bg: 'bg-dark-600', text: 'text-dark-200', dot: 'bg-dark-400' },
  sent: { label: 'Sent', bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400' },
  viewed: { label: 'Viewed', bg: 'bg-cyan-500/15', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  overdue: { label: 'Overdue', bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-400' },
  partial: { label: 'Partially Paid', bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400' },
  paid: { label: 'Paid', bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  cancelled: { label: 'Cancelled', bg: 'bg-dark-600', text: 'text-dark-400', dot: 'bg-dark-500' },
  credit_note: { label: 'Credit Note', bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-400' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatCurrency(amount, currency = 'INR') {
  if (amount == null) return `${currency} 0.00`;
  return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function InvoiceDetail() {
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const { invoiceId } = useParams();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // action key while loading

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Fetch invoice ──
  const fetchInvoice = useCallback(async () => {
    if (!orgSlug || !invoiceId) return;
    try {
      setLoading(true);
      const res = await invoicingApi.getInvoice(orgSlug, invoiceId);
      if (res?.invoice) {
        setInvoice({ ...res.invoice, payments: res.payments || res.invoice.payments || [] });
      } else {
        showToast('Invoice not found', 'error');
        navigate(orgPath('/invoicing/invoices'));
      }
    } catch (err) {
      showToast('Failed to load invoice', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  // ── Actions ──
  const handleSend = async () => {
    try {
      setActionLoading('send');
      await invoicingApi.sendInvoice(orgSlug, invoiceId);
      showToast('Invoice sent');
      fetchInvoice();
    } catch (err) {
      showToast(err.message || 'Failed to send invoice', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    try {
      setActionLoading('cancel');
      await invoicingApi.cancelInvoice(orgSlug, invoiceId);
      showToast('Invoice cancelled');
      fetchInvoice();
    } catch (err) {
      showToast(err.message || 'Failed to cancel invoice', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetToDraft = async () => {
    try {
      setActionLoading('reset');
      await invoicingApi.resetToDraft(orgSlug, invoiceId);
      showToast('Invoice reset to draft');
      fetchInvoice();
    } catch (err) {
      showToast(err.message || 'Failed to reset invoice', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDuplicate = async () => {
    try {
      setActionLoading('duplicate');
      const res = await invoicingApi.duplicateInvoice(orgSlug, invoiceId);
      showToast('Invoice duplicated');
      if (res?.invoice?._id) {
        navigate(orgPath(`/invoicing/invoices/${res.invoice._id}`));
      }
    } catch (err) {
      showToast(err.message || 'Failed to duplicate invoice', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateCreditNote = async () => {
    try {
      setActionLoading('credit');
      const res = await invoicingApi.createCreditNote(orgSlug, invoiceId);
      showToast('Credit note created');
      if (res?.invoice?._id) {
        navigate(orgPath(`/invoicing/invoices/${res.invoice._id}`));
      }
    } catch (err) {
      showToast(err.message || 'Failed to create credit note', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVoidPayment = async (paymentId) => {
    if (!confirm('Are you sure you want to void this payment? The invoice status will be updated accordingly.')) return;
    try {
      setActionLoading('voidPayment');
      await invoicingApi.deletePayment(orgSlug, paymentId);
      showToast('Payment voided');
      fetchInvoice();
    } catch (err) {
      showToast(err.message || 'Failed to void payment', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setActionLoading('pdf');
      const response = await invoicingApi.downloadPdf(orgSlug, invoiceId);
      // response is a raw Response object (from { raw: true })
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice?.number || invoice?.invoiceNumber || 'invoice'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('PDF downloaded');
    } catch (err) {
      showToast(err.message || 'Failed to download PDF', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    try {
      setActionLoading('delete');
      await invoicingApi.deleteInvoice(orgSlug, invoiceId);
      showToast('Invoice deleted');
      navigate(orgPath('/invoicing/invoices'));
    } catch (err) {
      showToast(err.message || 'Failed to delete invoice', 'error');
    } finally {
      setActionLoading(null);
      setShowDeleteConfirm(false);
    }
  };

  const handleSendFollowUp = async () => {
    try {
      setActionLoading('followup');
      await invoicingApi.sendFollowUp(orgSlug, invoiceId, {});
      showToast('Follow-up sent');
    } catch (err) {
      showToast(err.message || 'Failed to send follow-up', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-rivvra-500" />
      </div>
    );
  }

  if (!invoice) return null;

  const status = invoice.status || 'draft';
  const customer = invoice.customer || { name: invoice.contactName, email: invoice.contactEmail };
  const currency = invoice.currency || 'INR';
  const lineItems = invoice.lines || invoice.lineItems || [];
  const payments = invoice.payments || [];
  const amountDue = invoice.amountDue ?? invoice.total ?? 0;

  return (
    <div className="min-h-screen bg-dark-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={() => navigate(orgPath('/invoicing/invoices'))}
              className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-white truncate">
                  {invoice.number || 'Invoice'}
                </h1>
                <StatusBadge status={status} />
              </div>
              <p className="text-sm text-dark-400 mt-0.5">
                {customer.name || customer.company || customer.email || 'No customer'}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Draft actions */}
            {status === 'draft' && (
              <>
                <Link
                  to={orgPath(`/invoicing/invoices/${invoiceId}/edit`)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dark-600 text-dark-300 hover:text-white hover:border-dark-500 text-sm transition-colors"
                >
                  <Edit3 size={14} /> Edit
                </Link>
                <ActionBtn
                  icon={Send}
                  label="Send"
                  onClick={handleSend}
                  loading={actionLoading === 'send'}
                  primary
                />
                <ActionBtn
                  icon={Trash2}
                  label="Delete"
                  onClick={() => setShowDeleteConfirm(true)}
                  danger
                />
              </>
            )}

            {/* Sent actions */}
            {(status === 'sent' || status === 'viewed' || status === 'partial') && (
              <>
                <ActionBtn
                  icon={CreditCard}
                  label="Record Payment"
                  onClick={() => setShowPaymentModal(true)}
                  primary
                />
                <ActionBtn
                  icon={Download}
                  label="PDF"
                  onClick={handleDownloadPdf}
                  loading={actionLoading === 'pdf'}
                />
                <ActionBtn
                  icon={Mail}
                  label="Email"
                  onClick={() => setShowEmailModal(true)}
                />
                <ActionBtn
                  icon={FileText}
                  label="Credit Note"
                  onClick={handleCreateCreditNote}
                  loading={actionLoading === 'credit'}
                />
                <ActionBtn
                  icon={XCircle}
                  label="Cancel"
                  onClick={handleCancel}
                  loading={actionLoading === 'cancel'}
                  danger
                />
              </>
            )}

            {/* Overdue actions */}
            {status === 'overdue' && (
              <>
                <ActionBtn
                  icon={CreditCard}
                  label="Record Payment"
                  onClick={() => setShowPaymentModal(true)}
                  primary
                />
                <ActionBtn
                  icon={Download}
                  label="PDF"
                  onClick={handleDownloadPdf}
                  loading={actionLoading === 'pdf'}
                />
                <ActionBtn
                  icon={Mail}
                  label="Email"
                  onClick={() => setShowEmailModal(true)}
                />
                <ActionBtn
                  icon={BellRing}
                  label="Follow-up"
                  onClick={handleSendFollowUp}
                  loading={actionLoading === 'followup'}
                />
              </>
            )}

            {/* Paid actions */}
            {status === 'paid' && (
              <>
                <ActionBtn
                  icon={Download}
                  label="PDF"
                  onClick={handleDownloadPdf}
                  loading={actionLoading === 'pdf'}
                />
                <ActionBtn
                  icon={FileText}
                  label="Credit Note"
                  onClick={handleCreateCreditNote}
                  loading={actionLoading === 'creditNote'}
                />
                <ActionBtn
                  icon={Copy}
                  label="Duplicate"
                  onClick={handleDuplicate}
                  loading={actionLoading === 'duplicate'}
                />
              </>
            )}

            {/* Cancelled actions */}
            {status === 'cancelled' && (
              <ActionBtn
                icon={RotateCcw}
                label="Reset to Draft"
                onClick={handleResetToDraft}
                loading={actionLoading === 'reset'}
              />
            )}
          </div>
        </div>

        {/* ── Info Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* From */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={14} className="text-dark-400" />
              <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">From</h3>
            </div>
            <p className="text-sm text-white font-medium">
              {invoice.company?.name || invoice.orgName || 'Your Company'}
            </p>
            {invoice.company?.email && (
              <p className="text-xs text-dark-400 mt-0.5">{invoice.company.email}</p>
            )}
            {invoice.company?.address && (
              <p className="text-xs text-dark-400 mt-0.5">{invoice.company.address}</p>
            )}
          </div>

          {/* To */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <User size={14} className="text-dark-400" />
              <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">To</h3>
            </div>
            <p className="text-sm text-white font-medium">
              {customer.name || customer.company || 'Customer'}
            </p>
            {customer.email && (
              <p className="text-xs text-dark-400 mt-0.5">{customer.email}</p>
            )}
            {customer.phone && (
              <p className="text-xs text-dark-400 mt-0.5">{customer.phone}</p>
            )}
            {(customer.address || customer.city) && (
              <p className="text-xs text-dark-400 mt-0.5">
                {[customer.address, customer.city, customer.state, customer.zip]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={14} className="text-dark-400" />
              <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Dates</h3>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Issued</span>
                <span className="text-white">{formatDate(invoice.invoiceDate)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Due</span>
                <span className={`${status === 'overdue' ? 'text-red-400' : 'text-white'}`}>
                  {formatDate(invoice.dueDate)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Terms & Amount */}
          <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard size={14} className="text-dark-400" />
              <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Payment</h3>
            </div>
            <div className="space-y-1.5">
              {invoice.paymentTerms && (
                <div className="flex justify-between text-sm">
                  <span className="text-dark-400">Terms</span>
                  <span className="text-white">
                    {typeof invoice.paymentTerms === 'object'
                      ? invoice.paymentTerms.name
                      : invoice.paymentTerms}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Due</span>
                <span className="text-rivvra-400 font-bold">
                  {formatCurrency(amountDue, currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Line Items Table ── */}
        <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-dark-700">
            <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
              Line Items
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left text-xs font-medium text-dark-400 uppercase px-5 py-3">#</th>
                  <th className="text-left text-xs font-medium text-dark-400 uppercase px-3 py-3">Description</th>
                  <th className="text-right text-xs font-medium text-dark-400 uppercase px-3 py-3">Qty</th>
                  <th className="text-right text-xs font-medium text-dark-400 uppercase px-3 py-3">Unit Price</th>
                  <th className="text-right text-xs font-medium text-dark-400 uppercase px-3 py-3">Disc %</th>
                  <th className="text-left text-xs font-medium text-dark-400 uppercase px-3 py-3">Tax</th>
                  <th className="text-right text-xs font-medium text-dark-400 uppercase px-5 py-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, i) => {
                  const lineTotal = li.total ?? ((li.quantity || 0) * (li.unitPrice || 0));

                  return (
                    <tr key={li._id || i} className="border-b border-dark-700/50 hover:bg-dark-800/30">
                      <td className="px-5 py-3 text-dark-400">{i + 1}</td>
                      <td className="px-3 py-3">
                        <p className="text-white">
                          {li.description || '-'}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right text-white">{li.quantity}</td>
                      <td className="px-3 py-3 text-right text-white">
                        {formatCurrency(li.unitPrice, currency)}
                      </td>
                      <td className="px-3 py-3 text-right text-white">
                        {(li.discount || li.discountPercent) ? `${li.discount || li.discountPercent}%` : '-'}
                      </td>
                      <td className="px-3 py-3 text-dark-400 text-xs">
                        {(li.taxIds || li.taxes || [])
                          .map((t) => (typeof t === 'object' ? t.name : t))
                          .join(', ') || '-'}
                      </td>
                      <td className="px-5 py-3 text-right text-white font-medium">
                        {formatCurrency(lineTotal, currency)}
                      </td>
                    </tr>
                  );
                })}
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-dark-500">
                      No line items
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t border-dark-700 px-5 py-4">
            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-dark-400">Subtotal</span>
                  <span className="text-white">
                    {formatCurrency(invoice.subtotal, currency)}
                  </span>
                </div>
                {(invoice.totalDiscount > 0 || invoice.discountAmount > 0) && (
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-400">Discount</span>
                    <span className="text-amber-400">
                      -{formatCurrency(invoice.totalDiscount || invoice.discountAmount, currency)}
                    </span>
                  </div>
                )}
                {(invoice.totalTax > 0 || invoice.taxAmount > 0) && (
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-400">Tax</span>
                    <span className="text-white">
                      {formatCurrency(invoice.totalTax || invoice.taxAmount, currency)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t border-dark-600 pt-2">
                  <span className="text-white">Total</span>
                  <span className="text-white">
                    {formatCurrency(invoice.total, currency)}
                  </span>
                </div>
                {payments.length > 0 && (
                  <div className="flex justify-between text-base font-bold text-rivvra-400">
                    <span>Amount Due</span>
                    <span>{formatCurrency(amountDue, currency)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Payment History ── */}
        {payments.length > 0 && (
          <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-dark-700">
              <h2 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
                Payment History
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left text-xs font-medium text-dark-400 uppercase px-5 py-3">Date</th>
                    <th className="text-left text-xs font-medium text-dark-400 uppercase px-3 py-3">Method</th>
                    <th className="text-left text-xs font-medium text-dark-400 uppercase px-3 py-3">Reference</th>
                    <th className="text-left text-xs font-medium text-dark-400 uppercase px-3 py-3">Notes</th>
                    <th className="text-right text-xs font-medium text-dark-400 uppercase px-5 py-3">Amount</th>
                    <th className="text-right text-xs font-medium text-dark-400 uppercase px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((pmt, i) => (
                    <tr key={pmt._id || i} className="border-b border-dark-700/50 hover:bg-dark-800/30">
                      <td className="px-5 py-3 text-white">{formatDate(pmt.date || pmt.paymentDate)}</td>
                      <td className="px-3 py-3 text-dark-300 capitalize">{pmt.method || pmt.paymentMethod || '-'}</td>
                      <td className="px-3 py-3 text-dark-400">{pmt.reference || '-'}</td>
                      <td className="px-3 py-3 text-dark-400 max-w-xs truncate">{pmt.notes || '-'}</td>
                      <td className="px-5 py-3 text-right text-emerald-400 font-medium">
                        {formatCurrency(pmt.amount, currency)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleVoidPayment(pmt._id)}
                          disabled={actionLoading === 'voidPayment'}
                          className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded px-2 py-1 hover:bg-red-500/10 transition-colors"
                        >
                          Void
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Notes ── */}
        {(invoice.notes || invoice.internalNotes) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {invoice.notes && (
              <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">
                  Notes
                </h3>
                <p className="text-sm text-dark-300 whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}
            {invoice.internalNotes && (
              <div className="bg-dark-850 border border-dark-700 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">
                  Internal Notes
                </h3>
                <p className="text-sm text-dark-300 whitespace-pre-wrap">{invoice.internalNotes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
         Modals
         ══════════════════════════════════════════════════════════════════════ */}

      {/* ── Record Payment Modal ── */}
      {showPaymentModal && (
        <RecordPaymentModal
          orgSlug={orgSlug}
          invoiceId={invoiceId}
          currency={currency}
          amountDue={amountDue}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            fetchInvoice();
          }}
          showToast={showToast}
        />
      )}

      {/* ── Email Modal ── */}
      {showEmailModal && (
        <EmailInvoiceModal
          orgSlug={orgSlug}
          invoiceId={invoiceId}
          customerEmail={customer.email || ''}
          invoiceNumber={invoice.number || ''}
          onClose={() => setShowEmailModal(false)}
          onSuccess={() => {
            setShowEmailModal(false);
            showToast('Email sent');
          }}
          showToast={showToast}
        />
      )}

      {/* ── Delete Confirmation ── */}
      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete Invoice"
          message={`Are you sure you want to delete ${invoice.number || 'this invoice'}? This action cannot be undone.`}
          confirmLabel="Delete"
          danger
          loading={actionLoading === 'delete'}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// ActionBtn — small action button used in the header
// ============================================================================

function ActionBtn({ icon: Icon, label, onClick, loading, primary, danger }) {
  let cls =
    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 ';
  if (primary) {
    cls += 'bg-rivvra-500 hover:bg-rivvra-600 text-white font-medium';
  } else if (danger) {
    cls += 'border border-red-500/30 text-red-400 hover:bg-red-500/10';
  } else {
    cls += 'border border-dark-600 text-dark-300 hover:text-white hover:border-dark-500';
  }

  return (
    <button onClick={onClick} disabled={loading} className={cls}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ============================================================================
// RecordPaymentModal
// ============================================================================

function RecordPaymentModal({ orgSlug, invoiceId, currency, amountDue, onClose, onSuccess, showToast }) {
  const [form, setForm] = useState({
    amount: amountDue || 0,
    method: 'bank_transfer',
    date: new Date().toISOString().slice(0, 10),
    reference: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const inputCls =
    'w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-rivvra-500 focus:border-transparent';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    try {
      setSaving(true);
      await invoicingApi.recordPayment(orgSlug, {
        invoiceId: invoiceId,
        amount: Number(form.amount),
        method: form.method,
        date: form.date,
        reference: form.reference,
        notes: form.notes,
      });
      showToast('Payment recorded');
      onSuccess();
    } catch (err) {
      showToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-dark-850 border border-dark-700 rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <h2 className="text-lg font-bold text-white">Record Payment</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              Amount ({currency}) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className={inputCls}
              autoFocus
            />
            {amountDue > 0 && (
              <p className="text-xs text-dark-400 mt-1">
                Amount due: {currency} {Number(amountDue).toFixed(2)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Payment Method</label>
            <select
              value={form.method}
              onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
              className={inputCls}
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="credit_card">Credit Card</option>
              <option value="debit_card">Debit Card</option>
              <option value="upi">UPI</option>
              <option value="paypal">PayPal</option>
              <option value="stripe">Stripe</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Payment Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Reference / Transaction ID</label>
            <input
              type="text"
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              placeholder="e.g. TXN-123456"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Optional notes..."
              className={inputCls}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-dark-600 text-dark-300 hover:text-white hover:border-dark-500 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Record Payment
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

// ============================================================================
// EmailInvoiceModal
// ============================================================================

function EmailInvoiceModal({ orgSlug, invoiceId, customerEmail, invoiceNumber, onClose, onSuccess, showToast }) {
  const [form, setForm] = useState({
    to: customerEmail,
    subject: `Invoice ${invoiceNumber}`,
    message: `Please find attached invoice ${invoiceNumber}. Let us know if you have any questions.`,
  });
  const [sending, setSending] = useState(false);

  const inputCls =
    'w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-rivvra-500 focus:border-transparent';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.to) {
      showToast('Email address is required', 'error');
      return;
    }
    try {
      setSending(true);
      await invoicingApi.emailInvoice(orgSlug, invoiceId, {
        to: form.to,
        subject: form.subject,
        message: form.message,
      });
      onSuccess();
    } catch (err) {
      showToast(err.message || 'Failed to send email', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-dark-850 border border-dark-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <h2 className="text-lg font-bold text-white">Email Invoice</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              To <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={form.to}
              onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
              placeholder="customer@email.com"
              className={inputCls}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Subject</label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Message</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              rows={4}
              className={inputCls}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-dark-600 text-dark-300 hover:text-white hover:border-dark-500 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send Email
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

// ============================================================================
// ConfirmModal — generic confirmation dialog
// ============================================================================

function ConfirmModal({ title, message, confirmLabel, danger, loading, onConfirm, onCancel }) {
  return (
    <ModalOverlay onClose={onCancel}>
      <div className="bg-dark-850 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className={`p-2 rounded-lg ${danger ? 'bg-red-500/15' : 'bg-amber-500/15'}`}>
              <AlertTriangle size={20} className={danger ? 'text-red-400' : 'text-amber-400'} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <p className="text-sm text-dark-400 mt-1">{message}</p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-dark-600 text-dark-300 hover:text-white hover:border-dark-500 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                danger
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-rivvra-500 hover:bg-rivvra-600 text-white'
              }`}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {confirmLabel || 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ============================================================================
// ModalOverlay — shared overlay backdrop
// ============================================================================

function ModalOverlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
