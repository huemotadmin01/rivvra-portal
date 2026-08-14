import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import { groupRecords, sortGroupsByCount } from '../../utils/grouping';
import { useDensity } from '../../hooks/useDensity';
import BulkImportModal from '../../components/BulkImportModal';
import { DataTable, FilterBar, Pagination, EmptyState, Button, Chip, Avatar, DensityToggle, GroupedHeader } from '../../components/ds';
import {
  useListParams, usePageParam, useSearchParamValue,
  SelectChipV2, BooleanChipV2, GroupByChipV2, ArchivedToggleV2, PageHeaderV2,
} from '../../components/platform/v2/listkit';
import { Plus, Users, Upload, Linkedin, ExternalLink } from 'lucide-react';

const PAGE_SIZE = 25;

const GROUP_BY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'manager', label: 'Manager' },
  { value: 'skill', label: 'Skill' },
];

// Same import-field config as the legacy page — the modal is reused as-is.
const CANDIDATE_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'full name', 'candidate', 'candidate name'] },
  { key: 'email', label: 'Email', required: true, aliases: ['email', 'e-mail', 'email address', 'mail'] },
  { key: 'phone', label: 'Phone', required: false, aliases: ['phone', 'phone number', 'telephone', 'tel'] },
  { key: 'mobile', label: 'Mobile', required: false, aliases: ['mobile', 'mobile number', 'cell', 'cellphone'] },
  { key: 'linkedinProfile', label: 'LinkedIn', required: false, aliases: ['linkedin', 'linkedin profile', 'linkedin url', 'profile'] },
  { key: 'description', label: 'Notes', required: false, aliases: ['description', 'notes', 'about', 'summary'] },
];

// "Matched on" skill chips under the name when the search hit a skill
// rather than name/email — same logic as the legacy page, token-styled.
function MatchedSkills({ candidate, search }) {
  const term = (search || '').trim();
  if (!term) return null;
  const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
  const aiSkills = Array.isArray(candidate.aiSkills) ? candidate.aiSkills : [];
  if (skills.length === 0 && aiSkills.length === 0) return null;
  const lowerTerm = term.toLowerCase();
  if ((candidate.name || '').toLowerCase().includes(lowerTerm)) return null;
  if ((candidate.email || '').toLowerCase().includes(lowerTerm)) return null;

  const matched = [];
  const aiMatched = [];
  const seen = new Set();
  for (const s of skills) {
    const n = (s.skillName || '').trim();
    if (!n || !n.toLowerCase().includes(lowerTerm) || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    matched.push(n);
    if (matched.length >= 4) break;
  }
  for (const s of aiSkills) {
    const n = (typeof s === 'string' ? s : s?.skillName || s?.name || '').trim();
    if (!n || !n.toLowerCase().includes(lowerTerm) || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    aiMatched.push(n);
    if (aiMatched.length >= 4) break;
  }
  if (matched.length === 0 && aiMatched.length === 0) return null;

  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 3 }}>
      <span style={{ font: "600 9.5px/1 'Inter', system-ui, sans-serif", letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-4)' }}>Matched</span>
      {matched.map((n) => <Chip key={n} tone="brand">{n}</Chip>)}
      {aiMatched.map((n) => (
        <Chip key={`ai-${n}`} tone="warn" title="Extracted from resume by AI — not yet confirmed by a recruiter">AI · {n}</Chip>
      ))}
    </span>
  );
}

/* v2 ATS Candidates list (Slice 2) — same data flow, grouping and URL
   semantics as AtsCandidates.jsx, rendered on ds DataTable + FilterBar. */
