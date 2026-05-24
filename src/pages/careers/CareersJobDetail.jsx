// ============================================================================
// CareersJobDetail — Single public job + inline apply form.
//
// Route: /careers/:orgSlug/jobs/:publicSlug
//
// Renders the Public-facing JD (with Internal description fallback handled
// server-side) and an inline application form. Submission posts multipart
// to /api/public/careers/:orgSlug/jobs/:publicSlug/apply.
// ============================================================================

import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_BASE_URL } from '../../utils/config';
import {
  Loader2, ChevronLeft, Briefcase, MapPin, Clock, Building2,
  AlertCircle, CheckCircle2, Upload, FileText, Mail, User, Phone,
  Linkedin, Send, Sparkles,
} from 'lucide-react';

const MAX_RESUME_MB = 10;
const RESUME_ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const LINKEDIN_RE = /linkedin\.com\/(in|pub)\//i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CareersJobDetail() {
  const { orgSlug, publicSlug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [job, setJob] = useState(null);
  const [org, setOrg] = useState(null);
  const [turnstile, setTurnstile] = useState({ enabled: false, siteKey: null });

  useEffect(() => {
    const prevHtml = document.documentElement.style.background;
    const prevBody = document.body.style.background;
    document.documentElement.style.background = '#fafafa';
    document.body.style.background = '#fafafa';
    return () => {
      document.documentElement.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`${API_BASE_URL}/api/public/careers/${encodeURIComponent(orgSlug)}/jobs/${encodeURIComponent(publicSlug)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) throw new Error(j.error || `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (cancelled) return;
        setJob(j.job);
        setOrg(j.org);
        setTurnstile(j.turnstile || { enabled: false });
        if (j.job?.name && j.org?.name) document.title = `${j.job.name} · ${j.org.name}`;
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load job'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgSlug, publicSlug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-zinc-100 flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-zinc-400" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">Position no longer available</h1>
          <p className="text-sm text-zinc-500 mb-6">This role may have been filled or removed. Browse other openings below.</p>
          <Link to={`/careers/${orgSlug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900 underline hover:text-zinc-700">
            <ChevronLeft size={14} /> Back to careers
          </Link>
        </div>
      </div>
    );
  }

  const accent = org?.branding?.primaryColor || '#2563eb';

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 antialiased">
      {/* Slim top bar */}
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-4xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between">
          <Link to={`/careers/${orgSlug}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            <ChevronLeft size={14} /> All openings
          </Link>
          <div className="flex items-center gap-2">
            {org?.logoUrl ? (
              <img src={org.logoUrl} alt={org.name} className="w-7 h-7 rounded-lg object-contain" />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-zinc-400" />
              </div>
            )}
            <span className="text-sm font-medium text-zinc-700">{org?.name}</span>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 sm:px-8 py-8 sm:py-12">
        {/* Job header */}
        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 mb-4">{job.name}</h1>
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-sm text-zinc-600">
            {job.department && <span className="inline-flex items-center gap-1.5"><Briefcase size={14} className="text-zinc-400" />{job.department}</span>}
            {job.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-zinc-400" />{job.location}</span>}
            {job.employmentType && <Chip>{job.employmentType}</Chip>}
            {job.hiringMode && <Chip>{job.hiringMode}</Chip>}
            {job.requiredExperience && <span className="text-zinc-600">{job.requiredExperience} experience</span>}
            {job.publishedAt && (
              <span className="inline-flex items-center gap-1.5 text-zinc-400">
                <Clock size={13} />Posted {new Date(job.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </header>

        {/* JD body */}
        <article className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 mb-8">
          {job.description ? (
            <div
              className="careers-jd prose prose-zinc max-w-none text-[15px] leading-relaxed text-zinc-800"
              dangerouslySetInnerHTML={{ __html: job.description }}
            />
          ) : (
            <p className="text-sm text-zinc-500 italic">Job description coming soon.</p>
          )}
          {job.requirements && (
            <>
              <h3 className="text-base font-semibold text-zinc-900 mt-8 mb-3">Requirements</h3>
              <div
                className="careers-jd prose prose-zinc max-w-none text-[15px] leading-relaxed text-zinc-800"
                dangerouslySetInnerHTML={{ __html: job.requirements }}
              />
            </>
          )}
        </article>

        {/* Apply card */}
        <ApplyCard
          orgSlug={orgSlug}
          publicSlug={publicSlug}
          accent={accent}
          turnstile={turnstile}
          jobName={job.name}
        />
      </main>

      <footer className="border-t border-zinc-200 mt-12">
        <div className="max-w-4xl mx-auto px-6 sm:px-8 py-6 text-xs text-zinc-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p>© {new Date().getFullYear()} {org?.name || ''}. All rights reserved.</p>
          <p>Powered by <a href="https://www.rivvra.com" className="text-zinc-500 hover:text-zinc-700 transition-colors">Rivvra</a></p>
        </div>
      </footer>
    </div>
  );
}

function Chip({ children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-700">
      {children}
    </span>
  );
}

function ApplyCard({ orgSlug, publicSlug, accent, turnstile, jobName }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);  // { applicationRef } when submitted
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', linkedinUrl: '',
  });
  const [resumeFile, setResumeFile] = useState(null);

  const setField = (k) => (e) => {
    setForm((prev) => ({ ...prev, [k]: e.target.value }));
    if (fieldErrors[k]) setFieldErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    if (f && f.size > MAX_RESUME_MB * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, resume: `Resume must be under ${MAX_RESUME_MB} MB.` }));
      setResumeFile(null);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setResumeFile(f);
    if (fieldErrors.resume) setFieldErrors((prev) => ({ ...prev, resume: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim() || form.name.trim().length < 2) errs.name = 'Enter your full name.';
    if (!EMAIL_RE.test(form.email)) errs.email = 'Enter a valid email.';
    if (form.phone.replace(/[^\d]/g, '').length < 7) errs.phone = 'Enter a valid phone number.';
    if (!LINKEDIN_RE.test(form.linkedinUrl)) errs.linkedinUrl = 'Enter your LinkedIn profile URL.';
    if (!resumeFile) errs.resume = 'Attach your resume (PDF, DOC, or DOCX).';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('email', form.email.trim());
      fd.append('phone', form.phone.trim());
      fd.append('linkedinUrl', form.linkedinUrl.trim());
      fd.append('resume', resumeFile);
      // Turnstile token would go here when enabled. The server's verifier
      // returns true when CAREERS_TURNSTILE_ENABLED isn't 'true', so the
      // field-omitted-while-flag-off path is intentionally tolerated.
      if (turnstile?.enabled) {
        // Future: read window.turnstile widget response. For now we leave
        // it empty — server rejects empty tokens with TURNSTILE_FAILED
        // only when the flag is on, which is opt-in.
      }
      const res = await fetch(
        `${API_BASE_URL}/api/public/careers/${encodeURIComponent(orgSlug)}/jobs/${encodeURIComponent(publicSlug)}/apply`,
        { method: 'POST', body: fd },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) {
        if (j.fieldErrors) setFieldErrors(j.fieldErrors);
        setServerError(j.error || `Submission failed (HTTP ${res.status}).`);
        return;
      }
      setDone({ ref: j.applicationRef || '—' });
    } catch (err) {
      setServerError(err.message || 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-8 sm:p-10 text-center" id="apply">
        <div
          className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4"
          style={{ background: `${accent}15`, color: accent }}
        >
          <CheckCircle2 size={28} />
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 mb-2">Application received</h2>
        <p className="text-sm text-zinc-600 max-w-md mx-auto">
          Thanks for applying to <span className="font-medium text-zinc-900">{jobName}</span>. Our team will reach out if your profile is a fit.
        </p>
        <p className="text-xs text-zinc-400 mt-4">Reference · <span className="font-mono">{done.ref}</span></p>
      </div>
    );
  }

  return (
    <form id="apply" onSubmit={handleSubmit} className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={16} style={{ color: accent }} />
        <h2 className="text-lg font-semibold text-zinc-900">Apply for this position</h2>
      </div>

      {serverError && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field icon={User} label="Full name" required error={fieldErrors.name}>
          <input
            type="text"
            value={form.name}
            onChange={setField('name')}
            placeholder="Jane Doe"
            className={inputCls(fieldErrors.name)}
            autoComplete="name"
            maxLength={100}
          />
        </Field>
        <Field icon={Mail} label="Email" required error={fieldErrors.email}>
          <input
            type="email"
            value={form.email}
            onChange={setField('email')}
            placeholder="jane@example.com"
            className={inputCls(fieldErrors.email)}
            autoComplete="email"
            maxLength={120}
          />
        </Field>
        <Field icon={Phone} label="Phone" required error={fieldErrors.phone}>
          <input
            type="tel"
            value={form.phone}
            onChange={setField('phone')}
            placeholder="+1 555 123 4567"
            className={inputCls(fieldErrors.phone)}
            autoComplete="tel"
            maxLength={30}
          />
        </Field>
        <Field icon={Linkedin} label="LinkedIn profile" required error={fieldErrors.linkedinUrl}>
          <input
            type="url"
            value={form.linkedinUrl}
            onChange={setField('linkedinUrl')}
            placeholder="https://linkedin.com/in/your-handle"
            className={inputCls(fieldErrors.linkedinUrl)}
            maxLength={250}
          />
        </Field>
      </div>

      {/* Resume */}
      <div className="mt-4">
        <label className="block text-xs font-medium text-zinc-600 mb-1.5">
          Resume <span className="text-red-500">*</span>
        </label>
        <label
          className={`flex items-center justify-between gap-3 px-4 py-3 border border-dashed rounded-lg cursor-pointer transition-colors ${
            fieldErrors.resume ? 'border-red-300 bg-red-50/30' : 'border-zinc-300 hover:border-zinc-400 bg-zinc-50/40'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0">
              {resumeFile ? <FileText className="w-4 h-4 text-zinc-600" /> : <Upload className="w-4 h-4 text-zinc-500" />}
            </div>
            <div className="min-w-0">
              {resumeFile ? (
                <>
                  <p className="text-sm text-zinc-900 truncate">{resumeFile.name}</p>
                  <p className="text-[11px] text-zinc-500">{(resumeFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-zinc-700">Click to upload resume</p>
                  <p className="text-[11px] text-zinc-500">PDF, DOC, or DOCX · up to {MAX_RESUME_MB} MB</p>
                </>
              )}
            </div>
          </div>
          <span className="text-xs font-medium text-zinc-700 hover:text-zinc-900">Browse</span>
          <input
            ref={fileRef}
            type="file"
            accept={RESUME_ACCEPT}
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
        {fieldErrors.resume && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.resume}</p>}
      </div>

      {turnstile?.enabled && (
        <p className="mt-4 text-xs text-zinc-500">
          Protected by Cloudflare Turnstile.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
        style={{ background: accent }}
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {submitting ? 'Submitting…' : 'Submit application'}
      </button>

      <p className="mt-4 text-[11px] text-zinc-500 leading-relaxed">
        By submitting, you consent to your information being processed for recruitment purposes.
      </p>
    </form>
  );
}

function Field({ icon: Icon, label, required, error, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1.5">
        <span className="inline-flex items-center gap-1.5">
          <Icon size={12} className="text-zinc-400" />
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function inputCls(error) {
  return `w-full px-3 py-2 bg-white border rounded-lg text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 transition-colors ${
    error
      ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
      : 'border-zinc-200 focus:ring-zinc-200 focus:border-zinc-300'
  }`;
}
