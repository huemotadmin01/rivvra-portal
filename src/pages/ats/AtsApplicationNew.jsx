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
import {
  ChevronLeft, ChevronRight, Loader2, User, Search, Plus, Briefcase,
  Mail, Phone as PhoneIcon, Linkedin, Building2, GitBranch, Users,
  FileText, Check, Award, X, Upload, FileCheck2,
} from 'lucide-react';

/**
 * AtsApplicationNew — routed create flow for new applications under a
 * specific Job Position. Reachable only from /ats/jobs/:jobId/applications/new
 *
 * Locked behavior 2026-05-10:
 *  - Recruiter required (typeahead, prefills from job).
 *  - Candidate name + (email OR phone) required.
 *  - At least one skill required (existing-candidate's tagged skills count
 *    toward the gate; new picks union into the candidate's skill set).
 *  - Resume required: existing-candidate's prior resume satisfies the gate;
 *    new candidates must upload one (PDF/DOC/DOCX, ≤10 MB).
 *  - Source intentionally absent — edited later on the application detail
 *    page. Account Owner / Client Name / Account Mgr inherited from job.
 *
 * Submit is multi-step on purpose (per Q9-B): create application first,
 * then attach skills + upload resume against the returned application's
 * candidateId / _id. Reuses existing endpoints; no new code paths.
 */
