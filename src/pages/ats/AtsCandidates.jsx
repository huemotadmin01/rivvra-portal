import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import FilterBar, { FilterChip, GroupByChip, ArchivedToggle, useFilterParams } from '../../components/shared/FilterBar';
import { groupRecords, sortGroupsByCount } from '../../utils/grouping';
import {
  Plus, Loader2, Users, ChevronDown,
  ChevronLeft, ChevronRight,
  Mail, Phone, Linkedin, ExternalLink,
} from 'lucide-react';

const GROUP_BY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'manager', label: 'Manager' },
  { value: 'skill', label: 'Skill' },
];

// EMPTY_CANDIDATE + NewCandidateModal removed — creation now routes to /ats/candidates/new


/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsCandidates() {
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Filter state lives in the URL — bookmarkable + refresh-safe.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useFilterParams(['search', 'archived', 'hasActiveApps', 'managerId', 'groupBy']);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const groupBy = filterParams.groupBy || '';
  const isGrouped = Boolean(groupBy);

  const [candidates, setCandidates] = useState([]);
  const [total, setTotal] = useState(0);
  const [archivedCount, setArchivedCount] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [recruiters, setRecruiters] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  // showCreateModal removed — creation now routes to /ats/candidates/new

  const debounceRef = useRef(null);
  const orgSlug = currentOrg?.slug;
  const isAdmin = getAppRole('ats') === 'admin';

  const setPage = (next) => {
    const np = new URLSearchParams(searchParams);
    if (next > 1) np.set('page', String(next)); else np.delete('page');
    setSearchParams(np);
  };

  // ── Fetch candidates ──────────────────────────────────────────────────
  const fetchCandidates = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    setCandidates([]);
    setTotal(0);
    setTotalPages(1);
    try {
      const res = await atsApi.listCandidates(orgSlug, { page, ...filterParams });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, page, JSON.stringify(filterParams), showToast]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  // Fetch recruiters once for the Manager filter chip + group-by labels.
  // Same list the rest of ATS uses for People-field pickers.
  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    atsApi.listRecruiters(orgSlug)
      .then((res) => {
        if (cancelled) return;
        if (res?.success && Array.isArray(res.recruiters)) setRecruiters(res.recruiters);
        else if (Array.isArray(res)) setRecruiters(res);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orgSlug]);

  const managerOptions = useMemo(() => recruiters.map((r) => ({
    value: r._id || r.id,
    label: r.fullName || r.name || r.email || String(r._id || r.id),
  })), [recruiters]);

  // Group candidates per the active groupBy. groupRecords (utils/grouping.js)
  // returns a Map<key, {label, records[]}>; sortGroupsByCount puts biggest
  // groups first with Unknown last. Memoised so re-renders don't re-bucket.
  const groupedCandidates = useMemo(() => {
    if (!groupBy) return null;
    const extractor = (cand) => {
      if (groupBy === 'manager') {
        return [{
          key: cand.managerId || '__unknown__',
          label: cand.managerName || (cand.managerId ? 'Unknown manager' : 'No manager'),
        }];
      }
      if (groupBy === 'skill') {
        const skills = Array.isArray(cand.skills) ? cand.skills : [];
        if (skills.length === 0) return [{ key: '__unknown__', label: 'No skills captured' }];
        return skills.map((s) => ({
          key: s.skillId || s.skillName || '__unknown__',
          label: s.skillName || 'Unknown skill',
        }));
      }
      return [];
    };
    return sortGroupsByCount(groupRecords(candidates, extractor));
  }, [candidates, groupBy]);

  const toggleGroup = (key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Archived count for the segmented Active/Archived chip.
  useEffect(() => {
    if (!orgSlug) return;
    const controller = new AbortController();
    atsApi.listCandidates(orgSlug, { ...filterParams, archived: '1', limit: 1, page: 1 })
      .then((res) => { if (!controller.signal.aborted && res.success) setArchivedCount(res.total || 0); })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, JSON.stringify({ ...filterParams, archived: undefined })]);

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
            onClick={() => navigate(orgPath('/ats/candidates/new'))}
            className="flex items-center gap-2 px-4 py-2 bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Add Candidate
          </button>
        )}
      </div>

      {/* Filters — URL-driven via shared FilterBar */}
      <FilterBar searchPlaceholder="Search by name or email…">
        <FilterChip type="boolean" paramKey="hasActiveApps" label="Has applications" />
        <FilterChip type="select" paramKey="managerId" label="Manager" options={managerOptions} placeholder="No managers" />
        <GroupByChip options={GROUP_BY_OPTIONS} />
        <ArchivedToggle activeCount={filterParams.archived ? null : total} archivedCount={archivedCount} />
      </FilterBar>

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
            {Object.values(filterParams).some(Boolean)
              ? 'Try adjusting your search or filters.'
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
                    {/* 2026-05-12 audit P3: column visibility shuffled to
                        match recruiter priority. Phone is the second-
                        most-asked-for column after name (calls happen),
                        Application count was previously promoted ahead
                        of it which made no sense on tablet widths. */}
                    <th className="text-left px-4 py-3 text-dark-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden sm:table-cell">Phone</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Email</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">LinkedIn</th>
                    <th className="text-center px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Applications</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Last Applied</th>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // 2026-05-12 ATS audit Q2 = A: when groupBy is set,
                    // wrap the row stream in collapsible group sections.
                    // Same cells, same widths \u2014 only adds the header rows.
                    const renderRow = (candidate, keySuffix = '') => (
                      <tr
                        key={`${candidate._id}${keySuffix}`}
                        onClick={() => navigate(orgPath(`/ats/candidates/${candidate._id}`))}
                        className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                      >
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
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {candidate.phone ? (
                            <div className="flex items-center gap-1.5 text-dark-300">
                              <Phone size={12} className="text-dark-500 flex-shrink-0" />
                              <span title={candidate.phone}>{candidate.phone}</span>
                            </div>
                          ) : (
                            <span className="text-dark-500">{'\u2014'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {candidate.email ? (
                            <div className="flex items-center gap-1.5 text-dark-300">
                              <Mail size={12} className="text-dark-500 flex-shrink-0" />
                              <span className="truncate block max-w-[200px]" title={candidate.email}>{candidate.email}</span>
                            </div>
                          ) : (
                            <span className="text-dark-500">{'\u2014'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {candidate.linkedinProfile ? (
                            <a
                              href={candidate.linkedinProfile}
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
                        <td className="px-4 py-3 text-center hidden lg:table-cell">
                          <span className="bg-dark-700 text-dark-300 text-xs px-2 py-0.5 rounded-full">
                            {candidate.applicationCount ?? candidate.applications?.length ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-dark-400 text-xs hidden xl:table-cell">
                          {formatDate(candidate.lastApplied || candidate.updatedAt)}
                        </td>
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
                    );

                    if (!isGrouped) {
                      return candidates.map((c) => renderRow(c));
                    }
                    return (groupedCandidates || []).flatMap(([key, group]) => {
                      const collapsed = collapsedGroups.has(key);
                      const header = (
                        <tr key={`__group__${key}`} className="bg-dark-800/40 sticky">
                          <td colSpan={7} className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => toggleGroup(key)}
                              className="flex items-center gap-2 text-sm font-semibold text-dark-100 hover:text-white w-full text-left"
                            >
                              <ChevronDown
                                size={14}
                                className={`text-dark-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                              />
                              <span>{group.label}</span>
                              <span className="text-xs text-dark-400 font-normal">
                                {group.records.length} candidate{group.records.length === 1 ? '' : 's'}
                              </span>
                            </button>
                          </td>
                        </tr>
                      );
                      // Group-by-skill duplicates candidates across groups,
                      // so suffix the row key with the group key to keep
                      // React happy.
                      const rows = collapsed
                        ? []
                        : group.records.map((c) => renderRow(c, `__${key}`));
                      return [header, ...rows];
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination — hidden in grouped mode (server returns the full
              filtered set so grouping is correct; pagination would
              fragment groups). */}
          {!isGrouped && totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-dark-400 text-sm">
                Showing {pageStart}–{pageEnd} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
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
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
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

      {/* New-candidate creation now lives at /ats/candidates/new */}
    </div>
  );
}
