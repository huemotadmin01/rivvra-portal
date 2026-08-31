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
import {
  Panel, Button, Input, Select, Switch, SettingRow, Callout, EmptyState, PageSpinner,
} from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ The Careers card publishes Open + Approved jobs to a PUBLIC website. Its
// `enabled` toggle plus Save is the difference between a live careers page and
// a 404, so it is on the never-trigger list and was not saved during
// verification — only read.
//
// Carried across byte-identically:
//   · CareersCard's whole state/effect/save block, including `colorValid`
//     (`/^#[0-9a-fA-F]{6}$/`), the `hasChanges` dirty-check that gates Save,
//     and the `.slice(0, 160)` / `.slice(0, 500)` input caps.
//   · The reporting-threshold block, which lives in the RENDER: the nested
//     `updateThreshold` merge (a flat `update` would nuke the sibling
//     thresholds) and the `Number.isFinite` defaults, which now read from
//     THRESHOLD_DEFAULTS below — that object mirrors
//     ATS_REPORTING_THRESHOLD_DEFAULTS in the API and must stay in sync.
//   · `autoCreateCandidate ?? true` — not `|| false`. A stored `false` must
//     stay false; a missing key must read as true.
//
// The local `ToggleSwitch` is gone (ds `Switch`); two copies now remain, in
// SettingsTimesheet and components/ToggleSwitch.jsx.
// ─────────────────────────────────────────────────────────────────────────────

/** Label + hint above a control — the shape this tab repeats. */
function FieldBlock({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 3 }}>
        {label}
      </label>
      {hint && <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 8px' }}>{hint}</p>}
      {children}
    </div>
  );
}

