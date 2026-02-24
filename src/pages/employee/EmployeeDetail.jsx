import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import employeeApi from '../../utils/employeeApi';
import {
  ArrowLeft,
  Edit2,
  Building2,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Shield,
  User,
  IndianRupee,
  Loader2,
  Briefcase,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(val) {
  if (!val) return null;
  return new Date(val).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(val) {
  if (val == null) return null;
  return `\u20B9${Number(val).toLocaleString()}`;
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

function Badge({ children, className }) {
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
      <span className="text-dark-400 text-sm">{label}</span>
      <span className="text-white text-sm">{value ?? '\u2014'}</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon size={16} className="text-dark-400" />}
        <h3 className="text-white font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employment type / status badge helpers
// ---------------------------------------------------------------------------

const EMPLOYMENT_TYPE_CONFIG = {
  confirmed: { label: 'Confirmed', className: 'bg-emerald-500/10 text-emerald-400' },
  internal_consultant: { label: 'Internal Consultant', className: 'bg-purple-500/10 text-purple-400' },
  external_consultant: { label: 'External Consultant', className: 'bg-blue-500/10 text-blue-400' },
  intern: { label: 'Intern', className: 'bg-amber-500/10 text-amber-400' },
};

function employmentTypeBadge(type) {
  if (!type) return null;
  const cfg = EMPLOYMENT_TYPE_CONFIG[type] || { label: type, className: 'bg-dark-700 text-dark-300' };
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

function statusBadge(status) {
  if (!status) return null;
  const lower = status.toLowerCase();
  if (lower === 'active') {
    return (
      <Badge className="bg-green-500/10 text-green-400">
        Active
      </Badge>
    );
  }
  return (
    <Badge className="bg-dark-700 text-dark-400">
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EmployeeDetail() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { currentOrg, getAppRole } = useOrg();
  const { orgPath } = usePlatform();

  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const isAdmin = getAppRole('employee') === 'admin';

  useEffect(() => {
    if (!currentOrg?.slug || !employeeId) return;

    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    employeeApi
      .get(currentOrg.slug, employeeId)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.employee) {
          setEmployee(res.employee);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentOrg?.slug, employeeId]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-dark-400" />
      </div>
    );
  }

  // ── 404 state ────────────────────────────────────────────────────────────
  if (notFound || !employee) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate(orgPath('/employee/directory'))}
          className="flex items-center gap-1.5 text-dark-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          <span>Back to Directory</span>
        </button>
        <div className="flex flex-col items-center justify-center h-72 text-dark-400">
          <User size={48} className="mb-4 opacity-40" />
          <p className="text-lg">Employee not found</p>
        </div>
      </div>
    );
  }

  const emp = employee;
  const addr = emp.address || {};
  const emergency = emp.emergencyContact || {};
  const bank = emp.bankDetails || {};

  const addressLines = [addr.street, addr.street2, addr.city, addr.state, addr.zip, addr.country]
    .filter(Boolean)
    .join(', ');

  const hasBankData = bank.accountNumber || bank.ifsc || bank.pan || bank.bankName;

  const maskedAccount = bank.accountNumber
    ? `****${bank.accountNumber.slice(-4)}`
    : null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl">
      {/* Back button */}
      <button
        onClick={() => navigate(orgPath('/employee/directory'))}
        className="flex items-center gap-1.5 text-dark-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={18} />
        <span>Back to Directory</span>
      </button>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="card p-6 mb-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-bold text-orange-400">
              {getInitials(emp.fullName)}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">{emp.fullName}</h1>
                {emp.designation && (
                  <p className="text-dark-400 mt-0.5">{emp.designation}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {emp.departmentName && (
                    <Badge className="bg-dark-700 text-dark-300">
                      {emp.departmentName}
                    </Badge>
                  )}
                  {employmentTypeBadge(emp.employmentType)}
                  {statusBadge(emp.status)}
                </div>
              </div>

              {/* Edit button (admin only) */}
              {isAdmin && (
                <button
                  onClick={() => navigate(orgPath(`/employee/edit/${emp._id}`))}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-white text-sm transition-colors flex-shrink-0"
                >
                  <Edit2 size={14} />
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Info Sections (2-col grid) ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Work Information */}
        <SectionCard title="Work Information" icon={Building2}>
          <InfoRow label="Email" value={emp.email} />
          <InfoRow label="Phone" value={emp.phone} />
          <InfoRow label="Employee ID" value={emp.employeeId} />
          <InfoRow label="Department" value={emp.departmentName} />
          <InfoRow label="Manager" value={emp.managerName} />
          <InfoRow
            label="Monthly Gross"
            value={formatCurrency(emp.monthlyGrossSalary)}
          />
          <InfoRow
            label="Billable"
            value={
              emp.billable != null ? (
                <Badge
                  className={
                    emp.billable
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-dark-700 text-dark-400'
                  }
                >
                  {emp.billable ? 'Yes' : 'No'}
                </Badge>
              ) : null
            }
          />
          <InfoRow label="Joining Date" value={formatDate(emp.joiningDate)} />
          <InfoRow
            label="Salary Disbursement"
            value={
              emp.employmentType === 'confirmed' || emp.employmentType === 'intern'
                ? 'Last day of the month'
                : null
            }
          />
        </SectionCard>

        {/* Personal Information */}
        <SectionCard title="Personal Information" icon={User}>
          <InfoRow label="Private Email" value={emp.privateEmail} />
          <InfoRow label="Private Phone" value={emp.privatePhone} />
          <InfoRow label="Date of Birth" value={formatDate(emp.dateOfBirth)} />
          <InfoRow label="Nationality" value={emp.nationality} />
          <InfoRow label="Marital Status" value={emp.maritalStatus} />
        </SectionCard>

        {/* Address */}
        <SectionCard title="Address" icon={MapPin}>
          <InfoRow label="Full Address" value={addressLines || null} />
        </SectionCard>

        {/* Emergency Contact */}
        <SectionCard title="Emergency Contact" icon={Phone}>
          <InfoRow label="Name" value={emergency.name} />
          <InfoRow label="Phone" value={emergency.phone} />
          <InfoRow label="Relation" value={emergency.relation} />
        </SectionCard>

        {/* Bank Details (admin only, if data exists) */}
        {isAdmin && hasBankData && (
          <SectionCard title="Bank Details" icon={Shield}>
            <InfoRow label="Account Number" value={maskedAccount} />
            <InfoRow label="IFSC" value={bank.ifsc} />
            <InfoRow label="PAN" value={bank.pan} />
            <InfoRow label="Bank Name" value={bank.bankName} />
          </SectionCard>
        )}
      </div>

      {/* ── Project Assignments (full-width) ────────────────────────────── */}
      {Array.isArray(emp.assignments) && emp.assignments.length > 0 && (
        <div className="card p-5 mt-5">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={16} className="text-orange-400" />
            <h3 className="text-white font-semibold">Project Assignments</h3>
            <span className="ml-auto text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full font-medium">
              {emp.assignments.filter(a => a.status === 'active').length} active
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Client</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Project</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Candidate Rate</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Client Rate</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Start Date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">End Date</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-dark-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {emp.assignments.map((a, i) => {
                  const br = a.billingRate || {};
                  const cbr = typeof a.clientBillingRate === 'number'
                    ? { daily: a.clientBillingRate }
                    : (a.clientBillingRate || {});
                  const fmtRate = (r) => {
                    if (r.daily) return `${formatCurrency(r.daily)}/day`;
                    if (r.hourly) return `$${Number(r.hourly).toLocaleString()}/hr`;
                    if (r.monthly) return `${formatCurrency(r.monthly)}/mo`;
                    return '\u2014';
                  };
                  return (
                    <tr key={i} className="hover:bg-dark-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-sm text-white">{a.clientName || '\u2014'}</td>
                      <td className="px-3 py-2.5 text-sm text-white">{a.projectName || '\u2014'}</td>
                      <td className="px-3 py-2.5 text-sm text-white text-right">{fmtRate(br)}</td>
                      <td className="px-3 py-2.5 text-sm text-white text-right">{fmtRate(cbr)}</td>
                      <td className="px-3 py-2.5 text-sm text-dark-300">{formatDate(a.startDate)}</td>
                      <td className="px-3 py-2.5 text-sm text-dark-300">{formatDate(a.endDate) || '\u2014'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          a.status === 'active'
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-dark-700 text-dark-400'
                        }`}>
                          {a.status === 'active' ? 'Active' : 'Ended'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
