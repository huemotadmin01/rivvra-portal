// ============================================================================
// CareersHome — Public careers listing, redesigned 2026-05-24.
//
// Route: /careers/:orgSlug   (registered outside ProtectedRoute in App.jsx)
//
// Design: modern SaaS aesthetic (Linear/Notion/Stripe-careers spirit).
//   - Hero with slowly-drifting mesh-gradient blobs + animated job counter
//   - Sticky filter bar that gains a shadow on scroll
//   - Jobs grouped by intra-tenant entity (org_companies.name)
//   - Staggered fade-up reveals on cards as they scroll into view
//   - Light/neutral zinc surface, single accent (org primaryColor → fallback)
//   - Hard-isolated from the dark portal: per-page body bg restored on unmount
// ============================================================================

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  motion, useScroll, useSpring, useTransform,
  useMotionValue, animate, AnimatePresence,
} from 'framer-motion';
import { API_BASE_URL } from '../../utils/config';
import {
  Loader2, Briefcase, MapPin, Clock, Search, ArrowRight,
  Building2, AlertCircle, Filter as FilterIcon, ChevronDown, Sparkles,
} from 'lucide-react';

const DEFAULT_ACCENT = '#5b6cff'; // refined indigo-violet; overridable by org.careersBranding.primaryColor

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

