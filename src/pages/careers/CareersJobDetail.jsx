// ============================================================================
// CareersJobDetail — Single public job + Apply (redesigned 2026-05-24).
//
// Route: /careers/:orgSlug/jobs/:publicSlug
//
// Design:
//   Desktop: two-column — JD on the left (scrollable, readable prose) and a
//            sticky Apply card on the right that stays in view as you scroll.
//   Mobile:  single column with a floating "Apply for this role" pill at the
//            bottom that opens a bottom-sheet form. Submit success swaps in
//            an animated check-in card.
// ============================================================================

import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../../utils/config';
import {
  Loader2, ChevronLeft, Briefcase, MapPin, Clock, Building2,
  AlertCircle, CheckCircle2, Upload, FileText, Mail, User, Phone,
  Linkedin, Send, X, ArrowRight,
} from 'lucide-react';

const MAX_RESUME_MB = 10;
const RESUME_ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const LINKEDIN_RE = /linkedin\.com\/(in|pub)\//i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_ACCENT = '#5b6cff';

export default function CareersJobDetail() {
  const { orgSlug, publicSlug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [job, setJob] = useState(null);
  const [org, setOrg] = useState(null);
  const [turnstile, setTurnstile] = useState({ enabled: false, siteKey: null });
  const [mobileApplyOpen, setMobileApplyOpen] = useState(false);

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

  if (loading) return <FullPageLoader />;
  if (error || !job) return <NotFound orgSlug={orgSlug} />;

  const accent = org?.branding?.primaryColor || DEFAULT_ACCENT;

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 antialiased" style={{ '--accent': accent }}>
      {/* Slim top bar — shows the job's specific company logo + name (the
          entity the candidate would actually join), not the org shell. */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-zinc-200/60">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
          <Link to={`/careers/${orgSlug}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            <ChevronLeft size={15} /> All openings
          </Link>
          <Link to={`/careers/${orgSlug}`} className="flex items-center gap-2 group">
            <CompanyLogoOrFallback url={job.companyLogoUrl || org?.logoUrl} alt={job.companyName || org?.name} />
            <span className="hidden sm:inline text-sm font-medium text-zinc-700 group-hover:text-zinc-900 transition-colors">{job.companyName || org?.name}</span>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 sm:px-8 py-10 sm:py-16 pb-32 lg:pb-16">
        {/* Job header */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 max-w-3xl"
        >
          {job.companyName && (
            <div className="flex items-center gap-2.5 mb-3">
              <CompanyLogoOrFallback url={job.companyLogoUrl} alt={job.companyName} size={32} />
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{job.companyName}</p>
            </div>
          )}
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900 leading-[1.1]">{job.name}</h1>
          <div className="mt-4 flex items-center gap-x-4 gap-y-2 flex-wrap text-sm text-zinc-600">
            {job.department && <span className="inline-flex items-center gap-1.5"><Briefcase size={14} className="text-zinc-400" />{job.department}</span>}
            {job.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-zinc-400" />{job.location}</span>}
            {job.employmentType && <Chip>{job.employmentType}</Chip>}
            {job.hiringMode && <Chip>{job.hiringMode}</Chip>}
            {job.requiredExperience && <span className="text-zinc-600">{job.requiredExperience} experience</span>}
          </div>
          {job.publishedAt && (
            <p className="mt-3 text-xs text-zinc-400 inline-flex items-center gap-1.5">
              <Clock size={12} /> Posted {new Date(job.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </motion.header>

        {/* Two-column layout on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
          {/* JD */}
          <motion.article
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7"
          >
            {job.description ? (
              <div
                className="careers-jd text-[15.5px] leading-[1.7] text-zinc-700 [&_p]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-zinc-900 [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-900 [&_h3]:mt-6 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_li]:mb-1 [&_strong]:text-zinc-900 [&_a]:underline [&_a]:text-zinc-900"
                dangerouslySetInnerHTML={{ __html: job.description }}
              />
            ) : (
              <p className="text-sm text-zinc-500 italic">Job description coming soon.</p>
            )}
            {job.requirements && (
              <>
                <h2 className="text-xl font-semibold text-zinc-900 mt-10 mb-3">Requirements</h2>
                <div
                  className="careers-jd text-[15.5px] leading-[1.7] text-zinc-700 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_li]:mb-1"
                  dangerouslySetInnerHTML={{ __html: job.requirements }}
                />
              </>
            )}
          </motion.article>

          {/* Apply card — sticky on desktop, hidden on mobile (mobile uses floating CTA + sheet) */}
          <aside className="lg:col-span-5 hidden lg:block">
            <div className="sticky top-24">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <ApplyCard
                  orgSlug={orgSlug}
                  publicSlug={publicSlug}
                  accent={accent}
                  turnstile={turnstile}
                  jobName={job.name}
                />
              </motion.div>
            </div>
          </aside>
        </div>
      </main>

      {/* Mobile floating CTA */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 px-4 pb-4 pt-3 bg-gradient-to-t from-[#fafafa] via-[#fafafa]/95 to-transparent">
        <button
          onClick={() => setMobileApplyOpen(true)}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-full text-sm font-medium text-white shadow-lg active:scale-[0.98] transition-transform"
          style={{ background: accent, boxShadow: `0 8px 24px -8px ${accent}80` }}
        >
          Apply for this role <ArrowRight size={16} />
        </button>
      </div>

      {/* Mobile bottom sheet */}
      <AnimatePresence>
        {mobileApplyOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-sm"
              onClick={() => setMobileApplyOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white border-b border-zinc-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
                <div className="w-8 h-1 bg-zinc-200 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 -top-3" />
                <p className="text-sm font-semibold text-zinc-900">Apply</p>
                <button onClick={() => setMobileApplyOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
                  <X size={16} className="text-zinc-500" />
                </button>
              </div>
              <div className="px-5 py-5">
                <ApplyCard
                  orgSlug={orgSlug}
                  publicSlug={publicSlug}
                  accent={accent}
                  turnstile={turnstile}
                  jobName={job.name}
                  embedded
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Footer org={org} />
    </div>
  );
}

// ─── apply card ────────────────────────────────────────────────────────────

function ApplyCard({ orgSlug, publicSlug, accent, turnstile, jobName, embedded = false }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const fileRef = useRef(null);

  const [form, setForm] = useState({ name: '', email: '', phone: '', linkedinUrl: '' });
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
      // Referral attribution: if the candidate arrived via a recruiter's
      // personal link (?ref=<empId>), forward that to the backend so the
      // application's recruiterId becomes the link owner instead of the
      // org default. Invalid/missing → backend silently falls back.
      const refParam = new URLSearchParams(window.location.search).get('ref');
      if (refParam) fd.append('ref', refParam.trim());
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

  const wrapperCls = embedded ? '' : 'bg-white border border-zinc-200/80 rounded-3xl p-6 sm:p-7 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.12)]';

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={wrapperCls}
      >
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.34, 1.56, 0.64, 1] }}
          className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4"
          style={{ background: `${accent}15`, color: accent }}
        >
          <CheckCircle2 size={28} />
        </motion.div>
        <h2 className="text-xl font-semibold text-zinc-900 mb-2 text-center">Application received</h2>
        <p className="text-sm text-zinc-600 max-w-md mx-auto text-center">
          Thanks for applying to <span className="font-medium text-zinc-900">{jobName}</span>. Our team will reach out if your profile is a fit.
        </p>
        <p className="text-xs text-zinc-400 mt-4 text-center">Reference · <span className="font-mono">{done.ref}</span></p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={wrapperCls}>
      {!embedded && (
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-1">Apply</p>
          <h2 className="text-lg font-semibold text-zinc-900">Submit your application</h2>
          <p className="text-xs text-zinc-500 mt-1">Takes ~2 minutes. We read every application.</p>
        </div>
      )}

      <AnimatePresence>
        {serverError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{serverError}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        <Field icon={User} label="Full name" required error={fieldErrors.name}>
          <input
            type="text" value={form.name} onChange={setField('name')}
            placeholder="Jane Doe"
            className={inputCls(fieldErrors.name, accent)}
            autoComplete="name" maxLength={100}
          />
        </Field>
        <Field icon={Mail} label="Email" required error={fieldErrors.email}>
          <input
            type="email" value={form.email} onChange={setField('email')}
            placeholder="jane@example.com"
            className={inputCls(fieldErrors.email, accent)}
            autoComplete="email" maxLength={120}
          />
        </Field>
        <Field icon={Phone} label="Phone" required error={fieldErrors.phone}>
          <input
            type="tel" value={form.phone} onChange={setField('phone')}
            placeholder="+1 555 123 4567"
            className={inputCls(fieldErrors.phone, accent)}
            autoComplete="tel" maxLength={30}
          />
        </Field>
        <Field icon={Linkedin} label="LinkedIn profile" required error={fieldErrors.linkedinUrl}>
          <input
            type="url" value={form.linkedinUrl} onChange={setField('linkedinUrl')}
            placeholder="https://linkedin.com/in/your-handle"
            className={inputCls(fieldErrors.linkedinUrl, accent)}
            maxLength={250}
          />
        </Field>

        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1.5">
            Resume <span className="text-red-500">*</span>
          </label>
          <label
            className={`flex items-center justify-between gap-3 px-4 py-3 border border-dashed rounded-xl cursor-pointer transition-colors ${
              fieldErrors.resume ? 'border-red-300 bg-red-50/30' : 'border-zinc-300 hover:border-zinc-400 bg-zinc-50/60'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0">
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
            <input ref={fileRef} type="file" accept={RESUME_ACCEPT} onChange={handleFileChange} className="hidden" />
          </label>
          {fieldErrors.resume && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.resume}</p>}
        </div>

        {turnstile?.enabled && (
          <p className="text-xs text-zinc-500">Protected by Cloudflare Turnstile.</p>
        )}

        <motion.button
          type="submit"
          disabled={submitting}
          whileTap={{ scale: 0.98 }}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-medium text-white shadow-sm hover:shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: accent }}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? 'Submitting…' : 'Submit application'}
        </motion.button>

        <p className="text-[11px] text-zinc-500 leading-relaxed text-center">
          By submitting, you consent to your information being processed for recruitment purposes.
        </p>
      </div>
    </form>
  );
}

