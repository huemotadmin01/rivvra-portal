// ============================================================================
// InvoiceDetail.jsx — Odoo-style invoice detail page with chatter sidebar
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import ActivityPanel from '../../components/shared/ActivityPanel';
import DocumentPreviewModal from '../../components/shared/DocumentPreviewModal';
import {
  ArrowLeft, Send, Trash2, Download, Mail, Copy,
  CreditCard, XCircle, RotateCcw, Loader2, X, FileText,
  AlertTriangle, Check, Info, Upload, Eye, Paperclip,
  User, Calendar, Clock, RefreshCw, BellRing, Edit3,
} from 'lucide-react';

// ── Helpers ──

function formatCurrency(amount, currency = 'INR') {
  if (amount == null) return '\u20B90.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ── Status stepper config ──
const STATUS_STEPS = ['draft', 'sent', 'paid'];

function getStepIndex(status) {
  if (status === 'paid') return 2;
  if (status === 'sent' || status === 'overdue' || status === 'partial' || status === 'viewed') return 1;
  if (status === 'cancelled') return -1;
  return 0;
}

function getInvoiceTypeLabel(invoice) {
  if (invoice.type === 'credit_note' || invoice.isCreditNote) return 'Credit Note';
  if (invoice.type === 'vendor_bill' || invoice.isVendorBill) return 'Vendor Bill';
  return 'Customer Invoice';
}

// ============================================================================
// Main Component
// ============================================================================

export default function InvoiceDetail() {
  const { orgSlug } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const { invoiceId } = useParams();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [activeTab, setActiveTab] = useState('lines');

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ── Fetch invoice ──
  const fetchInvoice = useCallback(async () => {
    if (!orgSlug || !invoiceId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await invoicingApi.getInvoice(orgSlug, invoiceId);
      if (res?.invoice) {
        setInvoice({ ...res.invoice, payments: res.payments || res.invoice.payments || [] });
      } else {
        setError('Invoice not found');
        showToast('Invoice not found', 'error');
      }
    } catch (err) {
      setError(err.message || 'Failed to load invoice');
      showToast('Failed to load invoice', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch attachments ──
  const fetchAttachments = useCallback(async () => {
    if (!orgSlug || !invoiceId) return;
    try {
      setAttachmentsLoading(true);
      const res = await invoicingApi.listAttachments(orgSlug, invoiceId);
      setAttachments(res?.attachments || res?.documents || []);
    } catch {
      // silent fail for attachments
    } finally {
      setAttachmentsLoading(false);
    }
  }, [orgSlug, invoiceId]);

  useEffect(() => {
    fetchInvoice();
    fetchAttachments();
  }, [fetchInvoice, fetchAttachments]);

  // ── Action handlers ──
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
    if (!confirm('Are you sure you want to void this payment?')) return;
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
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice?.number || 'invoice'}.pdf`;
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

  // ── Attachment handlers ──
  const handleFileUpload = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('File size must be under 10MB', 'error');
      return;
    }
    try {
      setUploadingFile(true);
      await invoicingApi.uploadAttachment(orgSlug, invoiceId, file);
      showToast('File uploaded');
      fetchAttachments();
    } catch (err) {
      showToast(err.message || 'Failed to upload file', 'error');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteAttachment = async (docId) => {
    if (!confirm('Delete this attachment?')) return;
    try {
      await invoicingApi.deleteAttachment(orgSlug, invoiceId, docId);
      showToast('Attachment deleted');
      fetchAttachments();
    } catch (err) {
      showToast(err.message || 'Failed to delete attachment', 'error');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-rivvra-500" />
          <span className="text-sm text-dark-400">Loading invoice...</span>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="bg-dark-850 border border-dark-700 rounded-xl p-8 text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white mb-1">Invoice Not Found</h2>
          <p className="text-sm text-dark-400 mb-4">{error || 'The invoice could not be loaded.'}</p>
          <button
            onClick={() => navigate(orgPath('/invoicing/invoices'))}
            className="px-4 py-2 bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm rounded-lg transition-colors"
          >
            Back to Invoices
          </button>
        </div>
      </div>
    );
  }

  const status = invoice.status || 'draft';
  const currency = invoice.currency || 'INR';
  const lineItems = invoice.lines || invoice.lineItems || [];
  const payments = invoice.payments || [];
  const amountDue = invoice.amountDue ?? invoice.total ?? 0;
  const stepIndex = getStepIndex(status);
  const typeLabel = getInvoiceTypeLabel(invoice);

  // Build address string
  const addressParts = [
    invoice.contactAddress || invoice.customer?.address,
    invoice.customer?.city,
    invoice.customer?.state,
    invoice.customer?.zip,
    invoice.customer?.country,
  ].filter(Boolean);
  const addressStr = addressParts.join(', ');

  return (
    <div className="min-h-screen bg-dark-900">
      {/* ══════════════════════════════════════════════════════════════════
         TOP BAR — Actions + Status Stepper
         ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-dark-850 border-b border-dark-700 px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Left: Back + Action Buttons */}
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <button
              onClick={() => navigate(orgPath('/invoicing/invoices'))}
              className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft size={18} />
            </button>

            {/* Draft actions */}
            {status === 'draft' && (
              <>
                <ActionBtn icon={Send} label="Send" onClick={handleSend} loading={actionLoading === 'send'} primary />
                <ActionBtn icon={Download} label="Print / PDF" onClick={handleDownloadPdf} loading={actionLoading === 'pdf'} />
                <Link
                  to={orgPath(`/invoicing/invoices/${invoiceId}/edit`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-600 text-dark-300 hover:text-white hover:border-dark-500 text-sm transition-colors"
                >
                  <Edit3 size={14} /> Edit
                </Link>
                <ActionBtn icon={Trash2} label="Delete" onClick={() => setShowDeleteConfirm(true)} danger />
              </>
            )}

            {/* Sent / Viewed / Partial / Overdue actions */}
            {['sent', 'viewed', 'partial', 'overdue'].includes(status) && (
              <>
                <ActionBtn icon={CreditCard} label="Record Payment" onClick={() => setShowPaymentModal(true)} primary />
                <ActionBtn icon={Send} label="Send" onClick={handleSend} loading={actionLoading === 'send'} />
                <ActionBtn icon={Download} label="Print / PDF" onClick={handleDownloadPdf} loading={actionLoading === 'pdf'} />
                <ActionBtn icon={FileText} label="Credit Note" onClick={handleCreateCreditNote} loading={actionLoading === 'credit'} />
                <ActionBtn icon={Mail} label="Email" onClick={() => setShowEmailModal(true)} />
                {status === 'overdue' && (
                  <ActionBtn icon={BellRing} label="Follow-up" onClick={handleSendFollowUp} loading={actionLoading === 'followup'} />
                )}
                <ActionBtn icon={XCircle} label="Cancel" onClick={handleCancel} loading={actionLoading === 'cancel'} danger />
              </>
            )}

            {/* Paid actions */}
            {status === 'paid' && (
              <>
                <ActionBtn icon={Download} label="Print / PDF" onClick={handleDownloadPdf} loading={actionLoading === 'pdf'} />
                <ActionBtn icon={FileText} label="Credit Note" onClick={handleCreateCreditNote} loading={actionLoading === 'credit'} />
                <ActionBtn icon={Copy} label="Duplicate" onClick={handleDuplicate} loading={actionLoading === 'duplicate'} />
              </>
            )}

            {/* Cancelled actions */}
            {status === 'cancelled' && (
              <ActionBtn icon={RotateCcw} label="Reset to Draft" onClick={handleResetToDraft} loading={actionLoading === 'reset'} />
            )}
          </div>

          {/* Right: Status Stepper */}
          <div className="flex items-center gap-1 shrink-0">
            {STATUS_STEPS.map((step, i) => {
              const isActive = i === stepIndex;
              const isPast = i < stepIndex;
              const label = step.charAt(0).toUpperCase() + step.slice(1);

              let cls = 'px-4 py-1.5 text-xs font-semibold rounded-full transition-colors ';
              if (isActive) {
                cls += 'bg-rivvra-500 text-white';
              } else if (isPast) {
                cls += 'bg-dark-700 text-dark-300';
              } else {
                cls += 'border border-dark-600 text-dark-500';
              }

              return (
                <div key={step} className="flex items-center">
                  {i > 0 && <div className={`w-6 h-px mx-0.5 ${i <= stepIndex ? 'bg-rivvra-500' : 'bg-dark-600'}`} />}
                  <span className={cls}>{label}</span>
                </div>
              );
            })}
            {status === 'cancelled' && (
              <div className="flex items-center">
                <div className="w-6 h-px mx-0.5 bg-dark-600" />
                <span className="px-4 py-1.5 text-xs font-semibold rounded-full bg-red-500/15 text-red-400">
                  Cancelled
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
         BODY — 2-column layout (content + sidebar)
         ══════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── LEFT: Invoice Content (2/3) ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Header card with PAID stamp */}
            <div className="bg-dark-850 border border-dark-700 rounded-xl p-6 relative overflow-hidden">
              {/* PAID stamp overlay */}
              {status === 'paid' && (
                <div className="absolute top-6 right-[-20px] rotate-[30deg] z-10 pointer-events-none">
                  <div className="bg-emerald-500/20 border-2 border-emerald-500/40 px-8 py-1.5 rounded">
                    <span className="text-emerald-500 font-extrabold text-3xl tracking-widest uppercase">
                      PAID
                    </span>
                  </div>
                </div>
              )}

              {/* Type label */}
              <p className="text-sm text-dark-400 mb-1">{typeLabel}</p>

              {/* Invoice number */}
              <h1 className="text-2xl font-bold text-white mb-6">
                {invoice.number || 'Draft Invoice'}
              </h1>

              {/* Form fields — 2-column grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                {/* Left column */}
                <div className="space-y-4">
                  <FormField label="Customer">
                    <span className="text-rivvra-500 font-semibold">
                      {invoice.contactName || invoice.customer?.name || '-'}
                    </span>
                    {addressStr && (
                      <p className="text-sm text-dark-400 mt-0.5">{addressStr}</p>
                    )}
                    {invoice.contactEmail && (
                      <p className="text-sm text-dark-400">{invoice.contactEmail}</p>
                    )}
                    {invoice.customerGstin && (
                      <p className="text-sm text-dark-400 mt-0.5">GSTIN: {invoice.customerGstin}</p>
                    )}
                  </FormField>
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  <FormField label="Invoice Date">
                    <span className="text-white">{formatDate(invoice.invoiceDate)}</span>
                  </FormField>

                  <FormField label="Payment Terms">
                    <span className="text-white">
                      {invoice.paymentTerms
                        ? typeof invoice.paymentTerms === 'object'
                          ? invoice.paymentTerms.name
                          : invoice.paymentTerms
                        : 'Due on Receipt'}
                    </span>
                  </FormField>

                  <FormField label="Due Date">
                    <span className={status === 'overdue' ? 'text-red-400 font-medium' : 'text-white'}>
                      {formatDate(invoice.dueDate)}
                    </span>
                  </FormField>

                  <FormField label="Currency">
                    <span className="text-white">{currency}</span>
                  </FormField>

                  {invoice.placeOfSupply && (
                    <FormField label="Place of Supply">
                      <span className="text-white">{invoice.placeOfSupply}</span>
                    </FormField>
                  )}

                  {invoice.gstTreatment && (
                    <FormField label="GST Treatment">
                      <span className="text-white">{invoice.gstTreatment}</span>
                    </FormField>
                  )}
                </div>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
              {/* Tab headers */}
              <div className="flex border-b border-dark-700 px-6">
                <button
                  onClick={() => setActiveTab('lines')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === 'lines'
                      ? 'border-rivvra-500 text-white'
                      : 'border-transparent text-dark-400 hover:text-dark-300'
                  }`}
                >
                  Invoice Lines
                </button>
                <button
                  onClick={() => setActiveTab('other')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === 'other'
                      ? 'border-rivvra-500 text-white'
                      : 'border-transparent text-dark-400 hover:text-dark-300'
                  }`}
                >
                  Other Info
                </button>
              </div>

              {/* Tab content */}
              {activeTab === 'lines' && (
                <div>
                  {/* Invoice Lines table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-dark-800">
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-6 py-3">Product</th>
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Description</th>
                          <th className="text-right text-xs font-medium text-dark-400 uppercase px-4 py-3">Qty</th>
                          <th className="text-right text-xs font-medium text-dark-400 uppercase px-4 py-3">Unit Price</th>
                          <th className="text-left text-xs font-medium text-dark-400 uppercase px-4 py-3">Taxes</th>
                          <th className="text-right text-xs font-medium text-dark-400 uppercase px-6 py-3">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((li, i) => {
                          const lineTotal = li.total ?? li.subtotal ?? ((li.quantity || 0) * (li.unitPrice || 0));
                          return (
                            <tr key={li._id || i} className="border-b border-dark-700/50 hover:bg-dark-800/30">
                              <td className="px-6 py-3 text-white">
                                {li.product?.name || li.productName || '-'}
                              </td>
                              <td className="px-4 py-3 text-dark-300 max-w-xs">
                                {li.description || '-'}
                              </td>
                              <td className="px-4 py-3 text-right text-white">{li.quantity ?? 0}</td>
                              <td className="px-4 py-3 text-right text-white">
                                {formatCurrency(li.unitPrice, currency)}
                              </td>
                              <td className="px-4 py-3 text-dark-400 text-xs">
                                {(li.taxIds || li.taxes || [])
                                  .map((t) => (typeof t === 'object' ? t.name : t))
                                  .join(', ') || '-'}
                              </td>
                              <td className="px-6 py-3 text-right text-white font-medium">
                                {formatCurrency(lineTotal, currency)}
                              </td>
                            </tr>
                          );
                        })}
                        {lineItems.length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center py-10 text-dark-500">
                              No invoice lines
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals section */}
                  <div className="border-t border-dark-700 px-6 py-5">
                    <div className="flex justify-end">
                      <div className="w-full max-w-xs space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-dark-400">Untaxed Amount</span>
                          <span className="text-white">
                            {formatCurrency(invoice.subtotal, currency)}
                          </span>
                        </div>

                        {/* Tax breakdown — show taxTotal or individual tax lines */}
                        {(invoice.taxTotal > 0 || invoice.totalTax > 0 || invoice.taxAmount > 0) && (
                          <div className="flex justify-between text-sm">
                            <span className="text-dark-400">
                              {invoice.taxBreakdown?.[0]?.name || 'Taxes'}
                            </span>
                            <span className="text-white">
                              {formatCurrency(invoice.taxTotal || invoice.totalTax || invoice.taxAmount, currency)}
                            </span>
                          </div>
                        )}

                        {(invoice.totalDiscount > 0 || invoice.discountAmount > 0) && (
                          <div className="flex justify-between text-sm">
                            <span className="text-dark-400">Discount</span>
                            <span className="text-amber-400">
                              -{formatCurrency(invoice.totalDiscount || invoice.discountAmount, currency)}
                            </span>
                          </div>
                        )}

                        <div className="border-t border-dark-600 my-1" />

                        <div className="flex justify-between text-base font-bold">
                          <span className="text-white">Total</span>
                          <span className="text-white">
                            {formatCurrency(invoice.total, currency)}
                          </span>
                        </div>

                        {invoice.amountPaid > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-dark-400">Amount Paid</span>
                            <span className="text-emerald-400">
                              {formatCurrency(invoice.amountPaid, currency)}
                            </span>
                          </div>
                        )}

                        {payments.length > 0 && amountDue > 0 && (
                          <div className="flex justify-between text-base font-bold text-rivvra-400 border-t border-dark-600 pt-2">
                            <span>Amount Due</span>
                            <span>{formatCurrency(amountDue, currency)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Payment info lines */}
                  {payments.length > 0 && (
                    <div className="border-t border-dark-700 px-6 py-4 space-y-2">
                      {payments.map((pmt, i) => (
                        <div key={pmt._id || i} className="flex items-center gap-2 text-sm text-emerald-400">
                          <Info size={14} className="shrink-0" />
                          <span>
                            Paid on {formatDate(pmt.date || pmt.paymentDate)}
                          </span>
                          <span className="font-medium ml-4">
                            {formatCurrency(pmt.amount, currency)}
                          </span>
                          {pmt._id && (
                            <button
                              onClick={() => handleVoidPayment(pmt._id)}
                              disabled={actionLoading === 'voidPayment'}
                              className="ml-auto text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded px-2 py-0.5 hover:bg-red-500/10 transition-colors"
                            >
                              Void
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'other' && (
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    {/* Left column */}
                    <div className="space-y-4">
                      {invoice.salesperson && (
                        <FormField label="Salesperson">
                          <span className="text-white">
                            {typeof invoice.salesperson === 'object'
                              ? invoice.salesperson.name || invoice.salesperson.email
                              : invoice.salesperson}
                          </span>
                        </FormField>
                      )}

                      {(invoice.creditNoteForId || invoice.parentInvoiceId) && (
                        <FormField label="Source Document">
                          <Link
                            to={orgPath(`/invoicing/invoices/${invoice.creditNoteForId || invoice.parentInvoiceId}`)}
                            className="text-rivvra-500 hover:underline text-sm"
                          >
                            View Original Invoice
                          </Link>
                        </FormField>
                      )}

                      {invoice.notes && (
                        <FormField label="Notes (Customer-Facing)">
                          <p className="text-dark-300 text-sm whitespace-pre-wrap">{invoice.notes}</p>
                        </FormField>
                      )}

                      {invoice.internalNotes && (
                        <FormField label="Internal Notes">
                          <p className="text-dark-300 text-sm whitespace-pre-wrap">{invoice.internalNotes}</p>
                        </FormField>
                      )}
                    </div>

                    {/* Right column */}
                    <div className="space-y-4">
                      {invoice.createdBy && (
                        <FormField label="Created By">
                          <span className="text-white">
                            {typeof invoice.createdBy === 'object'
                              ? invoice.createdBy.name || invoice.createdBy.email
                              : invoice.createdBy}
                          </span>
                        </FormField>
                      )}

                      {invoice.createdAt && (
                        <FormField label="Created At">
                          <span className="text-white">{formatDate(invoice.createdAt)}</span>
                        </FormField>
                      )}

                      {invoice.isRecurring && (
                        <FormField label="Recurring">
                          <span className="text-white">
                            {invoice.recurringInterval
                              ? `Every ${invoice.recurringInterval} ${invoice.recurringPeriod || 'month'}(s)`
                              : 'Yes'}
                          </span>
                          {invoice.nextRecurringDate && (
                            <p className="text-sm text-dark-400 mt-0.5">
                              Next: {formatDate(invoice.nextRecurringDate)}
                            </p>
                          )}
                        </FormField>
                      )}

                      {invoice.sourceDocument && (
                        <FormField label="Source Document">
                          <span className="text-white">{invoice.sourceDocument}</span>
                        </FormField>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT SIDEBAR (1/3) ── */}
          <div className="lg:col-span-1 space-y-6">
            {/* Chatter / Activity Panel */}
            <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
              <ActivityPanel
                orgSlug={orgSlug}
                entityType="invoice"
                entityId={invoiceId}
              />
            </div>

            {/* Attachments */}
            <div className="bg-dark-850 border border-dark-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-dark-700">
                <div className="flex items-center gap-2">
                  <Paperclip size={14} className="text-dark-400" />
                  <h3 className="text-sm font-semibold text-white">Attachments</h3>
                  <span className="text-xs text-dark-500">({attachments.length})</span>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Drop zone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    dragOver
                      ? 'border-rivvra-500 bg-rivvra-500/5'
                      : 'border-dark-600 hover:border-dark-500'
                  }`}
                >
                  {uploadingFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin text-rivvra-500" />
                      <span className="text-sm text-dark-400">Uploading...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Upload size={18} className="text-dark-500" />
                      <p className="text-xs text-dark-400">
                        Click to upload or drag file here
                      </p>
                      <p className="text-xs text-dark-500">Max 10MB</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                </div>

                {/* Attachment list */}
                {attachmentsLoading && attachments.length === 0 && (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 size={16} className="animate-spin text-dark-500" />
                  </div>
                )}

                {attachments.map((doc) => {
                  const docId = doc._id || doc.id;
                  const filename = doc.filename || doc.name || 'Untitled';
                  const isPreviewable = /\.(pdf|png|jpg|jpeg|gif|webp|svg)$/i.test(filename);
                  const url = invoicingApi.getAttachmentUrl(orgSlug, invoiceId, docId);

                  return (
                    <div
                      key={docId}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-dark-800/50 border border-dark-700/50 group"
                    >
                      <FileText size={16} className="text-dark-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{filename}</p>
                        {doc.size && (
                          <p className="text-xs text-dark-500">{formatFileSize(doc.size)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isPreviewable && (
                          <button
                            onClick={() =>
                              setPreviewDoc({
                                filename,
                                mimeType: doc.mimeType || doc.contentType,
                                url,
                              })
                            }
                            className="p-1 rounded hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                            title="Preview"
                          >
                            <Eye size={14} />
                          </button>
                        )}
                        <a
                          href={url}
                          download={filename}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                          title="Download"
                        >
                          <Download size={14} />
                        </a>
                        <button
                          onClick={() => handleDeleteAttachment(docId)}
                          className="p-1 rounded hover:bg-red-500/10 text-dark-400 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
         Modals
         ══════════════════════════════════════════════════════════════════ */}

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

      {showEmailModal && (
        <EmailInvoiceModal
          orgSlug={orgSlug}
          invoiceId={invoiceId}
          customerEmail={invoice.contactEmail || invoice.customer?.email || ''}
          invoiceNumber={invoice.number || ''}
          onClose={() => setShowEmailModal(false)}
          onSuccess={() => {
            setShowEmailModal(false);
            showToast('Email sent');
          }}
          showToast={showToast}
        />
      )}

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

      {previewDoc && (
        <DocumentPreviewModal
          filename={previewDoc.filename}
          mimeType={previewDoc.mimeType}
          directUrl={previewDoc.url}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// FormField — label:value display row (Odoo-style)
// ============================================================================

function FormField({ label, children }) {
  return (
    <div>
      <span className="text-sm text-dark-400">{label}</span>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

// ============================================================================
// ActionBtn — compact action button for the top bar
// ============================================================================

function ActionBtn({ icon: Icon, label, onClick, loading, primary, danger }) {
  let cls =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap ';
  if (primary) {
    cls += 'bg-rivvra-500 hover:bg-rivvra-600 text-white';
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
    'w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-rivvra-500 focus:border-transparent text-sm';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    try {
      setSaving(true);
      await invoicingApi.recordPayment(orgSlug, {
        invoiceId,
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
                Amount due: {formatCurrency(amountDue, currency)}
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
    'w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-rivvra-500 focus:border-transparent text-sm';

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
// ConfirmModal
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
// ModalOverlay
// ============================================================================

function ModalOverlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
