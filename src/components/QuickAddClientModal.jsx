import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import contactsApi from '../utils/contactsApi';
import EmployeeLookup from './shared/EmployeeLookup';

/**
 * Quick-add client sub-modal.
 *
 * Captures the minimum fields needed to create a CRM contact (name +
 * salesperson). Country/currency default to India/INR — user edits the rest
 * later from the Contacts page.
 *
 * Props:
 *  - isOpen      : boolean
 *  - orgSlug     : string
 *  - initialName : string — pre-fills the name field from the parent typeahead
 *  - onClose     : () => void
 *  - onCreated   : (contact) => void — fires after successful POST
 */
export default function QuickAddClientModal({ isOpen, orgSlug, initialName = '', onClose, onCreated }) {
  const [name, setName] = useState(initialName);
  const [salespersonId, setSalespersonId] = useState('');
  const [salespersonName, setSalespersonName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setSalespersonId('');
      setSalespersonName('');
      setError('');
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const canSubmit = name.trim() && salespersonId && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const res = await contactsApi.create(orgSlug, {
        type: 'company',
        name: name.trim(),
        isCustomer: true,
        salespersonId,
        salespersonName,
        countryCode: 'India',
        defaultCurrency: 'INR',
      });
      const contact = res?.contact || res;
      if (!contact?._id) throw new Error('Server did not return a contact id');
      onCreated(contact);
    } catch (e) {
      setError(e?.message || 'Failed to create client. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-client-title"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id="quick-add-client-title" className="text-white font-semibold text-lg">Add New Client</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white" aria-label="Close"><X size={18} /></button>
        </div>

        <p className="text-xs text-dark-400 mb-4">
          We'll create a CRM contact in India (INR). You can edit address, GSTIN and other details later from the Contacts page.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-dark-400 mb-1">
              Client Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field w-full text-sm"
              placeholder="Acme Corp"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-dark-400 mb-1">
              Salesperson <span className="text-red-400">*</span>
            </label>
            <EmployeeLookup
              orgSlug={orgSlug}
              variant="row"
              label=""
              currentValue={salespersonId}
              currentName={salespersonName}
              placeholder="Search employees…"
              allowClear
              onSelect={(id, nm) => { setSalespersonId(id); setSalespersonName(nm); }}
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={!name.trim() ? 'Name is required' : !salespersonId ? 'Salesperson is required' : ''}
            className="px-4 py-2 bg-rivvra-600 text-white rounded-lg hover:bg-rivvra-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create Client
          </button>
        </div>
      </div>
    </div>
  );
}
