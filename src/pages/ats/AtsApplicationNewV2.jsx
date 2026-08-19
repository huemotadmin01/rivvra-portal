import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import { useToast } from '../../context/ToastContext';
import atsApi from '../../utils/atsApi';
import employeeApi from '../../utils/employeeApi';
import EmployeeLookup from '../../components/shared/EmployeeLookup';
import { usePageTitle } from '../../hooks/usePageTitle';
import useCompanyScoped404 from '../../hooks/useCompanyScoped404';
import {
  ChevronLeft, ChevronRight, Loader2, User, Search, Plus, Briefcase,
  Mail, Phone as PhoneIcon, Linkedin, Building2, GitBranch, Users,
  FileText, Check, Award, X, Upload, FileCheck2,
} from 'lucide-react';
import { Panel, Chip, Button, Input, Callout, PageSpinner } from '../../components/ds';

/**
 * AtsApplicationNewV2 — routed create flow for new applications under a
 * specific Job Position, on ds. Reachable only from
 * /ats/jobs/:jobId/applications/new
 *
 * Locked behavior 2026-05-10:
 *  - Recruiter required (typeahead, prefills from job).
 *  - Candidate name + (email OR phone) required.
 *  - Skills optional (2026-06-01): picks union into the candidate's skill set.
 *    Only EXISTING master skills or AI suggestions — no free-text minting.
 *  - Resume required: existing-candidate's prior resume satisfies the gate;
 *    new candidates must upload one (PDF/DOC/DOCX, ≤10 MB).
 *  - Source intentionally absent — edited later on the application detail
 *    page. Account Owner / Client Name / Account Mgr inherited from job.
 *
 * Submit is multi-step on purpose (per Q9-B): create application first,
 * then attach skills + upload resume against the returned application's
 * candidateId / _id. Reuses existing endpoints; no new code paths.
 *
 * ── Migration note ───────────────────────────────────────────────────────
 * The entire 673-line logic layer is spliced in byte-identically, because
 * almost all of this page is gates:
 *
 *   hasResume          — a fresh upload always counts; a REUSED resume only
 *                        counts after `resumeConfirmed`. Before 2026-05-13
 *                        this silently attached prior-application files.
 *   blockedByDuplicate — hard-blocks only when the prior application is
 *                        `ongoing` or `hired`. A refused/archived prior keeps
 *                        the banner but leaves Create enabled, because
 *                        re-applying after a refusal is legitimate.
 *   canSubmit          — an eight-condition conjunction over all of the above.
 *
 * The two inherited-field blanking paths are also carried across exactly: when
 * the user retypes over a picked candidate, only the fields they typed
 * themselves survive. Leaving the inherited ones would let the server's
 * email-dedupe attach the application to the wrong candidate.
 *
 * Not triggered: create application, resume upload, skill attach.
 */
