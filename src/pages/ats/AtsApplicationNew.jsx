import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  ChevronLeft, ChevronRight, Loader2, User, Search, Plus, Briefcase,
  Mail, Phone as PhoneIcon, Linkedin, Building2, GitBranch, Users,
  FileText, Check,
} from 'lucide-react';

/**
 * AtsApplicationNew — routed create flow for new applications under a
 * specific Job Position. Reachable only from /ats/jobs/:jobId/applications/new
 *
 * Layout: two-column on lg+ — form on the left, sticky context summary
 * on the right showing what will be created, plus a sticky bottom action
 * bar visible even mid-scroll. Modern SAAS-grade create flow rather than
 * the legacy modal it replaced.
 */
export default function AtsApplicationNew() {
  const { jobId } = useParams();
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  usePageTitle('New Application');

  const orgSlug = currentOrg?.slug;

  const [job, setJob] = useState(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    candidateId: '',
    candidateName: '',
    email: '',
    phone: '',
    linkedinProfile: '',
    employmentType: '',
    recruiterId: null,
    recruiterName: '',
  });
  // Track whether email/phone/linkedin came from picking an existing
  // candidate (we still allow edits, but apply a subtle "inherited" hint).
  const [inheritedFromPick, setInheritedFromPick] = useState({
    email: false, phone: false, linkedin: false,
  });
  // Track whether recruiter is still the job's default vs user override.
  const [recruiterOverridden, setRecruiterOverridden] = useState(false);

  // Candidate typeahead state
  const [candQuery, setCandQuery] = useState('');
  const [candResults, setCandResults] = useState([]);
  const [candDropdownOpen, setCandDropdownOpen] = useState(false);
  const [candSearching, setCandSearching] = useState(false);
  const [candAnchorRect, setCandAnchorRect] = useState(null);
  const candInputRef = useRef(null);
  const candContainerRef = useRef(null);
  const candSearchTimer = useRef(null);

  // ── Load parent job + auto-fill defaults ───────────────────────────
  useEffect(() => {
    if (!orgSlug || !jobId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await atsApi.getJob(orgSlug, jobId);
        if (cancelled) return;
        if (!res?.success || !res.job) {
          showToast('Job position not found', 'error');
          navigate(orgPath('/ats/jobs'), { replace: true });
          return;
        }
        const j = res.job;
        const statusKey = (j.status || '').toLowerCase().replace(/\s+/g, '_');
        if (j.archived || (statusKey !== 'open' && statusKey !== 'on_hold')) {
          showToast('Job is not accepting new applications', 'error');
          navigate(orgPath(`/ats/jobs/${jobId}`), { replace: true });
          return;
        }
        setJob(j);
        setForm((p) => ({
          ...p,
          recruiterId: j.recruiterId || null,
          recruiterName: j.recruiterName || '',
          employmentType: j.employmentType || '',
        }));
      } catch (err) {
        if (!cancelled) {
          showToast(err?.message || 'Failed to load job', 'error');
          navigate(orgPath('/ats/jobs'), { replace: true });
        }
      } finally {
        if (!cancelled) setLoadingJob(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, jobId]);

  // ── Candidate typeahead ─────────────────────────────────────────────
  const searchCandidates = useCallback(async (q) => {
    if (!orgSlug) return;
    setCandSearching(true);
    try {
      const res = await atsApi.listCandidates(orgSlug, { search: q || '', limit: 20 });
      setCandResults(res?.candidates || []);
    } catch {
      setCandResults([]);
    } finally {
      setCandSearching(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    if (!candDropdownOpen) return;
    if (candSearchTimer.current) clearTimeout(candSearchTimer.current);
    candSearchTimer.current = setTimeout(() => searchCandidates(candQuery), 200);
    return () => { if (candSearchTimer.current) clearTimeout(candSearchTimer.current); };
  }, [candQuery, candDropdownOpen, searchCandidates]);

  useEffect(() => {
    if (!candDropdownOpen) return;
    const handleClick = (e) => {
      if (candContainerRef.current && candContainerRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-cand-typeahead]')) return;
      setCandDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [candDropdownOpen]);

  useEffect(() => {
    if (!candDropdownOpen) return;
    const measure = () => {
      const node = candInputRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      setCandAnchorRect({ top: r.bottom, left: r.left, width: r.width });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [candDropdownOpen]);

  const pickExistingCandidate = (cand) => {
    setForm((p) => ({
      ...p,
      candidateId: String(cand._id),
      candidateName: cand.name || '',
      email: cand.email || '',
      phone: cand.phone || '',
      linkedinProfile: cand.linkedinProfile || '',
    }));
    setInheritedFromPick({
      email: !!cand.email,
      phone: !!cand.phone,
      linkedin: !!cand.linkedinProfile,
    });
    setCandQuery(cand.name || '');
    setCandDropdownOpen(false);
  };

  // ── Validation ──────────────────────────────────────────────────────
  const trimmedName = (form.candidateName || candQuery || '').trim();
  const hasContact = !!(form.email.trim() || form.phone.trim());
  const hasRecruiter = !!form.recruiterId;
  const canSubmit = !!trimmedName && hasContact && hasRecruiter && !saving && !loadingJob && !!job;

  // ── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const payload = {
        candidateName: trimmedName,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        linkedinProfile: form.linkedinProfile.trim() || null,
        jobPositionId: jobId,
        employmentType: form.employmentType || null,
        recruiterId: form.recruiterId || null,
        recruiterName: form.recruiterName || '',
      };
      if (form.candidateId) payload.candidateId = form.candidateId;
      const res = await atsApi.createApplication(orgSlug, payload);
      const newAppId = res?.application?._id || res?.applicationId;
      if (!newAppId) throw new Error('Server returned no application id');
      showToast('Application created');
      navigate(orgPath(`/ats/applications/${newAppId}`));
    } catch (err) {
      showToast(err?.message || 'Failed to create application', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading shell ───────────────────────────────────────────────────
  if (loadingJob) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
      </div>
    );
  }
  if (!job) return null;

  // ── Helpers for input chrome ────────────────────────────────────────
  const initials = (name) => {
    const parts = String(name || '').trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase()).join('') || '?';
  };
  const inputBase = 'w-full bg-dark-900/60 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-100 placeholder:text-dark-600 focus:border-rivvra-500/60 focus:outline-none focus:ring-2 focus:ring-rivvra-500/20 transition-all';
  const inputWithIcon = `${inputBase} pl-9`;
  const inheritedBg = 'bg-dark-900/30';

  return (
    <>
      {/* ── Top breadcrumb bar ───────────────────────────────────────── */}
      <div className="border-b border-dark-800/60 bg-dark-950/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-3 flex items-center gap-2 text-xs text-dark-400">
          <button
            onClick={() => navigate(orgPath(`/ats/jobs/${jobId}`))}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            <ChevronLeft size={12} /> {job.name}
          </button>
          <ChevronRight size={11} className="text-dark-700" />
          <span className="text-dark-300">New Application</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 pb-32">
        {/* ── Page heading ─────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">New Application</h1>
          <p className="text-dark-400 text-sm mt-1.5">
            Add a candidate to <span className="text-dark-200">{job.name}</span>’s pipeline.
            Required fields marked with <span className="text-red-400">*</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* ── Form column ──────────────────────────────────── */}
            <div className="lg:col-span-3 space-y-6">

              {/* Candidate section */}
              <section className="card p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-rivvra-300" />
                  <h2 className="text-sm font-semibold text-white tracking-wide">Candidate</h2>
                </div>

                {/* Name typeahead */}
                <div ref={candContainerRef} className="relative">
                  <label className="block text-xs font-medium text-dark-300 mb-1.5">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    {form.candidateId ? (
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-rivvra-500/15 text-rivvra-300 text-[10px] font-semibold flex items-center justify-center">
                        {initials(form.candidateName)}
                      </span>
                    ) : (
                      <Search size={13} className="text-dark-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    )}
                    <input
                      ref={candInputRef}
                      type="text"
                      value={candQuery}
                      placeholder="Search existing candidates or type a new name…"
                      onFocus={() => setCandDropdownOpen(true)}
                      onChange={(e) => {
                        setCandQuery(e.target.value);
                        setCandDropdownOpen(true);
                        if (form.candidateId) {
                          setForm((p) => ({ ...p, candidateId: '' }));
                          setInheritedFromPick({ email: false, phone: false, linkedin: false });
                        }
                        setForm((p) => ({ ...p, candidateName: e.target.value }));
                      }}
                      className={`${inputWithIcon} ${form.candidateId ? 'pl-10' : ''} pr-24`}
                      required
                      autoFocus
                    />
                    {form.candidateId && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                        existing
                      </span>
                    )}
                  </div>
                </div>

                {/* Email + Phone — 2 col */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-dark-300 mb-1.5">Email</label>
                    <div className="relative">
                      <Mail size={13} className="text-dark-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => {
                          setForm((p) => ({ ...p, email: e.target.value }));
                          if (inheritedFromPick.email) setInheritedFromPick((p) => ({ ...p, email: false }));
                        }}
                        placeholder="john@example.com"
                        className={`${inputWithIcon} ${inheritedFromPick.email ? inheritedBg : ''}`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-300 mb-1.5">Phone</label>
                    <div className="relative">
                      <PhoneIcon size={13} className="text-dark-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => {
                          setForm((p) => ({ ...p, phone: e.target.value }));
                          if (inheritedFromPick.phone) setInheritedFromPick((p) => ({ ...p, phone: false }));
                        }}
                        placeholder="+91 90000 00000"
                        className={`${inputWithIcon} ${inheritedFromPick.phone ? inheritedBg : ''}`}
                      />
                    </div>
                  </div>
                </div>

                <p className={`text-xs ${hasContact ? 'text-dark-500' : 'text-amber-400/80'}`}>
                  {hasContact ? 'At least one contact method captured.' : 'At least one of email or phone is required.'}
                </p>

                <div>
                  <label className="block text-xs font-medium text-dark-300 mb-1.5">LinkedIn <span className="text-dark-600">(optional)</span></label>
                  <div className="relative">
                    <Linkedin size={13} className="text-dark-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="url"
                      value={form.linkedinProfile}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, linkedinProfile: e.target.value }));
                        if (inheritedFromPick.linkedin) setInheritedFromPick((p) => ({ ...p, linkedin: false }));
                      }}
                      placeholder="https://linkedin.com/in/…"
                      className={`${inputWithIcon} ${inheritedFromPick.linkedin ? inheritedBg : ''}`}
                    />
                  </div>
                </div>
              </section>

              {/* Pipeline section */}
              <section className="card p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <GitBranch size={14} className="text-rivvra-300" />
                  <h2 className="text-sm font-semibold text-white tracking-wide">Pipeline</h2>
                </div>

                {/* Recruiter — required, lookup */}
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-dark-300 mb-1.5">
                    Recruiter <span className="text-red-400">*</span>
                    {!recruiterOverridden && form.recruiterId && (
                      <span className="text-[9px] uppercase tracking-wider bg-rivvra-500/10 text-rivvra-300 px-1.5 py-0.5 rounded">
                        inherited
                      </span>
                    )}
                  </label>
                  <div className="bg-dark-900/60 border border-dark-700 rounded-lg px-3 py-1.5 focus-within:border-rivvra-500/60 focus-within:ring-2 focus-within:ring-rivvra-500/20 transition-all">
                    <EmployeeLookup
                      orgSlug={orgSlug}
                      variant="inline"
                      editable
                      allowClear={false}
                      placeholder="Search employees…"
                      currentValue={form.recruiterId}
                      currentName={form.recruiterName}
                      onSelect={(id, name) => {
                        setForm((p) => ({ ...p, recruiterId: id || null, recruiterName: name || '' }));
                        setRecruiterOverridden(true);
                      }}
                    />
                  </div>
                  {!hasRecruiter && (
                    <p className="text-[11px] text-amber-400/80 mt-1.5">Recruiter is required.</p>
                  )}
                </div>

                {/* Inherited (read-only) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-dark-300 mb-1.5">
                      Stage
                    </label>
                    <div className="px-3 py-2 bg-dark-900/30 border border-dark-800 rounded-lg text-sm text-dark-200">
                      New
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-dark-300 mb-1.5">
                      Employment
                      {form.employmentType && (
                        <span className="text-[9px] uppercase tracking-wider bg-rivvra-500/10 text-rivvra-300 px-1.5 py-0.5 rounded">
                          inherited
                        </span>
                      )}
                    </label>
                    <div className="px-3 py-2 bg-dark-900/30 border border-dark-800 rounded-lg text-sm text-dark-200">
                      {form.employmentType || <span className="text-dark-500 italic">—</span>}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-dark-500 leading-relaxed">
                  Stage starts at <span className="text-dark-300">New</span>. Employment type is inherited from the linked job and editable on the application detail page after creation.
                </p>
              </section>
            </div>

            {/* ── Right: context summary ───────────────────────── */}
            <aside className="lg:col-span-2">
              <div className="lg:sticky lg:top-24 space-y-4">
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText size={13} className="text-rivvra-300" />
                    <h3 className="text-xs font-semibold text-white tracking-wider uppercase">Summary</h3>
                  </div>

                  <dl className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-dark-400 text-xs flex items-center gap-1.5"><Briefcase size={11} /> Job</dt>
                      <dd className="text-white text-right truncate font-medium" title={job.name}>{job.name}</dd>
                    </div>
                    {job.department && (
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-dark-400 text-xs flex items-center gap-1.5"><Building2 size={11} /> Dept</dt>
                        <dd className="text-dark-200 text-right truncate" title={job.department}>{job.department}</dd>
                      </div>
                    )}
                    {job.clientName && (
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-dark-400 text-xs flex items-center gap-1.5"><Users size={11} /> Client</dt>
                        <dd className="text-dark-200 text-right truncate" title={job.clientName}>{job.clientName}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="border-t border-dark-800 my-4" />

                  <div className="text-[10px] uppercase tracking-wider text-dark-500 mb-2">Will create</div>
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-dark-400 text-xs">Candidate</dt>
                      <dd className="text-white text-right truncate font-medium">
                        {trimmedName || <span className="text-dark-600 italic">unnamed</span>}
                        {form.candidateId && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-emerald-300">existing</span>}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-dark-400 text-xs">Recruiter</dt>
                      <dd className="text-dark-200 text-right truncate">
                        {form.recruiterName || <span className="text-amber-400/80">— required</span>}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-dark-400 text-xs">Stage</dt>
                      <dd className="text-dark-200">New</dd>
                    </div>
                  </dl>

                  <div className="border-t border-dark-800 my-4" />

                  {/* Validation checklist */}
                  <div className="space-y-1.5">
                    <ChecklistRow ok={!!trimmedName} label="Candidate name" />
                    <ChecklistRow ok={hasContact} label="Email or phone" />
                    <ChecklistRow ok={hasRecruiter} label="Recruiter assigned" />
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* ── Sticky bottom action bar ─────────────────────────── */}
          {/* Sidebar is fixed w-64 left-0 on lg+, so the bar starts at
              lg:left-64 to avoid hiding behind it. On mobile the sidebar
              is offscreen so left-0 is correct. */}
          <div className="fixed bottom-0 left-0 lg:left-64 right-0 border-t border-dark-800/80 bg-dark-950/85 backdrop-blur-md z-20">
            <div className="max-w-6xl mx-auto px-6 md:px-8 py-3 flex items-center justify-between gap-4">
              <p className="text-xs text-dark-500 hidden md:block">
                {canSubmit
                  ? <span className="text-dark-300">Ready to create.</span>
                  : 'Fill required fields to enable Create.'}
              </p>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => navigate(orgPath(`/ats/jobs/${jobId}`))}
                  className="px-4 py-2 text-sm text-dark-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="bg-rivvra-500 text-dark-950 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-lg shadow-rivvra-500/10"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Create Application
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Candidate typeahead dropdown — portaled to body to escape any
          backdrop-blur stacking context. */}
      {candDropdownOpen && candAnchorRect && createPortal(
        <div
          data-cand-typeahead
          style={{
            position: 'fixed',
            top: candAnchorRect.top + 4,
            left: candAnchorRect.left,
            width: candAnchorRect.width,
            zIndex: 1000,
          }}
          className="bg-dark-800 border border-dark-600 rounded-lg shadow-2xl max-h-72 overflow-y-auto"
        >
          {candSearching && (
            <div className="px-3 py-2 text-xs text-dark-500 flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" /> Searching…
            </div>
          )}
          {!candSearching && candResults.length === 0 && (
            <div className="px-3 py-2 text-xs text-dark-500">
              {candQuery.trim() ? `No matches — will create new candidate "${candQuery.trim()}"` : 'Start typing to search'}
            </div>
          )}
          {candResults.map((c) => (
            <button
              key={c._id}
              type="button"
              onClick={() => pickExistingCandidate(c)}
              className="w-full text-left px-3 py-2 hover:bg-dark-700 border-b border-dark-700/50 last:border-0 flex items-center gap-2.5"
            >
              <span className="w-7 h-7 rounded-full bg-rivvra-500/15 text-rivvra-300 text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                {initials(c.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-white truncate">{c.name}</div>
                {(c.email || c.phone) && (
                  <div className="text-[10px] text-dark-400 truncate">
                    {c.email}{c.email && c.phone ? ' · ' : ''}{c.phone}
                  </div>
                )}
              </div>
            </button>
          ))}
          {candQuery.trim() && !candResults.some((c) => (c.name || '').trim().toLowerCase() === candQuery.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={() => {
                setForm((p) => ({ ...p, candidateId: '', candidateName: candQuery.trim() }));
                setInheritedFromPick({ email: false, phone: false, linkedin: false });
                setCandDropdownOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs text-rivvra-300 hover:bg-dark-700 border-t border-dark-700 flex items-center gap-1.5"
            >
              <Plus size={11} /> Create new candidate &ldquo;{candQuery.trim()}&rdquo;
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

function ChecklistRow({ ok, label }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${ok ? 'text-emerald-300' : 'text-dark-500'}`}>
      <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${ok ? 'bg-emerald-500/15' : 'bg-dark-800 border border-dark-700'}`}>
        {ok ? <Check size={9} /> : <span className="w-1 h-1 rounded-full bg-dark-600" />}
      </span>
      <span>{label}</span>
    </div>
  );
}
