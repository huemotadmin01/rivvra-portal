// ============================================================================
// CareersHome — Public careers listing for a single org.
//
// Route: /careers/:orgSlug   (registered outside ProtectedRoute in App.jsx)
//
// Light/neutral theme — independent of the portal's dark UI. The page renders
// only when `careersEnabled` on the org is true; otherwise the API returns
// 404 and we show a friendly "Careers site not found" state.
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_BASE_URL } from '../../utils/config';
import {
  Loader2, Briefcase, MapPin, Clock, Search, ArrowRight,
  Building2, AlertCircle, Filter as FilterIcon,
} from 'lucide-react';

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
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
    setLoading(true);
    setError(null);
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

  const departments = useMemo(() => {
    const s = new Set(jobs.map(j => j.department).filter(Boolean));
    return ['all', ...Array.from(s).sort()];
  }, [jobs]);
  const locations = useMemo(() => {
    const s = new Set(jobs.map(j => j.location).filter(Boolean));
    return ['all', ...Array.from(s).sort()];
  }, [jobs]);
  const empTypes = useMemo(() => {
    const s = new Set(jobs.map(j => j.employmentType).filter(Boolean));
    return ['all', ...Array.from(s).sort()];
  }, [jobs]);

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

  // Group filtered jobs by company so multi-entity orgs get a clear visual
  // hierarchy. When the org has jobs from only one company (or no company
  // metadata at all), grouping collapses to a single flat list so we don't
  // surface a useless single header.
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
    // Largest group first, then alphabetical. Unnamed group always last.
    groups.sort((a, b) => {
      if (a.name === null) return 1;
      if (b.name === null) return -1;
      if (b.jobs.length !== a.jobs.length) return b.jobs.length - a.jobs.length;
      return a.name.localeCompare(b.name);
    });
    return groups;
  }, [filtered]);
  const showGroupHeaders = grouped.length > 1;

  const accent = org?.branding?.primaryColor || '#2563eb';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (error) {
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

  const tagline = org?.branding?.tagline || 'Open positions';

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 antialiased">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 py-8 sm:py-12">
          <div className="flex items-center gap-4 mb-8">
            {org?.logoUrl ? (
              <img src={org.logoUrl} alt={org.name} className="w-12 h-12 rounded-xl object-contain bg-white border border-zinc-100" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-zinc-400" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm text-zinc-500">Careers at</p>
              <p className="text-base font-semibold text-zinc-900 truncate">{org?.name || orgSlug}</p>
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900 mb-3">
            {tagline}
          </h1>
          <p className="text-base text-zinc-600 max-w-2xl">
            {jobs.length === 0
              ? 'There are no openings at the moment — check back soon.'
              : `${jobs.length} open ${jobs.length === 1 ? 'position' : 'positions'}. Apply directly with your resume below.`}
          </p>
        </div>
      </header>

      {/* Filters + listings */}
      <main className="max-w-5xl mx-auto px-6 sm:px-8 py-8 sm:py-10">
        {jobs.length > 0 && (
          <div className="mb-6 grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by title or department…"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-300"
              />
            </div>
            <Select className="sm:col-span-3" value={department} onChange={setDepartment} options={departments} label="Department" />
            <Select className="sm:col-span-2" value={location} onChange={setLocation} options={locations} label="Location" />
            <Select className="sm:col-span-2" value={empType} onChange={setEmpType} options={empTypes} label="Type" />
          </div>
        )}

        {jobs.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-zinc-100 flex items-center justify-center mb-4">
              <Briefcase className="w-6 h-6 text-zinc-400" />
            </div>
            <p className="text-sm text-zinc-500">No open positions right now.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
            <FilterIcon className="w-6 h-6 mx-auto text-zinc-400 mb-3" />
            <p className="text-sm text-zinc-500">No positions match the current filters.</p>
            <button
              onClick={() => { setQ(''); setDepartment('all'); setLocation('all'); setEmpType('all'); }}
              className="mt-3 text-sm text-zinc-700 underline hover:text-zinc-900"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map((group, gi) => (
              <section key={group.name || `unnamed-${gi}`}>
                {showGroupHeaders && (
                  <div className="flex items-baseline justify-between mb-3 px-1">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      {group.name || 'Other openings'}
                    </h2>
                    <span className="text-xs text-zinc-400">
                      {group.jobs.length} {group.jobs.length === 1 ? 'opening' : 'openings'}
                    </span>
                  </div>
                )}
                <ul className="space-y-3">
                  {group.jobs.map((j) => (
                    <li key={j.publicSlug}>
                      <Link
                        to={`/careers/${orgSlug}/jobs/${j.publicSlug}`}
                        className="group block bg-white border border-zinc-200 rounded-xl p-5 sm:p-6 hover:border-zinc-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-base sm:text-lg font-semibold text-zinc-900 group-hover:underline truncate">
                              {j.name}
                            </h3>
                            <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-zinc-500">
                              {j.department && <span className="inline-flex items-center gap-1.5"><Briefcase size={12} />{j.department}</span>}
                              {j.location && <span className="inline-flex items-center gap-1.5"><MapPin size={12} />{j.location}</span>}
                              {j.employmentType && <Chip>{j.employmentType}</Chip>}
                              {j.hiringMode && <Chip>{j.hiringMode}</Chip>}
                              {j.requiredExperience && <span className="text-zinc-500">{j.requiredExperience} exp</span>}
                              {/* Suppress the per-card company suffix when the section
                                  header already labels the group — avoids redundant noise. */}
                              {!showGroupHeaders && j.companyName && (
                                <span className="text-zinc-400">· {j.companyName}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {j.publishedAt && (
                              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-zinc-400">
                                <Clock size={11} />{fmtDate(j.publishedAt)}
                              </span>
                            )}
                            <span
                              className="hidden sm:inline-flex items-center gap-1 text-sm font-medium transition-colors"
                              style={{ color: accent }}
                            >
                              View <ArrowRight size={14} />
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 mt-12">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 py-6 text-xs text-zinc-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p>© {new Date().getFullYear()} {org?.name || ''}. All rights reserved.</p>
          <p>Powered by <a href="https://www.rivvra.com" className="text-zinc-500 hover:text-zinc-700 transition-colors">Rivvra</a></p>
        </div>
      </footer>
    </div>
  );
}

function Select({ value, onChange, options, label, className = '' }) {
  return (
    <div className={className}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:border-zinc-300"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o === 'all' ? `All ${label.toLowerCase()}s` : o}</option>
        ))}
      </select>
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