export default function AtsApplicationNew() {
  const { jobId } = useParams();
  const { currentOrg } = useOrg();
  const { orgPath } = usePlatform();
  const { showToast } = useToast();
  const navigate = useNavigate();

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
  const [skillLevels, setSkillLevels] = useState([]);
  const [pickedSkills, setPickedSkills] = useState([]); // [{tempKey, skillId|null, skillName, levelId|'', levelName|'', isNew}]
  const [inheritedSkills, setInheritedSkills] = useState([]); // [{_id, skillId, skillName, skillLevelName}]
  const [loadingInherited, setLoadingInherited] = useState(false);

  // Skill typeahead UI state
  const [skillQuery, setSkillQuery] = useState('');
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
  const [skillAnchorRect, setSkillAnchorRect] = useState(null);
  const [pendingLevelId, setPendingLevelId] = useState('');
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

  // ── Load master skill list + levels (once) ───────────────────────────
  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const [skills, levels] = await Promise.all([
          atsApi.listSkills(orgSlug),
          atsApi.listSkillLevels(orgSlug),
        ]);
        if (cancelled) return;
        setMasterSkills(skills?.skills || skills?.items || []);
        const ls = levels?.skillLevels || levels?.items || [];
        setSkillLevels([...ls].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)));
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
    || !!form.recruiterId
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
  const exactSkillMatch = skillSuggestions.find(
    (s) => (s.name || '').trim().toLowerCase() === skillQuery.trim().toLowerCase(),
  );
  const showSkillCreateOption = skillQuery.trim().length > 0 && !exactSkillMatch && !pickedSkills.some(
    (s) => (s.skillName || '').trim().toLowerCase() === skillQuery.trim().toLowerCase(),
  ) && !inheritedSkills.some(
    (s) => (s.skillName || s.name || '').trim().toLowerCase() === skillQuery.trim().toLowerCase(),
  );

  const addPickedSkill = ({ skillId, skillName, isNew }) => {
    const levelDoc = pendingLevelId ? skillLevels.find((l) => String(l._id) === String(pendingLevelId)) : null;
    setPickedSkills((p) => [
      ...p,
      {
        tempKey: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        skillId: skillId || null,
        skillName,
        levelId: levelDoc ? String(levelDoc._id) : '',
        levelName: levelDoc ? levelDoc.name : '',
        isNew: !!isNew,
      },
    ]);
    setSkillQuery('');
    setSkillDropdownOpen(false);
    setPendingLevelId('');
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

  const handleResumePick = (file) => {
    const err = validateResumeFile(file);
    if (err) { showToast(err, 'error'); return; }
    setResumeFile(file);
    if (existingResume) setResumeOverride(true);
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
  const hasSkill = totalSkills >= 1;
  // Resume gate: a freshly uploaded file always counts. A reused resume
  // only counts after the recruiter explicitly confirms it (was silently
  // attaching prior-application files before 2026-05-13).
  const hasResume = !!resumeFile || (!!existingResume && resumeConfirmed);
  const blockedByDuplicate = !!existingAppOnThisJob;
  const canSubmit = !!trimmedName && hasContact && hasRecruiter && hasSkill && hasResume
    && !blockedByDuplicate && !saving && !loadingJob && !!job;

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      // Step 1: resolve any "new" master skills to real ids
      const resolvedSkills = [];
      for (const s of pickedSkills) {
        if (s.isNew) {
          try {
            const created = await atsApi.createSkill(orgSlug, { name: s.skillName });
            const newId = created?.skill?._id;
            if (!newId) throw new Error(`Failed to create skill "${s.skillName}"`);
            resolvedSkills.push({ ...s, skillId: String(newId), isNew: false });
          } catch (err) {
            showToast(err?.message || `Failed to create skill "${s.skillName}"`, 'error');
            setSaving(false);
            return;
          }
        } else {
          resolvedSkills.push(s);
        }
      }

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
            ...(s.levelId ? { skillLevelId: s.levelId } : {}),
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
  if (loadingJob) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
      </div>
    );
  }
  if (!job) return null;

  // ── Helpers for input chrome ─────────────────────────────────────────
  const initials = (name) => {
    const parts = String(name || '').trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase()).join('') || '?';
  };
  const inputBase = 'w-full bg-dark-900/60 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-100 placeholder:text-dark-600 focus:border-rivvra-500/60 focus:outline-none focus:ring-2 focus:ring-rivvra-500/20 transition-all';
  const inputWithIcon = `${inputBase} pl-9`;
  const inheritedBg = 'bg-dark-900/30';

  return (
    <>
      {/* Top breadcrumb bar */}
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">New Application</h1>
          <p className="text-dark-400 text-sm mt-1.5">
            Add a candidate to <span className="text-dark-200">{job.name}</span>’s pipeline.
            Required fields marked with <span className="text-red-400">*</span>.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* ─── Form column ──────────────────────────────────── */}
            <div className="lg:col-span-3 space-y-6">

              {/* Candidate */}
              <section className="card p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-rivvra-300" />
                  <h2 className="text-sm font-semibold text-white tracking-wide">Candidate</h2>
                </div>

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
                          setInheritedSkills([]);
                          setExistingResume(null);
                          setResumeOverride(false);
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
                            border: 'border-red-500/40 bg-red-500/10 text-red-200',
                            buttonCls: 'text-red-100',
                            title: 'Already hired into this role',
                            body: `${(form.candidateName || 'This candidate').trim()} is already hired for this job. Creating another application is almost certainly a mistake.`,
                          }
                        : status === 'refused'
                        ? {
                            border: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
                            buttonCls: 'text-amber-100',
                            title: 'Previously refused for this job',
                            body: `${(form.candidateName || 'This candidate').trim()} was already refused for this role. Consider unrefusing the existing application instead of creating a new one.`,
                          }
                        : {
                            border: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
                            buttonCls: 'text-amber-100',
                            title: 'Already applied to this job',
                            body: `${(form.candidateName || 'This candidate').trim()} has an active application here. Creating another would be a duplicate.`,
                          };
                      return (
                        <div className={`mt-2 rounded-lg border p-3 text-xs ${cfg.border}`}>
                          <div className="font-medium mb-0.5">{cfg.title}</div>
                          <div className="opacity-80">{cfg.body}</div>
                          <button
                            type="button"
                            onClick={() => navigate(orgPath(`/ats/applications/${existingAppOnThisJob._id}`))}
                            className={`mt-1.5 underline underline-offset-2 hover:text-white ${cfg.buttonCls}`}
                          >
                            Open existing application →
                          </button>
                        </div>
                      );
                    })()
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-dark-300 mb-1.5">Email</label>
                    <div className="relative">
                      <Mail size={13} className="text-dark-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
                        title="Enter a valid email like name@example.com"
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
                        pattern="[\d\s\+\-\(\)]{7,}"
                        title="Digits, spaces, +, -, ( ) only — minimum 7 characters"
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

              {/* Skills */}
              <section className="card p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Award size={14} className="text-rivvra-300" />
                  <h2 className="text-sm font-semibold text-white tracking-wide">
                    Skills <span className="text-red-400">*</span>
                    <span className="ml-2 text-[11px] font-normal text-dark-500">at least one required</span>
                  </h2>
                </div>

                {/* Inherited (read-only) chips */}
                {form.candidateId && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-dark-500 mb-2">Already on this candidate</div>
                    {loadingInherited ? (
                      <div className="text-xs text-dark-500 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Loading…</div>
                    ) : inheritedSkills.length === 0 ? (
                      <div className="text-xs text-dark-500 italic">None yet — pick at least one below.</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {inheritedSkills.map((s) => (
                          <span key={s._id} className="inline-flex items-center gap-1 bg-dark-800 border border-dark-700 text-dark-300 text-xs px-2 py-1 rounded-full">
                            {s.skillName || s.name}
                            {s.skillLevelName && <span className="text-dark-500 text-[10px]">· {s.skillLevelName}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Picked-on-this-form chips */}
                {pickedSkills.length > 0 && (
                  <div>
                    {form.candidateId && <div className="text-[10px] uppercase tracking-wider text-dark-500 mb-2">Adding now</div>}
                    <div className="flex flex-wrap gap-1.5">
                      {pickedSkills.map((s) => (
                        <span key={s.tempKey} className="inline-flex items-center gap-1 bg-rivvra-500/10 border border-rivvra-500/20 text-rivvra-200 text-xs px-2 py-1 rounded-full">
                          {s.skillName}
                          {s.levelName && <span className="text-rivvra-300/70 text-[10px]">· {s.levelName}</span>}
                          {s.isNew && <span className="text-[9px] uppercase tracking-wider text-emerald-300 ml-0.5">new</span>}
                          <button
                            type="button"
                            onClick={() => removePickedSkill(s.tempKey)}
                            className="text-rivvra-300/60 hover:text-red-400 transition-colors ml-0.5"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add skill row */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
                  {/* 2026-05-17 health-check G.3: declared as a combobox
                      so AT announce "combobox, expanded/collapsed" and
                      can address the listbox via aria-controls. */}
                  <div ref={skillContainerRef} className="relative">
                    <Search size={13} className="text-dark-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={skillInputRef}
                      type="text"
                      value={skillQuery}
                      placeholder="Search or create a skill…"
                      aria-label="Search or create a skill"
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
                        if (e.key === 'Enter' && showSkillCreateOption) {
                          e.preventDefault();
                          addPickedSkill({ skillName: skillQuery.trim(), isNew: true });
                        }
                      }}
                      className={`${inputWithIcon}`}
                    />
                  </div>
                  <select
                    value={pendingLevelId}
                    onChange={(e) => setPendingLevelId(e.target.value)}
                    className={inputBase}
                    aria-label="Skill level (optional)"
                  >
                    <option value="">Level (optional)</option>
                    {skillLevels.map((l) => (
                      <option key={l._id} value={l._id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                <p className="text-xs text-dark-500">
                  Picked skills attach to the candidate on submit. Existing-candidate skills already count toward the requirement.
                </p>
              </section>

              {/* Resume */}
              <section className="card p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-rivvra-300" />
                  <h2 className="text-sm font-semibold text-white tracking-wide">
                    Resume <span className="text-red-400">*</span>
                    <span className="ml-2 text-[11px] font-normal text-dark-500">PDF, DOC, or DOCX · max 10 MB</span>
                  </h2>
                </div>

                {form.candidateId && loadingResume ? (
                  <div className="text-xs text-dark-500 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Looking up candidate's resume…</div>
                ) : existingResume && !resumeFile ? (
                  <div className={`bg-dark-900/40 border rounded-lg p-4 flex items-center justify-between gap-3 ${resumeConfirmed ? 'border-emerald-500/40' : 'border-amber-500/30'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <FileCheck2 size={18} className={`flex-shrink-0 ${resumeConfirmed ? 'text-emerald-400' : 'text-amber-300'}`} />
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{existingResume.fileName}</div>
                        <div className="text-[11px] text-dark-500">
                          Resume on file
                          {existingResume.createdAt
                            ? ` · uploaded ${new Date(existingResume.createdAt).toLocaleDateString()}`
                            : ''}
                          {' · '}
                          {resumeConfirmed
                            ? <span className="text-emerald-300">will be attached to this application</span>
                            : <span className="text-amber-200">confirm to reuse, or upload a new file</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!resumeConfirmed && (
                        <button
                          type="button"
                          onClick={() => setResumeConfirmed(true)}
                          className="text-xs px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                        >
                          Use this resume
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => resumeInputRef.current?.click()}
                        className="text-xs text-rivvra-300 hover:text-rivvra-200"
                      >
                        Upload new
                      </button>
                    </div>
                  </div>
                ) : resumeFile ? (
                  <div className="bg-dark-900/40 border border-dark-700 rounded-lg p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileCheck2 size={18} className="text-emerald-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{resumeFile.name}</div>
                        <div className="text-[11px] text-dark-500">
                          {(resumeFile.size / 1024 / 1024).toFixed(2)} MB
                          {resumeOverride && <span className="ml-2 text-amber-400/80">replaces existing</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setResumeFile(null); setResumeOverride(false); if (resumeInputRef.current) resumeInputRef.current.value = ''; }}
                      className="text-xs text-dark-400 hover:text-red-400 flex-shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div
                    onDrop={handleResumeDrop}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onClick={() => resumeInputRef.current?.click()}
                    className="border-2 border-dashed border-dark-700 rounded-lg p-8 text-center cursor-pointer hover:border-rivvra-500/40 hover:bg-dark-900/30 transition-colors"
                  >
                    <Upload size={20} className="text-dark-500 mx-auto mb-2" />
                    <div className="text-sm text-dark-300">Drop a resume here or <span className="text-rivvra-300">browse</span></div>
                    <div className="text-[11px] text-dark-500 mt-1">PDF, DOC, DOCX · up to 10 MB</div>
                  </div>
                )}
                <input
                  ref={resumeInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleResumePick(f);
                  }}
                />
              </section>

              {/* Pipeline */}
              <section className="card p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <GitBranch size={14} className="text-rivvra-300" />
                  <h2 className="text-sm font-semibold text-white tracking-wide">Pipeline</h2>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-dark-300 mb-1.5">
                    Recruiter <span className="text-red-400">*</span>
                    {!recruiterOverridden && form.recruiterId && (
                      <span
                        className="text-[9px] uppercase tracking-wider bg-rivvra-500/10 text-rivvra-300 px-1.5 py-0.5 rounded"
                        title="Defaulted to you. You'll be the recruiter on this application unless you pick someone else."
                      >
                        you
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-dark-300 mb-1.5 block">Stage</label>
                    <div className="px-3 py-2 bg-dark-900/30 border border-dark-800 rounded-lg text-sm text-dark-200">New</div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-dark-300 mb-1.5">
                      Employment
                      {form.employmentType && (
                        <span className="text-[9px] uppercase tracking-wider bg-rivvra-500/10 text-rivvra-300 px-1.5 py-0.5 rounded">inherited</span>
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

            {/* ─── Right: context summary ───────────────────────── */}
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
                      <dt className="text-dark-400 text-xs">Skills</dt>
                      <dd className="text-dark-200 text-right">
                        {totalSkills > 0
                          ? `${totalSkills} total${pickedSkills.length ? ` (${pickedSkills.length} new)` : ''}`
                          : <span className="text-amber-400/80">— required</span>}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-dark-400 text-xs">Resume</dt>
                      <dd className="text-dark-200 text-right truncate">
                        {resumeFile ? resumeFile.name
                          : existingResume ? <span>on file <span className="text-[10px] text-dark-500">(reused)</span></span>
                          : <span className="text-amber-400/80">— required</span>}
                      </dd>
                    </div>
                  </dl>

                  <div className="border-t border-dark-800 my-4" />

                  <div className="space-y-1.5">
                    <ChecklistRow ok={!!trimmedName} label="Candidate name" />
                    <ChecklistRow ok={hasContact} label="Email or phone" />
                    <ChecklistRow ok={hasRecruiter} label="Recruiter assigned" />
                    <ChecklistRow ok={hasSkill} label="At least one skill" />
                    <ChecklistRow ok={hasResume} label="Resume uploaded" />
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* Sticky bottom action bar */}
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

      {/* Candidate typeahead dropdown — portaled */}
      {candDropdownOpen && candAnchorRect && createPortal(
        <div
          data-cand-typeahead
          style={{ position: 'fixed', top: candAnchorRect.top + 4, left: candAnchorRect.left, width: candAnchorRect.width, zIndex: 1000 }}
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
          {/* C1 (2026-05-10): hide stale results while a fresh search is in
              flight, otherwise the dropdown shows the previous query's
              candidates as if they matched the new typed text. */}
          {!candSearching && candResults.map((c) => (
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
          {!candSearching && candQuery.trim() && !candResults.some((c) => (c.name || '').trim().toLowerCase() === candQuery.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={() => {
                setForm((p) => ({ ...p, candidateId: '', candidateName: candQuery.trim() }));
                setInheritedFromPick({ email: false, phone: false, linkedin: false });
                setInheritedSkills([]);
                setExistingResume(null);
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

      {/* Skill typeahead dropdown — portaled */}
      {skillDropdownOpen && skillAnchorRect && createPortal(
        <div
          data-skill-typeahead
          id="skill-picker-listbox"
          role="listbox"
          aria-label="Skill suggestions"
          style={{ position: 'fixed', top: skillAnchorRect.top + 4, left: skillAnchorRect.left, width: skillAnchorRect.width, zIndex: 1000 }}
          className="bg-dark-800 border border-dark-600 rounded-lg shadow-2xl max-h-64 overflow-y-auto"
        >
          {showSkillCreateOption && (
            <button
              type="button"
              onClick={() => addPickedSkill({ skillName: skillQuery.trim(), isNew: true })}
              className="w-full text-left px-3 py-2 text-xs text-rivvra-300 hover:bg-dark-700 border-b border-dark-700/50 flex items-center gap-1.5"
            >
              <Plus size={11} /> Create &ldquo;{skillQuery.trim()}&rdquo;
            </button>
          )}
          {skillSuggestions.length === 0 && !showSkillCreateOption && (
            <div className="px-3 py-2 text-xs text-dark-500">
              {skillQuery.trim() ? 'No matching skills' : 'Type to search'}
            </div>
          )}
          {skillSuggestions.map((s) => (
            <button
              key={s._id}
              type="button"
              onClick={() => addPickedSkill({ skillId: String(s._id), skillName: s.name, isNew: false })}
              className="w-full text-left px-3 py-2 hover:bg-dark-700 border-b border-dark-700/50 last:border-0"
            >
              <div className="text-xs text-white">{s.name}</div>
              {s.skillTypeName && <div className="text-[10px] text-dark-400">{s.skillTypeName}</div>}
            </button>
          ))}
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
