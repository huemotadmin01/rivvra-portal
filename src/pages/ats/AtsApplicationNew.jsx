import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import SectionCard from '../../components/platform/detail/SectionCard';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import { usePageTitle } from '../../hooks/usePageTitle';
import { ChevronLeft, Loader2, User, Search, Plus, Briefcase } from 'lucide-react';

/**
 * AtsApplicationNew — routed create flow for new applications under a
 * specific Job Position. Reachable only from /ats/jobs/:jobId/applications/new
 * — there is no list-page entry point.
 *
 * Behavior locked 2026-05-10:
 *  - Parent job hard-required from URL; bounces back if not open/on_hold.
 *  - Recruiter and Employment Type auto-fill from the job; Stage = "New".
 *  - Candidate field typeaheads existing candidates (auto-fills email/
 *    phone/LinkedIn) or types a new name.
 *  - Required: candidate name + (email OR phone). API enforces.
 *  - Source intentionally absent — edited later on detail page.
 *
 * Layout matches AtsCandidateNew: p-6 md:p-8 max-w-2xl mx-auto with
 * the label-left grid form rows used across the rest of the platform.
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

  // ── Render ──────────────────────────────────────────────────────────
  if (loadingJob) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
      </div>
    );
  }
  if (!job) return null;

  const labelCol = 'text-dark-400 text-sm';
  const inputCls = 'bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 focus:outline-none w-full';

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => navigate(orgPath(`/ats/jobs/${jobId}`))}
        className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors"
      >
        <ChevronLeft size={16} /> Back to {job.name}
      </button>

      <div>
        <h1 className="text-2xl font-bold text-white">New Application</h1>
        <p className="text-dark-400 text-sm mt-1 flex items-center gap-1.5">
          <Briefcase size={12} /> {job.name}
          {job.department && <span className="text-dark-500">· {job.department}</span>}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard title="Candidate" icon={User}>
          {/* Candidate typeahead — single full-width row */}
          <div ref={candContainerRef} className="grid grid-cols-[140px_1fr] gap-2 py-2 items-start">
            <span className={`${labelCol} pt-2`}>
              Name <span className="text-red-400">*</span>
            </span>
            <div className="relative">
              <Search size={12} className="text-dark-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={candInputRef}
                type="text"
                value={candQuery}
                placeholder="Search existing candidates or type a new name…"
                onFocus={() => setCandDropdownOpen(true)}
                onChange={(e) => {
                  setCandQuery(e.target.value);
                  setCandDropdownOpen(true);
                  if (form.candidateId) setForm((p) => ({ ...p, candidateId: '' }));
                  setForm((p) => ({ ...p, candidateName: e.target.value }));
                }}
                className={`${inputCls} pl-8 pr-20`}
                required
                autoFocus
              />
              {form.candidateId && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-rivvra-300 bg-rivvra-500/10 px-1.5 py-0.5 rounded">
                  existing
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className={labelCol}>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="john@example.com"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className={labelCol}>Phone</span>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="+91 90000 00000"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-1">
            <span />
            <p className={`text-xs ${hasContact ? 'text-dark-500' : 'text-amber-400/80'}`}>
              {hasContact ? 'At least one contact method captured.' : 'At least one of email or phone is required.'}
            </p>
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className={labelCol}>LinkedIn</span>
            <input
              type="url"
              value={form.linkedinProfile}
              onChange={(e) => setForm((p) => ({ ...p, linkedinProfile: e.target.value }))}
              placeholder="https://linkedin.com/in/…"
              className={inputCls}
            />
          </div>
        </SectionCard>

        <SectionCard title="Job & Pipeline" icon={Briefcase}>
          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className={labelCol}>Job Position</span>
            <span className="text-white text-sm truncate">{job.name}</span>
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className={labelCol}>Stage</span>
            <span className="text-white text-sm">New</span>
          </div>
          {/* Recruiter — required, pre-filled from job, but admins can
              override per-application (e.g. when one recruiter sources
              and another owns the candidate going forward). EmployeeLookup
              gives the same typeahead used on detail pages, including
              ex-employees that have no portal_users record. */}
          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-start">
            <span className={`${labelCol} pt-1`}>
              Recruiter <span className="text-red-400">*</span>
            </span>
            <div>
              <EmployeeLookup
                orgSlug={orgSlug}
                variant="inline"
                editable
                allowClear={false}
                placeholder="Search employees…"
                currentValue={form.recruiterId}
                currentName={form.recruiterName}
                onSelect={(id, name) => setForm((p) => ({ ...p, recruiterId: id || null, recruiterName: name || '' }))}
              />
              {!hasRecruiter && (
                <p className="text-[11px] text-amber-400/80 mt-1">Recruiter is required.</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-2 py-2 items-center">
            <span className={labelCol}>Employment</span>
            <span className="text-white text-sm">
              {form.employmentType || <span className="text-dark-500 italic">—</span>}
            </span>
          </div>
          <p className="text-xs text-dark-500 mt-3">
            Recruiter is pre-filled from the linked job — change here if a different recruiter owns this candidate. Employment type is inherited from the job and edited on the application detail page after creation.
          </p>
        </SectionCard>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate(orgPath(`/ats/jobs/${jobId}`))}
            className="px-4 py-2 text-sm text-dark-300 hover:text-dark-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 text-sm bg-rivvra-500 text-white rounded-lg hover:bg-rivvra-600 disabled:opacity-50 flex items-center gap-2 font-medium"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create Application
          </button>
        </div>
      </form>

      {/* Candidate typeahead dropdown — portaled to body so it escapes
          the SectionCard's backdrop-blur stacking context. */}
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
          className="bg-dark-800 border border-dark-600 rounded-lg shadow-xl max-h-72 overflow-y-auto"
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
              className="w-full text-left px-3 py-2 hover:bg-dark-700 border-b border-dark-700/50 last:border-0"
            >
              <div className="text-xs text-white">{c.name}</div>
              {(c.email || c.phone) && (
                <div className="text-[10px] text-dark-400">
                  {c.email}{c.email && c.phone ? ' · ' : ''}{c.phone}
                </div>
              )}
            </button>
          ))}
          {candQuery.trim() && !candResults.some((c) => (c.name || '').trim().toLowerCase() === candQuery.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={() => {
                setForm((p) => ({ ...p, candidateId: '', candidateName: candQuery.trim() }));
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
    </div>
  );
}
