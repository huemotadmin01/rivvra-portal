import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { useCompany } from '../../context/CompanyContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import employeeApi from '../../utils/employeeApi';
import contactsApi from '../../utils/contactsApi';
import ComboSelect from '../../components/ComboSelect';
import { usePageTitle } from '../../hooks/usePageTitle';
import useCompanyScoped404 from '../../hooks/useCompanyScoped404';
import InlineField from '../../components/shared/InlineField';
import RecordMeta from '../../components/shared/RecordMeta';
import ActivityPanel from '../../components/shared/ActivityPanel';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import StageBadge from '../../components/ats/StageBadge';
import SuggestedCandidates from '../../components/ats/SuggestedCandidates';
import JobRequiredSkills from '../../components/ats/JobRequiredSkills';
import InterviewRoundsCard from '../../components/ats/InterviewRoundsCard';
import SectionCard from '../../components/platform/detail/SectionCard';
import { formatCurrency } from '../../utils/formatCurrency';
import { withFromContext } from '../../utils/entityDescribe';
import {
  Loader2, Star, ChevronDown, ChevronLeft,
  Briefcase, Users, FileText, Tag, Plus,
  MapPin, UserCheck, Trash2, Archive, ArchiveRestore, MoreHorizontal,
  CheckCircle2, Clock, XCircle, AlertTriangle,
  Globe, Copy, ExternalLink, Check, Share2,
} from 'lucide-react';
import api from '../../utils/api';
import DOMPurify from 'dompurify';

/* ── Job-status pill ─────────────────────────────────────────────────────
 * Q7-B: status uses blue/amber/red so it doesn't visually collide with the
 * approval indicator (green check / amber clock / red X icon-text).
 */
function StatusBadge({ status }) {
  const styles = {
    open:    'bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/20',
    on_hold: 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20',
    closed:  'bg-zinc-500/10 text-zinc-300 ring-1 ring-zinc-500/20',
  };
  const labels = { open: 'Open', on_hold: 'On Hold', closed: 'Closed' };
  const key = (status || '').toLowerCase().replace(/\s+/g, '_');
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[key] || 'bg-dark-700 text-dark-400'}`}>
      {labels[key] || status || 'Unknown'}
    </span>
  );
}

/* ── Approval indicator — icon + text, no full pill (Q7-B) ───────────── */
function ApprovalIndicator({ status }) {
  const key = (status || '').toLowerCase();
  if (!key) return null;
  const map = {
    approved: { Icon: CheckCircle2, color: 'text-emerald-400', label: 'Approved' },
    pending:  { Icon: Clock,        color: 'text-amber-400',   label: 'Pending'  },
    rejected: { Icon: XCircle,      color: 'text-red-400',     label: 'Rejected' },
  };
  const m = map[key];
  if (!m) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${m.color}`}>
      <m.Icon size={13} /> {m.label}
    </span>
  );
}

// StageBadge moved to ../../components/ats/StageBadge.jsx — shared
// component, same colour palette as the Applications list (audit P1 #12).

/* ── Evaluation Stars (read-only) ─────────────────────────────────────── */
function EvalStars({ value = 0, max = 3 }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={12}
          className={i < value ? 'text-amber-400 fill-amber-400' : 'text-dark-600'}
        />
      ))}
    </div>
  );
}

