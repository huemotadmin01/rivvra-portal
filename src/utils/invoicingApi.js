// ============================================================================
// invoicingApi.js — Invoicing API client
// ============================================================================

import api from './api';

const invoicingApi = {
  // ---------- DASHBOARD ----------
  getDashboard(orgSlug) {
    return api.request(`/api/org/${orgSlug}/invoicing/dashboard`);
  },
  getJournalStats(orgSlug) {
    return api.request(`/api/org/${orgSlug}/invoicing/dashboard/journal-stats`);
  },

  // ---------- INVOICES ----------
  listInvoices(orgSlug, params = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))).toString();
    return api.request(`/api/org/${orgSlug}/invoicing/invoices${qs ? '?' + qs : ''}`);
  },
  getInvoice(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${id}`);
  },
  previewNumber(orgSlug, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/preview-number${qs ? '?' + qs : ''}`);
  },
  createInvoice(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateInvoice(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteInvoice(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${id}`, { method: 'DELETE' });
  },
  sendInvoice(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${id}/send`, { method: 'PATCH' });
  },
  cancelInvoice(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${id}/cancel`, { method: 'PATCH' });
  },
  resetToDraft(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${id}/reset-to-draft`, { method: 'PATCH' });
  },
  createCreditNote(orgSlug, id, data = {}) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${id}/credit-note`, { method: 'POST', body: JSON.stringify(data) });
  },
  duplicateInvoice(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${id}/duplicate`, { method: 'POST' });
  },
  async downloadPdf(orgSlug, id) {
    const token = localStorage.getItem('rivvra_token');
    const baseUrl = api.baseUrl || '';
    const res = await fetch(`${baseUrl}/api/org/${orgSlug}/invoicing/invoices/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to download PDF');
    return res;
  },
  emailInvoice(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${id}/email`, { method: 'POST', body: JSON.stringify(data) });
  },
  createPaymentLink(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${id}/payment-link`, { method: 'POST' });
  },

  // ---------- VENDOR BILLS ----------
  listBills(orgSlug, params = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))).toString();
    return api.request(`/api/org/${orgSlug}/invoicing/bills${qs ? '?' + qs : ''}`);
  },
  receiveBill(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/bills/${id}/receive`, { method: 'PATCH' });
  },

  // ---------- PAYMENTS ----------
  listPayments(orgSlug, params = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))).toString();
    return api.request(`/api/org/${orgSlug}/invoicing/payments${qs ? '?' + qs : ''}`);
  },
  getPayment(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/payments/${id}`);
  },
  recordPayment(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/payments`, { method: 'POST', body: JSON.stringify(data) });
  },
  deletePayment(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/payments/${id}`, { method: 'DELETE' });
  },

  // ---------- PRODUCTS ----------
  listProducts(orgSlug, params = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))).toString();
    return api.request(`/api/org/${orgSlug}/invoicing/products${qs ? '?' + qs : ''}`);
  },
  createProduct(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/products`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateProduct(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteProduct(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/products/${id}`, { method: 'DELETE' });
  },

  // ---------- TAXES ----------
  listTaxes(orgSlug, params = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))).toString();
    return api.request(`/api/org/${orgSlug}/invoicing/taxes${qs ? '?' + qs : ''}`);
  },
  createTax(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/taxes`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateTax(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/taxes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteTax(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/taxes/${id}`, { method: 'DELETE' });
  },

  // ---------- PAYMENT TERMS ----------
  listPaymentTerms(orgSlug) {
    return api.request(`/api/org/${orgSlug}/invoicing/payment-terms`);
  },
  createPaymentTerm(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/payment-terms`, { method: 'POST', body: JSON.stringify(data) });
  },
  updatePaymentTerm(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/payment-terms/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deletePaymentTerm(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/payment-terms/${id}`, { method: 'DELETE' });
  },

  // ---------- SEQUENCES ----------
  listSequences(orgSlug) {
    return api.request(`/api/org/${orgSlug}/invoicing/sequences`);
  },
  updateSequence(orgSlug, type, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/sequences/${type}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  // ---------- SETTINGS ----------
  getSettings(orgSlug) {
    return api.request(`/api/org/${orgSlug}/invoicing/settings`);
  },
  updateSettings(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/settings`, { method: 'PUT', body: JSON.stringify(data) });
  },
  seedDefaults(orgSlug) {
    return api.request(`/api/org/${orgSlug}/invoicing/seed-defaults`, { method: 'POST' });
  },

  // ---------- JOURNALS ----------
  listJournals(orgSlug, params = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))).toString();
    return api.request(`/api/org/${orgSlug}/invoicing/journals${qs ? '?' + qs : ''}`);
  },
  createJournal(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/journals`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateJournal(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/journals/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteJournal(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/journals/${id}`, { method: 'DELETE' });
  },

  // ---------- BANK STATEMENTS ----------
  listBankStatements(orgSlug) {
    return api.request(`/api/org/${orgSlug}/invoicing/bank-statements`);
  },
  createBankStatement(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/bank-statements`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateBankStatement(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/bank-statements/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  getReconciliationSuggestions(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/bank-statements/${id}/suggestions`);
  },
  reconcileLine(orgSlug, id, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/bank-statements/${id}/reconcile`, { method: 'POST', body: JSON.stringify(data) });
  },

  // ---------- FOLLOW-UPS ----------
  getFollowUpConfig(orgSlug) {
    return api.request(`/api/org/${orgSlug}/invoicing/follow-ups/config`);
  },
  updateFollowUpConfig(orgSlug, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/follow-ups/config`, { method: 'PUT', body: JSON.stringify(data) });
  },
  listOverdueInvoices(orgSlug) {
    return api.request(`/api/org/${orgSlug}/invoicing/follow-ups/overdue`);
  },
  sendFollowUp(orgSlug, invoiceId, data) {
    return api.request(`/api/org/${orgSlug}/invoicing/follow-ups/${invoiceId}/send`, { method: 'POST', body: JSON.stringify(data) });
  },
  listFollowUpLogs(orgSlug, params = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))).toString();
    return api.request(`/api/org/${orgSlug}/invoicing/follow-ups/logs${qs ? '?' + qs : ''}`);
  },

  // ---------- REPORTS ----------
  getAgedReceivables(orgSlug) {
    return api.request(`/api/org/${orgSlug}/invoicing/reports/aged-receivables`);
  },
  getAgedPayables(orgSlug) {
    return api.request(`/api/org/${orgSlug}/invoicing/reports/aged-payables`);
  },
  getInvoiceAnalysis(orgSlug, params = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))).toString();
    return api.request(`/api/org/${orgSlug}/invoicing/reports/invoice-analysis${qs ? '?' + qs : ''}`);
  },
  getTaxReport(orgSlug, params = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))).toString();
    return api.request(`/api/org/${orgSlug}/invoicing/reports/tax-report${qs ? '?' + qs : ''}`);
  },
  getPnlSummary(orgSlug, params = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))).toString();
    return api.request(`/api/org/${orgSlug}/invoicing/reports/pnl-summary${qs ? '?' + qs : ''}`);
  },

  // ---------- E-INVOICE ----------
  generateEInvoice(orgSlug, id) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${id}/e-invoice`, { method: 'POST' });
  },
  cancelEInvoice(orgSlug, id, data = {}) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${id}/e-invoice`, { method: 'DELETE', body: JSON.stringify(data) });
  },

  // ---------- ATTACHMENTS ----------
  listAttachments(orgSlug, invoiceId) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${invoiceId}/attachments`);
  },
  async uploadAttachment(orgSlug, invoiceId, file, label) {
    const token = localStorage.getItem('rivvra_token');
    const formData = new FormData();
    formData.append('file', file);
    if (label) formData.append('label', label);
    const res = await fetch(`${api.baseUrl}/api/org/${orgSlug}/invoicing/invoices/${invoiceId}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Upload failed'); }
    return res.json();
  },
  getAttachmentUrl(orgSlug, invoiceId, docId) {
    return `${api.baseUrl}/api/org/${orgSlug}/invoicing/invoices/${invoiceId}/attachments/${docId}`;
  },
  deleteAttachment(orgSlug, invoiceId, docId) {
    return api.request(`/api/org/${orgSlug}/invoicing/invoices/${invoiceId}/attachments/${docId}`, { method: 'DELETE' });
  },
};

export default invoicingApi;