export default function AtsCandidatesV2() {
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = useListParams(['search', 'archived', 'hasActiveApps', 'managerId', 'groupBy', 'sort', 'dir']);
  const [page, setPage] = usePageParam();
  const [searchValue, setSearchValue] = useSearchParamValue('search');
  const groupBy = filterParams.groupBy || '';
  const isGrouped = Boolean(groupBy);
  const { density, setDensity } = useDensity('ats:candidates');

  const [candidates, setCandidates] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [total, setTotal] = useState(0);
  const [archivedCount, setArchivedCount] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [recruiters, setRecruiters] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());

  const orgSlug = currentOrg?.slug;
  const isAdmin = getAppRole('ats') === 'admin';

  const fetchCandidates = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    let aborted = false;
    try {
      const searchActive = !!(filterParams.search && filterParams.search.trim());
      const res = await atsApi.listCandidates(orgSlug, {
        page: isGrouped ? 1 : page,
        limit: isGrouped ? 5000 : PAGE_SIZE,
        ...(searchActive ? { withSkills: '1' } : {}),
        ...filterParams,
        _requestKey: 'ats:candidates:list',
      });
      if (res.success) {
        setCandidates(res.candidates || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      } else {
        showToast(res.error || 'Failed to load candidates', 'error');
      }
    } catch (err) {
      if (err?.name === 'AbortError') { aborted = true; return; }
      console.error('Failed to load candidates:', err);
      showToast('Failed to load candidates', 'error');
    } finally {
      if (!aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, page, isGrouped, JSON.stringify(filterParams), showToast]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  // Page-clamp guard — same rationale as legacy.
  useEffect(() => {
    if (!loading && totalPages > 0 && page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, totalPages, page]);

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

  // Same bucketing rules as legacy (lookup-first manager labels, skillName
  // keys with a single Unknown bucket) — see AtsCandidates.jsx for the why.
  const groupedCandidates = useMemo(() => {
    if (!groupBy) return null;
    const recruiterById = new Map(recruiters.map(r => [String(r._id || r.id), r.fullName || r.name || r.email]));
    const extractor = (cand) => {
      if (groupBy === 'manager') {
        const lookupName = cand.managerId ? recruiterById.get(String(cand.managerId)) : null;
        return [{
          key: cand.managerId || '__unknown__',
          label: lookupName || cand.managerName || (cand.managerId ? 'Unknown manager' : 'No manager'),
        }];
      }
      if (groupBy === 'skill') {
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
  }, [candidates, groupBy, recruiters]);

  const toggleGroup = (key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    if (!orgSlug) return;
    const controller = new AbortController();
    atsApi.listCandidates(orgSlug, { ...filterParams, archived: '1', limit: 1, page: 1 })
      .then((res) => { if (!controller.signal.aborted && res.success) setArchivedCount(res.total || 0); })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, JSON.stringify({ ...filterParams, archived: undefined })]);

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const hasFilters = Object.values(filterParams).some(Boolean);
  const goTo = (c) => navigate(orgPath(`/ats/candidates/${c._id}`));

  const columns = [
    {
      key: 'name', header: 'Name', sortable: true, width: 260,
      render: (c) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar name={c.name} size="sm" />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', color: 'var(--fg)', fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            {c.currentTitle && <span style={{ display: 'block', font: '450 11.5px/1.3 var(--font)', color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.currentTitle}</span>}
            <MatchedSkills candidate={c} search={filterParams.search} />
          </span>
        </span>
      ),
    },
    { key: 'phone', header: 'Phone', muted: true, width: 140 },
    {
      key: 'email', header: 'Email', sortable: true, width: 220,
      render: (c) => c.email ? <span title={c.email} style={{ color: 'var(--fg-2)' }}>{c.email}</span> : null,
    },
    {
      key: 'linkedinProfile', header: 'LinkedIn', width: 110,
      render: (c) => c.linkedinProfile ? (
        <a
          href={c.linkedinProfile}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--brand)' }}
        >
          <Linkedin size={12} /> Profile <ExternalLink size={10} />
        </a>
      ) : null,
    },
    {
      key: 'applicationCount', header: 'Applications', sortable: true, align: 'center', width: 110,
      render: (c) => <Chip>{c.applicationCount ?? c.applications?.length ?? 0}</Chip>,
    },
    {
      key: 'lastApplicationDate', header: 'Last Applied', sortable: true, muted: true, width: 130,
      render: (c) => formatDate(c.lastApplied || c.updatedAt),
    },
    {
      key: 'tags', header: 'Tags', width: 150,
      render: (c) => {
        const tags = c.tagNames || c.tags || [];
        if (!tags.length) return null;
        return (
          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
            {tags.slice(0, 2).map((t, i) => <Chip key={i}>{typeof t === 'string' ? t : t.name}</Chip>)}
            {tags.length > 2 && <span style={{ color: 'var(--fg-4)', font: '450 11.5px/1.4 var(--font)' }}>+{tags.length - 2}</span>}
          </span>
        );
      },
    },
  ];

  // Sort state comes from the legacy `sort` + `dir` params (SortableHeader
  // convention: dir=asc|desc), mapped onto DataTable's {key, dir}.
  const dsSort = filterParams.sort ? { key: filterParams.sort, dir: filterParams.dir === 'desc' ? 'desc' : 'asc' } : null;
  const onSortChange = (next) => {
    const np = new URLSearchParams(searchParams);
    if (!next) { np.delete('sort'); np.delete('dir'); }
    else { np.set('sort', next.key); np.set('dir', next.dir); }
    np.delete('page');
    setSearchParams(np);
  };

  const emptyState = (
    <EmptyState
      icon={<Users size={22} />}
      title="No candidates found"
      actions={hasFilters && (
        <Button variant="secondary" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>Clear all filters</Button>
      )}
    >
      {hasFilters ? 'Try adjusting your search or filters.' : 'Candidates will appear here when applications are created.'}
    </EmptyState>
  );

  // Grouped mode renders group headers + rows through DataTable's children
  // slot; cell markup mirrors the columns above via a shared renderer.
  const renderGroupedRows = () => (groupedCandidates || []).flatMap(([key, group]) => {
    const collapsed = collapsedGroups.has(key);
    const isManagerGroup = groupBy === 'manager';
    const header = (
      <GroupedHeader
        key={`__group__${key}`}
        label={group.label}
        count={group.records.length}
        noun="candidate"
        colSpan={columns.length}
        collapsed={collapsed}
        onToggle={() => toggleGroup(key)}
        accent={isManagerGroup ? 'var(--a-ats, #8b5cf6)' : 'var(--brand, #22c55e)'}
        avatarText={isManagerGroup ? undefined : ''}
        sticky
        stickyTop={30}
      />
    );
    const pad = density === 'compact' ? '6px 12px' : '11px 14px';
    const rows = collapsed ? [] : group.records.map((c) => (
      <tr
        key={`${c._id}__${key}`}
        onClick={() => goTo(c)}
        style={{ cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {columns.map((col) => (
          <td key={col.key} style={{ padding: pad, font: density === 'compact' ? '450 13px/1.4 var(--font)' : '450 13.5px/1.45 var(--font)', color: col.muted ? 'var(--fg-3)' : 'var(--fg-2)', textAlign: col.align || 'left', borderBottom: '1px solid var(--line)', verticalAlign: 'middle', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {col.render ? col.render(c) : c?.[col.key] ?? <span style={{ color: 'var(--fg-4)' }}>—</span>}
          </td>
        ))}
      </tr>
    ));
    return [header, ...rows];
  });

  return (
    <div>
      <PageHeaderV2
        title="Candidates"
        sub={`${total} ${total === 1 ? 'candidate' : 'candidates'} total`}
        actions={(
          <>
            <DensityToggle density={density} onChange={setDensity} />
            {isAdmin && <Button variant="secondary" size="sm" iconLeft={<Upload size={14} />} onClick={() => setShowImport(true)}>Import</Button>}
            {isAdmin && <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => navigate(orgPath('/ats/candidates/new'))}>Add Candidate</Button>}
          </>
        )}
      />

      {isAdmin && (
        <BulkImportModal
          open={showImport}
          onClose={() => setShowImport(false)}
          title="Import Candidates"
          itemNoun="candidate"
          templateName="candidates-import-template.csv"
          fields={CANDIDATE_IMPORT_FIELDS}
          onImport={(rows) => atsApi.bulkImportCandidates(orgSlug, rows)}
          onDone={() => fetchCandidates()}
        />
      )}

      <FilterBar
        search={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search by name, email, or skill…"
        resultCount={total}
        noun="candidate"
        onClearAll={hasFilters ? () => setSearchParams(new URLSearchParams()) : undefined}
        filters={[]}
        left={(
          <>
            <BooleanChipV2 paramKey="hasActiveApps" label="Has applications" />
            <SelectChipV2 paramKey="managerId" label="Manager" options={managerOptions} placeholder="No managers" />
            <GroupByChipV2 options={GROUP_BY_OPTIONS} />
            <ArchivedToggleV2 activeCount={filterParams.archived ? null : total} archivedCount={archivedCount} />
          </>
        )}
        style={{ marginBottom: 14 }}
      />

      <DataTable
        columns={columns}
        rows={isGrouped ? [] : candidates}
        rowKey="_id"
        density={density}
        loading={loading}
        sort={dsSort}
        onSortChange={isGrouped ? undefined : onSortChange}
        onRowClick={goTo}
        empty={emptyState}
      >
        {/* Grouped mode feeds rows through the children slot; when the
            grouped set is empty, children is null so DataTable's own
            empty state takes over. */}
        {isGrouped && !loading && candidates.length ? renderGroupedRows() : null}
      </DataTable>

      {!isGrouped && total > 0 && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} noun="candidate" />
      )}
    </div>
  );
}
