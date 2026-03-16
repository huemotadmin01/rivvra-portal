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
  Loader2, Check, Users, Globe, Calendar, CreditCard, Send,
  Upload, Building2, Crown, Phone, Link2, Image, ChevronRight, Mail,
  Lock, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import api from '../../utils/api';

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

      <p className="text-xs text-dark-400 mb-4">
        Control which sign-in methods are available for your organization members.
      </p>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="space-y-3 mb-4">
        {/* Google Toggle */}
        <div className="flex items-center justify-between p-3 bg-dark-800/50 border border-dark-700 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white">Google Sign-In</p>
              <p className="text-xs text-dark-500">Members sign in with their Google account</p>
            </div>
          </div>
          <button
            onClick={() => setGoogleEnabled(!googleEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${googleEnabled ? 'bg-rivvra-500' : 'bg-dark-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${googleEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Password Toggle */}
        <div className="flex items-center justify-between p-3 bg-dark-800/50 border border-dark-700 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center">
              <Lock className="w-4 h-4 text-dark-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Email &amp; Password</p>
              <p className="text-xs text-dark-500">Members sign in with email and password</p>
            </div>
          </div>
          <button
            onClick={() => setPasswordEnabled(!passwordEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${passwordEnabled ? 'bg-rivvra-500' : 'bg-dark-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${passwordEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {!googleEnabled && !passwordEnabled && (
        <p className="text-xs text-red-400 mb-3">At least one method must be enabled.</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !hasChanges || (!googleEnabled && !passwordEnabled)}
        className="px-4 py-2 bg-rivvra-500 text-dark-950 rounded-lg hover:bg-rivvra-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-1.5"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><Check className="w-4 h-4" /> Saved</> : 'Save'}
      </button>
    </>
  );
}

// Reusable Odoo-style section header
function SectionHeader({ title }) {
  return (
    <div className="bg-dark-800/30 border-y border-dark-700/50 px-4 py-2.5 -mx-6 mb-5 mt-8 first:mt-0">
      <h3 className="text-xs font-bold text-dark-300 uppercase tracking-wider">{title}</h3>
    </div>
  );
}

export default function SettingsGeneral() {
  const navigate = useNavigate();
  const { orgPath } = usePlatform();
  const { user } = useAuth();
  const { currentOrg, isOrgAdmin, isOrgOwner, trial } = useOrg();

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
    } catch { /* ignore */ } finally {
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
    } catch { /* ignore */ } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleDeleteLogo = async () => {
    try {
      const res = await api.deleteOrgLogo(currentOrg.slug);
      if (res.success) setLogoPreviewUrl(null);
    } catch { /* ignore */ }
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
    } catch { /* ignore */ } finally {
      setSavingBranding(false);
    }
  };

  // If no org or not admin, show a message
  if (!currentOrg || (!isOrgAdmin && !isOrgOwner)) {
    return (
      <div className="card p-8 text-center">
        <Building2 className="w-10 h-10 text-dark-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-white mb-2">Organization Settings</h3>
        <p className="text-dark-400 text-sm">
          {!currentOrg
            ? 'No organization found. Join or create an organization to access these settings.'
            : 'You need admin or owner access to view organization settings.'}
        </p>
      </div>
    );
  }

  const orgLogoUrl = currentOrg.logoAvailable && currentOrg.slug
    ? `${api.baseUrl}/api/org/${currentOrg.slug}/logo?t=${Date.now()}`
    : null;

  return (
    <div className="card px-6 py-2 pb-8">

      {/* ═══════════════════════ COMPANY ═══════════════════════ */}
      <SectionHeader title="Company" />

      {/* Company Header: Logo + Name + Plan */}
      <div className="flex items-start gap-4 mb-6">
        {/* Org logo */}
        <div className="flex-shrink-0">
          {orgLogoUrl ? (
            <img src={orgLogoUrl} alt={currentOrg.name} className="w-14 h-14 rounded-xl object-contain bg-dark-800" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-dark-800 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-dark-500" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">{currentOrg.name}</h2>
            {currentOrg.plan && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                currentOrg.plan === 'pro' ? 'bg-amber-500/20 text-amber-300' :
                currentOrg.plan === 'enterprise' ? 'bg-purple-500/20 text-purple-300' :
                currentOrg.plan === 'trial' ? 'bg-rivvra-500/20 text-rivvra-300' :
                'bg-dark-700 text-dark-300'
              }`}>
                <Crown className="w-3 h-3" />
                {currentOrg.plan === 'pro' ? 'Pro' :
                 currentOrg.plan === 'enterprise' ? 'Enterprise' :
                 currentOrg.plan === 'trial' ? 'Trial' : 'Free'}
              </span>
            )}
          </div>
          <p className="text-sm text-dark-400 mt-0.5">
            {currentOrg.domain || 'No domain'} &middot; Created {currentOrg.createdAt ? new Date(currentOrg.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
          </p>
        </div>
      </div>

      {/* Company Info — two column */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8 mb-5">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-dark-500 flex-shrink-0" />
          <span className="text-xs text-dark-500 w-24 flex-shrink-0">Org URL</span>
          <span className="text-sm text-white truncate">rivvra.com/#/org/{currentOrg.slug}</span>
        </div>
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-dark-500 flex-shrink-0" />
          <span className="text-xs text-dark-500 w-24 flex-shrink-0">Domain</span>
          <span className="text-sm text-white">{currentOrg.domain || '-'}</span>
        </div>
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-dark-500 flex-shrink-0" />
          <span className="text-xs text-dark-500 w-24 flex-shrink-0">Enabled Apps</span>
          <span className="text-sm text-white">{currentOrg.enabledApps?.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', ') || '-'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-dark-500 flex-shrink-0" />
          <span className="text-xs text-dark-500 w-24 flex-shrink-0">Created</span>
          <span className="text-sm text-white">{currentOrg.createdAt ? new Date(currentOrg.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}</span>
        </div>
      </div>

      {/* Action link: Resend workspace URL email */}
      <button
        onClick={handleResendWelcome}
        disabled={resendingWelcome || welcomeResent}
        className="flex items-center gap-2 text-sm text-rivvra-400 hover:text-rivvra-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {resendingWelcome ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : welcomeResent ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Send className="w-3.5 h-3.5" />
        )}
        {welcomeResent ? 'Email sent!' : 'Resend workspace URL email'}
      </button>

      {/* ═══════════════════════ BRANDING ═══════════════════════ */}
      <SectionHeader title="Branding" />

      <p className="text-xs text-dark-500 mb-5">Your logo and company details appear in all outgoing emails (invites, timesheets, notifications).</p>

      {/* Logo Upload */}
      <div className="flex items-start gap-4 mb-6">
        <button
          type="button"
          onClick={() => logoInputRef.current?.click()}
          disabled={uploadingLogo}
          className="relative w-20 h-20 rounded-xl border-2 border-dashed border-dark-600 hover:border-rivvra-500/50 bg-dark-800/50 flex items-center justify-center transition-colors overflow-hidden flex-shrink-0 group"
        >
          {uploadingLogo ? (
            <Loader2 className="w-6 h-6 text-dark-400 animate-spin" />
          ) : logoPreviewUrl ? (
            <img src={logoPreviewUrl} alt="Logo" className="w-full h-full object-contain p-1" />
          ) : (
            <div className="text-center">
              <Upload className="w-5 h-5 text-dark-500 mx-auto mb-1" />
              <span className="text-[10px] text-dark-500">Upload</span>
            </div>
          )}
          {logoPreviewUrl && !uploadingLogo && (
            <div className="absolute inset-0 bg-dark-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" />
            </div>
          )}
        </button>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={handleLogoUpload}
          className="hidden"
        />
        <div className="flex-1 pt-1">
          <p className="text-sm text-dark-300 mb-1">Organization Logo</p>
          <p className="text-xs text-dark-600 mb-2">PNG, JPG, WEBP or SVG — max 2 MB</p>
          {logoPreviewUrl && (
            <button
              onClick={handleDeleteLogo}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Remove logo
            </button>
          )}
        </div>
      </div>

      {/* Branding Fields — two column */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs text-dark-500 mb-1.5">Company Website</label>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl">
            <Link2 className="w-4 h-4 text-dark-500 flex-shrink-0" />
            <input
              type="url"
              value={brandWebsite}
              onChange={(e) => { setBrandWebsite(e.target.value); setBrandingSaved(false); }}
              placeholder="https://yourcompany.com"
              className="bg-transparent text-white text-sm w-full outline-none placeholder:text-dark-600"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-dark-500 mb-1.5">Company Phone</label>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl">
            <Phone className="w-4 h-4 text-dark-500 flex-shrink-0" />
            <input
              type="tel"
              value={brandPhone}
              onChange={(e) => { setBrandPhone(e.target.value); setBrandingSaved(false); }}
              placeholder="+1 (555) 123-4567"
              className="bg-transparent text-white text-sm w-full outline-none placeholder:text-dark-600"
            />
          </div>
        </div>
      </div>
      <div className="mb-5">
        <label className="block text-xs text-dark-500 mb-1.5">Company Address</label>
        <div className="flex items-start gap-3 px-4 py-2.5 bg-dark-800/50 border border-dark-700 rounded-xl">
          <Building2 className="w-4 h-4 text-dark-500 flex-shrink-0 mt-0.5" />
          <textarea
            value={brandAddress}
            onChange={(e) => { setBrandAddress(e.target.value); setBrandingSaved(false); }}
            placeholder="123 Main St, City, Country"
            rows={2}
            className="bg-transparent text-white text-sm w-full outline-none placeholder:text-dark-600 resize-none"
          />
        </div>
      </div>

      {/* Save Branding */}
      <button
        onClick={handleSaveBranding}
        disabled={savingBranding || (
          brandWebsite.trim() === (currentOrg?.companyWebsite || '') &&
          brandAddress.trim() === (currentOrg?.companyAddress || '') &&
          brandPhone.trim() === (currentOrg?.companyPhone || '')
        )}
        className="px-4 py-2 bg-rivvra-500 text-dark-950 rounded-lg hover:bg-rivvra-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-1.5"
      >
        {savingBranding ? <Loader2 className="w-4 h-4 animate-spin" /> : brandingSaved ? <><Check className="w-4 h-4" /> Saved</> : 'Save'}
      </button>

      {/* ═══════════════════════ AUTHENTICATION ═══════════════════════ */}
      <AuthenticationSection currentOrg={currentOrg} />

      {/* ═══════════════════════ USERS & LICENSES ═══════════════════════ */}
      <SectionHeader title="Users & Licenses" />

      {licenses ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-4 bg-dark-800/30 rounded-xl">
              <p className="text-2xl font-bold text-white">{licenses.used || 0}</p>
              <p className="text-xs text-dark-400">Active Users</p>
            </div>
            <div className="p-4 bg-dark-800/30 rounded-xl">
              <p className="text-2xl font-bold text-white">{licenses.total || 0}</p>
              <p className="text-xs text-dark-400">Total Licenses</p>
            </div>
            <div className="p-4 bg-dark-800/30 rounded-xl">
              <p className="text-2xl font-bold text-rivvra-400">{licenses.remaining || 0}</p>
              <p className="text-xs text-dark-400">Available</p>
            </div>
            <div className="p-4 bg-dark-800/30 rounded-xl">
              <p className="text-2xl font-bold text-amber-400">{licenses.pendingInvites || 0}</p>
              <p className="text-xs text-dark-400">Pending Invites</p>
            </div>
          </div>

          {/* Usage Bar */}
          <div className="relative h-2 bg-dark-700 rounded-full overflow-hidden mb-2">
            <div
              className="absolute inset-y-0 left-0 bg-rivvra-500 rounded-full transition-all"
              style={{ width: `${licenses.total ? Math.min(100, ((licenses.used || 0) / licenses.total) * 100) : 0}%` }}
            />
          </div>
          <p className="text-xs text-dark-500 mb-5">
            {licenses.used || 0} of {licenses.total || 0} licenses used ({licenses.total ? Math.round(((licenses.used || 0) / licenses.total) * 100) : 0}%)
          </p>
        </>
      ) : (
        <p className="text-sm text-dark-400 mb-5">Loading license data...</p>
      )}

      {/* Action link: Manage Users */}
      <button
        onClick={() => navigate(orgPath('/settings/users'))}
        className="flex items-center gap-2 text-sm text-rivvra-400 hover:text-rivvra-300 transition-colors"
      >
        <ChevronRight className="w-3.5 h-3.5" />
        Manage Users & Teams
      </button>

      {/* ═══════════════════════ TRIAL STATUS ═══════════════════════ */}
      {trial && trial.status !== 'none' && trial.status !== 'converted' && (
        <>
          <SectionHeader title="Trial Status" />

          <div className={`p-4 rounded-xl border ${
            trial.status === 'active' ? 'bg-rivvra-500/5 border-rivvra-500/20' :
            trial.status === 'grace' ? 'bg-amber-500/5 border-amber-500/20' :
            'bg-red-500/5 border-red-500/20'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${
                  trial.status === 'active' ? 'text-rivvra-300' :
                  trial.status === 'grace' ? 'text-amber-300' : 'text-red-300'
                }`}>
                  {trial.status === 'active' && `Free Trial — ${trial.daysRemaining ?? 0} days remaining`}
                  {trial.status === 'grace' && 'Trial ended — Read-only mode'}
                  {trial.status === 'archived' && 'Organization archived'}
                </p>
                <p className="text-xs text-dark-500 mt-1">
                  {trial.status === 'active' && 'All features are unlocked during your trial period.'}
                  {trial.status === 'grace' && 'Upgrade to continue creating and modifying data.'}
                  {trial.status === 'archived' && 'Upgrade to restore access to your data.'}
                </p>
              </div>
              {(trial.status === 'grace' || trial.status === 'archived' || (trial.status === 'active' && (trial.daysRemaining ?? 14) <= 5)) && (
                <button
                  onClick={() => navigate(`/org/${currentOrg.slug}/upgrade`)}
                  className="px-4 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-semibold hover:bg-rivvra-400 transition-colors flex-shrink-0"
                >
                  Upgrade
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
