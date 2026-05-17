import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import FilterBar, { FilterChip, GroupByChip, ArchivedToggle, useFilterParams } from '../../components/shared/FilterBar';
import { groupRecords, sortGroupsByCount } from '../../utils/grouping';
import { useDensity } from '../../hooks/useDensity';
import DensityToggle from '../../components/shared/DensityToggle';
import SortableHeader from '../../components/shared/SortableHeader';
import GroupedHeader from '../../components/shared/GroupedHeader';
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

// 2026-05-18: "Matched on" chips. Renders only when the user has a
// search active AND the search term hits one of the candidate's skill
// names (not the candidate's own name/email — that case doesn't need
// extra context). The matching substring inside each skill chip gets
// highlighted so the user can see why each row qualified.
function MatchedSkills({ candidate, search }) {
  const term = (search || '').trim();
  if (!term) return null;
  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
  if (skills.length === 0) return null;
  // Skip when the row already matched on name/email — no need to also
  // explain via skills, the row is "obviously" relevant.
  const lowerTerm = term.toLowerCase();
  const nameHit  = (candidate.name  || '').toLowerCase().includes(lowerTerm);
  const emailHit = (candidate.email || '').toLowerCase().includes(lowerTerm);
  if (nameHit || emailHit) return null;
  // Find skills whose name contains the term (case-insensitive).
  const matched = [];
  const seen = new Set();
  for (const s of skills) {
    const n = (s.skillName || '').trim();
    if (!n) continue;
    if (!n.toLowerCase().includes(lowerTerm)) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    matched.push(n);
    if (matched.length >= 4) break;
  }
  if (matched.length === 0) return null;

  // Highlight the matching substring inside each chip.
  const renderHighlighted = (text) => {
    const i = text.toLowerCase().indexOf(lowerTerm);
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <span className="text-rivvra-300 underline underline-offset-2">
          {text.slice(i, i + term.length)}
        </span>
        {text.slice(i + term.length)}
      </>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      <span className="text-[10px] text-dark-500 uppercase tracking-wide">Matched</span>
      {matched.map((name) => (
        <span
          key={name}
          className="text-[10px] px-1.5 py-0.5 rounded-full bg-rivvra-500/10 text-rivvra-300 border border-rivvra-500/20"
        >
          {renderHighlighted(name)}
        </span>
      ))}
    </div>
  );
}


