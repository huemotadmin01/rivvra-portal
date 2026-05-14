import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import api from '../utils/api';

const OUTREACH_STATUS_OPTIONS = [
  { value: 'not_contacted', label: 'Not Contacted', cls: 'bg-dark-700 text-dark-400' },
  { value: 'in_sequence', label: 'In Sequence', cls: 'bg-blue-500/10 text-blue-400' },
  { value: 'replied', label: 'Interested', cls: 'bg-emerald-500/10 text-emerald-400' },
  { value: 'replied_not_interested', label: 'Not Interested', cls: 'bg-purple-500/10 text-purple-400' },
  { value: 'no_response', label: 'No Response', cls: 'bg-orange-500/10 text-orange-400' },
];

function EditContactModal({ lead, isOpen, onClose, onLeadUpdate }) {
  const [form, setForm] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    company: '',
    location: '',
    outreachStatus: 'not_contacted',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Populate form when lead changes
  useEffect(() => {
    if (lead) {
      setForm({
        name: lead.name || '',
        title: lead.title || lead.headline || '',
        email: lead.email === 'noemail@domain.com' ? '' : (lead.email || ''),
        phone: lead.phone || '',
        company: lead.company || lead.companyName || '',
        location: lead.location || '',
        outreachStatus: lead.outreachStatus || 'not_contacted',
      });
      setError('');
    }
  }, [lead]);

  if (!isOpen || !lead) return null;

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const updateData = {
        name: form.name.trim(),
        title: form.title.trim(),
        headline: form.title.trim(),
        email: form.email.trim() || 'noemail@domain.com',
        phone: form.phone.trim(),
        company: form.company.trim(),
        companyName: form.company.trim(),
        location: form.location.trim(),
        outreachStatus: form.outreachStatus,
      };

      await api.updateLead(lead._id, updateData);

      // Notify parent with updated lead
      if (onLeadUpdate) {
        onLeadUpdate({ ...lead, ...updateData });
      }

      onClose();
    } catch (err) {
      console.error('Failed to update contact:', err);
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: 'name', label: 'Name', placeholder: 'Full name' },
    { key: 'title', label: 'Job Title', placeholder: 'e.g. Software Engineer' },
    { key: 'email', label: 'Work Email', placeholder: 'email@company.com', type: 'email' },
    { key: 'phone', label: 'Phone', placeholder: '+1 234 567 8900', type: 'tel' },
    { key: 'company', label: 'Company', placeholder: 'Company name' },
    { key: 'location', label: 'Location', placeholder: 'City, Country' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <h2 className="text-lg font-semibold text-white">Edit Contact</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {fields.map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">
                {label}
              </label>
              <input
                type={type || 'text'}
                value={form[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
              />
            </div>
          ))}

          {/* Outreach Status */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">
              Outreach Status
            </label>
            <select
              value={form.outreachStatus}
              onChange={(e) => handleChange('outreachStatus', e.target.value)}
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm focus:outline-none focus:border-rivvra-500 transition-colors appearance-none cursor-pointer"
            >
              {OUTREACH_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-dark-500 mt-1">
              Useful when leads reply via LinkedIn DM or other channels
            </p>
          </div>

          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-dark-300 hover:text-white transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditContactModal;