// Tiny hook: animate an integer from 0 → target over a duration.
function useCountUp(target, duration = 1.2) {
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(mv, target, {
      duration, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [target, duration, mv]);
  return display;
}

export default function CareersHome() {
  const { orgSlug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [org, setOrg] = useState(null);
  const [jobs, setJobs] = useState([]);

  // Filters
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('all');
  const [location, setLocation] = useState('all');
  const [empType, setEmpType] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Hard-isolate from the portal's dark theme. Restore on unmount.
  useEffect(() => {
    document.title = 'Careers';
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
    fetch(`${API_BASE_URL}/api/public/careers/${encodeURIComponent(orgSlug)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) throw new Error(j.error || `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (cancelled) return;
        setOrg(j.org);
        setJobs(Array.isArray(j.jobs) ? j.jobs : []);
        if (j.org?.name) document.title = `Careers · ${j.org.name}`;
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load careers'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgSlug]);

  // Filter sources from full job set.
  const departments = useMemo(() => uniqVals(jobs, j => j.department), [jobs]);
  const locations = useMemo(() => uniqVals(jobs, j => j.location), [jobs]);
  const empTypes = useMemo(() => uniqVals(jobs, j => j.employmentType), [jobs]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return jobs.filter(j => {
      if (qq && !(j.name || '').toLowerCase().includes(qq) && !(j.department || '').toLowerCase().includes(qq)) return false;
      if (department !== 'all' && j.department !== department) return false;
      if (location !== 'all' && j.location !== location) return false;
      if (empType !== 'all' && j.employmentType !== empType) return false;
      return true;
    });
  }, [jobs, q, department, location, empType]);

  // Group by company (org_companies.name from API). Single-group → no headers.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const j of filtered) {
      const key = j.companyName || '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(j);
    }
    const groups = Array.from(map.entries()).map(([name, items]) => ({
      name: name === '__none__' ? null : name,
      jobs: items,
    }));
    groups.sort((a, b) => {
      if (a.name === null) return 1;
      if (b.name === null) return -1;
      if (b.jobs.length !== a.jobs.length) return b.jobs.length - a.jobs.length;
      return a.name.localeCompare(b.name);
    });
    return groups;
  }, [filtered]);
  const showGroupHeaders = grouped.length > 1;

  const accent = org?.branding?.primaryColor || DEFAULT_ACCENT;
  const companiesCount = useMemo(() => new Set(jobs.map(j => j.companyName).filter(Boolean)).size, [jobs]);
  const totalJobs = jobs.length;

  if (loading) return <FullPageLoader />;
  if (error) return <ErrorState />;

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white" style={{ '--accent': accent }}>
      <TopBar org={org} orgSlug={orgSlug} accent={accent} />
      <Hero org={org} totalJobs={totalJobs} companiesCount={companiesCount} accent={accent} />

      <StickyFilters
        q={q} setQ={setQ}
        department={department} setDepartment={setDepartment}
        location={location} setLocation={setLocation}
        empType={empType} setEmpType={setEmpType}
        departments={departments} locations={locations} empTypes={empTypes}
        filtersOpen={filtersOpen} setFiltersOpen={setFiltersOpen}
        accent={accent}
        resultCount={filtered.length}
      />

      <main className="max-w-6xl mx-auto px-6 sm:px-8 py-10 sm:py-16">
        {jobs.length === 0 ? (
          <EmptyOrg accent={accent} />
        ) : filtered.length === 0 ? (
          <EmptyFilters onReset={() => { setQ(''); setDepartment('all'); setLocation('all'); setEmpType('all'); }} />
        ) : (
          <div className="space-y-14">
            {grouped.map((group, gi) => (
              <section key={group.name || `unnamed-${gi}`}>
                {showGroupHeaders && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center justify-between mb-5 pb-3 border-b border-zinc-200/70 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CompanyLogo url={group.jobs[0]?.companyLogoUrl} size={40} />
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-0.5">Hiring at</p>
                        <h2 className="text-lg sm:text-xl font-semibold text-zinc-900 truncate">{group.name || 'Other openings'}</h2>
                      </div>
                    </div>
                    <span className="text-sm text-zinc-500 flex-shrink-0">{group.jobs.length} {group.jobs.length === 1 ? 'opening' : 'openings'}</span>
                  </motion.div>
                )}
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {group.jobs.map((j, idx) => (
                    <motion.li
                      key={j.publicSlug}
                      initial={{ opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.5, delay: Math.min(idx * 0.04, 0.35), ease: [0.16, 1, 0.3, 1] }}
                    >
                      <JobCard job={j} orgSlug={orgSlug} accent={accent} hideCompany={showGroupHeaders} />
                    </motion.li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      <Footer org={org} accent={accent} />
    </div>
  );
}

// ─── pieces ────────────────────────────────────────────────────────────────

function TopBar({ org, orgSlug, accent }) {
  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-zinc-200/60">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
        <Link to={`/careers/${orgSlug}`} className="flex items-center gap-2.5 group">
          <OrgLogo org={org} />
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 group-hover:text-zinc-700 transition-colors">Careers</p>
            <p className="text-sm font-semibold text-zinc-900">{org?.name || orgSlug}</p>
          </div>
        </Link>
        {org?.companyWebsite && (
          <a
            href={org.companyWebsite}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors hidden sm:inline-flex items-center gap-1.5"
          >
            Visit website <ArrowRight size={14} />
          </a>
        )}
      </div>
    </header>
  );
}

function OrgLogo({ org }) {
  const [errored, setErrored] = useState(false);
  if (org?.logoUrl && !errored) {
    return (
      <img
        src={org.logoUrl}
        alt={org.name || ''}
        onError={() => setErrored(true)}
        className="w-9 h-9 rounded-lg object-contain bg-white border border-zinc-200/80"
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center">
      <Building2 className="w-4.5 h-4.5 text-zinc-400" />
    </div>
  );
}

// Same logo / fallback pattern at an arbitrary size, used by section
// headers + footers where the visual weight differs from the top-bar.
function CompanyLogo({ url, size = 36, alt = '' }) {
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

function Hero({ org, totalJobs, companiesCount, accent }) {
  const count = useCountUp(totalJobs, 1.3);
  const tagline = org?.branding?.tagline;

  return (
    <section className="relative overflow-hidden">
      <MeshGradient accent={accent} />
      <div className="relative max-w-6xl mx-auto px-6 sm:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 backdrop-blur border border-zinc-200/80 mb-6">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: accent }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: accent }} />
            </span>
            <span className="text-xs font-medium text-zinc-700">We're hiring</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-zinc-900 leading-[1.05]">
            {tagline ? tagline : <>Build what's next, <span style={{ color: accent }}>with us.</span></>}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 text-lg text-zinc-600 max-w-xl"
          >
            {totalJobs === 0
              ? 'There are no openings right now — check back soon.'
              : <>We have <strong className="text-zinc-900 tabular-nums">{count}</strong> open {count === 1 ? 'role' : 'roles'}{companiesCount > 1 && <> across <strong className="text-zinc-900">{companiesCount}</strong> entities</>}. Apply with your resume — we read every application.</>}
          </motion.p>

          {totalJobs > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="mt-9 flex items-center gap-3"
            >
              <a href="#openings" className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-medium text-white shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5" style={{ background: accent }}>
                See open roles <ArrowRight size={16} />
              </a>
              <ScrollHint />
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

// SVG mesh-gradient — three slowly-drifting blurred blobs. CSS-only animation,
// negligible cost. The accent color tints one of the blobs so re-branding
// flows through naturally.
function MeshGradient({ accent }) {
  return (
    <div className="absolute inset-0 -z-0 pointer-events-none" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-b from-white via-[#fafafa] to-[#fafafa]" />
      <motion.div
        className="absolute -top-32 -left-24 w-[40rem] h-[40rem] rounded-full opacity-50 blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${accent}40, transparent)` }}
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-10 right-[-10rem] w-[36rem] h-[36rem] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, #ffd6a5, transparent)' }}
        animate={{ x: [0, -25, 0], y: [0, 30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[-12rem] left-1/3 w-[34rem] h-[34rem] rounded-full opacity-35 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, #bdfff3, transparent)' }}
        animate={{ x: [0, 25, 0], y: [0, -20, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* subtle grain via SVG noise */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.04] mix-blend-multiply" aria-hidden>
        <filter id="careers-noise"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" /></filter>
        <rect width="100%" height="100%" filter="url(#careers-noise)" />
      </svg>
    </div>
  );
}

function ScrollHint() {
  return (
    <motion.div
      className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500"
      animate={{ y: [0, 3, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
    >
      <ChevronDown size={14} /> Scroll
    </motion.div>
  );
}

function StickyFilters({
  q, setQ, department, setDepartment, location, setLocation, empType, setEmpType,
  departments, locations, empTypes, filtersOpen, setFiltersOpen, accent, resultCount,
}) {
  const ref = useRef(null);
  const [stuck, setStuck] = useState(false);

  // Detect "stuck" so we can add a soft shadow when pinned.
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(([e]) => setStuck(e.intersectionRatio < 1), { threshold: [1] });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const activeCount = (department !== 'all' ? 1 : 0) + (location !== 'all' ? 1 : 0) + (empType !== 'all' ? 1 : 0);

  return (
    <div ref={ref} id="openings" className={`sticky top-16 z-20 bg-[#fafafa]/85 backdrop-blur-md transition-shadow ${stuck ? 'shadow-[0_1px_0_0_rgba(0,0,0,0.05),0_8px_20px_-12px_rgba(0,0,0,0.12)]' : ''}`}>
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title or department…"
            className="w-full pl-10 pr-3 py-2.5 bg-white border border-zinc-200 rounded-full text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 transition-all"
            style={{ '--tw-ring-color': `${accent}30` }}
          />
        </div>
        <button
          onClick={() => setFiltersOpen(v => !v)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium border transition-all ${
            filtersOpen || activeCount > 0
              ? 'bg-zinc-900 text-white border-zinc-900'
              : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300'
          }`}
        >
          <FilterIcon size={14} /> Filters {activeCount > 0 && <span className="text-[11px] opacity-80">· {activeCount}</span>}
        </button>
        <span className="hidden sm:inline-flex text-xs text-zinc-500 ml-auto">{resultCount} result{resultCount === 1 ? '' : 's'}</span>
      </div>
      <AnimatePresence>
        {filtersOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="max-w-6xl mx-auto px-6 sm:px-8 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select value={department} onChange={setDepartment} options={departments} label="Department" />
              <Select value={location} onChange={setLocation} options={locations} label="Location" />
              <Select value={empType} onChange={setEmpType} options={empTypes} label="Type" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Select({ value, onChange, options, label }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none pl-3.5 pr-10 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-300"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o === 'all' ? `All ${label.toLowerCase()}s` : o}</option>
        ))}
      </select>
      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
    </div>
  );
}

function JobCard({ job, orgSlug, accent, hideCompany }) {
  return (
    <Link
      to={`/careers/${orgSlug}/jobs/${job.publicSlug}`}
      className="group relative block bg-white border border-zinc-200/80 rounded-2xl p-5 sm:p-6 transition-all hover:border-zinc-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)] hover:-translate-y-0.5"
    >
      <span
        className="absolute top-0 left-6 right-6 h-px opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base sm:text-lg font-semibold text-zinc-900 group-hover:text-zinc-950 truncate">{job.name}</h3>
          <div className="mt-2.5 flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-zinc-500">
            {job.department && <span className="inline-flex items-center gap-1.5"><Briefcase size={12} className="text-zinc-400" />{job.department}</span>}
            {job.location && <span className="inline-flex items-center gap-1.5"><MapPin size={12} className="text-zinc-400" />{job.location}</span>}
            {job.employmentType && <Chip>{job.employmentType}</Chip>}
            {job.hiringMode && <Chip>{job.hiringMode}</Chip>}
            {job.requiredExperience && <span className="text-zinc-500">{job.requiredExperience} exp</span>}
            {!hideCompany && job.companyName && <span className="text-zinc-400">· {job.companyName}</span>}
          </div>
        </div>
        <div
          className="flex-shrink-0 w-9 h-9 rounded-full bg-zinc-50 group-hover:bg-zinc-900 flex items-center justify-center transition-colors"
        >
          <ArrowRight size={14} className="text-zinc-400 group-hover:text-white transition-colors group-hover:translate-x-0.5 duration-200" />
        </div>
      </div>
      {job.publishedAt && (
        <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center gap-1.5 text-[11px] text-zinc-400">
          <Clock size={11} /> Posted {fmtDate(job.publishedAt)}
        </div>
      )}
    </Link>
  );
}

function Chip({ children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-zinc-100 text-zinc-700">
      {children}
    </span>
  );
}

function EmptyOrg({ accent }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-3xl p-16 text-center">
      <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4" style={{ background: `${accent}15`, color: accent }}>
        <Sparkles size={24} />
      </div>
      <h2 className="text-lg font-semibold text-zinc-900 mb-1">No open positions right now</h2>
      <p className="text-sm text-zinc-500">We're not actively hiring, but feel free to check back soon.</p>
    </div>
  );
}

function EmptyFilters({ onReset }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-3xl p-16 text-center">
      <FilterIcon className="w-6 h-6 mx-auto text-zinc-400 mb-3" />
      <p className="text-sm text-zinc-500 mb-3">No positions match the current filters.</p>
      <button onClick={onReset} className="text-sm text-zinc-700 underline hover:text-zinc-900">Clear filters</button>
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

function ErrorState() {
  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-zinc-100 flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-zinc-400" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 mb-2">Careers site not found</h1>
        <p className="text-sm text-zinc-500">This careers page is unavailable or has been disabled.</p>
      </div>
    </div>
  );
}

function Footer({ org, accent }) {
  return (
    <footer className="border-t border-zinc-200/70 mt-12">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <OrgLogo org={org} />
          <div>
            <p className="text-sm font-medium text-zinc-700">{org?.name}</p>
            <p className="text-xs text-zinc-400">© {new Date().getFullYear()} All rights reserved.</p>
          </div>
        </div>
        <p className="text-xs text-zinc-400">Powered by <a href="https://www.rivvra.com" className="text-zinc-600 hover:text-zinc-900 transition-colors">Rivvra</a></p>
      </div>
    </footer>
  );
}

function uniqVals(jobs, accessor) {
  const s = new Set(jobs.map(accessor).filter(Boolean));
  return ['all', ...Array.from(s).sort()];
}
