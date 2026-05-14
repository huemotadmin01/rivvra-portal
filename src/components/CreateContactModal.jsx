import { useState } from 'react';
import { X, UserPlus, Loader2 } from 'lucide-react';
import api from '../utils/api';

function CreateContactModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    company: '',
    profileType: '',
    title: '',
    email: '',
    phone: '',
    location: '',
    linkedinUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleClose = () => {
    setForm({ name: '', company: '', profileType: '', title: '', email: '', phone: '', location: '', linkedinUrl: '' });
    setError('');
    onClose();
  };

  const handleSave = async () => {
    // Client-side validation
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.company.trim()) { setError('Company is required'); return; }
    if (!form.profileType) { setError('Profile Type is required'); return; }

    // Email format check (optional field)
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await api.createLead({
        name: form.name.trim(),
        company: form.company.trim(),
        profileType: form.profileType,
        title: form.title.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        location: form.location.trim() || undefined,
        linkedinUrl: form.linkedinUrl.trim() || undefined,
      });

      if (res.success && res.lead) {
        onCreated(res.lead);
        handleClose();
      } else {
        setError(res.error || 'Failed to create contact');
      }
    } catch (err) {
      setError(err.message || 'Failed to create contact');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rivvra-500/10 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-rivvra-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Add Contact</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Required: Name */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Full name"
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
              autoFocus
            />
          </div>

          {/* Required: Company */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">
              Company <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.company}
              onChange={(e) => handleChange('company', e.target.value)}
              placeholder="Company name"
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
            />
          </div>

          {/* Required: Profile Type */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">
              Profile Type <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-3">
              {[
                { value: 'client', label: 'Client', color: 'blue' },
                { value: 'candidate', label: 'Candidate', color: 'purple' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleChange('profileType', opt.value)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    form.profileType === opt.value
                      ? opt.color === 'blue'
                        ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
                        : 'bg-purple-500/10 border-purple-500/40 text-purple-400'
                      : 'bg-dark-800 border-dark-600 text-dark-400 hover:border-dark-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-dark-700" />
            <span className="text-[10px] text-dark-500 uppercase tracking-wider">Optional</span>
            <div className="flex-1 h-px bg-dark-700" />
          </div>

          {/* Optional: Title */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">Job Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="e.g. Director of Sales"
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
            />
          </div>

          {/* Optional: Email */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">Work Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="email@company.com"
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
            />
            <p className="text-[10px] text-dark-500 mt-1">Required to add contact to email sequences</p>
          </div>

          {/* Optional: Phone */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="+1 234 567 8900"
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
            />
          </div>

          {/* Optional: Location */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => handleChange('location', e.target.value)}
              placeholder="City, Country"
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
            />
          </div>

          {/* Optional: LinkedIn URL */}
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">LinkedIn URL</label>
            <input
              type="url"
              value={form.linkedinUrl}
              onChange={(e) => handleChange('linkedinUrl', e.target.value)}
              placeholder="https://linkedin.com/in/username"
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white text-sm placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
            />
            <p className="text-[10px] text-dark-500 mt-1">Paste the profile URL that failed to scrape</p>
          </div>

          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-dark-700">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-dark-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Add Contact
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateContactModal;