/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsCandidates() {
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Filter state lives in the URL — bookmarkable + refresh-safe.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useFilterParams(['search', 'archived', 'hasActiveApps', 'managerId', 'groupBy', 'sort', 'dir']);
  // 2026-05-17 Phase L: harden page-param parsing (see AtsApplications).
  const pageRaw = parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const groupBy = filterParams.groupBy || '';
  const isGrouped = Boolean(groupBy);
  const { density, setDensity, cellPadding } = useDensity('ats:candidates');

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
  // 2026-05-18 RBAC two-tier: any ATS user can add candidates.
  const canRecruit = !!getAppRole('ats');

  const setPage = (next) => {
    const np = new URLSearchParams(searchParams);
    if (next > 1) np.set('page', String(next)); else np.delete('page');
    setSearchParams(np);
  };

  // ── Fetch candidates ──────────────────────────────────────────────────
  const fetchCandidates = useCallback(async () => {
    if (!orgSlug) return;
    // 2026-05-17 health-check D.1: keep prior view; dedup via _requestKey.
    setLoading(true);
    try {
      // 2026-05-17 ATS-CAND-GROUP-FETCH: when groupBy is active, pull the
      // full filtered set in one shot (cap 5000, matches API ceiling) so
      // groups aren't fragmented or undercounted. Before this, the
      // default limit of 25 meant Group by Manager on 2172 candidates
      // only grouped the first 25 — making counts look wildly wrong.
      // 2026-05-18: ask API to attach skill rows whenever the user is
      // searching, so we can render "Matched on: <skill>" chips under
      // each candidate. The API already understands withSkills=1.
      const searchActive = !!(filterParams.search && filterParams.search.trim());
      const res = await atsApi.listCandidates(orgSlug, {
        page: isGrouped ? 1 : page,
        ...(isGrouped ? { limit: 5000 } : {}),
        ...(searchActive ? { withSkills: '1' } : {}),
        ...filterParams,
        _requestKey: 'ats:candidates:list',
      });
      if (res.success) {
        setCandidates(res.candidates || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Failed to load candidates:', err);
      showToast('Failed to load candidates', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, page, isGrouped, JSON.stringify(filterParams), showToast]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  // 2026-05-17 Phase L: page-clamp guard (see AtsApplications for rationale).
  useEffect(() => {
    if (!loading && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, totalPages, page]);

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
        // 2026-05-17 ATS-CAND-GROUP-SKILL: key by skillName, not skillId.
        // Huemot's imported candidate-skill rows have skillId set but
        // skillName missing on many rows — keying on id produced a
        // separate "Unknown skill" bucket per id (UI showed 9+ groups
        // all labeled the same). Collapse all unnamed rows into one
        // __unknown__ bucket so the user gets one Unknown group plus
        // one bucket per real skill name.
        const skills = Array.isArray(cand.skills) ? cand.skills : [];
        if (skills.length === 0) return [{ key: '__no_skills__', label: 'No skills captured' }];
        return skills.map((s) => {
          const name = (s.skillName || '').trim();
          if (!name) return { key: '__unknown__', label: 'Unknown skill' };
          return { key: name.toLowerCase(), label: name };
        });
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
        <div className="flex items-center gap-2">
          <DensityToggle density={density} onChange={setDensity} />
          {canRecruit && (
          <button
            onClick={() => navigate(orgPath('/ats/candidates/new'))}
            className="flex items-center gap-2 px-4 py-2 bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Add Candidate
          </button>
          )}
        </div>
      </div>

      {/* Filters — URL-driven via shared FilterBar */}
      <FilterBar searchPlaceholder="Search by name, email, or skill…">
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
        // 2026-05-17 Phase M.2: when filters are active, give a
        // one-click "Clear all filters" affordance instead of leaving
        // the user to wipe each chip manually. Mirrors AtsApplications.
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No candidates found</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm mb-4">
            {Object.values(filterParams).some(Boolean)
              ? 'Try adjusting your search or filters.'
              : 'Candidates will appear here when applications are created.'}
          </p>
          {Object.values(filterParams).some(Boolean) && (
            <button
              type="button"
              onClick={() => setSearchParams(new URLSearchParams())}
              className="text-xs text-rivvra-400 hover:text-rivvra-300 underline underline-offset-2"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-700">
                    {/* 2026-05-13 audit Q4 = A: clickable column headers
                        for sortable fields. Non-sortable columns (Phone,
                        LinkedIn, Tags) stay as plain <th>. */}
                    <SortableHeader column="name">Name</SortableHeader>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden sm:table-cell">Phone</th>
                    <SortableHeader column="email" className="hidden md:table-cell">Email</SortableHeader>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">LinkedIn</th>
                    <SortableHeader column="applicationCount" align="center" className="hidden lg:table-cell">Applications</SortableHeader>
                    <SortableHeader column="lastApplicationDate" className="hidden xl:table-cell">Last Applied</SortableHeader>
                    <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // 2026-05-12 ATS audit Q2 = A: when groupBy is set,
                    // wrap the row stream in collapsible group sections.
                    // Same cells, same widths \u2014 only adds the header rows.
                    const renderRow = (candidate, keySuffix = '') => (
                      // 2026-05-17 Phase M.3: keyboard + a11y for the
                      // navigable row (same pattern as AtsApplications).
                      <tr
                        key={`${candidate._id}${keySuffix}`}
                        onClick={() => navigate(orgPath(`/ats/candidates/${candidate._id}`))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(orgPath(`/ats/candidates/${candidate._id}`));
                          }
                        }}
                        tabIndex={0}
                        role="link"
                        aria-label={`Open candidate: ${candidate.name || 'Unknown'}`}
                        className={`border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors focus:outline-none focus:bg-dark-800/70 focus:ring-1 focus:ring-rivvra-500/40 ${density === 'compact' ? '[&>td]:py-1.5' : '[&>td]:py-3'}`}
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
                              {/* 2026-05-18: when the search matched on a
                                  skill (not name/email), surface which
                                  skills matched so the row's relevance is
                                  obvious. Only renders when searching. */}
                              <MatchedSkills
                                candidate={candidate}
                                search={filterParams.search}
                              />
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
                      // 2026-05-13 audit Q3 = A+B: sticky group headers
                      // with visual hooks. Manager grouping → initials
                      // avatar in violet. Skill grouping → emerald
                      // accent bar (no avatar; skill name is the label).
                      const isManagerGroup = groupBy === 'manager';
                      const header = (
                        <GroupedHeader
                          key={`__group__${key}`}
                          label={group.label}
                          count={group.records.length}
                          recordSingular="candidate"
                          colSpan={7}
                          collapsed={collapsed}
                          onToggle={() => toggleGroup(key)}
                          accent={isManagerGroup ? 'bg-violet-500' : 'bg-emerald-500'}
                          avatarText={isManagerGroup ? undefined : ''}
                          avatarColor={isManagerGroup ? 'bg-violet-500/15 text-violet-300' : ''}
                          sticky
                          stickyTop="-1px"
                        />
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
                  aria-label="Previous page"
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
                  aria-label="Next page"
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