// ─── small pieces ──────────────────────────────────────────────────────────

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

function inputCls(error, accent) {
  // Note: focus ring color is set inline via style to avoid Tailwind JIT
  // for arbitrary dynamic colors.
  return `w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 transition-colors ${
    error
      ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
      : 'border-zinc-200 focus:border-zinc-400'
  }`;
}

function Chip({ children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-700">{children}</span>
  );
}

// Generic logo with onError fallback. Used by both the top-bar (the job's
// company) and the job-header eyebrow.
function CompanyLogoOrFallback({ url, alt = '', size = 36 }) {
  const [errored, setErrored] = useState(false);
  const dim = { width: size, height: size };
  const radius = size >= 36 ? 'rounded-xl' : 'rounded-lg';
  if (url && !errored) {
    return (
      <img
        src={url}
        alt={alt}
        onError={() => setErrored(true)}
        style={dim}
        className={`${radius} object-contain bg-white border border-zinc-200/80 flex-shrink-0`}
      />
    );
  }
  return (
    <div style={dim} className={`${radius} bg-zinc-100 flex items-center justify-center flex-shrink-0`}>
      <Building2 className="text-zinc-400" size={Math.round(size * 0.45)} />
    </div>
  );
}

function FullPageLoader() {
  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
    </div>
  );
}

function NotFound({ orgSlug }) {
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

function Footer({ org }) {
  return (
    <footer className="border-t border-zinc-200/70 mt-12 hidden lg:block">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-8 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-400">© {new Date().getFullYear()} {org?.name} · All rights reserved.</p>
        <p className="text-xs text-zinc-400">Powered by <a href="https://www.rivvra.com" className="text-zinc-600 hover:text-zinc-900 transition-colors">Rivvra</a></p>
      </div>
    </footer>
  );
}
