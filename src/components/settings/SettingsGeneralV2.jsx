/**
 * SettingsGeneral — Odoo-style Organization Settings page
 * Org-level config: Company info, Branding, Users & Licenses, Trial status.
 * Personal profile stuff has been moved to SettingsProfile.jsx.
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { usePlatform } from '../../context/PlatformContext';
import {
  Loader2, Check, Globe, Calendar, CreditCard, Send,
  Upload, Building2, Crown, Phone, Link2, ChevronRight, Mail,
  Lock, AlertTriangle, Database, Download,
} from 'lucide-react';
import api from '../../utils/api';
import {
  Panel, Chip, Button, Input, Textarea, Switch, Modal, Callout, EmptyState, Meter,
} from '../ds';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ This page holds the three most destructive actions in the product, and
// none of them was triggered during verification:
//
//   1. DELETE ORGANIZATION — permanently removes every record in the workspace
//      for every member. Guarded by typing the exact slug; the slug was never
//      typed.
//   2. RESTORE BACKUP — REPLACES all current data with the backup's. Guarded by
//      a two-step dialog then typing RESTORE; the word was never typed.
//   3. CREATE BACKUP — a write.
//
// Also not triggered: "Resend workspace URL email" (sends mail), the logo
// upload and delete, Save branding, Save authentication, and Export data
// (which downloads every record in the workspace).
//
// Four verbatim slices — AuthenticationSection (46), DangerZoneSection (53),
// DataBackupSection (66) and the page body (96). The confirmation gates in
// particular are byte-identical: `confirmSlug !== slug`, `confirmText !== 'RESTORE'`,
// and the "at least one auth method" check, which is what stops an admin
// locking every member out of the org.
// ─────────────────────────────────────────────────────────────────────────────

/** Plan → label + tone. Legacy mapped `core` and `all_apps` to the same amber
 *  as `pro`, and anything unknown to neutral; kept exactly. */
const PLAN_LABELS = { pro: 'Pro', enterprise: 'Enterprise', core: 'Core', all_apps: 'All Apps' };
const PLAN_TONES = { pro: 'warn', enterprise: 'purple', core: 'warn', all_apps: 'warn' };

// Reusable Odoo-style section header
function SectionHeader({ title }) {
  return (
    <div style={{
      background: 'var(--surface-2)',
      borderTop: '1px solid var(--line-2)', borderBottom: '1px solid var(--line-2)',
      padding: '8px 18px', margin: '28px -18px 18px',
      font: "700 10.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-3)',
      textTransform: 'uppercase', letterSpacing: '0.08em',
    }}>
      {title}
    </div>
  );
}

/** Icon + fixed-width caption + value, the shape the Company grid repeats. */
function InfoRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span style={{ color: 'var(--fg-4)', flexShrink: 0, display: 'grid', placeItems: 'center' }}>{icon}</span>
      <span style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', width: 92, flexShrink: 0 }}>{label}</span>
      <span style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

/** Label above a bordered field group, as Branding uses. */
function BrandField({ id, label, icon, children, align = 'center' }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', font: "400 11px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginBottom: 6 }}>
        {label}
      </label>
      <div style={{
        display: 'flex', alignItems: align, gap: 10, padding: '8px 12px',
        background: 'var(--surface-2)', borderRadius: 'var(--r-2)', boxShadow: '0 0 0 1px var(--line)',
      }}>
        <span style={{ color: 'var(--fg-4)', flexShrink: 0, display: 'grid', placeItems: 'center', marginTop: align === 'flex-start' ? 3 : 0 }}>{icon}</span>
        {children}
      </div>
    </div>
  );
}

/** Borderless control that sits inside a BrandField's own border. */
const bare = {
  background: 'transparent', boxShadow: 'none', border: 0, outline: 'none',
  width: '100%', height: 'auto', padding: 0,
  font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg)',
};

