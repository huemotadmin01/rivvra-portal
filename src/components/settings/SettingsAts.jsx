/**
 * SettingsAts — ATS app settings section
 * Application defaults and candidate management config.
 * Only visible to users with admin role on the ATS app.
 */
import { useState, useEffect } from 'react';
import { useOrg } from '../../context/OrgContext';
import { useToast } from '../../context/ToastContext';
import { Save, Loader2, AlertCircle, UserSearch, BarChart3, Globe, Copy, ExternalLink, Check } from 'lucide-react';
import atsApi from '../../utils/atsApi';
import api from '../../utils/api';

/**
 * CareersCard — Public careers site toggle + branding + URL.
 *
 * Org admin/owner only on the server (PUT /api/org/:slug/settings/careers).
 * The card stays visible to ATS admins so they understand why "Publish to
 * Careers" on a job is gated; the toggle just won't save without org-admin.
 */
function CareersCard({ orgSlug }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [tagline, setTagline] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [initial, setInitial] = useState(null);

  useEffect(() => {
    if (!orgSlug) return;
    setLoading(true);
    api.getCareersSettings(orgSlug)
      .then((res) => {
        if (!res?.success) return;
        const c = res.careers || {};
        setEnabled(!!c.enabled);
        setTagline(c.branding?.tagline || '');
        setPrimaryColor(c.branding?.primaryColor || '');
        setLogoUrl(c.branding?.logoUrl || '');
        setPublicUrl(c.publicUrl || '');
        setInitial({
          enabled: !!c.enabled,
          tagline: c.branding?.tagline || '',
          primaryColor: c.branding?.primaryColor || '',
          logoUrl: c.branding?.logoUrl || '',
        });
      })
      .catch((err) => setError(err.message || 'Failed to load careers settings'))
      .finally(() => setLoading(false));
  }, [orgSlug]);

  const hasChanges = initial && (
    enabled !== initial.enabled ||
    tagline !== initial.tagline ||
    primaryColor !== initial.primaryColor ||
    logoUrl !== initial.logoUrl
  );
  const colorValid = !primaryColor || /^#[0-9a-fA-F]{6}$/.test(primaryColor);

  const handleSave = async () => {
    if (!colorValid) { setError('Primary color must be a 6-digit hex (e.g. #2563eb).'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.updateCareersSettings(orgSlug, {
        enabled,
        branding: {
          tagline: tagline.trim() || null,
          primaryColor: primaryColor.trim() || null,
          logoUrl: logoUrl.trim() || null,
        },
      });
      if (res.success) {
        const c = res.careers || {};
        setInitial({
          enabled: !!c.enabled,
          tagline: c.branding?.tagline || '',
          primaryColor: c.branding?.primaryColor || '',
          logoUrl: c.branding?.logoUrl || '',
        });
        setPublicUrl(c.publicUrl || publicUrl);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(res.error || 'Failed to save');
      }
    } catch (err) {
      setError(err.message || 'Failed to save careers settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!publicUrl) return;
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Globe size={18} className="text-sky-400" />
        <h3 className="font-semibold text-white">Public Careers Site</h3>
      </div>
      <p className="text-xs text-dark-500 mb-4">
        Publish Open + Approved job positions to a public careers page.
        Applicants land in ATS with the HR Team employee as recruiter.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-dark-400 py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-dark-300">Enable Careers Site</p>
              <p className="text-xs text-dark-500">When off, the public URL returns Not Found.</p>
            </div>
            <ToggleSwitch checked={enabled} onChange={setEnabled} />
          </div>

          {/* Public URL */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Public URL</label>
            <p className="text-xs text-dark-500 mb-2">Paste this on your WordPress careers menu.</p>
            <div className="flex items-stretch gap-2">
              <div className="flex-1 flex items-center px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg min-w-0">
                <span className="text-sm text-dark-200 truncate font-mono">{publicUrl || '—'}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyUrl}
                disabled={!publicUrl}
                className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-300 hover:text-white hover:border-dark-600 transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              {enabled && publicUrl && (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-300 hover:text-white hover:border-dark-600 transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" /> Open
                </a>
              )}
            </div>
          </div>

          {/* Branding */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Tagline (optional)</label>
            <p className="text-xs text-dark-500 mb-2">Shown under your logo on the careers page.</p>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value.slice(0, 160))}
              placeholder="e.g. Build what's next with us."
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Primary Color (hex, optional)</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#2563eb"
                className={`input-field w-40 ${colorValid ? '' : 'border-red-500/40'}`}
              />
              <div
                className="w-9 h-9 rounded-lg border border-dark-700"
                style={{ background: colorValid && primaryColor ? primaryColor : 'transparent' }}
              />
            </div>
            {!colorValid && <p className="text-[11px] text-red-400 mt-1">Must be a 6-digit hex (e.g. #2563eb).</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1">Logo URL (optional override)</label>
            <p className="text-xs text-dark-500 mb-2">Leave blank to use the org logo from Org Settings.</p>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value.slice(0, 500))}
              placeholder="https://…"
              className="input-field w-full"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !hasChanges || !colorValid}
            className="btn-primary px-4 py-2 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><Check className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save Careers Settings</>}
          </button>
        </div>
      )}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-10 h-5.5 rounded-full transition-colors ${
        checked ? 'bg-rivvra-500' : 'bg-dark-600'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform shadow-sm ${
        checked ? 'translate-x-[18px]' : 'translate-x-0'
      }`} />
    </button>
  );
}

// Defaults match ATS_REPORTING_THRESHOLD_DEFAULTS in the API (src/ats.js).
// Keep these in sync if the server-side defaults change, so the field values
// never disagree with what the dashboard actually scores against.
const THRESHOLD_DEFAULTS = {
  staleDays: 14,
  awaitingResultDays: 3,
  pendingApprovalHours: 24,
  jobAgingTargetDays: 30,
  jobNoSubmittalDays: 7,
};

// The threshold inputs hold the raw string while focused so the field can be
// cleared and retyped. Applying `|| default` per keystroke snapped the value
// back the instant the field went blank, so the next keystroke appended to the
// default instead of replacing it (14 -> type "2" -> 142). Normalise on blur
// and again on save.
const normaliseThreshold = (key, v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : THRESHOLD_DEFAULTS[key];
};

export default function SettingsAts() {
  const { currentOrg, isOrgAdmin, isOrgOwner, getAppRole } = useOrg();
  const { showToast } = useToast();
  const isAdmin = getAppRole('ats') === 'admin' || isOrgAdmin || isOrgOwner;

  const [settings, setSettings] = useState(null);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!isAdmin || !currentOrg?.slug) { setLoading(false); return; }
    let cancelled = false;

    Promise.all([
      atsApi.getSettings(currentOrg.slug),
      atsApi.listStages(currentOrg.slug),
    ])
      .then(([settingsRes, stagesRes]) => {
        if (cancelled) return;
        if (settingsRes.success && settingsRes.settings) setSettings(settingsRes.settings);
        else setSettings(settingsRes);
        if (stagesRes.success) setStages(stagesRes.stages || []);
      })
      .catch(() => { if (!cancelled) setFetchError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isAdmin, currentOrg?.slug]);

  const handleSave = async () => {
    if (!settings) { showToast('No settings to save', 'error'); return; }
    setSaving(true);
    try {
      // Coerce only the thresholds actually present — a key that was never set
      // must stay absent so the API keeps applying its own default.
      const reportingThresholds = { ...(settings.reportingThresholds || {}) };
      for (const key of Object.keys(THRESHOLD_DEFAULTS)) {
        if (reportingThresholds[key] !== undefined) {
          reportingThresholds[key] = normaliseThreshold(key, reportingThresholds[key]);
        }
      }
      await atsApi.updateSettings(currentOrg.slug, { ...settings, reportingThresholds });
      showToast('Settings saved');
    } catch (err) {
      showToast(err.message || 'Failed to save settings', 'error');
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 text-purple-500 animate-spin" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-dark-400">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">You need admin access to manage ATS settings.</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm">Failed to load settings. Please try refreshing the page.</p>
        </div>
      </div>
    );
  }

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));
  // Reporting thresholds live under settings.reportingThresholds. The
  // updater merges into that nested object so individual fields can be
  // edited without nuking the others.
  const updateThreshold = (key, value) => setSettings((prev) => ({
    ...prev,
    reportingThresholds: { ...(prev?.reportingThresholds || {}), [key]: value },
  }));
  // Defaults match ATS_REPORTING_THRESHOLD_DEFAULTS in the API
  // (src/ats.js). Keep these in sync if the server-side defaults
  // change so the placeholder text never lies.
  const thresholds = settings?.reportingThresholds || {};
  const staleDays = Number.isFinite(Number(thresholds.staleDays)) ? thresholds.staleDays : THRESHOLD_DEFAULTS.staleDays;
  const awaitingResultDays = Number.isFinite(Number(thresholds.awaitingResultDays)) ? thresholds.awaitingResultDays : THRESHOLD_DEFAULTS.awaitingResultDays;
  const pendingApprovalHours = Number.isFinite(Number(thresholds.pendingApprovalHours)) ? thresholds.pendingApprovalHours : THRESHOLD_DEFAULTS.pendingApprovalHours;
  // 2026-08-20 job-aging SLA (dashboard Job Aging card).
  const jobAgingTargetDays = Number.isFinite(Number(thresholds.jobAgingTargetDays)) ? thresholds.jobAgingTargetDays : THRESHOLD_DEFAULTS.jobAgingTargetDays;
  const jobNoSubmittalDays = Number.isFinite(Number(thresholds.jobNoSubmittalDays)) ? thresholds.jobNoSubmittalDays : THRESHOLD_DEFAULTS.jobNoSubmittalDays;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Application Settings */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserSearch size={18} className="text-purple-400" />
            <h3 className="font-semibold text-white">Application Settings</h3>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-300">Auto-Create Candidate</p>
                <p className="text-xs text-dark-500">Automatically create a candidate record when an application is received</p>
              </div>
              <ToggleSwitch
                checked={settings?.autoCreateCandidate ?? true}
                onChange={v => update('autoCreateCandidate', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-300">Suggest candidates across companies</p>
                <p className="text-xs text-dark-500">Let this company's job suggestions also draw from other companies in your organization (shown in a separate section). Use when this company has a small candidate pool.</p>
              </div>
              <ToggleSwitch
                checked={settings?.crossCompanySuggestions ?? false}
                onChange={v => update('crossCompanySuggestions', v)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Default Stage</label>
              <p className="text-xs text-dark-500 mb-2">Stage assigned to new applications when created</p>
              <select
                value={settings?.defaultStageOnApply ?? ''}
                onChange={e => update('defaultStageOnApply', e.target.value || null)}
                className="input-field w-auto">
                <option value="">First stage (default)</option>
                {stages.map(s => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Reporting Thresholds (Phase 2) */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={18} className="text-amber-400" />
            <h3 className="font-semibold text-white">Reporting Thresholds</h3>
          </div>
          <p className="text-xs text-dark-500 mb-4">
            Controls when records appear on the ATS Reporting "Needs attention" cards.
          </p>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Stale applications</label>
              <p className="text-xs text-dark-500 mb-2">Applications stuck in the same stage longer than this many days flag as stale.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={staleDays}
                  onChange={(e) => updateThreshold('staleDays', e.target.value)}
                  onBlur={(e) => updateThreshold('staleDays', normaliseThreshold('staleDays', e.target.value))}
                  className="input-field w-24"
                />
                <span className="text-xs text-dark-500">days</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Awaiting interview result</label>
              <p className="text-xs text-dark-500 mb-2">Interviews older than this without a captured Proceed / Reject result flag as awaiting.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={awaitingResultDays}
                  onChange={(e) => updateThreshold('awaitingResultDays', e.target.value)}
                  onBlur={(e) => updateThreshold('awaitingResultDays', normaliseThreshold('awaitingResultDays', e.target.value))}
                  className="input-field w-24"
                />
                <span className="text-xs text-dark-500">days</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Pending job approvals</label>
              <p className="text-xs text-dark-500 mb-2">Jobs awaiting approval longer than this flag as overdue.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={pendingApprovalHours}
                  onChange={(e) => updateThreshold('pendingApprovalHours', e.target.value)}
                  onBlur={(e) => updateThreshold('pendingApprovalHours', normaliseThreshold('pendingApprovalHours', e.target.value))}
                  className="input-field w-24"
                />
                <span className="text-xs text-dark-500">hours</span>
              </div>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">Recruiter referral links</label>
                <p className="text-xs text-dark-500">Show the "Your Referral Link" card on published jobs so recruiters can share credited apply links. Existing shared links keep crediting either way.</p>
              </div>
              <button
                type="button"
                onClick={() => update('showReferralLinks', !(settings?.showReferralLinks ?? true))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${(settings?.showReferralLinks ?? true) ? 'bg-rivvra-500' : 'bg-dark-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(settings?.showReferralLinks ?? true) ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Job aging target</label>
              <p className="text-xs text-dark-500 mb-2">Open jobs older than this (from approval) flag red on the dashboard's Job Aging card.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={jobAgingTargetDays}
                  onChange={(e) => updateThreshold('jobAgingTargetDays', e.target.value)}
                  onBlur={(e) => updateThreshold('jobAgingTargetDays', normaliseThreshold('jobAgingTargetDays', e.target.value))}
                  className="input-field w-24"
                />
                <span className="text-xs text-dark-500">days</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Submittal window</label>
              <p className="text-xs text-dark-500 mb-2">Open jobs with no new submittal within this window flag amber on the Job Aging card.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={jobNoSubmittalDays}
                  onChange={(e) => updateThreshold('jobNoSubmittalDays', e.target.value)}
                  onBlur={(e) => updateThreshold('jobNoSubmittalDays', normaliseThreshold('jobNoSubmittalDays', e.target.value))}
                  className="input-field w-24"
                />
                <span className="text-xs text-dark-500">days</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Careers Site — full-width card below the two-column grid. */}
      <CareersCard orgSlug={currentOrg?.slug} />

      <button onClick={handleSave} disabled={saving}
        className="btn-primary px-6 py-2.5 flex items-center gap-2 disabled:opacity-50">
        <Save size={16} /> {saving ? 'Saving...' : 'Save ATS Settings'}
      </button>
    </div>
  );
}