/** Number field with a trailing unit, used by all three thresholds. */
function UnitNumber({ id, unit, ...rest }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <Input id={id} type="number" style={{ width: 92, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} {...rest} />
      <span style={{ font: "400 11.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{unit}</span>
    </span>
  );
}

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
    <Panel icon={<Globe size={16} />} title="Public Careers Site">
      <div style={{ padding: 6, display: 'grid', gap: 14 }}>
        <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
          Publish Open + Approved job positions to a public careers page.
          Applicants land in ATS with the HR Team employee as recruiter.
        </p>

        {loading ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: "400 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', padding: '6px 0' }}>
            <Loader2 size={15} className="animate-spin" /> Loading…
          </span>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {error && <Callout tone="danger" icon={<AlertCircle size={15} />}>{error}</Callout>}

            {/* Enable toggle */}
            <SettingRow
              label="Enable Careers Site"
              description="When off, the public URL returns Not Found."
              control={<Switch label="Enable Careers Site" checked={enabled} onChange={setEnabled} />}
            />

            {/* Public URL */}
            <FieldBlock label="Public URL" hint="Paste this on your WordPress careers menu.">
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
                <div style={{
                  flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', height: 38, padding: '0 12px',
                  background: 'var(--surface-2)', borderRadius: 'var(--r-2)', boxShadow: '0 0 0 1px var(--line)',
                }}>
                  <span style={{
                    font: "400 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace", color: 'var(--fg-2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{publicUrl || '—'}</span>
                </div>
                <Button
                  variant="secondary" size="md" type="button"
                  onClick={handleCopyUrl}
                  disabled={!publicUrl}
                  iconLeft={copied ? <Check size={15} style={{ color: 'var(--acc-emerald)' }} /> : <Copy size={15} />}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                {enabled && publicUrl && (
                  <Button
                    as="a" variant="secondary" size="md"
                    href={publicUrl} target="_blank" rel="noreferrer"
                    iconLeft={<ExternalLink size={15} />}
                  >
                    Open
                  </Button>
                )}
              </div>
            </FieldBlock>

            {/* Branding */}
            <FieldBlock id="careers-tagline" label="Tagline (optional)" hint="Shown under your logo on the careers page.">
              <Input
                id="careers-tagline"
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value.slice(0, 160))}
                placeholder="e.g. Build what's next with us."
              />
            </FieldBlock>

            <FieldBlock id="careers-color" label="Primary Color (hex, optional)">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Input
                  id="careers-color"
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#2563eb"
                  invalid={!colorValid}
                  aria-invalid={!colorValid}
                  style={{ width: 170 }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    width: 36, height: 36, borderRadius: 'var(--r-2)', flexShrink: 0,
                    boxShadow: '0 0 0 1px var(--line)',
                    background: colorValid && primaryColor ? primaryColor : 'transparent',
                  }}
                />
              </span>
              {!colorValid && (
                <p style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger)', margin: '6px 0 0' }}>
                  Must be a 6-digit hex (e.g. #2563eb).
                </p>
              )}
            </FieldBlock>

            <FieldBlock id="careers-logo" label="Logo URL (optional override)" hint="Leave blank to use the org logo from Org Settings.">
              <Input
                id="careers-logo"
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value.slice(0, 500))}
                placeholder="https://…"
              />
            </FieldBlock>

            <div>
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges || !colorValid}
                iconLeft={saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
              >
                {saved ? 'Saved' : 'Save Careers Settings'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
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

export default function SettingsAtsV2() {
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

  if (loading) return <PageSpinner label="Loading ATS settings…" />;

  if (!isAdmin) {
    return (
      <Panel>
        <EmptyState icon={<AlertCircle size={22} />} tone="warn" compact
          title="You need admin access to manage ATS settings." />
      </Panel>
    );
  }

  if (fetchError) {
    return (
      <Panel>
        <EmptyState icon={<AlertCircle size={22} />} tone="danger" compact
          title="Failed to load settings.">
          Please try refreshing the page.
        </EmptyState>
      </Panel>
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
  // Defaults come from THRESHOLD_DEFAULTS above, which mirrors
  // ATS_REPORTING_THRESHOLD_DEFAULTS in the API (src/ats.js).
  // Note these pass a raw '' straight through (Number('') is 0, which is
  // finite) — that is what lets the field be cleared while focused.
  const thresholds = settings?.reportingThresholds || {};
  const staleDays = Number.isFinite(Number(thresholds.staleDays)) ? thresholds.staleDays : THRESHOLD_DEFAULTS.staleDays;
  const awaitingResultDays = Number.isFinite(Number(thresholds.awaitingResultDays)) ? thresholds.awaitingResultDays : THRESHOLD_DEFAULTS.awaitingResultDays;
  const pendingApprovalHours = Number.isFinite(Number(thresholds.pendingApprovalHours)) ? thresholds.pendingApprovalHours : THRESHOLD_DEFAULTS.pendingApprovalHours;
  // 2026-08-20 job-aging SLA (dashboard Job Aging card). Defaults must match
  // ATS_REPORTING_THRESHOLD_DEFAULTS in the API and the legacy page, or the
  // card scores against one number while this page shows another.
  const jobAgingTargetDays = Number.isFinite(Number(thresholds.jobAgingTargetDays)) ? thresholds.jobAgingTargetDays : THRESHOLD_DEFAULTS.jobAgingTargetDays;
  const jobNoSubmittalDays = Number.isFinite(Number(thresholds.jobNoSubmittalDays)) ? thresholds.jobNoSubmittalDays : THRESHOLD_DEFAULTS.jobNoSubmittalDays;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>

        {/* Application Settings */}
        <Panel icon={<UserSearch size={16} />} title="Application Settings">
          <div style={{ padding: 6, display: 'grid', gap: 14 }}>
            <SettingRow
              label="Auto-Create Candidate"
              description="Automatically create a candidate record when an application is received"
              control={(
                <Switch
                  label="Auto-Create Candidate"
                  checked={settings?.autoCreateCandidate ?? true}
                  onChange={v => update('autoCreateCandidate', v)}
                />
              )}
            />
            <SettingRow
              label="Require signed Rate Confirmation"
              description="Block forward stage moves until a Rate Confirmation envelope is signed by both parties. Leave off unless rate confirmations are part of your standard placement workflow."
              control={(
                <Switch
                  label="Require signed Rate Confirmation"
                  checked={settings?.requireRateConfirmation ?? false}
                  onChange={v => update('requireRateConfirmation', v)}
                />
              )}
            />
            <SettingRow
              label="Suggest candidates across companies"
              description="Let this company's job suggestions also draw from other companies in your organization (shown in a separate section). Use when this company has a small candidate pool."
              control={(
                <Switch
                  label="Suggest candidates across companies"
                  checked={settings?.crossCompanySuggestions ?? false}
                  onChange={v => update('crossCompanySuggestions', v)}
                />
              )}
            />
            <FieldBlock
              id="ats-default-stage"
              label="Default Stage"
              hint="Stage assigned to new applications when created"
            >
              <Select
                id="ats-default-stage"
                value={settings?.defaultStageOnApply ?? ''}
                onChange={e => update('defaultStageOnApply', e.target.value || null)}
                style={{ width: 'auto' }}
              >
                <option value="">First stage (default)</option>
                {stages.map(s => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </Select>
            </FieldBlock>
          </div>
        </Panel>

        {/* Reporting Thresholds (Phase 2) */}
        <Panel icon={<BarChart3 size={16} />} title="Reporting Thresholds">
          <div style={{ padding: 6, display: 'grid', gap: 14 }}>
            <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: 0 }}>
              Controls when records appear on the ATS Reporting “Needs attention” cards.
            </p>

            <FieldBlock
              id="ats-stale-days"
              label="Stale applications"
              hint="Applications stuck in the same stage longer than this many days flag as stale."
            >
              <UnitNumber
                id="ats-stale-days"
                unit="days"
                min="1"
                max="365"
                value={staleDays}
                aria-label="Stale applications, days"
                onChange={(e) => updateThreshold('staleDays', e.target.value)}
                onBlur={(e) => updateThreshold('staleDays', normaliseThreshold('staleDays', e.target.value))}
              />
            </FieldBlock>

            <FieldBlock
              id="ats-awaiting-days"
              label="Awaiting interview result"
              hint="Interviews older than this without a captured Proceed / Reject result flag as awaiting."
            >
              <UnitNumber
                id="ats-awaiting-days"
                unit="days"
                min="1"
                max="60"
                value={awaitingResultDays}
                aria-label="Awaiting interview result, days"
                onChange={(e) => updateThreshold('awaitingResultDays', e.target.value)}
                onBlur={(e) => updateThreshold('awaitingResultDays', normaliseThreshold('awaitingResultDays', e.target.value))}
              />
            </FieldBlock>

            <FieldBlock
              id="ats-pending-hours"
              label="Pending job approvals"
              hint="Jobs awaiting approval longer than this flag as overdue."
            >
              <UnitNumber
                id="ats-pending-hours"
                unit="hours"
                min="1"
                max="720"
                value={pendingApprovalHours}
                aria-label="Pending job approvals, hours"
                onChange={(e) => updateThreshold('pendingApprovalHours', e.target.value)}
                onBlur={(e) => updateThreshold('pendingApprovalHours', normaliseThreshold('pendingApprovalHours', e.target.value))}
              />
            </FieldBlock>
            {/* Job-aging SLA. These two drive the dashboard's Job Aging &
                Delivery SLA card — without them the card scores every org
                against the defaults with no way to tune it. */}
            <FieldBlock
              id="ats-job-aging-target"
              label="Job aging target"
              hint="Open jobs older than this (from approval) flag red on the dashboard's Job Aging card."
            >
              <UnitNumber
                id="ats-job-aging-target"
                unit="days"
                min="1"
                max="365"
                value={jobAgingTargetDays}
                aria-label="Job aging target, days"
                onChange={(e) => updateThreshold('jobAgingTargetDays', e.target.value)}
                onBlur={(e) => updateThreshold('jobAgingTargetDays', normaliseThreshold('jobAgingTargetDays', e.target.value))}
              />
            </FieldBlock>
            <FieldBlock
              id="ats-job-no-submittal"
              label="Submittal window"
              hint="Open jobs with no new submittal within this window flag amber on the Job Aging card."
            >
              <UnitNumber
                id="ats-job-no-submittal"
                unit="days"
                min="1"
                max="60"
                value={jobNoSubmittalDays}
                aria-label="Submittal window, days"
                onChange={(e) => updateThreshold('jobNoSubmittalDays', e.target.value)}
                onBlur={(e) => updateThreshold('jobNoSubmittalDays', normaliseThreshold('jobNoSubmittalDays', e.target.value))}
              />
            </FieldBlock>
          </div>
        </Panel>
      </div>

      {/* Careers Site — full-width card below the two-column grid. */}
      <CareersCard orgSlug={currentOrg?.slug} />

      <div>
        <Button onClick={handleSave} disabled={saving} iconLeft={<Save size={15} />}>
          {saving ? 'Saving...' : 'Save ATS Settings'}
        </Button>
      </div>
    </div>
  );
}
