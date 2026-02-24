import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import employeeApi from '../../utils/employeeApi';
import {
  Search, Plus, Loader2, Users, Mail, Phone, Hash,
  ChevronLeft, ChevronRight, ChevronDown, X,
} from 'lucide-react';

/* ── Inline FilterChip component ─────────────────────────────────────── */
function FilterChip({ label, value, options, isOpen, onToggle, onSelect }) {
  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption && value ? selectedOption.label : label;

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${
          value
            ? 'bg-rivvra-500/10 border-rivvra-500/30 text-rivvra-400'
            : 'bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600 hover:text-dark-200'
        }`}
      >
        {displayLabel}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={onToggle} />

          {/* Dropdown */}
          <div className="absolute left-0 top-full mt-1.5 min-w-[180px] bg-dark-800 border border-dark-700 rounded-xl shadow-2xl py-1 z-20 max-h-60 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onSelect(opt.value)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  opt.value === value
                    ? 'bg-rivvra-500/10 text-rivvra-400'
                    : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */
export default function EmployeeDirectory() {
  const { currentOrg, getAppRole } = useOrg();
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
  const [statusFilter, setStatusFilter] = useState('');
  const [billableFilter, setBillableFilter] = useState('');

  // Which filter dropdown is open
  const [openFilter, setOpenFilter] = useState(null);

  // Departments for dropdown
  const [departments, setDepartments] = useState([]);

  const debounceRef = useRef(null);
  const isAdmin = getAppRole('employee') === 'admin';
  const orgSlug = currentOrg?.slug;

  // Count active filters
  const activeFilterCount = [departmentFilter, employmentTypeFilter, statusFilter, billableFilter]
    .filter(Boolean).length;

  // Fetch departments once
  useEffect(() => {
    if (!orgSlug) return;
    employeeApi.listDepartments(orgSlug)
      .then((res) => {
        if (res.success) {
          setDepartments(res.departments || []);
        }
      })
      .catch(() => {});
  }, [orgSlug]);

  // Fetch employees
  const fetchEmployees = useCallback(async (params = {}) => {
    if (!orgSlug) return;
    setLoading(true);
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
  }, [orgSlug, page, search, departmentFilter, employmentTypeFilter, statusFilter, billableFilter]);

  // Initial load + re-fetch on filter / page change (not search — that's debounced)
  useEffect(() => {
    fetchEmployees();
  }, [page, departmentFilter, employmentTypeFilter, statusFilter, billableFilter, orgSlug]);

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

  // Handle filter changes — reset to page 1
  const handleFilterSelect = (setter) => (val) => {
    setter(val);
    setPage(1);
    setOpenFilter(null);
  };

  const clearAllFilters = () => {
    setDepartmentFilter('');
    setEmploymentTypeFilter('');
    setStatusFilter('');
    setBillableFilter('');
    setPage(1);
  };

  const toggleFilter = (name) => {
    setOpenFilter((prev) => (prev === name ? null : name));
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
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'internal_consultant', label: 'Internal Consultant' },
    { value: 'external_consultant', label: 'External Consultant' },
    { value: 'intern', label: 'Intern' },
  ];

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];

  const billableOptions = [
    { value: '', label: 'Billable / Non-Billable' },
    { value: 'true', label: 'Billable' },
    { value: 'false', label: 'Non-Billable' },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Employee Directory</h1>
          <p className="text-dark-400 text-sm mt-1">
            {total} {total === 1 ? 'employee' : 'employees'} total
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => navigate(orgPath('/employee/add'))}
            className="btn-primary flex items-center gap-2 self-start"
          >
            <Plus size={16} />
            Add Employee
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
        <input
          type="text"
          placeholder="Search by name, email, or designation..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="input-field w-full pl-10"
        />
      </div>

      {/* Filter chips row */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="Department"
          value={departmentFilter}
          options={departmentOptions}
          isOpen={openFilter === 'department'}
          onToggle={() => toggleFilter('department')}
          onSelect={handleFilterSelect(setDepartmentFilter)}
        />
        <FilterChip
          label="Type"
          value={employmentTypeFilter}
          options={typeOptions}
          isOpen={openFilter === 'type'}
          onToggle={() => toggleFilter('type')}
          onSelect={handleFilterSelect(setEmploymentTypeFilter)}
        />
        <FilterChip
          label="Status"
          value={statusFilter}
          options={statusOptions}
          isOpen={openFilter === 'status'}
          onToggle={() => toggleFilter('status')}
          onSelect={handleFilterSelect(setStatusFilter)}
        />
        <FilterChip
          label="Billable / Non-Billable"
          value={billableFilter}
          options={billableOptions}
          isOpen={openFilter === 'billable'}
          onToggle={() => toggleFilter('billable')}
          onSelect={handleFilterSelect(setBillableFilter)}
        />

        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-dark-400 hover:text-white transition-colors rounded-lg hover:bg-dark-800"
          >
            <X className="w-3.5 h-3.5" />
            Clear{activeFilterCount > 1 ? ` (${activeFilterCount})` : ''}
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No employees found</h3>
          <p className="text-dark-400 text-sm text-center max-w-sm">
            {search || departmentFilter || employmentTypeFilter || statusFilter || billableFilter
              ? 'Try adjusting your search or filters.'
              : 'Add your first employee to get started.'}
          </p>
        </div>
      ) : (
        <>
          {/* Card grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.map((emp) => (
              <div
                key={emp._id}
                onClick={() => navigate(orgPath('/employee/' + emp._id))}
                className="card p-5 cursor-pointer hover:bg-dark-800/50 transition-colors group"
              >
                {/* Top row: avatar + name + status */}
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-orange-400">
                      {getInitials(emp.fullName)}
                    </span>
                  </div>

                  {/* Name + designation */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white truncate group-hover:text-orange-400 transition-colors">
                        {emp.fullName || 'Unknown'}
                      </p>
                      {/* Status dot */}
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          emp.status === 'active' ? 'bg-emerald-400' : 'bg-dark-500'
                        }`}
                        title={emp.status === 'active' ? 'Active' : 'Inactive'}
                      />
                    </div>
                    <p className="text-dark-400 text-sm truncate">
                      {emp.designation || 'No designation'}
                    </p>
                    {emp.employeeId && (
                      <p className="text-dark-500 text-xs flex items-center gap-1 mt-0.5">
                        <Hash size={10} className="flex-shrink-0" />
                        {emp.employeeId}
                      </p>
                    )}
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {emp.departmentName && (
                    <span className="text-xs px-2 py-0.5 rounded bg-dark-700 text-dark-300">
                      {emp.departmentName}
                    </span>
                  )}
                  {emp.employmentType && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        {
                          confirmed: 'bg-emerald-500/10 text-emerald-400',
                          internal_consultant: 'bg-purple-500/10 text-purple-400',
                          external_consultant: 'bg-blue-500/10 text-blue-400',
                          intern: 'bg-amber-500/10 text-amber-400',
                        }[emp.employmentType] || 'bg-dark-700 text-dark-300'
                      }`}
                    >
                      {
                        {
                          confirmed: 'Confirmed',
                          internal_consultant: 'Internal Consultant',
                          external_consultant: 'External Consultant',
                          intern: 'Intern',
                        }[emp.employmentType] || emp.employmentType
                      }
                    </span>
                  )}
                  {emp.billable && (
                    <span className="text-xs px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 font-medium">
                      Billable
                    </span>
                  )}
                </div>

                {/* Contact info */}
                <div className="mt-3 space-y-1.5">
                  {emp.email && (
                    <div className="flex items-center gap-2 text-sm text-dark-400 truncate">
                      <Mail size={14} className="flex-shrink-0" />
                      <span className="truncate">{emp.email}</span>
                    </div>
                  )}
                  {emp.phone && (
                    <div className="flex items-center gap-2 text-sm text-dark-400 truncate">
                      <Phone size={14} className="flex-shrink-0" />
                      <span className="truncate">{emp.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-dark-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-dark-400" />
                </button>
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
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        page === pageNum
                          ? 'bg-orange-500 text-white'
                          : 'text-dark-400 hover:bg-dark-700'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-dark-400" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