/** Auth-method row: icon tile, name, description, switch. */
function AuthRow({ icon, title, description, checked, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--r-2)', boxShadow: '0 0 0 1px var(--line)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ width: 32, height: 32, borderRadius: 'var(--r-1)', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--surface-3, var(--surface-1))' }}>
          {icon}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', font: "500 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{title}</span>
          <span style={{ display: 'block', font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 2 }}>{description}</span>
        </span>
      </span>
      <Switch label={title} checked={checked} onChange={onChange} />
    </div>
  );
}

/** The Google mark, unchanged — it is a brand asset, not a themeable icon. */
function GoogleMark() {
  return (
    <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
  );
}

/**
 * AuthenticationSection — Org-level authentication method toggles
 */
function AuthenticationSection({ currentOrg }) {
  const allowedMethods = currentOrg?.authSettings?.allowedMethods || ['google'];
  const [googleEnabled, setGoogleEnabled] = useState(allowedMethods.includes('google'));
  const [passwordEnabled, setPasswordEnabled] = useState(allowedMethods.includes('password'));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Sync state when org data changes
  useEffect(() => {
    const methods = currentOrg?.authSettings?.allowedMethods || ['google'];
    setGoogleEnabled(methods.includes('google'));
    setPasswordEnabled(methods.includes('password'));
  }, [currentOrg?.authSettings?.allowedMethods]);

  const hasChanges = (() => {
    const currentGoogle = allowedMethods.includes('google');
    const currentPassword = allowedMethods.includes('password');
    return googleEnabled !== currentGoogle || passwordEnabled !== currentPassword;
  })();

  const handleSave = async () => {
    setError('');
    if (!googleEnabled && !passwordEnabled) {
      setError('At least one authentication method must be enabled.');
      return;
    }

    const methods = [];
    if (googleEnabled) methods.push('google');
    if (passwordEnabled) methods.push('password');

    setSaving(true);
    try {
      const res = await api.updateOrgAuthSettings(currentOrg.slug, { allowedMethods: methods });
      if (res.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(res.error || 'Failed to save');
      }
    } catch (err) {
      setError(err.message || 'Failed to save authentication settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SectionHeader title="Authentication" />

      <p style={{ font: "400 11px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 14px' }}>
        Control which sign-in methods are available for your organization members.
      </p>

      {error && <Callout tone="danger" icon={<AlertTriangle size={15} />} style={{ marginBottom: 14 }}>{error}</Callout>}

      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <AuthRow
          icon={<GoogleMark />}
          title="Google Sign-In"
          description="Members sign in with their Google account"
          checked={googleEnabled}
          onChange={() => setGoogleEnabled(!googleEnabled)}
        />
        <AuthRow
          icon={<Lock size={15} style={{ color: 'var(--fg-3)' }} />}
          title="Email & Password"
          description="Members sign in with email and password"
          checked={passwordEnabled}
          onChange={() => setPasswordEnabled(!passwordEnabled)}
        />
      </div>

      {!googleEnabled && !passwordEnabled && (
        <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--danger)', margin: '0 0 12px' }}>
          At least one method must be enabled.
        </p>
      )}

      <Button
        onClick={handleSave}
        disabled={saving || !hasChanges || (!googleEnabled && !passwordEnabled)}
        size="sm"
        iconLeft={saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : undefined}
      >
        {saved ? 'Saved' : 'Save'}
      </Button>
    </>
  );
}

/**
 * DangerZoneSection — owner-only: full data export (JSONL download) and
 * permanent organization deletion (type-the-slug confirmation; backend also
 * writes an audit row and detaches user accounts without deleting them).
 */
function DangerZoneSection({ currentOrg }) {
  const slug = currentOrg?.slug;
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleExport = async () => {
    if (!slug || exporting) return;
    setExporting(true);
    setError('');
    try {
      const token = localStorage.getItem('rivvra_token');
      const resp = await fetch(`${api.baseUrl}/api/org/${slug}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error || `Export failed (${resp.status})`);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rivvra-export-${slug}-${new Date().toISOString().slice(0, 10)}.jsonl`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (confirmSlug !== slug || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await api.request(`/api/org/${slug}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmSlug }),
      });
      // Org is gone — clear local state and send the user to the landing page.
      localStorage.removeItem('rivvra_user');
      window.location.href = '/';
    } catch (err) {
      setError(err.message || 'Deletion failed');
      setDeleting(false);
    }
  };

  return (
    <section style={{
      background: 'var(--surface-1)', borderRadius: 'var(--r-3)', padding: 20, marginTop: 24,
      boxShadow: '0 0 0 1px color-mix(in srgb, var(--danger) 26%, transparent)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle size={15} style={{ color: 'var(--danger)' }} />
        <h2 style={{ font: "650 14px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>Danger zone</h2>
      </div>
      <p style={{ font: "400 11px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 18px' }}>
        Export everything your organization owns, or permanently close this workspace.
      </p>

      {/* Export */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '12px 0', borderTop: '1px solid var(--line-2)',
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ font: "500 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>Export all data</p>
          <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
            Download every record in this workspace as a JSON Lines file. Files stored in the cloud are referenced by URL.
          </p>
        </div>
        <Button
          variant="secondary" size="sm" onClick={handleExport} disabled={exporting}
          style={{ flexShrink: 0 }}
          iconLeft={exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        >
          {exporting ? 'Exporting…' : 'Export data'}
        </Button>
      </div>

      {/* Delete */}
      <div style={{ padding: '12px 0', borderTop: '1px solid var(--line-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ font: "500 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: 0 }}>Delete this organization</p>
            <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
              Permanently removes all workspace data for every member. User accounts are kept. This cannot be undone.
            </p>
          </div>
          {!deleteOpen && (
            <Button
              variant="danger" size="sm" style={{ flexShrink: 0 }}
              onClick={() => { setDeleteOpen(true); setConfirmSlug(''); setError(''); }}
            >
              Delete organization
            </Button>
          )}
        </div>
        {deleteOpen && (
          <div style={{
            marginTop: 16, padding: 14, borderRadius: 'var(--r-2)',
            background: 'var(--danger-soft)',
            boxShadow: '0 0 0 1px color-mix(in srgb, var(--danger) 26%, transparent)',
          }}>
            <p style={{ font: "400 11.5px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: '0 0 10px' }}>
              We strongly recommend exporting your data first. To confirm, type the workspace ID{' '}
              <span style={{ font: "600 11.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace", color: 'var(--danger)' }}>{slug}</span> below:
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Input
                type="text"
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                placeholder={slug}
                aria-label="Type the workspace ID to confirm deletion"
                disabled={deleting}
                style={{ flex: 1, minWidth: 200 }}
              />
              <Button
                variant="danger" size="sm"
                onClick={handleDelete}
                disabled={confirmSlug !== slug || deleting}
                iconLeft={deleting ? <Loader2 size={14} className="animate-spin" /> : undefined}
              >
                {deleting ? 'Deleting…' : 'Permanently delete'}
              </Button>
              <Button
                variant="ghost" size="sm" disabled={deleting}
                onClick={() => { setDeleteOpen(false); setConfirmSlug(''); setError(''); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--danger)', margin: '8px 0 0' }}>{error}</p>
      )}
    </section>
  );
}

/**
 * DataBackupSection — Org owner backup management
 */
function DataBackupSection({ currentOrg }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [restoreStep, setRestoreStep] = useState(null); // null | { backupId, step: 1|2 }
  const [restoring, setRestoring] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const slug = currentOrg?.slug;

  const loadBackups = async () => {
    if (!slug) return;
    try {
      setLoading(true);
      setError('');
      const res = await api.request(`/api/org/${slug}/backups`);
      setBackups(res.backups || []);
    } catch (err) {
      setError(err.message || 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, [slug]);

  const handleCreate = async () => {
    try {
      setCreating(true);
      setError('');
      await api.request(`/api/org/${slug}/backups/create`, { method: 'POST' });
      setSuccess('Backup created successfully');
      setTimeout(() => setSuccess(''), 3000);
      await loadBackups();
    } catch (err) {
      setError(err.message || 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (backupId) => {
    try {
      setRestoring(true);
      setError('');
      const res = await api.request(`/api/org/${slug}/backups/${backupId}/restore`, { method: 'POST' });
      setSuccess(res.message || 'Restore complete');
      setRestoreStep(null);
      setConfirmText('');
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message || 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '—';
    return bytes >= 1048576
      ? `${(bytes / 1048576).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <>
      <SectionHeader title="Data Backup" />

      <p style={{ font: "400 11px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 14px' }}>
        Create manual backups of your organization data. Backups from the last 4 weeks are shown below.
      </p>

      {error && <Callout tone="danger" icon={<AlertTriangle size={15} />} style={{ marginBottom: 14 }}>{error}</Callout>}
      {success && <Callout tone="brand" icon={<Check size={15} />} style={{ marginBottom: 14 }}>{success}</Callout>}

      {/* Backup Button */}
      <div style={{ marginBottom: 18 }}>
        <Button
          onClick={handleCreate} disabled={creating} size="sm"
          iconLeft={creating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        >
          Create Backup Now
        </Button>
      </div>

      {/* Backup List */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 0' }}>
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
        </div>
      ) : backups.length === 0 ? (
        <EmptyState icon={<Database size={22} />} compact title="No backups yet">
          Create your first backup to protect your data.
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {backups.map((b) => {
            const dateStr = new Date(b.createdAt).toLocaleDateString('en-US', {
              year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            return (
              <div key={b._id || b.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--r-2)', boxShadow: '0 0 0 1px var(--line)',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 'var(--r-1)', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--surface-1)' }}>
                    <Database size={15} style={{ color: 'var(--fg-3)' }} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', font: "500 12.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{dateStr}</span>
                    <span style={{ display: 'block', font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 2 }}>
                      {formatSize(b.sizeBytes)} &middot; {b.documentCount ?? 0} documents &middot; {b.collectionCount ?? 0} collections
                    </span>
                  </span>
                </span>
                <Button
                  variant="secondary" size="sm" style={{ flexShrink: 0 }}
                  onClick={() => setRestoreStep({ backupId: b._id, step: 1, date: dateStr })}
                >
                  Restore
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 2-Step Restore Confirmation Modal ──────────────────────────── */}
      <Modal
        open={!!restoreStep}
        onClose={() => { setRestoreStep(null); setConfirmText(''); }}
        size="sm"
        tone={restoreStep?.step === 2 ? 'danger' : 'warn'}
        icon={<AlertTriangle size={18} />}
        title={restoreStep?.step === 2 ? 'Final Confirmation' : 'Restore Backup?'}
        sub={restoreStep?.step === 2 ? 'This action cannot be undone' : (restoreStep ? `Backup from ${restoreStep.date}` : undefined)}
        footer={restoreStep?.step === 2 ? (
          <>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={() => { setRestoreStep(null); setConfirmText(''); }}>Cancel</Button>
            <Button
              variant="danger" size="sm"
              disabled={confirmText !== 'RESTORE' || restoring}
              onClick={() => handleRestore(restoreStep.backupId)}
              iconLeft={restoring ? <Loader2 size={14} className="animate-spin" /> : undefined}
            >
              {restoring ? 'Restoring...' : 'Restore Now'}
            </Button>
          </>
        ) : (
          <>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={() => { setRestoreStep(null); setConfirmText(''); }}>Cancel</Button>
            <Button variant="secondary" size="sm" onClick={() => setRestoreStep(prev => ({ ...prev, step: 2 }))}>
              I understand, continue
            </Button>
          </>
        )}
      >
        {restoreStep?.step === 2 ? (
          <div>
            <p style={{ font: "400 12.5px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: '0 0 10px' }}>
              Type <strong style={{ color: 'var(--fg)' }}>RESTORE</strong> to confirm:
            </p>
            <Input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type RESTORE"
              aria-label="Type RESTORE to confirm"
              autoFocus
            />
          </div>
        ) : (
          <Callout tone="danger">
            This will <strong>replace all current data</strong> with the backup data. Any changes made after this backup will be lost.
          </Callout>
        )}
      </Modal>
    </>
  );
}

export default function SettingsGeneralV2() {
  const navigate = useNavigate();
  const { orgPath } = usePlatform();
  const { user } = useAuth();
  const { currentOrg, isOrgAdmin, isOrgOwner } = useOrg();

  // License data (fetched for org owners/admins)
  const [licenses, setLicenses] = useState(null);
  useEffect(() => {
    if (isOrgAdmin || isOrgOwner) {
      api.getTeamMembers().then(res => {
        if (res.licenses) setLicenses(res.licenses);
      }).catch(() => {});
    }
  }, [isOrgAdmin, isOrgOwner]);

  // Resend welcome email
  const [resendingWelcome, setResendingWelcome] = useState(false);
  const [welcomeResent, setWelcomeResent] = useState(false);

  const handleResendWelcome = async () => {
    setResendingWelcome(true);
    try {
      const res = await api.resendWelcomeEmail();
      if (res.success) {
        setWelcomeResent(true);
        setTimeout(() => setWelcomeResent(false), 3000);
      }
    } catch (err) { /* ignore */ } finally {
      setResendingWelcome(false);
    }
  };

  // Company Branding (org owner/admin)
  const [brandWebsite, setBrandWebsite] = useState('');
  const [brandAddress, setBrandAddress] = useState('');
  const [brandPhone, setBrandPhone] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const logoInputRef = useRef(null);

  // Initialise branding fields from currentOrg
  useEffect(() => {
    if (currentOrg) {
      setBrandWebsite(currentOrg.companyWebsite || '');
      setBrandAddress(currentOrg.companyAddress || '');
      setBrandPhone(currentOrg.companyPhone || '');
      if (currentOrg.logoAvailable && currentOrg.slug) {
        setLogoPreviewUrl(`${api.baseUrl}/api/org/${currentOrg.slug}/logo?t=${Date.now()}`);
      } else {
        setLogoPreviewUrl(null);
      }
    }
  }, [currentOrg]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const res = await api.uploadOrgLogo(currentOrg.slug, formData);
      if (res.success) {
        setLogoPreviewUrl(`${api.baseUrl}/api/org/${currentOrg.slug}/logo?t=${Date.now()}`);
      }
    } catch (err) { /* ignore */ } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleDeleteLogo = async () => {
    try {
      const res = await api.deleteOrgLogo(currentOrg.slug);
      if (res.success) setLogoPreviewUrl(null);
    } catch (err) { /* ignore */ }
  };

  const handleSaveBranding = async () => {
    setSavingBranding(true);
    try {
      const res = await api.updateOrg(currentOrg.slug, {
        companyWebsite: brandWebsite.trim(),
        companyAddress: brandAddress.trim(),
        companyPhone: brandPhone.trim(),
      });
      if (res.success) {
        setBrandingSaved(true);
        setTimeout(() => setBrandingSaved(false), 2000);
      }
    } catch (err) { /* ignore */ } finally {
      setSavingBranding(false);
    }
  };

  // If no org or not admin, show a message
  if (!currentOrg || (!isOrgAdmin && !isOrgOwner)) {
    return (
      <Panel>
        <EmptyState icon={<Building2 size={22} />} title="Organization Settings">
          {!currentOrg
            ? 'No organization found. Join or create an organization to access these settings.'
            : 'You need admin or owner access to view organization settings.'}
        </EmptyState>
      </Panel>
    );
  }

  const orgLogoUrl = currentOrg.logoAvailable && currentOrg.slug
    ? `${api.baseUrl}/api/org/${currentOrg.slug}/logo?t=${Date.now()}`
    : null;

  const brandingUnchanged = (
    brandWebsite.trim() === (currentOrg?.companyWebsite || '') &&
    brandAddress.trim() === (currentOrg?.companyAddress || '') &&
    brandPhone.trim() === (currentOrg?.companyPhone || '')
  );

  return (
    <Panel style={{ padding: '4px 18px 28px' }}>

      {/* ═══════════════════════ COMPANY ═══════════════════════ */}
      <SectionHeader title="Company" />

      {/* Company Header: Logo + Name + Plan */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        {/* Org logo */}
        <div style={{ flexShrink: 0 }}>
          {orgLogoUrl ? (
            <img src={orgLogoUrl} alt={currentOrg.name}
              style={{ width: 54, height: 54, borderRadius: 'var(--r-2)', objectFit: 'contain', background: 'var(--surface-2)' }} />
          ) : (
            <div style={{ width: 54, height: 54, borderRadius: 'var(--r-2)', background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}>
              <Building2 size={24} style={{ color: 'var(--fg-4)' }} />
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ font: "700 16px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.012em', color: 'var(--fg)', margin: 0 }}>
              {currentOrg.name}
            </h2>
            {currentOrg.plan && (
              <Chip tone={PLAN_TONES[currentOrg.plan] || 'neutral'}>
                <Crown size={11} /> {PLAN_LABELS[currentOrg.plan] || 'Free'}
              </Chip>
            )}
          </div>
          <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>
            {currentOrg.domain || 'No domain'} &middot; Created {currentOrg.createdAt ? new Date(currentOrg.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
          </p>
        </div>
      </div>

      {/* Company Info — two column */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', rowGap: 12, columnGap: 32, marginBottom: 18 }}>
        <InfoRow icon={<Globe size={15} />} label="Org URL" value={`rivvra.com/#/org/${currentOrg.slug}`} />
        <InfoRow icon={<Mail size={15} />} label="Domain" value={currentOrg.domain || '-'} />
        <InfoRow icon={<CreditCard size={15} />} label="Enabled Apps" value={currentOrg.enabledApps?.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', ') || '-'} />
        <InfoRow icon={<Calendar size={15} />} label="Created" value={currentOrg.createdAt ? new Date(currentOrg.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'} />
      </div>

      {/* Action link: Resend workspace URL email */}
      <Button
        variant="ghost" size="sm"
        onClick={handleResendWelcome}
        disabled={resendingWelcome || welcomeResent}
        iconLeft={resendingWelcome ? <Loader2 size={13} className="animate-spin" /> : welcomeResent ? <Check size={13} /> : <Send size={13} />}
      >
        {welcomeResent ? 'Email sent!' : 'Resend workspace URL email'}
      </Button>

      {/* ═══════════════════════ BRANDING ═══════════════════════ */}
      <SectionHeader title="Branding" />

      <p style={{ font: "400 11px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 18px' }}>
        Your logo and company details appear in all outgoing emails (invites, timesheets, notifications).
      </p>

      {/* Logo Upload */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => logoInputRef.current?.click()}
          disabled={uploadingLogo}
          aria-label="Upload organization logo"
          style={{
            position: 'relative', width: 76, height: 76, flexShrink: 0, cursor: 'pointer',
            borderRadius: 'var(--r-2)', border: '2px dashed var(--line-2)', background: 'var(--surface-2)',
            display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 0,
          }}
        >
          {uploadingLogo ? (
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
          ) : logoPreviewUrl ? (
            <img src={logoPreviewUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
          ) : (
            <span style={{ textAlign: 'center' }}>
              <Upload size={18} style={{ color: 'var(--fg-4)', display: 'block', margin: '0 auto 4px' }} />
              <span style={{ font: "400 10px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Upload</span>
            </span>
          )}
        </button>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={handleLogoUpload}
          style={{ display: 'none' }}
        />
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <p style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: 0 }}>Organization Logo</p>
          <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 8px' }}>PNG, JPG, WEBP or SVG — max 2 MB</p>
          {logoPreviewUrl && (
            <Button variant="ghost" size="sm" onClick={handleDeleteLogo} style={{ color: 'var(--danger)' }}>
              Remove logo
            </Button>
          )}
        </div>
      </div>

      {/* Branding Fields — two column */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 14 }}>
        <BrandField id="brand-website" label="Company Website" icon={<Link2 size={15} />}>
          <input
            id="brand-website"
            type="url"
            value={brandWebsite}
            onChange={(e) => { setBrandWebsite(e.target.value); setBrandingSaved(false); }}
            placeholder="https://yourcompany.com"
            style={bare}
          />
        </BrandField>
        <BrandField id="brand-phone" label="Company Phone" icon={<Phone size={15} />}>
          <input
            id="brand-phone"
            type="tel"
            value={brandPhone}
            onChange={(e) => { setBrandPhone(e.target.value); setBrandingSaved(false); }}
            placeholder="+1 (555) 123-4567"
            style={bare}
          />
        </BrandField>
      </div>
      <div style={{ marginBottom: 18 }}>
        <BrandField id="brand-address" label="Company Address" icon={<Building2 size={15} />} align="flex-start">
          <textarea
            id="brand-address"
            value={brandAddress}
            onChange={(e) => { setBrandAddress(e.target.value); setBrandingSaved(false); }}
            placeholder="123 Main St, City, Country"
            rows={2}
            style={{ ...bare, resize: 'none' }}
          />
        </BrandField>
      </div>

      {/* Save Branding */}
      <Button
        onClick={handleSaveBranding}
        disabled={savingBranding || brandingUnchanged}
        size="sm"
        iconLeft={savingBranding ? <Loader2 size={14} className="animate-spin" /> : brandingSaved ? <Check size={14} /> : undefined}
      >
        {brandingSaved ? 'Saved' : 'Save'}
      </Button>

      {/* ═══════════════════════ AUTHENTICATION ═══════════════════════ */}
      <AuthenticationSection currentOrg={currentOrg} />

      {/* ═══════════════════════ USERS & LICENSES ═══════════════════════ */}
      <SectionHeader title="Users & Licenses" />

      {licenses ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 14 }}>
            {[
              { label: 'Active Users', value: licenses.used || 0, color: 'var(--fg)' },
              { label: 'Total Licenses', value: licenses.total || 0, color: 'var(--fg)' },
              { label: 'Available', value: licenses.remaining || 0, color: 'var(--brand-ink)' },
              { label: 'Pending Invites', value: licenses.pendingInvites || 0, color: 'var(--warn-ink)' },
            ].map(s => (
              <div key={s.label} style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 'var(--r-2)' }}>
                <p style={{ font: "700 21px/1.2 'Inter', system-ui, sans-serif", color: s.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                <p style={{ font: "400 11px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '3px 0 0' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Usage Bar */}
          <Meter value={licenses.total ? Math.min(100, ((licenses.used || 0) / licenses.total) * 100) : 0} style={{ marginBottom: 8 }} />
          <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 18px' }}>
            {licenses.used || 0} of {licenses.total || 0} licenses used ({licenses.total ? Math.round(((licenses.used || 0) / licenses.total) * 100) : 0}%)
          </p>
        </>
      ) : (
        <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 18px' }}>Loading license data...</p>
      )}

      {/* Action link: Manage Users */}
      <Button variant="ghost" size="sm" onClick={() => navigate(orgPath('/settings/users'))} iconLeft={<ChevronRight size={13} />}>
        Manage Users &amp; Teams
      </Button>

      {/* ═══════════════════════ DATA BACKUP ═══════════════════════ */}
      {isOrgOwner && <DataBackupSection currentOrg={currentOrg} />}

      {/* ═══════════════════════ DANGER ZONE ═══════════════════════ */}
      {isOrgOwner && <DangerZoneSection currentOrg={currentOrg} />}
    </Panel>
  );
}
