import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import employeeApi from '../../utils/employeeApi';
import { getPublicPlatformSetting } from '../../utils/payrollApi';
import {
  Plus, Users, Mail, Phone, Hash,
  ChevronLeft, ChevronRight, X, Upload,
} from 'lucide-react';
import BulkImportModal from '../../components/BulkImportModal';
import {
  PageHeader, Panel, Chip, Button, SearchInput, SelectChip,
  EmptyState, PageSpinner,
} from '../../components/ds';

// ─────────────────────────────────────────────────────────────────────────────
// The directory's data layer is spliced in verbatim in four segments, each
// diffed against the legacy file. The only lines dropped are the `openFilter`
// bookkeeping (state, `toggleFilter`, and the `setOpenFilter(null)` inside
// `handleFilterSelect`): ds `SelectChip` owns its own popover, so the page no
// longer coordinates which dropdown is open. Everything else — the two effects,
// `fetchEmployees` with its own eslint-disable, the 300ms search debounce, the
// unmount cleanup, `clearAllFilters`, `getInitials`, and all four option
// arrays — is byte-identical.
//
// Two legacy quirks carried across deliberately, not fixed:
//   • `activeFilterCount` counts `statusFilter`, which *defaults* to 'active',
//     so the Clear affordance is showing "(1)" on first paint.
//   • `clearAllFilters` sets status to '' (All Statuses), which is not the
//     initial 'active' — clearing lands somewhere the page never started.
//
// `BulkImportModal` is kept as-is: it is a whole import wizard, not a styling
// primitive, and ds has no equivalent.
//
// Not triggered: bulk import.
// ─────────────────────────────────────────────────────────────────────────────

// Column config for the bulk-import modal → employee create payload.
// Import posture = migrating existing staff: Sourced By blank, no probation,
// no salary (set CTC later via Revise CTC).
const EMPLOYEE_IMPORT_FIELDS = [
  { key: 'fullName', label: 'Full Name', required: true, aliases: ['full name', 'name', 'employee name', 'fullname'] },
  { key: 'email', label: 'Email', required: true, aliases: ['email', 'e-mail', 'email address', 'work email', 'mail'] },
  { key: 'phone', label: 'Phone', required: false, aliases: ['phone', 'phone number', 'mobile', 'contact'] },
  { key: 'employeeId', label: 'Employee ID', required: false, aliases: ['employee id', 'emp id', 'employeeid', 'id', 'empid'] },
  { key: 'employmentType', label: 'Employment Type', required: false, aliases: ['employment type', 'type', 'emp type'] },
  { key: 'designation', label: 'Designation', required: false, aliases: ['designation', 'title', 'job title', 'role', 'position'] },
  { key: 'joiningDate', label: 'Joining Date', required: false, aliases: ['joining date', 'doj', 'date of joining', 'start date', 'joined'] },
  { key: 'status', label: 'Status', required: false, aliases: ['status', 'employment status'] },
  { key: 'lastWorkingDate', label: 'Last Working Date', required: false, aliases: ['last working date', 'lwd', 'exit date', 'end date'] },
  { key: 'dateOfBirth', label: 'Date of Birth', required: false, aliases: ['date of birth', 'dob', 'birth date', 'birthday'] },
];

// Employment type carries meaning, so each gets its own Chip tone rather than a
// hand-rolled colour pair. Same four buckets legacy painted, same fallback.
const TYPE_TONE = {
  confirmed: 'brand',
  internal_consultant: 'purple',
  external_consultant: 'info',
  intern: 'warn',
};

const STATUS_DOT = {
  active: 'var(--acc-emerald)',
  resigned: 'var(--danger)',
  terminated: 'var(--danger)',
};

