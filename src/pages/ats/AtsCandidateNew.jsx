import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import SectionCard from '../../components/platform/detail/SectionCard';
import { usePageTitle } from '../../hooks/usePageTitle';
import { ChevronLeft, Loader2, User } from 'lucide-react';

/**
 * AtsCandidateNew — routed create flow for ATS candidates.
 * Replaces the in-place NewCandidateModal previously triggered from
 * AtsCandidates list, per the modal-to-route rule. After successful
 * creation, jumps straight to the new candidate's detail page so
 * users can fill in description / skills / evaluation inline.
 */
export default function AtsCandidateNew() {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  usePageTitle('New Candidate');

  const orgSlug = currentOrg?.slug;
  const isAdmin = getAppRole('ats') === 'admin';

  // 2026-05-21: candidate creation is admin-only. Mirrors the list-page
  // button gate so a non-admin can't reach the form by typing the URL.
  if (!isAdmin) {
    return (
      <div className="p-6 md:p-8 max-w-2xl mx-auto">
        <div className="card p-8 text-center">
          <User size={36} className="mx-auto text-dark-500 mb-3" />
          <h1 className="text-lg font-semibold text-white mb-1">Admin access required</h1>
          <p className="text-sm text-dark-400 mb-4">
            Only ATS admins can create new candidate records. Ask an admin to add the candidate, then it'll be available for you to manage.
          </p>
          <button
            onClick={() => navigate(orgPath('/ats/candidates'))}
            className="text-sm text-rivvra-400 hover:text-rivvra-300"
          >
            ← Back to Candidates
          </button>
        </div>
      </div>
    );
  }
  const [form, setForm] = useState({ name: '', email: '', phone: '', mobile: '', linkedinProfile: '' });
  const [saving, setSaving] = useState(false);

  const canSubmit = form.name.trim() && form.email.trim();

  const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        mobile: form.mobile.trim() || undefined,
        linkedinProfile: form.linkedinProfile.trim() || undefined,
      };
      const res = await atsApi.createCandidate(orgSlug, payload);
      if (res?.success) {
        showToast('Candidate created');
        const id = res.candidate?._id || res._id;
        if (id) navigate(orgPath(`/ats/candidates/${id}`), { replace: true });
        else navigate(orgPath('/ats/candidates'), { replace: true });
      } else {
        showToast(res?.error || 'Failed to create candidate', 'error');
      }
    } catch (err) {
      showToast(err?.message || 'Failed to create candidate', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors"
      >
        <ChevronLeft size={16} /> Back
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white">New Candidate</h1>
        <p className="text-dark-400 text-sm mt-1">
          Add the basics here. Description, skills and evaluation fill in on the record page.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <SectionCard title="Contact" icon={User}>
          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className="text-dark-400 text-sm">
              Name <span className="text-red-400">*</span>
            </span>
            <input
              type="text"
              autoFocus
              required
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. John Doe"
              className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className="text-dark-400 text-sm">
              Email <span className="text-red-400">*</span>
            </span>
            <input
              type="email"
              required
              pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
              title="Enter a valid email like name@example.com"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="e.g. john@example.com"
              className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className="text-dark-400 text-sm">Phone</span>
            <input
              type="tel"
              pattern="[\d\s\+\-\(\)]{7,}"
              title="Digits, spaces, +, -, ( ) only — minimum 7 characters"
              value={form.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="e.g. +91 98765 43210"
              className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className="text-dark-400 text-sm">Mobile</span>
            <input
              type="tel"
              pattern="[\d\s\+\-\(\)]{7,}"
              title="Digits, spaces, +, -, ( ) only — minimum 7 characters"
              value={form.mobile}
              onChange={(e) => handleChange('mobile', e.target.value)}
              placeholder="e.g. +91 98765 43210"
              className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className="text-dark-400 text-sm">LinkedIn</span>
            <input
              type="url"
              value={form.linkedinProfile}
              onChange={(e) => handleChange('linkedinProfile', e.target.value)}
              placeholder="https://linkedin.com/in/…"
              className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none"
            />
          </div>
        </SectionCard>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="px-4 py-2 text-sm bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create Candidate
          </button>
        </div>
      </form>
    </div>
  );
}
