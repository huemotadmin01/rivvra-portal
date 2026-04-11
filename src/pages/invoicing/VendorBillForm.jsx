import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import invoicingApi from '../../utils/invoicingApi';
import {
  Save, Loader2, Plus, Trash2, ArrowLeft, CheckCircle2,
  X, Search, Building2, Package,
} from 'lucide-react';

const EMPTY_LINE = {
  product: '',
  productName: '',
  description: '',
  quantity: 1,
  unitPrice: 0,
  taxIds: [],
  amount: 0,
};

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().split('T')[0];
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function VendorBillForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orgSlug, orgPath } = usePlatform();
  const { showToast } = useToast();
  const isEdit = Boolean(id && id !== 'new');

  // Form state
  const [form, setForm] = useState({
    type: 'vendor_bill',
    contactId: '',
    contactName: '',
    vendorReference: '',
    date: todayStr(),
    dueDate: '',
    notes: '',
    lines: [{ ...EMPTY_LINE }],
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);

  // Lookup data
  const [products, setProducts] = useState([]);
  const [taxes, setTaxes] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  // Load lookup data
  useEffect(() => {
    if (!orgSlug) return;
    Promise.all([
      invoicingApi.listProducts(orgSlug, { limit: 500 }).catch(() => ({ data: [] })),
      invoicingApi.listTaxes(orgSlug).catch(() => ({ data: [] })),
    ]).then(([prodRes, taxRes]) => {
      setProducts(prodRes.products || prodRes.data || []);
      setTaxes(taxRes.taxes || taxRes.data || []);
    });
  }, [orgSlug]);

  // Load existing bill for editing
  useEffect(() => {
    if (!isEdit || !orgSlug) return;
    setInitialLoading(true);
    invoicingApi.getInvoice(orgSlug, id)
      .then(res => {
        const bill = res.invoice || res.bill || res.data || res;
        setForm({
          type: 'vendor_bill',
          contactId: bill.contactId || bill.contact?._id || '',
          contactName: bill.contactName || bill.contact?.name || '',
          vendorReference: bill.vendorReference || bill.reference || '',
          date: formatDate(bill.date) || todayStr(),
          dueDate: formatDate(bill.dueDate) || '',
          notes: bill.notes || '',
          lines: (bill.lines || bill.items || []).map(l => ({
            product: l.product || l.productId || '',
            productName: l.productName || l.name || '',
            description: l.description || '',
            quantity: l.quantity || 1,
            unitPrice: l.unitPrice || l.price || 0,
            taxIds: l.taxIds || l.taxes || [],
            amount: l.amount || (l.quantity || 1) * (l.unitPrice || l.price || 0),
          })),
        });
        if (bill.lines?.length === 0 || !bill.lines) {
          setForm(prev => ({ ...prev, lines: [{ ...EMPTY_LINE }] }));
        }
      })
      .catch(err => {
        showToast(err.message || 'Failed to load bill', 'error');
        navigate(orgPath('/invoicing/bills'));
      })
      .finally(() => setInitialLoading(false));
  }, [isEdit, id, orgSlug]);

  // Search contacts (vendors)
  useEffect(() => {
    if (!orgSlug || contactSearch.length < 2) {
      setContacts([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await invoicingApi.listProducts(orgSlug, {}); // We'll search contacts via a general approach
        // Try a contacts/vendors endpoint — fall back to empty
        const contactRes = await fetch(`/api/org/${orgSlug}/contacts?search=${encodeURIComponent(contactSearch)}&type=vendor&limit=10`).then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] }));
        setContacts(contactRes.contacts || contactRes.data || []);
      } catch {
        setContacts([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [contactSearch, orgSlug]);

  // Recalculate line amounts
  function recalcLine(line) {
    const subtotal = (line.quantity || 0) * (line.unitPrice || 0);
    let taxAmount = 0;
    if (line.taxIds?.length && taxes.length) {
      line.taxIds.forEach(tId => {
        const tax = taxes.find(t => t._id === tId);
        if (tax) taxAmount += subtotal * (tax.rate || 0) / 100;
      });
    }
    return { ...line, amount: subtotal + taxAmount };
  }

  function updateLine(index, field, value) {
    setForm(prev => {
      const lines = [...prev.lines];
      lines[index] = { ...lines[index], [field]: value };

      // If product selected, fill in defaults
      if (field === 'product' && value) {
        const prod = products.find(p => p._id === value);
        if (prod) {
          lines[index].productName = prod.name || '';
          lines[index].description = prod.description || lines[index].description;
          lines[index].unitPrice = prod.defaultPrice || prod.price || lines[index].unitPrice;
          lines[index].taxIds = prod.taxIds || prod.defaultTaxIds || lines[index].taxIds;
        }
      }

      lines[index] = recalcLine(lines[index]);
      return { ...prev, lines };
    });
  }

  function addLine() {
    setForm(prev => ({ ...prev, lines: [...prev.lines, { ...EMPTY_LINE }] }));
  }

  function removeLine(index) {
    setForm(prev => {
      const lines = prev.lines.filter((_, i) => i !== index);
      return { ...prev, lines: lines.length ? lines : [{ ...EMPTY_LINE }] };
    });
  }

  // Totals
  const subtotal = form.lines.reduce((sum, l) => sum + (l.quantity || 0) * (l.unitPrice || 0), 0);
  const taxTotal = form.lines.reduce((sum, l) => {
    const lineSub = (l.quantity || 0) * (l.unitPrice || 0);
    let lineTax = 0;
    (l.taxIds || []).forEach(tId => {
      const tax = taxes.find(t => t._id === tId);
      if (tax) lineTax += lineSub * (tax.rate || 0) / 100;
    });
    return sum + lineTax;
  }, 0);
  const total = subtotal + taxTotal;

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
  }

  async function handleSave(status = 'draft') {
    if (!form.contactId && !form.contactName) {
      showToast('Please select a vendor', 'error');
      return;
    }
    if (!form.lines.some(l => l.productName || l.description)) {
      showToast('Please add at least one line item', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type: 'vendor_bill',
        contactId: form.contactId || undefined,
        contactName: form.contactName,
        vendorReference: form.vendorReference,
        date: form.date,
        dueDate: form.dueDate || undefined,
        notes: form.notes,
        status,
        lines: form.lines
          .filter(l => l.productName || l.description || l.product)
          .map(l => ({
            productId: l.product || undefined,
            description: l.description,
            quantity: Number(l.quantity) || 1,
            unitPrice: Number(l.unitPrice) || 0,
            taxIds: l.taxIds || [],
          })),
      };

      if (isEdit) {
        await invoicingApi.updateInvoice(orgSlug, id, payload);
        showToast('Bill updated successfully');
      } else {
        const res = await invoicingApi.createInvoice(orgSlug, payload);
        const newId = res.invoice?._id || res.bill?._id || res.data?._id;
        showToast('Bill created successfully');
        if (newId) {
          navigate(orgPath(`/invoicing/bills/${newId}`), { replace: true });
          return;
        }
      }
      navigate(orgPath('/invoicing/bills'));
    } catch (err) {
      showToast(err.message || 'Failed to save bill', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleReceive() {
    if (!isEdit) return;
    setSaving(true);
    try {
      await invoicingApi.receiveBill(orgSlug, id);
      showToast('Bill marked as received');
      navigate(orgPath('/invoicing/bills'));
    } catch (err) {
      showToast(err.message || 'Failed to mark bill as received', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (initialLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-dark-500" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(orgPath('/invoicing/bills'))}
          className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">
            {isEdit ? 'Edit Vendor Bill' : 'New Vendor Bill'}
          </h1>
          <p className="text-sm text-dark-400 mt-0.5">
            {isEdit ? 'Update bill details' : 'Create a new purchase bill'}
          </p>
        </div>
      </div>

      {/* Vendor & Details Card */}
      <div className="bg-dark-850 border border-dark-700 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Bill Details</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Vendor Selector */}
          <div className="relative sm:col-span-2">
            <label className="text-xs text-dark-400 mb-1 block">Vendor *</label>
            {form.contactId ? (
              <div className="flex items-center justify-between px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg">
                <div className="flex items-center gap-2">
                  <Building2 size={14} className="text-rivvra-400" />
                  <span className="text-sm text-white">{form.contactName}</span>
                </div>
                <button
                  onClick={() => {
                    setForm(prev => ({ ...prev, contactId: '', contactName: '' }));
                    setContactSearch('');
                  }}
                  className="text-dark-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
                <input
                  value={contactSearch}
                  onChange={e => { setContactSearch(e.target.value); setShowContactDropdown(true); }}
                  onFocus={() => setShowContactDropdown(true)}
                  onBlur={() => setTimeout(() => setShowContactDropdown(false), 200)}
                  placeholder="Search vendor or type name..."
                  className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
                />
                {showContactDropdown && contacts.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-dark-800 border border-dark-700 rounded-lg shadow-xl">
                    {contacts.map(c => (
                      <button
                        key={c._id}
                        type="button"
                        onMouseDown={() => {
                          setForm(prev => ({ ...prev, contactId: c._id, contactName: c.name || c.displayName }));
                          setContactSearch('');
                          setShowContactDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-dark-750 transition-colors"
                      >
                        <p className="text-sm text-white">{c.name || c.displayName}</p>
                        {c.email && <p className="text-[10px] text-dark-500">{c.email}</p>}
                      </button>
                    ))}
                  </div>
                )}
                {/* Allow manual name entry */}
                {contactSearch && !form.contactId && contacts.length === 0 && (
                  <button
                    type="button"
                    onMouseDown={() => {
                      setForm(prev => ({ ...prev, contactName: contactSearch, contactId: '' }));
                      setShowContactDropdown(false);
                    }}
                    className="absolute z-20 mt-1 w-full text-left px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg shadow-xl hover:bg-dark-750 transition-colors"
                  >
                    <p className="text-xs text-dark-400">Use "{contactSearch}" as vendor name</p>
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-dark-400 mb-1 block">Vendor Reference</label>
            <input
              value={form.vendorReference}
              onChange={e => setForm(prev => ({ ...prev, vendorReference: e.target.value }))}
              placeholder="Vendor invoice/ref number"
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
            />
          </div>

          <div>
            <label className="text-xs text-dark-400 mb-1 block">Bill Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500"
            />
          </div>

          <div>
            <label className="text-xs text-dark-400 mb-1 block">Due Date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => setForm(prev => ({ ...prev, dueDate: e.target.value }))}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500"
            />
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-dark-850 border border-dark-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Line Items</h2>
          <button
            onClick={addLine}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-rivvra-400 hover:bg-dark-700 transition-colors"
          >
            <Plus size={14} /> Add Line
          </button>
        </div>

        <div className="space-y-3">
          {form.lines.map((line, idx) => (
            <div key={idx} className="bg-dark-800/60 border border-dark-700/50 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <span className="text-xs text-dark-500 font-medium">Line {idx + 1}</span>
                {form.lines.length > 1 && (
                  <button
                    onClick={() => removeLine(idx)}
                    className="p-1 text-dark-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Product */}
                <div className="sm:col-span-4">
                  <label className="text-[10px] text-dark-500 mb-1 block">Product</label>
                  <select
                    value={line.product}
                    onChange={e => updateLine(idx, 'product', e.target.value)}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-rivvra-500"
                  >
                    <option value="">Select or type below...</option>
                    {products.map(p => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div className="sm:col-span-4">
                  <label className="text-[10px] text-dark-500 mb-1 block">Description</label>
                  <input
                    value={line.description}
                    onChange={e => updateLine(idx, 'description', e.target.value)}
                    placeholder="Description"
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500"
                  />
                </div>

                {/* Quantity */}
                <div className="sm:col-span-1">
                  <label className="text-[10px] text-dark-500 mb-1 block">Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={line.quantity}
                    onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white text-center focus:outline-none focus:border-rivvra-500"
                  />
                </div>

                {/* Unit Price */}
                <div className="sm:col-span-2">
                  <label className="text-[10px] text-dark-500 mb-1 block">Unit Price</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={line.unitPrice}
                    onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white text-right focus:outline-none focus:border-rivvra-500"
                  />
                </div>

                {/* Amount (read-only) */}
                <div className="sm:col-span-1">
                  <label className="text-[10px] text-dark-500 mb-1 block">Amount</label>
                  <div className="px-2 py-2 text-sm text-white text-right font-medium">
                    {formatCurrency(line.amount)}
                  </div>
                </div>
              </div>

              {/* Tax selector */}
              {taxes.length > 0 && (
                <div>
                  <label className="text-[10px] text-dark-500 mb-1 block">Taxes</label>
                  <div className="flex flex-wrap gap-2">
                    {taxes.map(tax => {
                      const selected = (line.taxIds || []).includes(tax._id);
                      return (
                        <button
                          key={tax._id}
                          type="button"
                          onClick={() => {
                            const newTaxIds = selected
                              ? (line.taxIds || []).filter(t => t !== tax._id)
                              : [...(line.taxIds || []), tax._id];
                            updateLine(idx, 'taxIds', newTaxIds);
                          }}
                          className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                            selected
                              ? 'bg-rivvra-500/10 border-rivvra-500/30 text-rivvra-400'
                              : 'bg-dark-900 border-dark-700 text-dark-400 hover:border-dark-600'
                          }`}
                        >
                          {tax.name} ({tax.rate}%)
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="border-t border-dark-700 pt-4 flex justify-end">
          <div className="w-64 space-y-2 text-sm">
            <div className="flex justify-between text-dark-400">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {taxTotal > 0 && (
              <div className="flex justify-between text-dark-400">
                <span>Tax</span>
                <span>{formatCurrency(taxTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-white font-semibold text-base pt-1 border-t border-dark-700">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-dark-850 border border-dark-700 rounded-xl p-5 space-y-3">
        <label className="text-sm font-semibold text-white block">Notes</label>
        <textarea
          value={form.notes}
          onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
          rows={3}
          placeholder="Internal notes..."
          className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder:text-dark-600 focus:outline-none focus:border-rivvra-500 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => handleSave('draft')}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save as Draft
        </button>
        <button
          onClick={() => handleSave('received')}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rivvra-500 hover:bg-rivvra-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {isEdit ? 'Save & Mark Received' : 'Create & Mark Received'}
        </button>
        {isEdit && (
          <button
            onClick={handleReceive}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> Mark as Received
          </button>
        )}
        <button
          onClick={() => navigate(orgPath('/invoicing/bills'))}
          className="px-4 py-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
