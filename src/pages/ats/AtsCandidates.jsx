import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import {
  Search, Plus, Loader2, Users,
  ChevronLeft, ChevronRight,
  Mail, Phone, Linkedin, ExternalLink, X,
} from 'lucide-react';

/* ── New Candidate Modal ──────────────────────────────────────────────── */
const EMPTY_CANDIDATE = {
  name: '',
  email: '',
  phone: '',
  mobile: '',
  linkedinProfile: '',
};

function NewCandidateModal({ show, onClose, onSaved, orgSlug }) {
  const modalRef = useRef(null);
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_CANDIDATE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (show) {
      setForm(EMPTY_CANDIDATE);
      setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 50);
    }
  }, [show]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;

    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        mobile: form.mobile.trim() || undefined,
        linkedinProfile: form.linkedinProfile.trim() || undefined,
      };
      const res = await atsApi.createCandidate(orgSlug, payload);
      if (res.success) {
        showToast('Candidate created');
        onSaved();
        onClose();
      }
    } catch (err) {
      showToast(err.message || 'Failed to create candidate', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-modal-title"
        className="bg-dark-800 rounded-xl p-6 border border-dark-700 w-full max-w-lg my-8"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id="candidate-modal-title" className="text-lg font-semibold text-white">
            New Candidate
          </h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. John Doe"
              className="input-field"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="e.g. john@example.com"
              className="input-field"
            />
          </div>

          {/* Phone & Mobile */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="e.g. +1 555-0100"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Mobile</label>
              <input
                type="text"
                value={form.mobile}
                onChange={(e) => handleChange('mobile', e.target.value)}
                placeholder="e.g. +1 555-0101"
                className="input-field"
              />
            </div>
          </div>

          {/* LinkedIn Profile */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">LinkedIn Profile</label>
            <input
              type="url"
              value={form.linkedinProfile}
              onChange={(e) => handleChange('linkedinProfile', e.target.value)}
              placeholder="e.g. https://linkedin.com/in/johndoe"
              className="input-field"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-dark-700 hover:bg-dark-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Create Candidate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsCandidates() {
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [candidates, setCandidates] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Search
  const [search, setSearch] = useState('');

  const debounceRef = useRef(null);
  const orgSlug = currentOrg?.slug;
  const isAdmin = getAppRole('ats') === 'admin';

  // ── Fetch candidates ──────────────────────────────────────────────────
  const fetchCandidates = useCallback(async (params = {}) => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const res = await atsApi.listCandidates(orgSlug, {
        page: params.page || page,
        search: params.search !== undefined ? params.search : search,
      });
      if (res.success) {
        setCandidates(res.candidates || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load candidates:', err);
      showToast('Failed to load candidates', 'error');
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, page, search, showToast]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  // Debounced search
  const handleSearchChange = (value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchCandidates({ search: value, page: 1 });
    }, 300);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Initials helper
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || '?';
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Pagination
  const pageStart = total === 0 ? 0 : (page - 1) * 20 + 1;
  const pageEnd = Math.min(page * 20, total);

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Candidates</h1>
          <p className="text-dark-400 text-sm mt-1">
            {total} {total === 1 ? 'candidate' : 'candidates'} total
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Add Candidate
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="input-field w-full pl-10"
          aria-label="Search candidates"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No candidates found</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm">
            {search
              ? 'Try adjusting your search terms.'
              : 'Candidates will appear here when applications are created.'}
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left px-4 py-3 text-dark-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Email</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Phone</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">LinkedIn</th>
                    <th className="text-center px-4 py-3 text-dark-400 font-medium hidden sm:table-cell">Applications</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Last Applied</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr
                      key={candidate._id}
                      onClick={() => navigate(orgPath(`/ats/candidates/${candidate._id}`))}
                      className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-orange-400">
                              {getInitials(candidate.name)}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">{candidate.name}</p>
                            {candidate.currentTitle && (
                              <p className="text-dark-500 text-xs truncate">{candidate.currentTitle}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {candidate.email ? (
                          <div className="flex items-center gap-1.5 text-dark-300">
                            <Mail size={12} className="text-dark-500 flex-shrink-0" />
                            <span className="truncate block max-w-[200px]">{candidate.email}</span>
                          </div>
                        ) : (
                          <span className="text-dark-500">{'\u2014'}</span>
                        )}
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {candidate.phone ? (
                          <div className="flex items-center gap-1.5 text-dark-300">
                            <Phone size={12} className="text-dark-500 flex-shrink-0" />
                            <span>{candidate.phone}</span>
                          </div>
                        ) : (
                          <span className="text-dark-500">{'\u2014'}</span>
                        )}
                      </td>

                      {/* LinkedIn */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {candidate.linkedin ? (
                          <a
                            href={candidate.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5 text-rivvra-400 hover:text-rivvra-300 transition-colors"
                          >
                            <Linkedin size={12} className="flex-shrink-0" />
                            <span className="text-xs">Profile</span>
                            <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span className="text-dark-500">{'\u2014'}</span>
                        )}
                      </td>

                      {/* Application Count */}
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className="bg-dark-700 text-dark-300 text-xs px-2 py-0.5 rounded-full">
                          {candidate.applicationCount ?? candidate.applications?.length ?? 0}
                        </span>
                      </td>

                      {/* Last Applied */}
                      <td className="px-4 py-3 text-dark-400 text-xs hidden xl:table-cell">
                        {formatDate(candidate.lastApplied || candidate.updatedAt)}
                      </td>

                      {/* Tags */}
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(candidate.tagNames || candidate.tags || []).slice(0, 2).map((tag, i) => (
                            <span
                              key={i}
                              className="bg-dark-700 text-dark-300 text-xs px-1.5 py-0.5 rounded"
                            >
                              {typeof tag === 'string' ? tag : tag.name}
                            </span>
                          ))}
                          {(candidate.tagNames || candidate.tags || []).length > 2 && (
                            <span className="text-dark-500 text-xs">
                              +{(candidate.tagNames || candidate.tags || []).length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-dark-400 text-sm">
                Showing {pageStart}\u2013{pageEnd} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) {
                      acc.push('...');
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '...' ? (
                      <span key={`dots-${i}`} className="px-2 text-dark-500 text-sm">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          p === page
                            ? 'bg-rivvra-500 text-dark-950'
                            : 'text-dark-400 hover:text-white hover:bg-dark-800'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* New Candidate Modal */}
      {showCreateModal && (
        <NewCandidateModal
          show={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSaved={() => fetchCandidates({ page: 1 })}
          orgSlug={orgSlug}
        />
      )}
    </div>
  );
}