/* ── Change Status Dropdown ───────────────────────────────────────────── */
function ChangeStatusDropdown({ currentStatus, isOpen, onToggle, onSelect }) {
  const statuses = [
    { value: 'open', label: 'Open' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'closed', label: 'Closed' },
  ];
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all bg-dark-800 border-dark-700 text-dark-300 hover:border-dark-600 hover:text-dark-200"
      >
        Change Status
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute right-0 top-full mt-1.5 min-w-[150px] bg-dark-800 border border-dark-700 rounded-xl shadow-2xl py-1 z-20">
            {statuses.filter((s) => s.value !== currentStatus).map((s) => (
              <button
                key={s.value}
                onClick={() => onSelect(s.value)}
                className="w-full text-left px-3 py-2 text-sm text-dark-300 hover:bg-dark-700 hover:text-white transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── ApprovalSubmitBanner ───────────────────────────────────────────────
 * Pre-submit checklist UI for a draft or rejected job. Locked 2026-05-13:
 *   • shows the missing-required-fields list as clickable jump-links
 *   • shows the previous rejection comment when status === 'rejected'
 *   • the primary CTA is the same button relabelled per state — Submit /
 *     Resubmit — and stays disabled until the gate is clean
 *
 * The checklist labels come from the server's validateJobReadyForApproval
 * helper so there's one source of truth. FIELD_TO_CARD maps each label
 * back to the SectionCard id so the jump-link scroll lands the user
 * roughly on the right field. */
const FIELD_TO_CARD = {
  'Job Title':            'card-overview',
  'Department':           'card-overview',
  'Employment Type':      'card-overview',
  'Is Client Role':       'card-staffing',
  'Client Name':          'card-staffing',
  'Client Budget':        'card-staffing',
  'Candidate Max Budget': 'card-staffing',
  'Client Hiring Mode':   'card-staffing',
  'Work Location':        'card-staffing',
  'Required Experience':  'card-staffing',
  'Job Description':      'card-description',
  'Public-facing JD':     'card-description',
};
function ApprovalSubmitBanner({
  status, approverName, approverComment, missing, approverAssigned,
  scrollToCard, onSubmit, submitting,
}) {
  const isRejected = status === 'rejected';
  const blocked = missing.length > 0 || !approverAssigned;

  // Tone: amber for draft, red-tinted for rejected. Same layout otherwise.
  const tone = isRejected
    ? { border: 'border-red-500/30', bg: 'bg-red-500/5', accent: 'text-red-200', muted: 'text-red-100/70', chipBorder: 'border-red-500/30' }
    : { border: 'border-amber-500/30', bg: 'bg-amber-500/5', accent: 'text-amber-200', muted: 'text-amber-100/70', chipBorder: 'border-amber-500/30' };

  return (
    <div className={`rounded-lg border ${tone.border} ${tone.bg} px-4 py-3.5`}>
      <div className="flex items-start gap-3">
        {isRejected
          ? <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          : <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${tone.accent}`}>
            {isRejected ? 'Position rejected — needs rework' : 'Draft — not yet submitted for approval'}
          </div>

          {isRejected && approverComment && (
            <div className={`mt-1.5 text-[13px] ${tone.muted}`}>
              {approverName && <>Rejected by <span className={tone.accent}>{approverName}</span>: </>}
              <em>{approverComment}</em>
            </div>
          )}
          {isRejected && !approverComment && (
            <div className={`mt-1.5 text-[13px] ${tone.muted}`}>
              {approverName && <>Rejected by <span className={tone.accent}>{approverName}</span>. </>}
              No comment provided.
            </div>
          )}

          {blocked ? (
            <div className={`mt-2.5 text-[13px] ${tone.muted}`}>
              {missing.length > 0 && (
                <>
                  <span>Fill the required fields before {isRejected ? 'resubmitting' : 'submitting'}:</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {missing.map((field) => (
                      <button
                        key={field}
                        type="button"
                        onClick={() => scrollToCard(FIELD_TO_CARD[field])}
                        className={`px-2 py-1 text-[11px] rounded-md bg-dark-800/60 border ${tone.chipBorder} ${tone.accent} hover:bg-dark-800 transition-colors`}
                      >
                        {field}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {!approverAssigned && (
                <div className={`${missing.length > 0 ? 'mt-2' : ''}`}>
                  Assign an <strong>Approver</strong> in the People card to enable the {isRejected ? 'Resubmit' : 'Submit'} button.
                </div>
              )}
            </div>
          ) : (
            <div className={`mt-1.5 text-[13px] ${tone.muted}`}>
              {isRejected
                ? <>All required fields are filled. Click <strong>Resubmit for Approval</strong> to send <span className={tone.accent}>{approverName}</span> a fresh request.</>
                : <>All required fields are filled. Click <strong>Submit for Approval</strong> to send <span className={tone.accent}>{approverName}</span> a request.</>}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={blocked || submitting}
          title={blocked ? 'Fill the required fields and assign an approver first' : ''}
          className={`flex-shrink-0 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
            blocked || submitting
              ? 'bg-dark-800 text-dark-500 cursor-not-allowed border border-dark-700'
              : isRejected
                ? 'bg-amber-500 text-dark-950 hover:bg-amber-400'
                : 'bg-emerald-500 text-dark-950 hover:bg-emerald-400'
          }`}
        >
          {submitting && <Loader2 size={12} className="animate-spin" />}
          {isRejected ? 'Resubmit for Approval' : 'Submit for Approval'}
        </button>
      </div>
    </div>
  );
}

/* ── Description tabs (Q2-C: Internal | Public-facing) ───────────────── */
function DescriptionTabs({ internal, publicDesc, canEdit, onSave }) {
  const [tab, setTab] = useState('internal');
  return (
    <div>
      <div className="flex items-center gap-1 mb-3 border-b border-dark-700">
        {[
          { key: 'internal', label: 'Internal' },
          { key: 'public',   label: 'Public-facing' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'text-white border-rivvra-500'
                : 'text-dark-400 border-transparent hover:text-dark-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'internal' ? (
        <DescriptionBody
          field="description"
          value={internal}
          canEdit={canEdit}
          onSave={onSave}
          placeholder="Internal role description (recruiters only)"
        />
      ) : (
        <DescriptionBody
          field="websiteDescription"
          value={publicDesc}
          canEdit={canEdit}
          onSave={onSave}
          placeholder="Candidate-facing description for the public careers page"
        />
      )}
    </div>
  );
}

/* ── DescriptionBody — read-mode renders bullets/newlines properly,
 *   click-to-edit swaps in a textarea. The Odoo import dumps `•` bullets
 *   as inline characters; whitespace-pre-line + a regex split keeps them
 *   readable without paying for a full markdown parser.
 */
function DescriptionBody({ field, value, canEdit, onSave, placeholder }) {
  // Defensive: legacy Odoo imports (#1483 et al.) wrote literal "false" / "true"
  // into description fields. Treat those as empty so the UI doesn't render the
  // word "false". Root fix is in scripts/odoo-dry-run/helpers.js (smartStripHtml).
  const safeValue = (value === false || value === true || value === 'false' || value === 'true')
    ? ''
    : (value || '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(safeValue);
  const [saving, setSaving] = useState(false);

  // F-P2-12: only re-seed draft when not actively editing. Parent
  // re-renders (activity-panel polling, etc.) used to wipe the
  // in-progress edit because `safeValue` identity flipped on every
  // re-render.
  useEffect(() => { if (!editing) setDraft(safeValue); }, [safeValue, editing]);

  const handleSave = async () => {
    if ((draft || '') === safeValue) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(field, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={12}
          autoFocus
          placeholder={placeholder}
          className="w-full bg-dark-900 border border-dark-600 rounded px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none resize-y"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium bg-rivvra-500 text-dark-950 rounded-lg hover:bg-rivvra-400 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => { setDraft(safeValue); setEditing(false); }}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-dark-300 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!safeValue) {
    return (
      <div
        onClick={canEdit ? () => setEditing(true) : undefined}
        className={`text-sm text-dark-500 italic ${canEdit ? 'cursor-pointer hover:text-dark-300' : ''}`}
      >
        {canEdit ? `Click to add ${placeholder.toLowerCase()}` : '—'}
      </div>
    );
  }

  // Render: prettifyJd (server-side) wraps JD content in HTML tags (<p>,
  // <h3>, <ul>, <li>, <strong>) so the public careers page can format the
  // copy. Detect that shape and render it through DOMPurify so recruiters
  // see the formatted JD instead of raw markup. Legacy plain-text JDs
  // (no tags) fall through to the bullet/newline renderer below.
  const hasHtml = /<\/?(p|h[1-6]|ul|ol|li|strong|em|br|div|span)\b/i.test(safeValue);
  if (hasHtml) {
    const clean = DOMPurify.sanitize(safeValue, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'div', 'blockquote'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
    });
    return (
      <div
        onClick={canEdit ? () => setEditing(true) : undefined}
        className={`text-sm text-dark-200 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-white [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-white [&_h4]:mt-2 [&_h4]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:text-white [&_strong]:font-semibold [&_a]:text-rivvra-400 [&_a]:underline [&_a:hover]:text-rivvra-300 ${canEdit ? 'cursor-text hover:bg-dark-800/40 -mx-2 px-2 py-1 rounded' : ''}`}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  // Plain-text fallback: bullets + newlines preserved. Lines starting with
  // `•` get a hanging-indent so multi-line bullets wrap nicely.
  const lines = String(safeValue).split(/\r?\n|(?<=\.)\s+(?=•)/g);
  return (
    <div
      onClick={canEdit ? () => setEditing(true) : undefined}
      className={`text-sm text-dark-200 leading-relaxed space-y-1.5 ${canEdit ? 'cursor-text hover:bg-dark-800/40 -mx-2 px-2 py-1 rounded' : ''}`}
    >
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('•')) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-rivvra-400 flex-shrink-0">•</span>
              <span className="flex-1">{trimmed.slice(1).trim()}</span>
            </div>
          );
        }
        return <p key={i} className="whitespace-pre-line">{trimmed}</p>;
      })}
    </div>
  );
}

/* ── Hiring-mode tooltip helper (Q11-B: keep abbrev, tooltip with full form) */
const HIRING_MODE_FULL = {
  'C2C':                  'Contract-to-Contract',
  'C2H':                  'Contract-to-Hire',
  'Full-time Hire':       'Full-time Hire',
  'C2C or Full-time Hire':'Contract-to-Contract or Full-time Hire',
};

const EXPERIENCE_OPTIONS = ['0-2 Years', '2-5 Years', '5-8 Years', '8-11 Years', '11-14 Years', '14+ Years']
  .map((v) => ({ value: v, label: v }));

const HIRING_MODE_OPTIONS = ['C2C', 'C2H', 'Full-time Hire', 'C2C or Full-time Hire']
  .map((v) => ({ value: v, label: v }));

const APPROVAL_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/* ── Main component ──────────────────────────────────────────────────── */
export default function AtsJobDetail() {
  const { jobId } = useParams();
  const { currentOrg, getAppRole, isOrgAdmin } = useOrg();
  const { currentCompany } = useCompany();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const handleScoped404 = useCompanyScoped404('job position');
  const navigate = useNavigate();

  // 2026-07-18 audit D14: never hardcode an INR fallback — a US/CA company
  // with no currency set was rendering ₹. Fall back company → org currency;
  // when neither exists fmtBudget degrades to a plain formatted number.
  const companyCurrency = currentCompany?.currency || currentOrg?.currency || null;

  const [job, setJob] = useState(null);
  // Server-computed list of required-field labels still missing on the
  // job. Drives the pre-submit checklist banner. Refreshes on every
  // job fetch and after every inline-field save.
  const [missingApprovalFields, setMissingApprovalFields] = useState([]);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  // Bumped after any save that the server may turn into an audit /
  // email_sent activity row (people reassignments, approval decisions
  // etc.). Forces ActivityPanel to refetch so the new row shows up
  // without a manual page reload.
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  // Picklist sources fetched on mount. Both are platform-shared lists:
  //   • departments — canonical from /employee/departments (Q2 locked
  //     2026-05-13). Single source across Employee + ATS + CRM.
  //   • employmentTypes — per-org picklist from /ats/config/employment-types
  //     (Q1 locked 2026-05-13). Replaces the previously-hardcoded list
  //     and lets each org curate values.
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [employmentTypeOptions, setEmploymentTypeOptions] = useState([]);
  usePageTitle(job?.name);
  const [loading, setLoading] = useState(true);

  const [companyContacts, setCompanyContacts] = useState([]);
  const [editingClient, setEditingClient] = useState(false);

  // Applications for this job
  const [applications, setApplications] = useState([]);
  const [appsTotal, setAppsTotal] = useState(0);
  const [appsPage, setAppsPage] = useState(1);
  const [appsTotalPages, setAppsTotalPages] = useState(1);
  const [appsLoading, setAppsLoading] = useState(false);
  // Bumped to force the Suggested Candidates card to re-fetch (e.g. after
  // editing required skills).
  const [suggestRefresh, setSuggestRefresh] = useState(0);

  // UI / modal state
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivePreview, setArchivePreview] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [showKebab, setShowKebab] = useState(false);

  // Q14-D: optional Approval comment expansion in Meta card
  const [showApprovalComment, setShowApprovalComment] = useState(false);

  // Current user's employee _id — used to detect whether the caller is the
  // job's assigned approver. People fields (approverId, recruiterId, …)
  // store employee._id, never portal_user._id (see semantic locked
  // 2026-05-08), so we resolve via /employees/me before comparing.
  const [myEmployeeId, setMyEmployeeId] = useState(null);

  // Approval-decision panel state (local — only the assigned approver or
  // an org admin can submit it).
  const [approvalDraftComment, setApprovalDraftComment] = useState('');
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  // Careers publish state. orgCareersEnabled is fetched once via
  // /settings/careers so the publish toggle on this job knows whether the
  // org-level kill switch is on. Disabled-at-org is rendered as a hint
  // pointing the admin to Settings → General → Careers Site.
  const [orgCareersEnabled, setOrgCareersEnabled] = useState(false);
  const [orgCareersUrl, setOrgCareersUrl] = useState('');
  const [publishingCareers, setPublishingCareers] = useState(false);
  const [careersUrlCopied, setCareersUrlCopied] = useState(false);
  const [refLinkCopied, setRefLinkCopied] = useState(false);

  const isAdmin = getAppRole('ats') === 'admin';
  // 2026-05-18 RBAC two-tier: anyone with ATS access is a "recruiter" and
  // can do daily work (create candidates + applications, run interviews,
  // upload attachments, etc.). Only admins manage Job Positions / config /
  // offer compensation. See ats.js middleware (atsAdmin vs atsAccess).
  const canRecruit = !!getAppRole('ats');
  const orgSlug = currentOrg?.slug;
  // 2026-05-18: writer gate widened to include the job's Account Owner so a
  // salesperson can fill out and submit their own Draft. Server mirrors this
  // in ensureJobWriter (ats.js); change both together.
  const isAccountOwner = !!(myEmployeeId && job?.accountOwnerId && String(job.accountOwnerId) === String(myEmployeeId));
  const canEdit = (isAdmin || isAccountOwner) && !job?.archived;
  const isAssignedApprover = !!(myEmployeeId && job?.approverId && String(job.approverId) === String(myEmployeeId));
  // Mirrors the server rule (PUT /jobs/:id): no approval writes are
  // possible until an approver is assigned, even for org admin.
  const canDecideApproval = !!job?.approverId && (isOrgAdmin || isAssignedApprover) && !job?.archived;

  // EmployeeLookup hits /contacts/salespersons internally — no need for
  // a page-level recruiters fetch anymore. Removed.

  // ── Fetch company contacts for client lookup ─────────────────────────
  useEffect(() => {
    if (!orgSlug) return;
    contactsApi.listCompanies(orgSlug)
      .then((res) => { if (res.success) setCompanyContacts(res.companies || []); })
      .catch(() => {});
  }, [orgSlug]);

  // Org-level careers flag (drives whether the per-job publish toggle is
  // actionable). Cheap read; cached for the lifetime of this page view.
  useEffect(() => {
    if (!orgSlug) return;
    api.getCareersSettings(orgSlug)
      .then((res) => {
        if (res?.success) {
          setOrgCareersEnabled(!!res.careers?.enabled);
          setOrgCareersUrl(res.careers?.publicUrl || '');
        }
      })
      .catch(() => {});
  }, [orgSlug]);

  const jobPublicUrl = (job?.publicSlug && orgCareersUrl)
    ? `${orgCareersUrl}/jobs/${job.publicSlug}`
    : '';

  const handlePublishCareers = async () => {
    if (!orgSlug || !jobId) return;
    setPublishingCareers(true);
    try {
      const res = await atsApi.publishJob(orgSlug, jobId);
      if (res.success) {
        setJob((prev) => ({
          ...prev,
          publishToCareers: true,
          publicSlug: res.publicSlug || prev?.publicSlug,
          publishedAt: prev?.publishedAt || new Date().toISOString(),
        }));
        showToast('Job published to careers site', 'success');
      } else {
        showToast(res.error || 'Failed to publish', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to publish', 'error');
    } finally {
      setPublishingCareers(false);
    }
  };

  const handleUnpublishCareers = async () => {
    if (!orgSlug || !jobId) return;
    setPublishingCareers(true);
    try {
      const res = await atsApi.unpublishJob(orgSlug, jobId);
      if (res.success) {
        setJob((prev) => ({ ...prev, publishToCareers: false, unpublishedAt: new Date().toISOString() }));
        showToast('Job removed from careers site', 'success');
      } else {
        showToast(res.error || 'Failed to unpublish', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to unpublish', 'error');
    } finally {
      setPublishingCareers(false);
    }
  };

  const handleToggleAutoPublish = async (nextVal) => {
    if (!orgSlug || !jobId) return;
    setJob((prev) => (prev ? { ...prev, autoPublishOnApproval: nextVal } : prev));
    try {
      await atsApi.updateJob(orgSlug, jobId, { autoPublishOnApproval: nextVal });
    } catch (err) {
      setJob((prev) => (prev ? { ...prev, autoPublishOnApproval: !nextVal } : prev));
      showToast(err.message || 'Failed to update auto-publish preference', 'error');
    }
  };

  const handleCopyJobPublicUrl = async () => {
    if (!jobPublicUrl) return;
    try {
      await navigator.clipboard.writeText(jobPublicUrl);
      setCareersUrlCopied(true);
      setTimeout(() => setCareersUrlCopied(false), 1500);
    } catch {}
  };

  // Apply a PUT /jobs/:id response the same way saveField does: prefer the
  // server's canonical job, refresh missingApprovalFields, and surface the
  // auto-reapproval toast + activity refresh. clientName is a reapproval
  // trigger, so changing/clearing the client on an approved job can flip it
  // to pending — without this the UI kept showing "approved" with stale
  // missing-field state until a manual reload.
  const applyJobUpdateResult = (res, fallbackPatch) => {
    if (res?.job) setJob(res.job);
    else setJob((prev) => ({ ...prev, ...fallbackPatch }));
    if (Array.isArray(res?.missingApprovalFields)) {
      setMissingApprovalFields(res.missingApprovalFields);
    }
    if (res?.triggeredReapproval) {
      showToast('Approval reset — change requires re-approval', 'info');
      setActivityRefreshKey(k => k + 1);
      setTimeout(() => setActivityRefreshKey(k => k + 1), 2000);
    }
  };

  // Save client picker selection — writes both clientContactId + clientName
  // so the page label stays in sync with the linked contact.
  const handleClientSelect = async (id, name) => {
    setEditingClient(false);
    if (!id && !name) return;
    try {
      const res = await atsApi.updateJob(orgSlug, jobId, { clientContactId: id || null, clientName: name || '' });
      applyJobUpdateResult(res, { clientContactId: id || null, clientName: name || '' });
    } catch (err) {
      showToast(err.message || 'Failed to update client', 'error');
    }
  };

  // 2026-07-18 audit D13: explicit clear path. handleClientSelect's blank
  // guard (needed so closing the picker without choosing doesn't wipe the
  // field) meant the client could never be REMOVED once set — this handler
  // is wired to a dedicated clear (X) button next to the client name.
  const handleClientClear = async () => {
    setEditingClient(false);
    try {
      const res = await atsApi.updateJob(orgSlug, jobId, { clientContactId: null, clientName: '' });
      applyJobUpdateResult(res, { clientContactId: null, clientName: '' });
    } catch (err) {
      showToast(err.message || 'Failed to clear client', 'error');
    }
  };

  // ── Fetch job ─────────────────────────────────────────────────────────
  const fetchJob = useCallback(async () => {
    if (!orgSlug || !jobId) return;
    setLoading(true);
    try {
      const res = await atsApi.getJob(orgSlug, jobId);
      if (res.success) {
        setJob(res.job);
        setMissingApprovalFields(Array.isArray(res.missingApprovalFields) ? res.missingApprovalFields : []);
      }
    } catch (err) {
      if (handleScoped404(err)) return;
      console.error('Failed to load job:', err);
      showToast('Failed to load job position', 'error');
    } finally {
      setLoading(false);
    }
  }, [orgSlug, jobId, showToast, handleScoped404]);

  // ── Fetch applications for this job ──────────────────────────────────
  const fetchApplications = useCallback(async () => {
    if (!orgSlug || !jobId) return;
    setAppsLoading(true);
    try {
      const res = await atsApi.listApplications(orgSlug, {
        jobId,
        page: appsPage,
        limit: 15,
        sort: 'appliedOn',
        dir: 'desc',
      });
      if (res.success) {
        setApplications(res.applications || []);
        setAppsTotal(res.total || 0);
        setAppsTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load applications:', err);
    } finally {
      setAppsLoading(false);
    }
  }, [orgSlug, jobId, appsPage]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  // Load Department + Employment Type picklists once per orgSlug. Both
  // are scoped to the current org/company via the existing endpoints.
  useEffect(() => {
    if (!orgSlug) return;
    employeeApi.listDepartments(orgSlug)
      .then(res => {
        if (res?.success && Array.isArray(res.departments)) {
          const opts = res.departments
            .filter(d => d.isActive !== false)
            .map(d => ({ value: d.name, label: d.name }));
          setDepartmentOptions(opts);
        }
      })
      .catch(() => {});
    atsApi.listConfig(orgSlug, 'employment-types')
      .then(res => {
        if (res?.success) {
          const items = res.items || res.employmentTypes || [];
          setEmploymentTypeOptions(items.map(i => ({ value: i.name || i.value, label: i.name || i.label })));
        }
      })
      .catch(() => {});
  }, [orgSlug]);
  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  // 2026-07-18 audit D4: reset applications pagination when navigating to a
  // different job — the old page index used to survive the jobId change and
  // could land past the new job's last page (blank table).
  useEffect(() => { setAppsPage(1); }, [jobId]);

  // 2026-07-18 audit D12: Escape dismisses the Archive/Delete confirmation
  // modals (backdrop click added on the overlays below). Blocked while the
  // action is in flight so a stray keypress can't hide an active operation.
  useEffect(() => {
    if (!showArchiveModal && !showDeleteModal) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (!archiving) setShowArchiveModal(false);
      if (!deleting) setShowDeleteModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showArchiveModal, showDeleteModal, archiving, deleting]);

  // Resolve current user → employee _id once per org. Same pattern as
  // EmployeeDetail.jsx:367. Used to gate the Approval Decision panel.
  useEffect(() => {
    if (!orgSlug) return;
    employeeApi.getMyProfile(orgSlug)
      .then((res) => { if (res?.success && res.employee) setMyEmployeeId(res.employee._id); })
      .catch(() => {});
  }, [orgSlug]);

  // Hydrate the approval-comment draft from the saved job whenever it
  // refreshes — lets the assigned approver edit the existing comment
  // inline instead of starting from blank every render.
  useEffect(() => {
    if (job?.approverComment != null) setApprovalDraftComment(job.approverComment || '');
  }, [job?.approverComment]);

  // Submit an approve/reject decision. Goes through the same PUT /jobs/:id
  // the inline fields use, but with both fields set atomically so the
  // server-side activity log gets a clean (status, comment) pair.
  const submitApprovalDecision = async (decision) => {
    if (!canDecideApproval || approvalSubmitting) return;
    if (decision === 'rejected' && !approvalDraftComment.trim()) {
      showToast('Please add a comment explaining why this position is rejected.', 'error');
      return;
    }
    setApprovalSubmitting(true);
    try {
      const res = await atsApi.updateJob(orgSlug, jobId, {
        approvalStatus: decision,
        approverComment: approvalDraftComment || null,
      });
      if (res?.job) setJob(res.job);
      else setJob((prev) => ({ ...prev, approvalStatus: decision, approverComment: approvalDraftComment || null }));
      // Decision triggers ats_job_approved / ats_job_rejected emails
      // server-side via fire-and-forget. Surface the resulting audit +
      // email_sent rows without a manual reload, same pattern as
      // savePerson.
      setActivityRefreshKey(k => k + 1);
      setTimeout(() => setActivityRefreshKey(k => k + 1), 2000);
      showToast(decision === 'approved' ? 'Position approved' : 'Position rejected', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to submit decision', 'error');
    } finally {
      setApprovalSubmitting(false);
    }
  };

  // ── Generic inline-field save handler ─────────────────────────────────
  const saveField = async (field, value) => {
    let coerced = value;
    if (field === 'expectedHires') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 1) throw new Error('Must be at least 1');
      coerced = n;
    } else if (field === 'clientBudget' || field === 'maxBudget') {
      if (value === '' || value == null) {
        coerced = null;
      } else {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) throw new Error('Must be a positive number');
        coerced = n;
      }
    }
    const res = await atsApi.updateJob(orgSlug, jobId, { [field]: coerced });
    if (res?.job) setJob(res.job);
    else setJob((prev) => ({ ...prev, [field]: coerced }));
    if (Array.isArray(res?.missingApprovalFields)) {
      setMissingApprovalFields(res.missingApprovalFields);
    }
    // The whitelisted-edit auto-reapproval (clientBudget / employmentType /
    // isClientRole / clientName on an approved job) records a system event
    // and may fire the request email. Refresh the activity panel to surface
    // both without a manual reload.
    if (res?.triggeredReapproval) {
      showToast('Approval reset — change requires re-approval', 'info');
      setActivityRefreshKey(k => k + 1);
      setTimeout(() => setActivityRefreshKey(k => k + 1), 2000);
    }
  };

  // Work Location save — writes BOTH clientJobLocation (the internal field
  // this editor owns) and location (what the public careers site reads). The
  // careers page only picks up `location`, set at creation, so editing just
  // clientJobLocation never reached the public listing. Mirror both.
  const saveWorkLocation = async (_field, value) => {
    const res = await atsApi.updateJob(orgSlug, jobId, {
      clientJobLocation: value,
      location: value,
    });
    applyJobUpdateResult(res, { clientJobLocation: value, location: value });
  };

  // Persist the job's structured required skills (drives the Suggested
  // Candidates matcher) and re-fetch suggestions so the new ranking shows.
  const saveRequiredSkills = async (next) => {
    const res = await atsApi.updateJob(orgSlug, jobId, { requiredSkills: next });
    if (res?.job) setJob(res.job);
    else setJob((prev) => ({ ...prev, requiredSkills: next }));
    setSuggestRefresh((k) => k + 1);
  };

  // savePerson — atomic update of an id + denormalized name pair (e.g.
  // recruiterId + recruiterName). Saving the name alongside the id keeps
  // list views reading the row without an extra lookup; saving them in
  // the same PUT means a refresh never shows id-without-name flicker.
  // Jump from a checklist chip to the SectionCard containing the missing
  // field. Card-level scroll is good-enough for v1 — drilling down to
  // the specific field within each card can come later if recruiters
  // ask for it. Briefly highlights the card so the user knows where to
  // look.
  const scrollToCard = (cardId) => {
    if (!cardId) return;
    const el = document.getElementById(cardId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-amber-400/40', 'transition-all');
    setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400/40'), 1600);
  };

  // Submit / Resubmit for Approval — explicit state transition.
  // Server enforces the 8-field gate + approver-assigned precondition;
  // on 400 we surface what's missing so the salesperson can fix it.
  const handleSubmitForApproval = async () => {
    if (submittingApproval) return;
    setSubmittingApproval(true);
    try {
      const res = await atsApi.submitJobForApproval(orgSlug, jobId);
      if (res?.success) {
        const wasRejected = job?.approvalStatus === 'rejected';
        if (res.job) setJob(res.job);
        setMissingApprovalFields([]);
        setActivityRefreshKey(k => k + 1);
        setTimeout(() => setActivityRefreshKey(k => k + 1), 2000);
        showToast(wasRejected ? 'Resubmitted for approval' : 'Submitted for approval', 'success');
      } else {
        // Server returns { missing: [...] } on the 400 path — sync it
        // so the banner reflects the latest server view instead of
        // whatever was cached from the previous GET.
        if (Array.isArray(res?.missing)) setMissingApprovalFields(res.missing);
        showToast(res?.error || 'Failed to submit for approval', 'error');
      }
    } catch (err) {
      const payload = err?.payload || err?.body;
      if (payload && Array.isArray(payload.missing)) setMissingApprovalFields(payload.missing);
      showToast(payload?.error || err?.message || 'Failed to submit for approval', 'error');
    } finally {
      setSubmittingApproval(false);
    }
  };

  const savePerson = async (idField, nameField, id, name) => {
    try {
      const res = await atsApi.updateJob(orgSlug, jobId, {
        [idField]: id || null,
        [nameField]: name || '',
      });
      if (res?.job) setJob(res.job);
      else setJob((prev) => ({ ...prev, [idField]: id || null, [nameField]: name || '' }));
      if (Array.isArray(res?.missingApprovalFields)) {
        setMissingApprovalFields(res.missingApprovalFields);
      }
      // Refresh the activity panel twice — once immediately to catch
      // the synchronous audit row (e.g. "Approver assigned"), again
      // after ~2s to catch the fire-and-forget email_sent row that the
      // server emits when assigning a new approver on a status=pending
      // job (Resend round-trip takes ~1-2s; the immediate bump misses
      // it without this second pass).
      setActivityRefreshKey(k => k + 1);
      setTimeout(() => setActivityRefreshKey(k => k + 1), 2000);
    } catch (err) {
      showToast(err.message || `Failed to update ${nameField.replace('Name', '')}`, 'error');
    }
  };

  // ── Status / archive / delete handlers ────────────────────────────────
  const handleChangeStatus = async (status) => {
    setShowStatusDropdown(false);
    try {
      await atsApi.changeJobStatus(orgSlug, jobId, status);
      showToast('Status updated');
      fetchJob();
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  };

  const openArchiveModal = async () => {
    setShowKebab(false);
    setShowArchiveModal(true);
    setArchivePreview(null);
    try {
      const res = await atsApi.archiveJobPreview(orgSlug, jobId);
      setArchivePreview(res || { dependencies: [] });
    } catch {
      setArchivePreview({ dependencies: [] });
    }
  };

  const handleArchiveJob = async (cascade = false) => {
    setArchiving(true);
    try {
      const res = await atsApi.archiveJob(orgSlug, jobId, { cascade });
      setShowArchiveModal(false);
      setJob((j) => ({ ...j, archived: true }));
      const cascadedCount = res?.cascadedAppCount || 0;
      showToast(
        cascade && cascadedCount > 0
          ? `Archived (with ${cascadedCount} application${cascadedCount === 1 ? '' : 's'})`
          : 'Archived',
        'success'
      );
    } catch (err) {
      showToast(err.message || 'Failed to archive job position', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchiveJob = async () => {
    try {
      await atsApi.unarchiveJob(orgSlug, jobId);
      setJob((j) => ({ ...j, archived: false }));
      showToast('Unarchived', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to unarchive job position', 'error');
    }
  };

  const handleDeleteJob = async () => {
    setDeleting(true);
    try {
      await atsApi.deleteJob(orgSlug, jobId);
      showToast('Job position deleted', 'success');
      navigate(orgPath('/ats/jobs'));
    } catch (err) {
      setDeleting(false);
      showToast(err.message || 'Failed to delete job position', 'error');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex flex-col items-center justify-center py-20">
          <h3 className="text-lg font-semibold text-white mb-2">Job position not found</h3>
          <p className="text-dark-400 text-sm">The position may have been deleted or you don't have access.</p>
        </div>
      </div>
    );
  }

  const statusKey = (job.status || '').toLowerCase().replace(/\s+/g, '_');
  // 2026-05-10: New Application creation is only allowed while a job is
  // actively recruiting. `closed` and `archived` jobs are terminal — no
  // new pipeline entries. `on_hold` still allows queuing candidates so
  // recruiters are ready when the role reopens.
  // 2026-05-13: approval gate. A pending or rejected position is locked
  // for sourcing — the API will reject POST /applications with 403
  // JOB_NOT_APPROVED, so we hide the CTA at the UI layer for clarity.
  const isApproved = job.approvalStatus === 'approved';
  // 2026-05-18: recruiters (not just admins) can create applications.
  // API allows POST /applications for any ATS access role.
  const canCreateApplication = canRecruit && !job.archived && isApproved && (statusKey === 'open' || statusKey === 'on_hold');
  const fmtBudget = (v) => (v == null || v === ''
    ? null
    : (companyCurrency ? formatCurrency(v, companyCurrency) : Number(v).toLocaleString()));
  const hiringModeFull = HIRING_MODE_FULL[job.hiringMode] || job.hiringMode;
  // Odoo imports arrive as "7-8" / "5+" without a unit suffix; the
  // dropdown options carry "Years" baked in. Normalize the display so a
  // user reading "7-8" doesn't have to guess whether that's years or
  // months. Idempotent — won't double-suffix values that already include
  // years/yr/months.
  const requiredExpDisplay = job.requiredExperience
    ? (/years?|yrs?|months?|mos?\b/i.test(job.requiredExperience)
        ? job.requiredExperience
        : `${job.requiredExperience} Years`)
    : null;

  // Q9-A: row click handler — guard against link-cell propagation.
  const openApp = (appId) => navigate(withFromContext(orgPath(`/ats/applications/${appId}`), 'ats_job', jobId));

  return (
    <div className="p-6 md:p-8 space-y-6">
      <button
        onClick={() => navigate(orgPath('/ats/jobs'))}
        className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors"
      >
        <ChevronLeft size={16} />
        Back to Job Positions
      </button>
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-white truncate" title={job.name}>{job.name}</h1>
            {job.archived && (
              <span className="text-xs bg-dark-700 text-dark-300 rounded-full px-2 py-0.5 border border-dark-600 flex items-center gap-1">
                <Archive size={11} /> ARCHIVED
              </span>
            )}
            <StatusBadge status={job.status} />
            {/* Suppress the approval indicator until an approver is
                assigned — the page-top banner explains what's needed. */}
            {job.approverId && <ApprovalIndicator status={job.approvalStatus} />}
          </div>
          {/* Q6-B: department dropped from header subtitle (kept linkified in
              Overview below). Header stays clean. */}
        </div>

        {/* 2026-05-18 RBAC: header action bar — render the container for
            any recruiter when at least one button qualifies. New Application
            is recruiter-allowed; Change Status, Archive, Delete stay
            admin-only and are gated individually inside. */}
        {(canCreateApplication || isAdmin || isAccountOwner) && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Q13-D: + New Application + Change Status as primary actions */}
            {canCreateApplication && (
              <button
                onClick={() => navigate(orgPath(`/ats/jobs/${jobId}/applications/new`))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-rivvra-500 text-dark-950 hover:bg-rivvra-400 transition-colors"
              >
                <Plus size={14} /> New Application
              </button>
            )}
            {(isAdmin || isAccountOwner) && !job.archived && (
              <ChangeStatusDropdown
                currentStatus={statusKey}
                isOpen={showStatusDropdown}
                onToggle={() => setShowStatusDropdown((p) => !p)}
                onSelect={handleChangeStatus}
              />
            )}
            {/* Overflow — Archive lives here (Q13-D). Admin-only since
                archive/unarchive/delete are all admin actions. */}
            {isAdmin && (
            <div className="relative">
              <button
                onClick={() => setShowKebab((o) => !o)}
                className="p-1.5 text-dark-500 hover:text-dark-300 rounded-lg hover:bg-dark-800"
                aria-label="More actions"
              >
                <MoreHorizontal size={16} />
              </button>
              {showKebab && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowKebab(false)} />
                  <div className="absolute right-0 top-full mt-1 w-56 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 py-1">
                    {!job.archived ? (
                      <button
                        onClick={() => { setShowKebab(false); openArchiveModal(); }}
                        className="w-full text-left px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10 flex items-center gap-2"
                      >
                        <Archive size={12} /> Archive
                      </button>
                    ) : (
                      <button
                        onClick={() => { setShowKebab(false); handleUnarchiveJob(); }}
                        className="w-full text-left px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10 flex items-center gap-2"
                      >
                        <ArchiveRestore size={12} /> Unarchive
                      </button>
                    )}
                    {isOrgAdmin && (
                      <button
                        onClick={() => { setShowKebab(false); setShowDeleteModal(true); }}
                        className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                      >
                        <Trash2 size={12} />
                        <div className="flex-1">
                          <div className="font-medium">Delete permanently</div>
                          <div className="text-[10px] text-dark-500 mt-0.5">Cannot be recovered. Use Archive instead.</div>
                        </div>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Careers publish panel ───────────────────────────────────────
          Admin-only. Surfaces:
            • current publish state + toggle (only when job is Open+Approved)
            • shareable public URL when published
            • a warning chip when Public-facing JD is empty (will fall back
              to Internal description on the public page).
          Hidden entirely when the org has not enabled Careers AND the job
          is not already published — to keep the page lean for tenants
          that aren't using this feature yet. */}
      {isAdmin && !job.archived && (orgCareersEnabled || job.publishToCareers) && (
        <div className={`rounded-lg border px-4 py-3 ${
          job.publishToCareers
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-dark-700 bg-dark-800/40'
        }`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                job.publishToCareers ? 'bg-emerald-500/15 text-emerald-300' : 'bg-dark-700 text-dark-300'
              }`}>
                <Globe size={15} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-white">Public Careers Page</p>
                  {job.publishToCareers ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-300">
                      Live
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-dark-700 text-dark-400">
                      Not published
                    </span>
                  )}
                  {!(job.websiteDescription || '').trim() && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      <AlertTriangle size={10} /> Public-facing JD empty — using Internal
                    </span>
                  )}
                </div>
                {job.publishToCareers && jobPublicUrl ? (
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-dark-300 truncate max-w-md">{jobPublicUrl}</span>
                    <button
                      onClick={handleCopyJobPublicUrl}
                      className="inline-flex items-center gap-1 text-[11px] text-dark-400 hover:text-white transition-colors"
                    >
                      {careersUrlCopied ? <><Check size={11} className="text-emerald-400" /> Copied</> : <><Copy size={11} /> Copy</>}
                    </button>
                    <a
                      href={jobPublicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-dark-400 hover:text-white transition-colors"
                    >
                      <ExternalLink size={11} /> Open
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-dark-500 mt-0.5">
                    {orgCareersEnabled
                      ? (job.status === 'open' && job.approvalStatus === 'approved'
                          ? 'Publish to expose this job at rivvra.com/careers and accept applications via the public form.'
                          : 'Job must be Open and Approved to publish.')
                      : <>Enable Careers in <span className="text-dark-300">Settings → General</span> first.</>}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {job.publishToCareers ? (
                <button
                  onClick={handleUnpublishCareers}
                  disabled={publishingCareers}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-dark-800 border border-dark-700 text-dark-300 hover:text-white hover:border-dark-600 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  {publishingCareers && <Loader2 size={12} className="animate-spin" />}
                  Unpublish
                </button>
              ) : (
                <button
                  onClick={handlePublishCareers}
                  disabled={
                    publishingCareers
                    || !orgCareersEnabled
                    || job.status !== 'open'
                    || job.approvalStatus !== 'approved'
                  }
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rivvra-500 text-dark-950 hover:bg-rivvra-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {publishingCareers && <Loader2 size={12} className="animate-spin" />}
                  Publish to Careers
                </button>
              )}
            </div>
          </div>

          {/* Auto-publish toggle. Default ON. Off for confidential / NDA roles
              where the org doesn't want a public listing even after approval.
              Server reads this on the approval transition (PUT /jobs/:id);
              already-published jobs aren't affected by toggling. */}
          {orgCareersEnabled && (
            <div className="mt-3 pt-3 border-t border-dark-700/60 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-dark-200">Auto-publish when approved</p>
                <p className="text-[11px] text-dark-500 mt-0.5">
                  When the assigned approver approves this job, it goes live on the careers site automatically. Turn off for confidential roles.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={job.autoPublishOnApproval !== false}
                onClick={() => handleToggleAutoPublish(job.autoPublishOnApproval === false)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                  job.autoPublishOnApproval !== false ? 'bg-emerald-500' : 'bg-dark-700'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  job.autoPublishOnApproval !== false ? 'translate-x-5' : 'translate-x-1'
                }`} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Personal Referral Link ────────────────────────────────────
          Visible to anyone with ATS access (recruiters, account owners,
          admins) once the job is published to careers AND we know their
          employeeId. Appending ?ref=<empId> to the public URL routes
          applications through this recruiter — careers.js validates the
          ref and uses it as application.recruiterId in place of the org
          default. Resolves the gap where Niharika shared a public link
          but didn't get credit on resulting applications. */}
      {canRecruit && myEmployeeId && job.publishToCareers && jobPublicUrl && (() => {
        const myRefLink = `${jobPublicUrl}?ref=${myEmployeeId}`;
        return (
          <div className="rounded-lg border border-dark-700 bg-dark-800/40 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-rivvra-500/15 text-rivvra-300">
                  <Share2 size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">Your Referral Link</p>
                  <p className="text-xs text-dark-500 mt-0.5">
                    Share this instead of the plain public URL. Candidates who apply through this link get credited to you as recruiter.
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-dark-300 truncate max-w-md">{myRefLink}</span>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(myRefLink);
                          setRefLinkCopied(true);
                          setTimeout(() => setRefLinkCopied(false), 1800);
                        } catch (_) { /* ignore — browser may block in non-secure context */ }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-dark-400 hover:text-white transition-colors"
                    >
                      {refLinkCopied ? <><Check size={11} className="text-emerald-400" /> Copied</> : <><Copy size={11} /> Copy</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Approval-state banner ───────────────────────────────────────
          Surfaces *why* New Application is missing/disabled and what the
          salesperson needs to do next. Locked 2026-05-13:
            • status null/undefined → Draft banner with checklist + Submit
            • status 'pending'      → Awaiting-approver banner (read-only)
            • status 'rejected'     → Rejection banner with comment +
                                       checklist (if still missing) +
                                       Resubmit button
            • status 'approved'     → no banner (or it dismisses itself)
          The checklist + Submit pattern is unified across draft and
          rejected so the rework loop uses the same UI. */}
      {!job.archived && (!job.approvalStatus || job.approvalStatus === 'rejected') && (
        <ApprovalSubmitBanner
          status={job.approvalStatus}
          approverName={job.approverName}
          approverComment={job.approverComment}
          missing={missingApprovalFields}
          approverAssigned={!!job.approverId}
          scrollToCard={scrollToCard}
          onSubmit={handleSubmitForApproval}
          submitting={submittingApproval}
        />
      )}
      {!job.archived && job.approvalStatus === 'pending' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
          <Clock size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-100/90">
            <div className="font-medium text-amber-200">Pending approval</div>
            <div className="text-amber-100/70 mt-0.5">
              {job.approverName
                ? <>Awaiting <span className="text-amber-200">{job.approverName}</span>'s decision. Applications are blocked until approved.</>
                : <>Awaiting decision. Applications are blocked until approved.</>}
            </div>
          </div>
        </div>
      )}

      {/* ─── Body: 2-col grid (left = main flow, right = sidebar) ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main flow */}
        <div className="lg:col-span-2 space-y-5">
          {/* Top sub-grid: Overview + Staffing & Compensation side-by-side
              on md+ so the two short cards fill the row. Stacks below md. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <SectionCard id="card-overview" title="Overview" icon={Briefcase}>
            <InlineField label="Position Name" field="name" value={job.name} editable={canEdit} onSave={saveField} required />
            <InlineField
              label="Department"
              field="department"
              value={job.department}
              type="select"
              options={departmentOptions}
              editable={canEdit}
              onSave={saveField}
              placeholder={departmentOptions.length ? 'Pick department' : 'No departments — add one in Employee → Departments'}
              displayValue={
                job.department ? (
                  <Link
                    to={orgPath(`/ats/jobs?department=${encodeURIComponent(job.department)}`)}
                    onClick={(e) => e.stopPropagation()}
                    className="text-rivvra-300 hover:text-rivvra-200 hover:underline"
                  >
                    {job.department}
                  </Link>
                ) : undefined
              }
            />
            <InlineField
              label="Employment Type"
              field="employmentType"
              value={job.employmentType}
              type="select"
              options={employmentTypeOptions}
              editable={canEdit}
              onSave={saveField}
              placeholder={employmentTypeOptions.length ? 'Pick employment type' : 'No types — add in ATS Configuration'}
            />
            <InlineField label="Expected Hires" field="expectedHires" value={job.expectedHires ?? 1} editable={canEdit} onSave={saveField} />
            <InlineField label="Hired" field="hiredCount" value={job.hiredCount ?? 0} editable={false} />
          </SectionCard>

          <SectionCard id="card-staffing" title="Staffing & Compensation" icon={MapPin}>
            <InlineField
              label="Required Exp."
              field="requiredExperience"
              value={job.requiredExperience}
              type="select"
              options={EXPERIENCE_OPTIONS}
              editable={canEdit}
              onSave={saveField}
              displayValue={requiredExpDisplay || undefined}
            />
            <JobRequiredSkills
              orgSlug={orgSlug}
              jobId={jobId}
              value={job.requiredSkills || []}
              canEdit={canEdit}
              onSave={saveRequiredSkills}
              onAutofilled={(skills) => {
                // Endpoint already saved server-side — just sync state + refresh suggestions.
                setJob((prev) => ({ ...prev, requiredSkills: skills }));
                setSuggestRefresh((k) => k + 1);
              }}
            />
            <InlineField
              label="Client Hiring Mode"
              field="hiringMode"
              value={job.hiringMode}
              type="select"
              options={HIRING_MODE_OPTIONS}
              editable={canEdit}
              onSave={saveField}
              displayValue={
                job.hiringMode ? (
                  <span title={hiringModeFull} className="cursor-help underline decoration-dotted decoration-dark-500 underline-offset-2">
                    {job.hiringMode}
                  </span>
                ) : undefined
              }
            />
            <InlineField
              label="Work Location"
              field="clientJobLocation"
              value={job.clientJobLocation}
              editable={canEdit}
              onSave={saveWorkLocation}
              placeholder="e.g. Remote, Bangalore on-site"
            />
            <InlineField
              label="Client Budget"
              field="clientBudget"
              value={job.clientBudget}
              editable={canEdit}
              onSave={saveField}
              placeholder="0"
              displayValue={fmtBudget(job.clientBudget) || undefined}
            />
            <InlineField
              label="Candidate Max Budget"
              field="maxBudget"
              value={job.maxBudget}
              editable={canEdit}
              onSave={saveField}
              placeholder="0"
              displayValue={fmtBudget(job.maxBudget) || undefined}
            />
            {/* Approval Status is a read-only mirror here; the actual
                approve/reject UI lives in the "Approval Decision" card.
                We only render it once an approver is assigned — showing
                a misleading "Pending" with no recourse before assignment
                would just confuse the recruiter. The banner at the top
                of the page already prompts "assign an approver". */}
            {job.approverId && (
              <InlineField
                label="Approval Status"
                field="approvalStatus"
                value={job.approvalStatus}
                editable={false}
                displayValue={job.approvalStatus ? <ApprovalIndicator status={job.approvalStatus} /> : undefined}
              />
            )}
          </SectionCard>
          </div>{/* /sub-grid */}

          <SectionCard id="card-description" title="Description" icon={FileText}>
            <DescriptionTabs
              internal={job.description}
              publicDesc={job.websiteDescription}
              canEdit={canEdit}
              onSave={saveField}
            />
          </SectionCard>

          {/* Interview Rounds — per-job variable technical rounds (L1, L2,
              L3 …). Account Owner / ATS admin can add rounds for this
              requirement only. (per_job_interview_rounds_plan.md) */}
          <InterviewRoundsCard orgSlug={orgSlug} jobId={jobId} />

          {/* Suggested Candidates — only for a live (approved + open) req.
              Helps the account owner immediately submit best-fit people from
              the candidate DB instead of hand-filtering the candidate tab. */}
          {isApproved && statusKey === 'open' && !job.archived && (
            <SuggestedCandidates
              orgSlug={orgSlug}
              jobId={jobId}
              job={job}
              canCreate={canCreateApplication}
              canRecommend={canRecruit || isAccountOwner || isAdmin}
              onCreated={fetchApplications}
              refreshKey={suggestRefresh}
            />
          )}

          {/* Applications */}
          <div>
            {/* 2026-05-12 audit dedupe: header already has "+ New
                Application" as the primary CTA — removed the duplicate
                inline link here. Empty-state button below still renders
                when applications.length === 0 because at that point the
                header CTA needs reinforcing as the next action. */}
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">
                Applications
                <span className="ml-2 text-dark-400 text-sm font-normal">({appsTotal})</span>
              </h2>
            </div>

            {appsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
              </div>
            ) : applications.length === 0 ? (
              <div className="card p-8 flex flex-col items-center justify-center">
                <Users className="w-8 h-8 text-dark-500 mb-2" />
                <p className="text-dark-400 text-sm mb-3">No applications for this position yet.</p>
                {canCreateApplication && (
                  <button
                    onClick={() => navigate(orgPath(`/ats/jobs/${jobId}/applications/new`))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rivvra-500 text-dark-950 hover:bg-rivvra-400"
                  >
                    <Plus size={12} /> New Application
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-700">
                          <th className="text-left px-4 py-3 text-dark-400 font-medium">Candidate</th>
                          <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Email</th>
                          <th className="text-left px-4 py-3 text-dark-400 font-medium">Stage</th>
                          <th className="text-left px-4 py-3 text-dark-400 font-medium">Status</th>
                          <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Recruiter</th>
                          <th className="text-center px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Evaluation</th>
                          <th className="text-left px-4 py-3 text-dark-400 font-medium hidden xl:table-cell">Applied</th>
                        </tr>
                      </thead>
                      <tbody>
                        {applications.map((app) => {
                          // recruiterId on applications now stores the
                          // employee _id (semantic shifted with the People
                          // field migration). Older rows may still hold a
                          // portal_user id — the link will 404 until the
                          // backfill (or a re-save) runs.
                          const recId = app.recruiter || app.recruiterId;
                          // 2026-05-18 PM: surface lifecycle Status (Active /
                          // Hired / Refused) as its own column + tint the
                          // candidate name red for refused rows, matching the
                          // Applications list view.
                          const appStatus = app.applicationStatus || app.status;
                          const isRefused = appStatus === 'refused' || !!app.refused;
                          const isHired = appStatus === 'hired' || !!app.hireDate;
                          return (
                            <tr
                              key={app._id}
                              onClick={() => openApp(app._id)}
                              className="border-b border-dark-700/50 hover:bg-dark-800/50 cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {app.candidateId ? (
                                    <Link
                                      to={withFromContext(orgPath(`/ats/candidates/${app.candidateId}`), 'ats_job', jobId)}
                                      onClick={(e) => e.stopPropagation()}
                                      title="Open candidate profile"
                                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${isRefused ? 'bg-red-500/10 hover:bg-red-500/20' : 'bg-rivvra-500/10 hover:bg-rivvra-500/20'}`}
                                    >
                                      <span className={`text-xs font-semibold ${isRefused ? 'text-red-400' : 'text-rivvra-400'}`}>
                                        {(app.candidateName || '?')[0].toUpperCase()}
                                      </span>
                                    </Link>
                                  ) : (
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isRefused ? 'bg-red-500/10' : 'bg-rivvra-500/10'}`}>
                                      <span className={`text-xs font-semibold ${isRefused ? 'text-red-400' : 'text-rivvra-400'}`}>
                                        {(app.candidateName || '?')[0].toUpperCase()}
                                      </span>
                                    </div>
                                  )}
                                  <Link
                                    to={withFromContext(orgPath(`/ats/applications/${app._id}`), 'ats_job', jobId)}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`font-medium truncate hover:underline ${isRefused ? 'text-red-400 hover:text-red-300' : 'text-white hover:text-rivvra-300'}`}
                                  >
                                    {app.candidateName || 'Unnamed'}
                                  </Link>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-dark-300 hidden md:table-cell">
                                <span className="truncate block max-w-[180px]">{app.candidateEmail || '—'}</span>
                              </td>
                              <td className="px-4 py-3">
                                <StageBadge stageName={app.stageName || app.stageId?.name} />
                              </td>
                              <td className="px-4 py-3">
                                {isRefused ? (
                                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Refused</span>
                                ) : isHired ? (
                                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Hired</span>
                                ) : (
                                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-rivvra-500/10 text-rivvra-300 border border-rivvra-500/20">Active</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-dark-300 hidden lg:table-cell">
                                {recId && app.recruiterName ? (
                                  <Link
                                    to={withFromContext(orgPath(`/employee/${recId}`), 'ats_job', jobId)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="hover:text-rivvra-300 hover:underline"
                                  >
                                    {app.recruiterName}
                                  </Link>
                                ) : (
                                  app.recruiterName || '—'
                                )}
                              </td>
                              <td className="px-4 py-3 hidden lg:table-cell">
                                <div className="flex justify-center">
                                  <EvalStars value={app.evaluation || 0} />
                                </div>
                              </td>
                              <td className="px-4 py-3 text-dark-400 text-xs hidden xl:table-cell">
                                {formatDate(app.appliedOn)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {appsTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-dark-400 text-sm">
                      Showing {appsTotal === 0 ? 0 : (appsPage - 1) * 15 + 1}–{Math.min(appsPage * 15, appsTotal)} of {appsTotal}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setAppsPage((p) => Math.max(1, p - 1))}
                        disabled={appsPage === 1}
                        className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronDown size={16} className="rotate-90" />
                      </button>
                      {Array.from({ length: appsTotalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === appsTotalPages || Math.abs(p - appsPage) <= 1)
                        .reduce((acc, p, i, arr) => {
                          if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) =>
                          p === '...' ? (
                            <span key={`dots-${i}`} className="px-2 text-dark-500 text-sm">...</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setAppsPage(p)}
                              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                p === appsPage
                                  ? 'bg-rivvra-500 text-dark-950'
                                  : 'text-dark-400 hover:text-white hover:bg-dark-800'
                              }`}
                            >
                              {p}
                            </button>
                          )
                        )}
                      <button
                        onClick={() => setAppsPage((p) => Math.min(appsTotalPages, p + 1))}
                        disabled={appsPage === appsTotalPages}
                        className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronDown size={16} className="-rotate-90" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

        </div>

        {/* Sidebar — People, Client, Meta, Activities */}
        <div className="space-y-5">
          <SectionCard title="People" icon={UserCheck}>
            <EmployeeLookup
              orgSlug={orgSlug}
              label="Recruiter"
              currentValue={job.recruiterId}
              currentName={job.recruiterName}
              editable={canEdit}
              linkTo={(id) => withFromContext(orgPath(`/employee/${id}`), 'ats_job', jobId)}
              onSelect={(id, name) => savePerson('recruiterId', 'recruiterName', id, name)}
            />
            <EmployeeLookup
              orgSlug={orgSlug}
              label="Account Owner"
              currentValue={job.accountOwnerId}
              currentName={job.accountOwnerName}
              editable={canEdit}
              linkTo={(id) => withFromContext(orgPath(`/employee/${id}`), 'ats_job', jobId)}
              onSelect={(id, name) => savePerson('accountOwnerId', 'accountOwnerName', id, name)}
            />
            {/* 2026-05-17 Phase N added Account Manager here; removed
                same day per user feedback — Huemot's workflow uses
                Account Owner as the salesperson field, and Account
                Manager was a redundant slot that confused recruiters.
                The field is still captured in the create form for
                backward-compat with imported data; we just don't
                surface it for editing on the detail page. */}
            <EmployeeLookup
              orgSlug={orgSlug}
              label="Approver"
              currentValue={job.approverId}
              currentName={job.approverName}
              editable={canEdit}
              linkTo={(id) => withFromContext(orgPath(`/employee/${id}`), 'ats_job', jobId)}
              onSelect={(id, name) => savePerson('approverId', 'approverName', id, name)}
            />
          </SectionCard>

          {/* ─── Approval Decision ─────────────────────────────────────────
              Only the assigned approver (job.approverId === my employee
              _id) or an org owner/admin can submit. Server re-enforces the
              same rule on PUT /jobs/:id with 403 APPROVAL_FORBIDDEN.
              Hidden entirely if no approver is assigned AND the caller
              isn't an org admin — there's nothing they can do here. */}
          {(canDecideApproval || (isOrgAdmin && !job.approverId)) && (
            <SectionCard title="Approval Decision" icon={UserCheck}>
              {!job.approverId ? (
                <p className="text-sm text-dark-400">
                  No approver assigned yet. Pick one in the <strong className="text-dark-200">People</strong> card above to start the approval flow.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-dark-400">Current status</div>
                    <ApprovalIndicator status={job.approvalStatus} />
                  </div>
                  {!canDecideApproval && (
                    <p className="text-xs text-dark-500 italic">
                      Only {job.approverName || 'the assigned approver'} (or an org admin) can submit a decision here.
                    </p>
                  )}
                  {canDecideApproval && (
                    <>
                      <div>
                        <label className="block text-xs text-dark-400 mb-1">
                          Comment <span className="text-dark-500">(required to reject)</span>
                        </label>
                        <textarea
                          value={approvalDraftComment}
                          onChange={(e) => setApprovalDraftComment(e.target.value)}
                          rows={3}
                          placeholder="Add context for your decision…"
                          className="w-full text-sm bg-dark-900 border border-dark-700 rounded-md px-2.5 py-1.5 text-dark-100 placeholder-dark-500 focus:outline-none focus:border-rivvra-500 resize-y"
                          disabled={approvalSubmitting}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => submitApprovalDecision('approved')}
                          disabled={approvalSubmitting || job.approvalStatus === 'approved'}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <CheckCircle2 size={13} /> Approve
                        </button>
                        <button
                          onClick={() => submitApprovalDecision('rejected')}
                          disabled={approvalSubmitting || job.approvalStatus === 'rejected'}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/10 text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <XCircle size={13} /> Reject
                        </button>
                      </div>
                      {job.approvalStatus !== 'pending' && (
                        <button
                          onClick={() => submitApprovalDecision('pending')}
                          disabled={approvalSubmitting}
                          className="w-full text-[11px] text-dark-400 hover:text-dark-200 underline disabled:opacity-40"
                        >
                          Reset to pending
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard title="Client" icon={Tag}>
            <InlineField
              label="Client Role"
              field="isClientRole"
              value={!!job.isClientRole}
              type="toggle"
              editable={canEdit}
              onSave={saveField}
            />
            {/* Q4-A: lookup field; selected name renders as a hyperlink to
                the contact record. Pencil/clear icon swaps to edit mode. */}
            <div className="grid grid-cols-[140px_1fr] gap-2 py-2 group items-start">
              <span className="text-dark-400 text-sm pt-1.5">Client Name</span>
              <div className="min-w-0">
                {editingClient && canEdit && job.isClientRole ? (
                  <ComboSelect
                    value={job.clientContactId || ''}
                    displayValue={job.clientName || ''}
                    options={companyContacts}
                    onChange={handleClientSelect}
                    disableCreate
                    placeholder="Search a company contact…"
                  />
                ) : job.clientName ? (
                  <div className="flex items-center gap-1.5 text-sm">
                    {job.clientContactId ? (
                      <Link
                        to={withFromContext(orgPath(`/contacts/${job.clientContactId}`), 'ats_job', jobId)}
                        className="text-rivvra-300 hover:text-rivvra-200 hover:underline truncate"
                      >
                        {job.clientName}
                      </Link>
                    ) : (
                      <span className="text-white truncate">{job.clientName}</span>
                    )}
                    {canEdit && job.isClientRole && (
                      <>
                        <button
                          onClick={() => setEditingClient(true)}
                          className="text-dark-500 hover:text-dark-300 flex-shrink-0"
                          title="Change client"
                          aria-label="Change client"
                        >
                          <ChevronDown size={14} />
                        </button>
                        {/* D13: dedicated clear affordance — the picker's
                            blank-guard makes selection-only clearing
                            impossible. */}
                        <button
                          onClick={handleClientClear}
                          className="text-dark-500 hover:text-red-300 flex-shrink-0"
                          title="Clear client"
                          aria-label="Clear client"
                        >
                          <XCircle size={13} />
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={canEdit && job.isClientRole ? () => setEditingClient(true) : undefined}
                    className={`text-sm rounded px-1 -mx-1 ${canEdit && job.isClientRole ? 'cursor-pointer hover:bg-dark-800' : ''}`}
                  >
                    <span className="text-dark-500 italic">
                      {job.isClientRole ? 'Search or type a company name…' : 'Toggle Client Role first'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Visibility card — hidden until the public careers-page feature
              actually ships. Showing a Published toggle that doesn't do
              anything misleads users. The schema field stays so the
              feature can light up by re-rendering this card later. */}

          {/* Q14-D + Q8-A: Meta card — Created/Updated/Source + folded Approval */}
          <SectionCard>
            <RecordMeta
              createdAt={job.createdAt}
              createdByName={job.createdByName}
              updatedAt={job.updatedAt}
              updatedByName={job.updatedByName}
            />
            {job.approverId && (job.approvalStatus || job.approverName) && (
              <div className="text-[11px] text-dark-500 mt-2 pt-2 border-t border-dark-700/50 space-y-1">
                <div className="flex items-center gap-1.5">
                  <ApprovalIndicator status={job.approvalStatus} />
                  {job.approverName && (
                    <span>
                      &nbsp;by <span className="text-dark-300">{job.approverName}</span>
                    </span>
                  )}
                </div>
                {job.approverComment && (
                  <button
                    onClick={() => setShowApprovalComment((s) => !s)}
                    className="text-[10px] text-dark-500 hover:text-dark-300 underline"
                  >
                    {showApprovalComment ? 'Hide comment' : 'Show comment'}
                  </button>
                )}
                {showApprovalComment && job.approverComment && (
                  <p className="text-dark-300 italic">{job.approverComment}</p>
                )}
              </div>
            )}
            {job.odooId && (
              <p className="text-[11px] text-dark-500 mt-2 pt-2 border-t border-dark-700/50">
                Source: Odoo import (#{job.odooId})
              </p>
            )}
          </SectionCard>

          {/* Activities — sits at the bottom of the right column so the
              feed can grow vertically without bounding the main flow. */}
          <ActivityPanel orgSlug={orgSlug} entityType="ats_job" entityId={jobId} refreshKey={activityRefreshKey} />
        </div>
      </div>

      {/* Archive Confirmation Modal */}
      {showArchiveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => { if (!archiving) setShowArchiveModal(false); }}
        >
          <div
            className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
              <Archive size={16} /> Archive Job Position
            </h2>
            <p className="text-sm text-dark-400 mb-3">
              Archive <span className="text-white font-medium">{job.name}</span>? It will be hidden from list views but can be restored at any time.
            </p>
            {archivePreview === null ? (
              <div className="text-xs text-dark-500 mb-4 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Checking linked records…</div>
            ) : (archivePreview.activeApplications > 0 || archivePreview.linkedOpportunity) ? (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-4">
                <p className="text-xs text-amber-300 font-medium mb-2">Linked records:</p>
                <ul className="space-y-1.5 text-xs text-dark-200">
                  {archivePreview.activeApplications > 0 && (
                    <li className="flex items-center gap-1.5">
                      <Users size={11} className="text-dark-500 flex-shrink-0" />
                      {archivePreview.activeApplications} active application{archivePreview.activeApplications === 1 ? '' : 's'}
                    </li>
                  )}
                  {archivePreview.linkedOpportunity && (
                    <li className="flex items-center gap-1.5">
                      <Briefcase size={11} className="text-dark-500 flex-shrink-0" />
                      <span className="flex-1 truncate">CRM opp: {archivePreview.linkedOpportunity.name}</span>
                      <span className="text-[10px] text-dark-500">won't be archived</span>
                    </li>
                  )}
                </ul>
                {archivePreview.activeApplications > 0 && (
                  <p className="text-[11px] text-dark-500 mt-2">Choose whether to archive the applications too.</p>
                )}
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleArchiveJob(false)}
                disabled={archiving}
                className="w-full px-3 py-2 text-sm bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                Archive job only
              </button>
              {archivePreview?.activeApplications > 0 && (
                <button
                  onClick={() => handleArchiveJob(true)}
                  disabled={archiving}
                  className="w-full px-3 py-2 text-sm bg-amber-500/25 text-amber-200 border border-amber-500/40 rounded-lg hover:bg-amber-500/35 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
                  Archive job + {archivePreview.activeApplications} application{archivePreview.activeApplications === 1 ? '' : 's'}
                </button>
              )}
              <button
                onClick={() => setShowArchiveModal(false)}
                disabled={archiving}
                className="w-full px-3 py-2 text-sm text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => { if (!deleting) setShowDeleteModal(false); }}
        >
          <div
            className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-dark-100 mb-2">Delete Job Position</h2>
            <p className="text-xs text-dark-400 mb-1">
              Are you sure you want to permanently delete <span className="text-dark-200 font-medium">{job.name}</span>?
            </p>
            <p className="text-xs text-dark-500 mb-5">This action cannot be undone. Jobs with existing applications cannot be deleted.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-3 py-2 text-xs text-dark-300 bg-dark-900 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteJob}
                disabled={deleting}
                className="flex-1 px-3 py-2 text-xs text-white bg-red-500 rounded-lg hover:bg-red-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