export default function EmployeeDirectoryV2() {
  const { currentOrg, getAppRole } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [billableFilter, setBillableFilter] = useState('');

  // Departments for dropdown
  const [departments, setDepartments] = useState([]);
  // Dynamic employment types from platform settings
  const [empTypes, setEmpTypes] = useState([
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'internal_consultant', label: 'Internal Consultant' },
    { key: 'external_consultant', label: 'External Consultant' },
    { key: 'intern', label: 'Intern' },
  ]);

  const debounceRef = useRef(null);
  const isAdmin = getAppRole('employee') === 'admin';
  const orgSlug = currentOrg?.slug;
  const [showImport, setShowImport] = useState(false);

  // Count active filters
  const activeFilterCount = [departmentFilter, employmentTypeFilter, statusFilter, billableFilter]
    .filter(Boolean).length;

  // Fetch departments + employment types once
  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    setDepartments([]);
    employeeApi.listDepartments(orgSlug)
      .then((res) => {
        if (!cancelled && res.success) {
          setDepartments(res.departments || []);
        }
      })
      .catch(() => {});
    getPublicPlatformSetting('employment_types')
      .then(res => {
        if (!cancelled && res?.items?.length) setEmpTypes(res.items.map(t => ({ key: t.key, label: t.label })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orgSlug, currentCompany?._id]);

  // Fetch employees
  const fetchEmployees = useCallback(async (params = {}) => {
    if (!orgSlug) return;
    setLoading(true);
    setEmployees([]);
    setTotal(0);
    setTotalPages(1);
    try {
      const res = await employeeApi.list(orgSlug, {
        page: params.page || page,
        search: params.search !== undefined ? params.search : search,
        department: params.department !== undefined ? params.department : departmentFilter,
        employmentType: params.employmentType !== undefined ? params.employmentType : employmentTypeFilter,
        status: params.status !== undefined ? params.status : statusFilter,
        billable: params.billable !== undefined ? params.billable : billableFilter,
      });
      if (res.success) {
        setEmployees(res.employees || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, currentCompany?._id, page, search, departmentFilter, employmentTypeFilter, statusFilter, billableFilter]);

  // Initial load + re-fetch on filter / page change (include fetchEmployees to fix stale closure)
  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Debounced search
  const handleSearchChange = (value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchEmployees({ search: value, page: 1 });
    }, 300);
  };

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Handle filter changes — reset to page 1.
  // Legacy also did `setOpenFilter(null)` here to close the dropdown; SelectChip
  // closes itself, so that line has no counterpart.
  const handleFilterSelect = (setter) => (val) => {
    setter(val);
    setPage(1);
  };

  const clearAllFilters = () => {
    setDepartmentFilter('');
    setEmploymentTypeFilter('');
    setStatusFilter('');
    setBillableFilter('');
    setPage(1);
  };

  // Get initials from full name
  const getInitials = (fullName) => {
    if (!fullName) return '?';
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0]?.[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || '?';
  };

  // Filter options
  const departmentOptions = [
    { value: '', label: 'All Departments' },
    ...departments.map((d) => ({ value: d._id, label: d.name })),
  ];

  const typeOptions = [
    { value: '', label: 'All Types' },
    ...empTypes.map(t => ({ value: t.key, label: t.label })),
  ];

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'resigned', label: 'Resigned' },
    { value: 'terminated', label: 'Terminated' },
  ];

  const billableOptions = [
    { value: '', label: 'Billable / Non-Billable' },
    { value: 'true', label: 'Billable' },
    { value: 'false', label: 'Non-Billable' },
  ];

  return (
    <div>
      {/* Header */}
      <PageHeader
        title="Employee Directory"
        sub={`${total} ${total === 1 ? 'employee' : 'employees'} total`}
        actions={isAdmin && (
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowImport(true)} iconLeft={<Upload size={15} />}>
              Import
            </Button>
            <Button size="sm" onClick={() => navigate(orgPath('/employee/add'))} iconLeft={<Plus size={15} />}>
              Add Employee
            </Button>
          </>
        )}
      />

      {isAdmin && (
        <BulkImportModal
          open={showImport}
          onClose={() => setShowImport(false)}
          title="Import Employees"
          itemNoun="employee"
          templateName="employees-import-template.csv"
          fields={EMPLOYEE_IMPORT_FIELDS}
          onImport={(rows) => employeeApi.bulkImport(orgSlug, rows)}
          onDone={() => fetchEmployees()}
        />
      )}

      {/* Search + filters */}
      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder="Search by name, email, or designation..."
          aria-label="Search employees"
          width="100%"
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
          <SelectChip label="Department" value={departmentFilter} options={departmentOptions}
            onChange={handleFilterSelect(setDepartmentFilter)} />
          <SelectChip label="Type" value={employmentTypeFilter} options={typeOptions}
            onChange={handleFilterSelect(setEmploymentTypeFilter)} />
          <SelectChip label="Status" value={statusFilter} options={statusOptions}
            onChange={handleFilterSelect(setStatusFilter)} />
          <SelectChip label="Billable" value={billableFilter} options={billableOptions}
            onChange={handleFilterSelect(setBillableFilter)} />

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters} iconLeft={<X size={13} />}>
              Clear{activeFilterCount > 1 ? ` (${activeFilterCount})` : ''}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <PageSpinner label="Loading employees…" />
      ) : employees.length === 0 ? (
        <Panel>
          <EmptyState icon={<Users size={22} />} title="No employees found">
            {search || departmentFilter || employmentTypeFilter || statusFilter || billableFilter
              ? 'Try adjusting your search or filters.'
              : 'Add your first employee to get started.'}
          </EmptyState>
        </Panel>
      ) : (
        <>
          {/* Card grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {employees.map((emp) => (
              <Panel
                key={emp._id}
                role="link"
                tabIndex={0}
                aria-label={`Open ${emp.fullName || 'Unknown'}`}
                onClick={() => navigate(orgPath('/employee/' + emp._id))}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(orgPath('/employee/' + emp._id)); } }}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ padding: 6 }}>
                  {/* Top row: initials + name + status dot */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <span style={{
                      flexShrink: 0, width: 42, height: 42, borderRadius: 99,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--brand-soft)',
                      font: "700 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)',
                    }}>
                      {getInitials(emp.fullName)}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <p style={{
                          font: "550 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {emp.fullName || 'Unknown'}
                        </p>
                        <span
                          title={emp.status ? emp.status.charAt(0).toUpperCase() + emp.status.slice(1) : 'Unknown'}
                          style={{
                            flexShrink: 0, width: 8, height: 8, borderRadius: 99,
                            background: STATUS_DOT[emp.status] || 'var(--line-2)',
                          }}
                        />
                      </div>
                      <p style={{
                        font: "400 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '2px 0 0',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {emp.designation || 'No designation'}
                      </p>
                      {emp.employeeId && (
                        <p style={{ display: 'flex', alignItems: 'center', gap: 4, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '2px 0 0' }}>
                          <Hash size={10} style={{ flexShrink: 0 }} />
                          {emp.employeeId}
                        </p>
                      )}
                      {(emp.status === 'resigned' || emp.status === 'terminated') && emp.lastWorkingDate && (
                        <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger)', margin: '2px 0 0' }}>
                          LWD: {new Date(emp.lastWorkingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 11 }}>
                    {emp.departmentName && <Chip tone="neutral">{emp.departmentName}</Chip>}
                    {emp.employmentType && (
                      <Chip tone={TYPE_TONE[emp.employmentType] || 'neutral'}>
                        {empTypes.find(t => t.key === emp.employmentType)?.label || emp.employmentType}
                      </Chip>
                    )}
                    {emp.billable && <Chip tone="brand">Billable</Chip>}
                  </div>

                  {/* Contact */}
                  <div style={{ display: 'grid', gap: 5, marginTop: 11 }}>
                    {emp.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <Mail size={13} style={{ flexShrink: 0, color: 'var(--fg-4)' }} />
                        <span style={{ font: "400 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.email}</span>
                      </div>
                    )}
                    {emp.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <Phone size={13} style={{ flexShrink: 0, color: 'var(--fg-4)' }} />
                        <span style={{ font: "400 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            ))}
          </div>

          {/* Pagination — the page-window arithmetic is legacy's, verbatim. ds
              `Pagination` derives its own page count from total/pageSize and has
              no numbered buttons, so adopting it would have changed which pages
              are reachable. */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 14 }}>
              <p style={{ font: "400 12px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
                Page {page} of {totalPages}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Button variant="ghost" size="sm" aria-label="Previous page"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1} iconLeft={<ChevronLeft size={15} />} />
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      size="sm"
                      variant={page === pageNum ? 'primary' : 'ghost'}
                      onClick={() => setPage(pageNum)}
                      aria-label={`Go to page ${pageNum}`}
                      aria-current={page === pageNum ? 'page' : undefined}
                      style={{ minWidth: 32 }}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button variant="ghost" size="sm" aria-label="Next page"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages} iconLeft={<ChevronRight size={15} />} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