export default function AtsApplicationNewV2() {
  const { jobId } = useParams();
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();
  // Company-switch graceful 404 (mirrors AtsApplicationDetail): a 404 on
  // the parent job mid-switch redirects silently; a cross-company deep
  // link gets the amber toast. /applications/new isn't an id-suffixed
  // path, so pass the jobs list as the explicit fallback.
  const handleScoped404 = useCompanyScoped404('job position', orgPath('/ats/jobs'));

  const orgSlug = currentOrg?.slug;

  const [job, setJob] = useState(null);
  usePageTitle('New Application', { [`/ats/jobs/${jobId}`]: job?.name });
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
  const [inheritedFromPick, setInheritedFromPick] = useState({
    email: false, phone: false, linkedin: false,
  });
  const [recruiterOverridden, setRecruiterOverridden] = useState(false);

  // 2026-05-18 PM: prefill recruiter with the logged-in user's employee.
  // The job no longer dictates this (HR Team shared inbox was hiding the
  // real recruiter). Admins can still pick someone else via the lookup.
  useEffect(() => {
    if (!orgSlug || recruiterOverridden || form.recruiterId) return;
    employeeApi.getMyProfile(orgSlug)
      .then((res) => {
        if (res?.success && res.employee && !recruiterOverridden) {
          setForm((p) => p.recruiterId ? p : {
            ...p,
            recruiterId: res.employee._id,
            recruiterName: res.employee.fullName || res.employee.name || '',
          });
        }
      })
      .catch(() => {});
  }, [orgSlug, recruiterOverridden, form.recruiterId]);

  // Candidate typeahead state
  const [candQuery, setCandQuery] = useState('');
  const [candResults, setCandResults] = useState([]);
  const [candDropdownOpen, setCandDropdownOpen] = useState(false);
  const [candSearching, setCandSearching] = useState(false);
  const [candAnchorRect, setCandAnchorRect] = useState(null);
  const candInputRef = useRef(null);
  const candContainerRef = useRef(null);
  const candSearchTimer = useRef(null);

  // ── Skills state ─────────────────────────────────────────────────────
  // pickedSkills are skills the recruiter selected on this form (will be
  // attached to the candidate post-create). inheritedSkills are skills
  // the existing-picked candidate already has (read-only chips here).
  const [masterSkills, setMasterSkills] = useState([]);
  const [pickedSkills, setPickedSkills] = useState([]); // [{tempKey, skillId|null, skillName}]
  const [inheritedSkills, setInheritedSkills] = useState([]); // [{_id, skillId, skillName, skillLevelName}]
  const [loadingInherited, setLoadingInherited] = useState(false);

  // Skill typeahead UI state
  const [skillQuery, setSkillQuery] = useState('');
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
  const [skillAnchorRect, setSkillAnchorRect] = useState(null);
  const skillInputRef = useRef(null);
  const skillContainerRef = useRef(null);

  // ── Resume state ─────────────────────────────────────────────────────
  const [resumeFile, setResumeFile] = useState(null); // File | null
  const [existingResume, setExistingResume] = useState(null); // { fileName, url, ... } | null
  const [loadingResume, setLoadingResume] = useState(false);
  const [resumeOverride, setResumeOverride] = useState(false); // true if user uploaded a new resume despite existing one
  // 2026-05-13: recruiter must explicitly opt in to reusing the candidate's
  // resume-on-file. Silent auto-satisfaction was attaching the wrong file
  // to fresh applications.
  const [resumeConfirmed, setResumeConfirmed] = useState(false);
  // 2026-05-28: AI preview-resume — extracted skills, shown as one-click
  // suggestions on the Skills picker. previewLoading=true while OpenAI
  // round-trips (~3s). previewError holds a soft fallback message.
  const [aiPreview, setAiPreview] = useState(null); // {suggestedSkills: [{name,knownSkillId,isNew}], totalYearsExp, summary, ...} | null
  const [aiPreviewLoading, setAiPreviewLoading] = useState(false);
  const [aiPreviewError, setAiPreviewError] = useState(null);
  const aiPreviewReqRef = useRef(0);
  // Pre-flight duplicate-application banner (same candidate + same job,
  // not yet hired/refused). Server-side 409 is the source of truth; this
  // is a UX nicety to catch it before the recruiter fills the form.
  const [existingAppOnThisJob, setExistingAppOnThisJob] = useState(null); // { _id, stageName, appliedOn } | null
  const resumeInputRef = useRef(null);
  const RESUME_MAX_BYTES = 10 * 1024 * 1024;
  const RESUME_ACCEPTED_EXT = ['pdf', 'doc', 'docx'];
  const RESUME_ACCEPTED_MIME = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  // ── Load parent job ──────────────────────────────────────────────────
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
        // Approval gate (2026-05-13). Pending/rejected positions cannot
        // accept candidates — the API also blocks with 403 JOB_NOT_APPROVED
        // but pre-empting at load-time avoids the half-filled-form
        // surprise.
        if (j.approvalStatus !== 'approved') {
          showToast(
            j.approvalStatus === 'rejected'
              ? 'This position was rejected and cannot accept applications.'
              : 'This position is pending approval. Applications can be added only after it is approved.',
            'error',
          );
          navigate(orgPath(`/ats/jobs/${jobId}`), { replace: true });
          return;
        }
        setJob(j);
        // 2026-05-18 PM: recruiter no longer inherited from the job. All
        // jobs were defaulting to the shared HR Team employee, which left
        // creators with View-only access to their own new application and
        // muddled the audit trail. We now default to the logged-in user's
        // employee (resolved below via /employees/me) so the creator owns
        // the application immediately. Employment type still inherited.
        setForm((p) => ({
          ...p,
          employmentType: j.employmentType || '',
        }));
      } catch (err) {
        if (!cancelled) {
          if (handleScoped404(err)) return;
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

  // ── Load master skill list (once) ────────────────────────────────────
  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const skills = await atsApi.listSkills(orgSlug);
        if (cancelled) return;
        setMasterSkills(skills?.skills || skills?.items || []);
      } catch { /* skills are optional surface — failure is silent */ }
    })();
    return () => { cancelled = true; };
  }, [orgSlug]);

  // ── Load existing candidate's skills + resume on pick ────────────────
  useEffect(() => {
    if (!orgSlug || !form.candidateId) {
      setInheritedSkills([]);
      setExistingResume(null);
      setResumeConfirmed(false);
      setExistingAppOnThisJob(null);
      return;
    }
    let cancelled = false;
    setLoadingInherited(true);
    setLoadingResume(true);
    setResumeConfirmed(false);
    setExistingAppOnThisJob(null);
    (async () => {
      try {
        const [skillsRes, resumeRes, dupRes] = await Promise.all([
          atsApi.listCandidateSkills(orgSlug, form.candidateId).catch(() => null),
          atsApi.getCandidateResume(orgSlug, form.candidateId).catch(() => null),
          // 2026-05-17 health-check I.3: drop the applicationStatus=ongoing
          // filter so we also catch already-hired apps for the same job.
          // Hiring twice into the same role is a data-entry error and the
          // banner now flags it explicitly. We also drop the archived
          // exclusion by default so a stale archived dup is surfaced too;
          // banner copy differentiates state.
          jobId
            ? atsApi.listApplications(orgSlug, {
              jobPositionId: jobId,
              candidateId: form.candidateId,
              limit: 1,
            }).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setInheritedSkills(skillsRes?.candidateSkills || skillsRes?.skills || []);
        setExistingResume(resumeRes?.resume || null);
        const dupApp = (dupRes?.applications || [])[0] || null;
        setExistingAppOnThisJob(dupApp);
      } finally {
        if (!cancelled) {
          setLoadingInherited(false);
          setLoadingResume(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [orgSlug, form.candidateId, jobId]);

  // ── Candidate typeahead behavior ─────────────────────────────────────
  // Race guard: rapid typing can let a slow earlier request resolve
  // AFTER a fast later one, overwriting fresh results with stale ones
  // and hiding the "Create new candidate" footer when the typed query
  // doesn't match the stale set. A monotonic seq id is checked before
  // each setState; any reply with an older seq is dropped.
  const candSearchSeq = useRef(0);
  const searchCandidates = useCallback(async (q) => {
    if (!orgSlug) return;
    const mySeq = ++candSearchSeq.current;
    setCandSearching(true);
    try {
      const res = await atsApi.listCandidates(orgSlug, { search: q || '', limit: 20 });
      if (mySeq !== candSearchSeq.current) return;
      setCandResults(res?.candidates || []);
    } catch {
      if (mySeq !== candSearchSeq.current) return;
      setCandResults([]);
    } finally {
      if (mySeq === candSearchSeq.current) setCandSearching(false);
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

  // ── Skill typeahead behavior (anchor + outside click) ────────────────
  useEffect(() => {
    if (!skillDropdownOpen) return;
    const handleClick = (e) => {
      if (skillContainerRef.current && skillContainerRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-skill-typeahead]')) return;
      setSkillDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [skillDropdownOpen]);

  useEffect(() => {
    if (!skillDropdownOpen) return;
    const measure = () => {
      const node = skillInputRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      setSkillAnchorRect({ top: r.bottom, left: r.left, width: r.width });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [skillDropdownOpen]);

  // 2026-05-12 audit P1: guard against lost work on accidental tab
  // close / refresh / external nav. Considers the form "dirty" when any
  // typed field is non-empty, any skill is picked, or a resume file is
  // attached — but suppresses the prompt while saving (success nav)
  // and once the new application has been created.
  const isDirty = (
    !!form.candidateName?.trim()
    || !!form.email?.trim()
    || !!form.phone?.trim()
    || !!form.linkedinProfile?.trim()
    // recruiterId auto-populates from the logged-in employee on load, so it's
    // "dirty" on an untouched form — only count it once the user has actually
    // changed it (recruiterOverridden), otherwise the leave-site prompt fires
    // on a pristine page.
    || (recruiterOverridden && !!form.recruiterId)
    || (Array.isArray(pickedSkills) && pickedSkills.length > 0)
    || !!resumeFile
  );
  useEffect(() => {
    if (!isDirty || saving) return undefined;
    const handler = (e) => {
      e.preventDefault();
      // Modern browsers ignore the custom string; the side-effect of
      // setting returnValue is what triggers the native prompt.
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, saving]);

  // 2026-05-17 health-check E.2 reverted (2026-05-17): useBlocker
  // requires React Router's Data Router API (createBrowserRouter); this
  // app uses the legacy <BrowserRouter> declarative API, so useBlocker
  // throws "useBlocker must be used within a data router" the moment
  // the form re-renders. Beforeunload (above) still catches tab close /
  // hard refresh / external nav. Full SPA-nav block needs a migration
  // to the data router — out of scope for this fix.

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
    // Wipe any picked skills the user added before switching candidates
    // — they were attached to a different person.
    setPickedSkills([]);
    setResumeFile(null);
    setResumeOverride(false);
  };

  // ── Skill picker helpers ─────────────────────────────────────────────
  // 2026-05-12 audit P2 #16: was an inline IIFE recomputed every render
  // (every keystroke in any input → re-filter all 30+ master skills 2-3x).
  // Memoised on the three real inputs.
  const skillSuggestions = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    const usedNames = new Set([
      ...pickedSkills.map((s) => (s.skillName || '').toLowerCase()),
      ...inheritedSkills.map((s) => (s.skillName || s.name || '').toLowerCase()),
    ]);
    const candidates = masterSkills.filter((s) => !usedNames.has((s.name || '').toLowerCase()));
    if (!q) return candidates.slice(0, 30);
    return candidates
      .filter((s) => (s.name || '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [skillQuery, pickedSkills, inheritedSkills, masterSkills]);
  // This form never mints master skills (2026-06-01). Free-text creation was
  // removed, and AI suggestions are filtered to existing master skills too
  // (see toMasterMatchedSuggestions) — so both paths can only attach skills
  // that already exist. New master skills are added by an admin via Settings.
  const addPickedSkill = ({ skillId, skillName }) => {
    setPickedSkills((p) => [
      ...p,
      {
        tempKey: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        skillId: skillId || null,
        skillName,
      },
    ]);
    setSkillQuery('');
    setSkillDropdownOpen(false);
  };

  const removePickedSkill = (tempKey) => {
    setPickedSkills((p) => p.filter((s) => s.tempKey !== tempKey));
  };

  // ── Resume handlers ──────────────────────────────────────────────────
  const validateResumeFile = (file) => {
    if (!file) return 'No file selected';
    if (file.size > RESUME_MAX_BYTES) return 'File exceeds 10 MB limit';
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!RESUME_ACCEPTED_EXT.includes(ext) && !RESUME_ACCEPTED_MIME.includes(file.type)) {
      return 'Only PDF, DOC, or DOCX files are accepted';
    }
    return null;
  };

  // Keep only AI suggestions that map to an EXISTING master skill, re-matched
  // against the current master list (the single source of truth — it may have
  // changed since extraction). Unmatched suggestions are dropped so the AI path
  // can't mint new master skills, consistent with the no-free-text-mint rule.
  // Returns chips using the CANONICAL master name + id, deduped.
  const toMasterMatchedSuggestions = (rawSuggestions) => {
    const masterByLc = new Map(masterSkills.map((m) => [String(m.name).toLowerCase().trim(), m]));
    const out = [];
    const seen = new Set();
    for (const sg of (rawSuggestions || [])) {
      const name = String(sg?.name || '').trim();
      if (!name) continue;
      const m = masterByLc.get(name.toLowerCase());
      if (!m) continue;
      const key = String(m._id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: m.name, knownSkillId: String(m._id) });
    }
    return out;
  };

  const handleResumePick = (file) => {
    const err = validateResumeFile(file);
    if (err) { showToast(err, 'error'); return; }
    setResumeFile(file);
    if (existingResume) setResumeOverride(true);
    // Kick off AI preview — async, ~3s round-trip. Race-safe via seq counter.
    const mySeq = ++aiPreviewReqRef.current;
    setAiPreviewLoading(true);
    setAiPreviewError(null);
    setAiPreview(null);
    atsApi.previewResumeAi(orgSlug, file)
      .then((res) => {
        if (mySeq !== aiPreviewReqRef.current) return; // newer pick raced
        if (res?.success) setAiPreview({ ...res, suggestedSkills: toMasterMatchedSuggestions(res.suggestedSkills) });
        else setAiPreviewError(res?.error || 'AI preview unavailable');
      })
      .catch((e) => {
        if (mySeq !== aiPreviewReqRef.current) return;
        setAiPreviewError(e.message || 'AI preview unavailable');
      })
      .finally(() => {
        if (mySeq === aiPreviewReqRef.current) setAiPreviewLoading(false);
      });
  };

  // When the recruiter clicks "Use this resume" we DON'T re-run OpenAI —
  // we surface the candidate's already-extracted aiSkills (from Mongo) as
  // suggestions. Sub-100ms vs 3s, same UX.
  const handleUseExistingResume = async () => {
    setResumeConfirmed(true);
    const cid = form.candidateId;
    if (!cid) return;
    setAiPreviewLoading(true);
    setAiPreviewError(null);
    setAiPreview(null);
    try {
      const res = await atsApi.getCandidate(orgSlug, cid);
      if (!res?.success || !res.candidate) {
        setAiPreviewError('Could not load candidate AI data');
        return;
      }
      const c = res.candidate;
      const aiSkills = Array.isArray(c.aiSkills) ? c.aiSkills.slice(0, 20) : [];
      // Only suggest skills that already exist in the master picklist — the AI
      // path can't mint new master skills (see toMasterMatchedSuggestions).
      const suggestedSkills = toMasterMatchedSuggestions(aiSkills.map((name) => ({ name })));
      if (suggestedSkills.length === 0) {
        setAiPreviewError('No AI-extracted skills match the existing skill list');
        return;
      }
      setAiPreview({
        suggestedSkills,
        totalYearsExp: typeof c.aiTotalYearsExp === 'number' ? c.aiTotalYearsExp : null,
        summary: c.aiProfileSummary || '',
        // omit workHistory/education to keep the response small — we don't
        // surface those on this form
      });
    } catch (e) {
      setAiPreviewError(e?.message || 'Could not load candidate AI data');
    } finally {
      setAiPreviewLoading(false);
    }
  };

  // One-click accept a single AI-suggested skill into the picker. Proficiency
  // level is not captured on this form — set later on the candidate page.
  const acceptAiSkill = (sugg) => {
    setPickedSkills((prev) => {
      // Skip duplicates (case-insensitive on canonical name).
      const seen = new Set(prev.map((s) => String(s.skillName).toLowerCase().trim()));
      if (seen.has(String(sugg.name).toLowerCase().trim())) return prev;
      return [...prev, {
        tempKey: 'ai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        skillId: sugg.knownSkillId,
        skillName: sugg.name,
      }];
    });
  };
  const acceptAllAiSkills = () => {
    if (!aiPreview?.suggestedSkills) return;
    for (const s of aiPreview.suggestedSkills.slice(0, 8)) acceptAiSkill(s);
  };

  const handleResumeDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleResumePick(file);
  };

  // ── Validation ───────────────────────────────────────────────────────
  const trimmedName = (form.candidateName || candQuery || '').trim();
  const hasContact = !!(form.email.trim() || form.phone.trim());
  const hasRecruiter = !!form.recruiterId;
  const totalSkills = pickedSkills.length + inheritedSkills.length;
  // Skills are optional at create time — public careers applications arrive
  // without them and AI enrichment fills the gap, so the manual flow matches.
  // Resume gate: a freshly uploaded file always counts. A reused resume
  // only counts after the recruiter explicitly confirms it (was silently
  // attaching prior-application files before 2026-05-13).
  const hasResume = !!resumeFile || (!!existingResume && resumeConfirmed);
  // Hard-block only when the prior application is live (ongoing) or already
  // hired. Refused / archived priors keep the informational banner but leave
  // Create enabled — re-applying after a refusal is legitimate, and the
  // server-side 409 remains the backstop for true duplicates.
  const dupStatus = existingAppOnThisJob?.applicationStatus || 'ongoing';
  const blockedByDuplicate = !!existingAppOnThisJob
    && !existingAppOnThisJob.archived
    && (dupStatus === 'ongoing' || dupStatus === 'hired');
  const canSubmit = !!trimmedName && hasContact && hasRecruiter && hasResume
    && !blockedByDuplicate && !saving && !loadingJob && !!job;

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      // Step 1: only attach skills that map to an existing master skill. The
      // form no longer mints new master skills (neither free-text nor AI) — any
      // picked entry without a real skillId is dropped defensively.
      const resolvedSkills = pickedSkills.filter((s) => !!s.skillId);

      // Step 2: create the application (server creates / dedups candidate)
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
      const newApp = res?.application;
      const newAppId = newApp?._id;
      const newCandidateId = newApp?.candidateId || form.candidateId;
      if (!newAppId) throw new Error('Server returned no application id');

      // Step 3: attach picked skills to the candidate (idempotent on
      // (candidateId, skillId) per the importer's dedup)
      const skillFailures = [];
      for (const s of resolvedSkills) {
        if (!s.skillId) continue;
        try {
          await atsApi.addCandidateSkill(orgSlug, newCandidateId, {
            skillId: s.skillId,
          });
        } catch (err) {
          skillFailures.push(s.skillName);
        }
      }
      if (skillFailures.length) {
        showToast(`Application created but skills failed: ${skillFailures.join(', ')}`, 'warning');
      }

      // Step 4: attach the resume. Two paths:
      //   a) recruiter uploaded a new file → upload as a fresh attachment
      //   b) recruiter reused candidate's resume-on-file → clone the
      //      attachment row onto this application (shares the Cloudinary
      //      asset; delete is refcount-aware on the API side).
      // Before 2026-05-13 path (b) did nothing, leaving the new application
      // without any resume attachment of its own.
      if (resumeFile) {
        try {
          await atsApi.uploadAttachment(orgSlug, newAppId, resumeFile, true);
        } catch (err) {
          showToast('Application created, but resume upload failed — retry from the application page.', 'warning');
        }
      } else if (existingResume && resumeConfirmed) {
        try {
          await atsApi.cloneAttachment(orgSlug, newAppId, existingResume._id);
        } catch (err) {
          showToast('Application created, but reusing the resume on file failed — upload from the application page.', 'warning');
        }
      }

      showToast('Application created');
      navigate(orgPath(`/ats/applications/${newAppId}`));
    } catch (err) {
      // Surfacing the server-side approval gate (403 JOB_NOT_APPROVED) as
      // a friendly toast and a redirect back to the job — the page-load
      // pre-check above usually catches this, but the approval can be
      // flipped while the form is open.
      if (err?.code === 'JOB_NOT_APPROVED' || err?.response?.data?.code === 'JOB_NOT_APPROVED') {
        showToast(err?.message || 'This position is no longer approved for new applications.', 'error');
        navigate(orgPath(`/ats/jobs/${jobId}`), { replace: true });
        return;
      }
      // 2026-05-13: server-side duplicate-application guard (409). The
      // pre-flight banner usually catches this, but a race is possible if
      // someone else creates the same application while the form is open.
      const dupCode = err?.code || err?.response?.data?.code;
      const dupAppId = err?.applicationId || err?.response?.data?.applicationId;
      if (dupCode === 'DUPLICATE_APPLICATION') {
        showToast(err?.message || 'This candidate already has an active application on this job.', 'error');
        if (dupAppId) navigate(orgPath(`/ats/applications/${dupAppId}`), { replace: true });
        return;
      }
      showToast(err?.message || 'Failed to create application', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Loading shell ────────────────────────────────────────────────────
  if (loadingJob) return <PageSpinner label="Loading job…" />;
  if (!job) return null;

  // ── Helpers for input chrome ─────────────────────────────────────────
  const initials = (name) => {
    const parts = String(name || '').trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase()).join('') || '?';
  };

  const fieldLabel = { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, font: "500 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' };
  const req = <span style={{ color: 'var(--danger)' }}>*</span>;
  const hint = { font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 };
  const micro = { font: "500 10px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--fg-4)' };
  const sectionHead = { display: 'flex', alignItems: 'center', gap: 8, margin: 0, font: "600 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' };
  const leadIcon = { position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--fg-4)' };
  // An inherited value is tinted so the recruiter can see at a glance which
  // fields came from the picked candidate rather than from their own typing.
  const inheritedStyle = { background: 'var(--surface-3)' };
  const dropdownShell = {
    borderRadius: 9, background: 'var(--surface-2)',
    boxShadow: '0 0 0 1px var(--line-2), 0 16px 40px rgba(0,0,0,.35)',
    overflowY: 'auto',
  };
  const dropdownRow = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
    padding: '8px 12px', cursor: 'pointer', background: 'none', border: 0,
    borderBottom: '1px solid var(--line-2)',
  };
  const dropdownNote = { padding: '8px 12px', margin: 0, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };
  const avatarSm = {
    width: 26, height: 26, borderRadius: 99, flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--brand-soft)', color: 'var(--brand-ink)',
    font: "600 10px/1 'Inter', system-ui, sans-serif",
  };

  return (
    <>
      {/* Top breadcrumb bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        borderBottom: '1px solid var(--line-2)', background: 'var(--surface-1)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 7 }}>
          <button
            type="button"
            onClick={() => navigate(orgPath(`/ats/jobs/${jobId}`))}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              background: 'none', border: 0, padding: 0,
              font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
            }}
          >
            <ChevronLeft size={12} /> {job.name}
          </button>
          <ChevronRight size={11} style={{ color: 'var(--fg-4)' }} />
          <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>New Application</span>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 16px 128px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ font: "700 22px/1.25 'Inter', system-ui, sans-serif", letterSpacing: '-0.02em', color: 'var(--fg)', margin: 0 }}>New Application</h1>
          <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '6px 0 0' }}>
            Add a candidate to <span style={{ color: 'var(--fg-2)' }}>{job.name}</span>’s pipeline.
            Required fields marked with {req}.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', gap: 20, alignItems: 'start' }}>
            {/* ─── Form column ──────────────────────────────────── */}
            <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>

              {/* Candidate */}
              <Panel>
                <div style={{ display: 'grid', gap: 18, padding: 4 }}>
                  <h2 style={sectionHead}><User size={14} style={{ color: 'var(--brand-ink)' }} /> Candidate</h2>

                  <div ref={candContainerRef} style={{ position: 'relative' }}>
                    <label htmlFor="an-name" style={fieldLabel}>Name {req}</label>
                    <div style={{ position: 'relative' }}>
                      {form.candidateId ? (
                        <span style={{ ...avatarSm, position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}>
                          {initials(form.candidateName)}
                        </span>
                      ) : (
                        <Search size={13} style={leadIcon} />
                      )}
                      <input
                        id="an-name"
                        ref={candInputRef}
                        type="text"
                        value={candQuery}
                        placeholder="Search existing candidates or type a new name…"
                        onFocus={() => setCandDropdownOpen(true)}
                        onChange={(e) => {
                          setCandQuery(e.target.value);
                          setCandDropdownOpen(true);
                          if (form.candidateId) {
                            // Blank contact fields that still hold the picked
                            // candidate's values — user-typed overrides (which
                            // flip the inherited flag off) are kept. Leaving
                            // them would let the server's email-dedupe attach
                            // this application to the wrong candidate.
                            setForm((p) => ({
                              ...p,
                              candidateId: '',
                              email: inheritedFromPick.email ? '' : p.email,
                              phone: inheritedFromPick.phone ? '' : p.phone,
                              linkedinProfile: inheritedFromPick.linkedin ? '' : p.linkedinProfile,
                            }));
                            setInheritedFromPick({ email: false, phone: false, linkedin: false });
                            setInheritedSkills([]);
                            setExistingResume(null);
                            setResumeOverride(false);
                          }
                          setForm((p) => ({ ...p, candidateName: e.target.value }));
                        }}
                        required
                        autoFocus
                        style={{
                          height: 38, width: '100%', borderRadius: 'var(--r-2, 12px)',
                          paddingLeft: form.candidateId ? 40 : 32, paddingRight: 84,
                          border: 'none', outline: 'none',
                          background: 'var(--surface-2)', color: 'var(--fg)',
                          boxShadow: '0 0 0 1px var(--line)',
                          font: "450 13px/1 'Inter', system-ui, sans-serif",
                        }}
                      />
                      {form.candidateId && (
                        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}>
                          <Chip tone="brand">existing</Chip>
                        </span>
                      )}
                    </div>
                    {existingAppOnThisJob && (
                      // 2026-05-17 health-check I.3: differentiated banners
                      // for hired / refused / ongoing duplicates. The hired
                      // case is the worst-of-the-three because creating a
                      // second app for someone already onboarded is almost
                      // always a data-entry mistake.
                      (() => {
                        const status = existingAppOnThisJob.applicationStatus || 'ongoing';
                        const cfg = status === 'hired'
                          ? {
                              tone: 'danger',
                              title: 'Already hired into this role',
                              body: `${(form.candidateName || 'This candidate').trim()} is already hired for this job. Creating another application is almost certainly a mistake.`,
                            }
                          : status === 'refused'
                          ? {
                              tone: 'warn',
                              title: 'Previously refused for this job',
                              body: `${(form.candidateName || 'This candidate').trim()} was already refused for this role. Consider unrefusing the existing application instead of creating a new one.`,
                            }
                          : {
                              tone: 'warn',
                              title: 'Already applied to this job',
                              body: `${(form.candidateName || 'This candidate').trim()} has an active application here. Creating another would be a duplicate.`,
                            };
                        return (
                          <div style={{ marginTop: 8 }}>
                            <Callout tone={cfg.tone}>
                              <div style={{ font: "550 12px/1.4 'Inter', system-ui, sans-serif" }}>{cfg.title}</div>
                              <div style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", marginTop: 2 }}>{cfg.body}</div>
                              <button
                                type="button"
                                onClick={() => navigate(orgPath(`/ats/applications/${existingAppOnThisJob._id}`))}
                                style={{
                                  marginTop: 6, cursor: 'pointer', background: 'none', border: 0, padding: 0,
                                  font: "500 11.5px/1.4 'Inter', system-ui, sans-serif",
                                  color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2,
                                }}
                              >
                                Open existing application →
                              </button>
                            </Callout>
                          </div>
                        );
                      })()
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    <div>
                      <label htmlFor="an-email" style={fieldLabel}>Email</label>
                      <div style={{ position: 'relative' }}>
                        <Mail size={13} style={leadIcon} />
                        <Input
                          id="an-email"
                          type="email"
                          pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                          title="Enter a valid email like name@example.com"
                          value={form.email}
                          onChange={(e) => {
                            setForm((p) => ({ ...p, email: e.target.value }));
                            if (inheritedFromPick.email) setInheritedFromPick((p) => ({ ...p, email: false }));
                          }}
                          placeholder="john@example.com"
                          style={{ paddingLeft: 32, ...(inheritedFromPick.email ? inheritedStyle : {}) }}
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="an-phone" style={fieldLabel}>Phone</label>
                      <div style={{ position: 'relative' }}>
                        <PhoneIcon size={13} style={leadIcon} />
                        <Input
                          id="an-phone"
                          type="tel"
                          pattern="[\d\s\+\-\(\)]{7,}"
                          title="Digits, spaces, +, -, ( ) only — minimum 7 characters"
                          value={form.phone}
                          onChange={(e) => {
                            setForm((p) => ({ ...p, phone: e.target.value }));
                            if (inheritedFromPick.phone) setInheritedFromPick((p) => ({ ...p, phone: false }));
                          }}
                          placeholder="+91 90000 00000"
                          style={{ paddingLeft: 32, ...(inheritedFromPick.phone ? inheritedStyle : {}) }}
                        />
                      </div>
                    </div>
                  </div>

                  <p style={{ ...hint, color: hasContact ? 'var(--fg-4)' : 'var(--warn-ink)' }}>
                    {hasContact ? 'At least one contact method captured.' : 'At least one of email or phone is required.'}
                  </p>

                  <div>
                    <label htmlFor="an-linkedin" style={fieldLabel}>
                      LinkedIn <span style={{ color: 'var(--fg-4)' }}>(optional)</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Linkedin size={13} style={leadIcon} />
                      <Input
                        id="an-linkedin"
                        type="url"
                        value={form.linkedinProfile}
                        onChange={(e) => {
                          setForm((p) => ({ ...p, linkedinProfile: e.target.value }));
                          if (inheritedFromPick.linkedin) setInheritedFromPick((p) => ({ ...p, linkedin: false }));
                        }}
                        placeholder="https://linkedin.com/in/…"
                        style={{ paddingLeft: 32, ...(inheritedFromPick.linkedin ? inheritedStyle : {}) }}
                      />
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Resume */}
              <Panel>
                <div style={{ display: 'grid', gap: 14, padding: 4 }}>
                  <h2 style={sectionHead}>
                    <FileText size={14} style={{ color: 'var(--brand-ink)' }} />
                    Resume {req}
                    <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                      PDF, DOC, or DOCX · max 10 MB
                    </span>
                  </h2>

                  {form.candidateId && loadingResume ? (
                    <p style={{ ...hint, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Loader2 size={11} className="animate-spin" /> Looking up candidate&apos;s resume…
                    </p>
                  ) : existingResume && !resumeFile ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      padding: 14, borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)',
                      boxShadow: `inset 0 0 0 1px ${resumeConfirmed ? 'var(--brand-line)' : 'color-mix(in srgb, var(--warn-ink) 40%, transparent)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                        <FileCheck2 size={18} style={{ flexShrink: 0, color: resumeConfirmed ? 'var(--brand-ink)' : 'var(--warn-ink)' }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ font: "450 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {existingResume.fileName}
                          </div>
                          <div style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                            Resume on file
                            {existingResume.createdAt
                              ? ` · uploaded ${new Date(existingResume.createdAt).toLocaleDateString()}`
                              : ''}
                            {' · '}
                            {resumeConfirmed
                              ? <span style={{ color: 'var(--brand-ink)' }}>will be attached to this application</span>
                              : <span style={{ color: 'var(--warn-ink)' }}>confirm to reuse, or upload a new file</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {!resumeConfirmed && (
                          <Button variant="secondary" size="sm" type="button" onClick={handleUseExistingResume}>
                            Use this resume
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" type="button" onClick={() => resumeInputRef.current?.click()}>
                          Upload new
                        </Button>
                      </div>
                    </div>
                  ) : resumeFile ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      padding: 14, borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)',
                      boxShadow: '0 0 0 1px var(--line)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                        <FileCheck2 size={18} style={{ flexShrink: 0, color: 'var(--brand-ink)' }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ font: "450 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {resumeFile.name}
                          </div>
                          <div style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
                            {(resumeFile.size / 1024 / 1024).toFixed(2)} MB
                            {resumeOverride && <span style={{ marginLeft: 8, color: 'var(--warn-ink)' }}>replaces existing</span>}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="sm" type="button" style={{ color: 'var(--danger)' }}
                        onClick={() => { setResumeFile(null); setResumeOverride(false); if (resumeInputRef.current) resumeInputRef.current.value = ''; setAiPreview(null); setAiPreviewError(null); setAiPreviewLoading(false); aiPreviewReqRef.current++; }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onDrop={handleResumeDrop}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onClick={() => resumeInputRef.current?.click()}
                      style={{
                        width: '100%', padding: '32px 16px', textAlign: 'center', cursor: 'pointer',
                        borderRadius: 'var(--r-2, 12px)', border: '2px dashed var(--line-2)',
                        background: 'transparent',
                      }}
                    >
                      <Upload size={20} style={{ color: 'var(--fg-4)' }} />
                      <div style={{ font: "450 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginTop: 8 }}>
                        Drop a resume here or <span style={{ color: 'var(--brand-ink)' }}>browse</span>
                      </div>
                      <div style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 4 }}>
                        PDF, DOC, DOCX · up to 10 MB
                      </div>
                    </button>
                  )}
                  <input
                    ref={resumeInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleResumePick(f);
                    }}
                  />
                </div>
              </Panel>

              {/* Skills */}
              <Panel>
                <div style={{ display: 'grid', gap: 14, padding: 4 }}>
                  <h2 style={sectionHead}>
                    <Award size={14} style={{ color: 'var(--brand-ink)' }} />
                    Skills
                    <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>optional</span>
                  </h2>

                  {/* Pointer to the Resume section when no resume is up yet —
                      the AI suggestions panel only renders once a file is
                      picked, so without this nudge the recruiter would type
                      skills manually and miss the time-saver. */}
                  {!resumeFile && !existingResume && !aiPreviewLoading && (
                    <Callout tone="info">
                      <span style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif" }}>
                        <strong>Tip:</strong> upload the resume above and AI will suggest skills you can accept with one click.
                      </span>
                    </Callout>
                  )}

                  {/* Inherited (read-only) chips */}
                  {form.candidateId && (
                    <div>
                      <div style={{ ...micro, marginBottom: 8 }}>Already on this candidate</div>
                      {loadingInherited ? (
                        <p style={{ ...hint, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Loader2 size={11} className="animate-spin" /> Loading…
                        </p>
                      ) : inheritedSkills.length === 0 ? (
                        <p style={{ ...hint, fontStyle: 'italic' }}>None yet — pick at least one below.</p>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {inheritedSkills.map((s) => (
                            <Chip key={s._id} tone="neutral">
                              {s.skillName || s.name}
                              {s.skillLevelName && <span style={{ opacity: 0.7 }}>· {s.skillLevelName}</span>}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Picked-on-this-form chips */}
                  {pickedSkills.length > 0 && (
                    <div>
                      {form.candidateId && <div style={{ ...micro, marginBottom: 8 }}>Adding now</div>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {pickedSkills.map((s) => (
                          <span key={s.tempKey} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Chip tone="brand">{s.skillName}</Chip>
                            <button
                              type="button"
                              onClick={() => removePickedSkill(s.tempKey)}
                              aria-label={`Remove ${s.skillName}`}
                              style={{ display: 'inline-flex', cursor: 'pointer', background: 'none', border: 0, padding: 2, color: 'var(--fg-4)' }}
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI-suggested skills (2026-05-28). Rendered when a resume
                      has been picked. Each chip is a one-click accept; "+ Add all"
                      accepts the top 8 in one go. Suggestions are skipped if the
                      skill is already in pickedSkills or inheritedSkills. */}
                  {(aiPreviewLoading || aiPreview?.suggestedSkills?.length > 0 || aiPreviewError) && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 'var(--r-2, 12px)',
                      background: 'var(--brand-soft)', boxShadow: 'inset 0 0 0 1px var(--brand-line)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <div style={{ ...micro, color: 'var(--brand-ink)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 2l1.5 4.5L16 8l-4.5 1.5L10 14l-1.5-4.5L4 8l4.5-1.5L10 2z"/></svg>
                          AI-suggested from the resume
                        </div>
                        {aiPreview?.suggestedSkills?.length > 0 && (
                          <Button variant="secondary" size="sm" type="button" onClick={acceptAllAiSkills}>
                            + Add all (top {Math.min(8, aiPreview.suggestedSkills.length)})
                          </Button>
                        )}
                      </div>
                      {aiPreviewLoading && (
                        <p style={{ ...hint, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Loader2 size={11} className="animate-spin" /> Analyzing resume…
                        </p>
                      )}
                      {aiPreviewError && !aiPreviewLoading && (
                        <p style={{ ...hint, color: 'var(--warn-ink)' }}>{aiPreviewError} — please add skills manually.</p>
                      )}
                      {aiPreview?.suggestedSkills?.length > 0 && !aiPreviewLoading && (
                        <>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {aiPreview.suggestedSkills.slice(0, 12).map((sugg) => {
                              const alreadyPicked = pickedSkills.some((p) => String(p.skillName).toLowerCase().trim() === String(sugg.name).toLowerCase().trim())
                                || inheritedSkills.some((p) => String(p.skillName || p.name || '').toLowerCase().trim() === String(sugg.name).toLowerCase().trim());
                              return (
                                <button
                                  key={sugg.name}
                                  type="button"
                                  onClick={() => acceptAiSkill(sugg)}
                                  disabled={alreadyPicked}
                                  title={alreadyPicked ? 'Already added' : 'Existing skill'}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '3px 9px', borderRadius: 99,
                                    cursor: alreadyPicked ? 'default' : 'pointer',
                                    font: "450 11px/1.5 'Inter', system-ui, sans-serif",
                                    background: alreadyPicked ? 'var(--brand-soft)' : 'var(--surface-2)',
                                    color: alreadyPicked ? 'var(--brand-ink)' : 'var(--fg-2)',
                                    border: alreadyPicked ? '1px solid var(--brand-line)' : '1px dashed var(--line-strong)',
                                  }}
                                >
                                  {alreadyPicked ? '✓ ' : '+ '}{sugg.name}
                                </button>
                              );
                            })}
                          </div>
                          {aiPreview.totalYearsExp != null && (
                            <p style={{ ...hint, marginTop: 6 }}>
                              AI also estimated <span style={{ color: 'var(--fg-2)' }}>{aiPreview.totalYearsExp} years</span> of total experience.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Add skill row. Proficiency level is intentionally NOT
                      captured here — at create time recruiters are just logging
                      skills off a resume; level is set later on the candidate
                      detail page (SkillsPicker) once proficiency is assessed.
                      2026-05-17 health-check G.3: declared as a combobox so AT
                      announce "combobox, expanded/collapsed" and can address the
                      listbox via aria-controls. */}
                  <div ref={skillContainerRef} style={{ position: 'relative' }}>
                    <Search size={13} style={leadIcon} />
                    <Input
                      ref={skillInputRef}
                      type="text"
                      value={skillQuery}
                      placeholder="Search skills…"
                      aria-label="Search skills"
                      role="combobox"
                      aria-expanded={skillDropdownOpen}
                      aria-controls="skill-picker-listbox"
                      aria-autocomplete="list"
                      onFocus={() => setSkillDropdownOpen(true)}
                      onChange={(e) => {
                        setSkillQuery(e.target.value);
                        setSkillDropdownOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setSkillDropdownOpen(false);
                      }}
                      style={{ paddingLeft: 32 }}
                    />
                  </div>

                  <p style={hint}>
                    Skills are optional. Pick from existing skills or accept an AI suggestion — new skills are added by an admin in Settings.
                  </p>
                </div>
              </Panel>

              {/* Pipeline */}
              <Panel>
                <div style={{ display: 'grid', gap: 18, padding: 4 }}>
                  <h2 style={sectionHead}><GitBranch size={14} style={{ color: 'var(--brand-ink)' }} /> Pipeline</h2>

                  <div>
                    <span style={fieldLabel}>
                      Recruiter {req}
                      {!recruiterOverridden && form.recruiterId && (
                        <span title="Defaulted to you. You'll be the recruiter on this application unless you pick someone else.">
                          <Chip tone="brand">you</Chip>
                        </span>
                      )}
                    </span>
                    <div style={{
                      padding: '2px 10px', borderRadius: 'var(--r-2, 12px)',
                      background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)',
                    }}>
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
                      <p style={{ ...hint, color: 'var(--warn-ink)', marginTop: 6 }}>Recruiter is required.</p>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    <div>
                      <span style={fieldLabel}>Stage</span>
                      <div style={readOnlyBox}>New</div>
                    </div>
                    <div>
                      <span style={fieldLabel}>
                        Employment
                        {form.employmentType && <Chip tone="brand">inherited</Chip>}
                      </span>
                      <div style={readOnlyBox}>
                        {form.employmentType || <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>—</span>}
                      </div>
                    </div>
                  </div>

                  <p style={{ ...hint, lineHeight: 1.6 }}>
                    Stage starts at <span style={{ color: 'var(--fg-2)' }}>New</span>. Employment type is inherited from the linked job and editable on the application detail page after creation.
                  </p>
                </div>
              </Panel>
            </div>

            {/* ─── Right: context summary ───────────────────────── */}
            <aside style={{ minWidth: 0 }}>
              <div style={{ position: 'sticky', top: 88 }}>
                <Panel>
                  <div style={{ padding: 4 }}>
                    <h3 style={{ ...micro, display: 'flex', alignItems: 'center', gap: 7, color: 'var(--fg)', fontWeight: 600, marginBottom: 16 }}>
                      <FileText size={13} style={{ color: 'var(--brand-ink)' }} /> Summary
                    </h3>

                    <dl style={{ display: 'grid', gap: 11, margin: 0 }}>
                      <SummaryRow icon={<Briefcase size={11} />} term="Job" value={job.name} strong />
                      {job.department && <SummaryRow icon={<Building2 size={11} />} term="Dept" value={job.department} />}
                      {job.clientName && <SummaryRow icon={<Users size={11} />} term="Client" value={job.clientName} />}
                    </dl>

                    <div style={{ borderTop: '1px solid var(--line-2)', margin: '16px 0' }} />

                    <div style={{ ...micro, marginBottom: 8 }}>Will create</div>
                    <dl style={{ display: 'grid', gap: 11, margin: 0 }}>
                      <SummaryRow
                        term="Candidate"
                        strong
                        value={<>
                          {trimmedName || <span style={{ color: 'var(--fg-4)', fontStyle: 'italic' }}>unnamed</span>}
                          {form.candidateId && <span style={{ marginLeft: 6, ...micro, color: 'var(--brand-ink)' }}>existing</span>}
                        </>}
                      />
                      <SummaryRow
                        term="Recruiter"
                        value={form.recruiterName || <span style={{ color: 'var(--warn-ink)' }}>— required</span>}
                      />
                      <SummaryRow
                        term="Skills"
                        value={totalSkills > 0
                          ? `${totalSkills} total${pickedSkills.length ? ` (${pickedSkills.length} new)` : ''}`
                          : <span style={{ color: 'var(--fg-4)' }}>— none</span>}
                      />
                      <SummaryRow
                        term="Resume"
                        value={resumeFile ? resumeFile.name
                          : existingResume ? <span>on file <span style={{ color: 'var(--fg-4)' }}>(reused)</span></span>
                          : <span style={{ color: 'var(--warn-ink)' }}>— required</span>}
                      />
                    </dl>

                    <div style={{ borderTop: '1px solid var(--line-2)', margin: '16px 0' }} />

                    <div style={{ display: 'grid', gap: 6 }}>
                      <ChecklistRow ok={!!trimmedName} label="Candidate name" />
                      <ChecklistRow ok={hasContact} label="Email or phone" />
                      <ChecklistRow ok={hasRecruiter} label="Recruiter assigned" />
                      <ChecklistRow ok={hasResume} label="Resume uploaded" />
                    </div>
                  </div>
                </Panel>
              </div>
            </aside>
          </div>

          {/* Sticky bottom action bar */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
            borderTop: '1px solid var(--line-2)', background: 'var(--surface-1)',
          }}>
            <div style={{
              maxWidth: 1200, margin: '0 auto', padding: '11px 16px',
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <p style={hint}>
                {canSubmit
                  ? <span style={{ color: 'var(--fg-2)' }}>Ready to create.</span>
                  : 'Fill required fields to enable Create.'}
              </p>
              {/* mr reserve keeps the buttons clear of the global Ask-AI FAB
                  (fixed bottom-right, ~174px footprint). */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', marginRight: 168 }}>
                <Button variant="ghost" type="button" onClick={() => navigate(orgPath(`/ats/jobs/${jobId}`))}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSubmit}
                  iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}>
                  Create Application
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Candidate typeahead dropdown — portaled */}
      {candDropdownOpen && candAnchorRect && createPortal(
        <div
          data-cand-typeahead
          style={{
            ...dropdownShell,
            position: 'fixed', top: candAnchorRect.top + 4, left: candAnchorRect.left,
            width: candAnchorRect.width, zIndex: 1000, maxHeight: 288,
          }}
        >
          {candSearching && (
            <p style={{ ...dropdownNote, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={11} className="animate-spin" /> Searching…
            </p>
          )}
          {!candSearching && candResults.length === 0 && (
            <p style={dropdownNote}>
              {candQuery.trim() ? `No matches — will create new candidate "${candQuery.trim()}"` : 'Start typing to search'}
            </p>
          )}
          {/* C1 (2026-05-10): hide stale results while a fresh search is in
              flight, otherwise the dropdown shows the previous query's
              candidates as if they matched the new typed text. */}
          {!candSearching && candResults.map((c) => (
            <button key={c._id} type="button" onClick={() => pickExistingCandidate(c)} style={dropdownRow}>
              <span style={avatarSm}>{initials(c.name)}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                {(c.email || c.phone) && (
                  <span style={{ display: 'block', font: "400 10px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.email}{c.email && c.phone ? ' · ' : ''}{c.phone}
                  </span>
                )}
              </span>
            </button>
          ))}
          {!candSearching && candQuery.trim() && !candResults.some((c) => (c.name || '').trim().toLowerCase() === candQuery.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={() => {
                // Same inherited-field blanking as the retype path above —
                // keep only values the user typed themselves.
                setForm((p) => ({
                  ...p,
                  candidateId: '',
                  candidateName: candQuery.trim(),
                  email: inheritedFromPick.email ? '' : p.email,
                  phone: inheritedFromPick.phone ? '' : p.phone,
                  linkedinProfile: inheritedFromPick.linkedin ? '' : p.linkedinProfile,
                }));
                setInheritedFromPick({ email: false, phone: false, linkedin: false });
                setInheritedSkills([]);
                setExistingResume(null);
                setCandDropdownOpen(false);
              }}
              style={{ ...dropdownRow, borderTop: '1px solid var(--line-2)', borderBottom: 0, color: 'var(--brand-ink)', font: "450 11.5px/1.4 'Inter', system-ui, sans-serif" }}
            >
              <Plus size={11} /> Create new candidate &ldquo;{candQuery.trim()}&rdquo;
            </button>
          )}
        </div>,
        document.body,
      )}

      {/* Skill typeahead dropdown — portaled */}
      {skillDropdownOpen && skillAnchorRect && createPortal(
        <div
          data-skill-typeahead
          id="skill-picker-listbox"
          role="listbox"
          aria-label="Skill suggestions"
          style={{
            ...dropdownShell,
            position: 'fixed', top: skillAnchorRect.top + 4, left: skillAnchorRect.left,
            width: skillAnchorRect.width, zIndex: 1000, maxHeight: 256,
          }}
        >
          {skillSuggestions.length === 0 && (
            <p style={dropdownNote}>
              {skillQuery.trim() ? 'No matching skill — ask an admin to add it in Settings' : 'Type to search'}
            </p>
          )}
          {skillSuggestions.map((s) => (
            <button
              key={s._id}
              type="button"
              onClick={() => addPickedSkill({ skillId: String(s._id), skillName: s.name })}
              style={{ ...dropdownRow, display: 'block' }}
            >
              <span style={{ display: 'block', font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{s.name}</span>
              {s.skillTypeName && (
                <span style={{ display: 'block', font: "400 10px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{s.skillTypeName}</span>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

const readOnlyBox = {
  padding: '9px 12px', borderRadius: 'var(--r-2, 12px)',
  background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line-2)',
  font: "450 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)',
};

function SummaryRow({ icon, term, value, strong }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <dt style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
        {icon}{term}
      </dt>
      <dd style={{
        margin: 0, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        font: `${strong ? 500 : 400} 12px/1.5 'Inter', system-ui, sans-serif`,
        color: strong ? 'var(--fg)' : 'var(--fg-2)',
      }} title={typeof value === 'string' ? value : undefined}>
        {value}
      </dd>
    </div>
  );
}

function ChecklistRow({ ok, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: ok ? 'var(--brand-ink)' : 'var(--fg-4)' }}>
      <span style={{
        width: 16, height: 16, borderRadius: 99, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: ok ? 'var(--brand-soft)' : 'var(--surface-3)',
        boxShadow: ok ? 'none' : 'inset 0 0 0 1px var(--line-2)',
      }}>
        {ok ? <Check size={9} /> : <span style={{ width: 4, height: 4, borderRadius: 99, background: 'var(--fg-4)' }} />}
      </span>
      <span>{label}</span>
    </div>
  );
}
