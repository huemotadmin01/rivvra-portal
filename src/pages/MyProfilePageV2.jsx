/**
 * MyProfilePageV2 — Standalone Odoo-style profile page, on ds
 * Accessed from header avatar menu → "My Profile"
 * Route: /org/:slug/my-profile
 *
 * The whole data layer (legacy 50-312) is spliced in byte-identically, and so
 * are the two masking helpers, which are the sensitive surface on this page:
 *
 *   maskAccount('••••' + acc.slice(-4))    maskAadhaar('•••• •••• ' + aadhaar.slice(-4))
 *
 * Both guard on `length < 4` and return the raw value when it is shorter — so a
 * short or malformed value is shown in full by design. Carried across exactly;
 * a slip in either would print a whole bank account or Aadhaar number.
 *
 * `getPasswordStrength`, `handlePasswordSubmit` (including the 10-character
 * floor and the current-password requirement when one already exists), and
 * `handleDeleteAccount` with its exact `DELETE MY ACCOUNT` phrase gate come
 * across unchanged too.
 *
 * `InlineField` stays as-is — it is the shared save-on-blur editor, and its
 * pessimistic contract (the handler must reject on failure) is what
 * `handleSelfSave` is written against.
 *
 * Not triggered: photo upload/delete, name save, preferences save, set/change
 * password, sign out everywhere, delete account.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { useCompany } from '../context/CompanyContext';
import { API_BASE_URL } from '../utils/config';
import { formatDateUTC, getBrowserTimeZone, formatDateTime } from '../utils/dateUtils';
import {
  Shield, Trash2, AlertTriangle, Loader2, X, LogOut,
  Mail, Building2, Crown, Briefcase, Check, Lock, Settings2,
  Eye, EyeOff, CheckCircle, Camera, Phone, Smartphone, MapPin, Pencil,
  Heart, CreditCard, Globe
} from 'lucide-react';
import api from '../utils/api';
import employeeApi from '../utils/employeeApi';
import InlineField from '../components/shared/InlineField';
import { getFieldPermission } from '../config/employeeFieldPermissions';
import {
  Panel, Chip, Button, Input, Select, Field, Modal, Callout, PageSpinner,
} from '../components/ds';

// Curated set of timezones — covers the 4 countries Huemot operates in plus
// common business hubs. The browser's auto-detected zone is added at runtime
// so users in less-common zones still see their own listed at the top.
const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata',         label: 'India — Asia/Kolkata (IST)' },
  { value: 'America/Toronto',      label: 'Canada (East) — America/Toronto' },
  { value: 'America/Vancouver',    label: 'Canada (West) — America/Vancouver' },
  { value: 'America/New_York',     label: 'USA (East) — America/New_York' },
  { value: 'America/Chicago',      label: 'USA (Central) — America/Chicago' },
  { value: 'America/Denver',       label: 'USA (Mountain) — America/Denver' },
  { value: 'America/Los_Angeles',  label: 'USA (Pacific) — America/Los_Angeles' },
  { value: 'Europe/London',        label: 'UK — Europe/London' },
  { value: 'Asia/Dubai',           label: 'UAE — Asia/Dubai' },
  { value: 'Asia/Singapore',       label: 'Singapore — Asia/Singapore' },
  { value: 'Australia/Sydney',     label: 'Australia (East) — Australia/Sydney' },
  { value: 'UTC',                  label: 'UTC' },
];

/** Resolve picture URL — API-relative paths need base URL prefix */
function resolvePhotoUrl(picture) {
  if (!picture) return null;
  if (picture.startsWith('/api/')) return `${API_BASE_URL}${picture}`;
  return picture;
}

export default function MyProfilePageV2() {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const { currentOrg, membership } = useOrg();
  const { currentCompany } = useCompany();

  const [activeTab, setActiveTab] = useState('preferences');

  // ─── Photo upload ───────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoHover, setPhotoHover] = useState(false);

  const handlePhotoUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const res = await api.uploadProfilePhoto(file);
      if (res.success && res.user) {
        updateUser({ picture: res.user.picture, hasCustomPhoto: res.user.hasCustomPhoto });
      }
    } catch {
      /* ignore */
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [updateUser]);

  const handleDeletePhoto = useCallback(async () => {
    setUploadingPhoto(true);
    try {
      const res = await api.deleteProfilePhoto();
      if (res.success && res.user) {
        updateUser({ picture: res.user.picture, hasCustomPhoto: false });
      }
    } catch {
      /* ignore */
    } finally {
      setUploadingPhoto(false);
    }
  }, [updateUser]);

  // ─── Inline name editing ───────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);

  const handleSaveName = async () => {
    if (!nameValue.trim() || nameValue.trim() === user?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await api.updateProfile({ name: nameValue.trim() });
      if (res.success) {
        updateUser({ name: nameValue.trim() });
        setEditingName(false);
      }
    } catch {
      /* ignore */
    } finally {
      setSavingName(false);
    }
  };

  // ─── Preferences form ──────────────────────────────────────
  const [workPhone, setWorkPhone] = useState(user?.workPhone || '');
  const [workMobile, setWorkMobile] = useState(user?.workMobile || '');
  const [workLocation, setWorkLocation] = useState(user?.workLocation || '');
  const [timezone, setTimezone] = useState(user?.timezone || '');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  const browserTz = getBrowserTimeZone();
  // Merge browser-detected zone into the curated list so users in unlisted
  // zones (e.g. Asia/Manila) still see their own.
  const tzChoices = TIMEZONE_OPTIONS.some((o) => o.value === browserTz)
    ? TIMEZONE_OPTIONS
    : [{ value: browserTz, label: `Detected — ${browserTz}` }, ...TIMEZONE_OPTIONS];

  const prefsChanged =
    workPhone !== (user?.workPhone || '') ||
    workMobile !== (user?.workMobile || '') ||
    workLocation !== (user?.workLocation || '') ||
    timezone !== (user?.timezone || '');

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    setPrefsSaved(false);
    try {
      const res = await api.updateProfile({
        workPhone: workPhone.trim(),
        workMobile: workMobile.trim(),
        workLocation: workLocation.trim(),
        timezone: timezone || null,
      });
      if (res.success) {
        updateUser({
          workPhone: workPhone.trim(),
          workMobile: workMobile.trim(),
          workLocation: workLocation.trim(),
          timezone: timezone || null,
        });
        setPrefsSaved(true);
        setTimeout(() => setPrefsSaved(false), 2000);
      }
    } catch {
      /* ignore */
    } finally {
      setSavingPrefs(false);
    }
  };

  // ─── Password ──────────────────────────────────────────────
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const hasExistingPassword = !!user?.hasPassword || !!user?.password;
  const passwordAuthAllowed =
    (membership?.authMethods || []).includes('password') ||
    (currentOrg?.authSettings?.allowedMethods || []).includes('password');

  const getPasswordStrength = (pw) => {
    if (!pw) return 0;
    let s = 0;
    if (pw.length >= 10) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  };

  const handlePasswordSubmit = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword.length < 10) { setPasswordError('Password must be at least 10 characters'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }

    setSavingPassword(true);
    try {
      let res;
      if (hasExistingPassword) {
        if (!currentPassword) { setPasswordError('Current password is required'); setSavingPassword(false); return; }
        res = await api.changePassword(currentPassword, newPassword);
      } else {
        res = await api.selfSetPassword(newPassword);
      }
      if (res.success) {
        setPasswordSuccess(hasExistingPassword ? 'Password changed successfully' : 'Password set successfully');
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        setShowPasswordForm(false);
        if (!hasExistingPassword) updateUser({ hasPassword: true, password: true });
        if (res.token) localStorage.setItem('rivvra_token', res.token);
        setTimeout(() => setPasswordSuccess(''), 3000);
      } else {
        setPasswordError(res.error || 'Failed to update password');
      }
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password');
    } finally {
      setSavingPassword(false);
    }
  };

  // ─── Delete account ────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState({ type: '', text: '' });
  const CONFIRM_TEXT = 'DELETE MY ACCOUNT';

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== CONFIRM_TEXT) {
      setDeleteMessage({ type: 'error', text: `Please type "${CONFIRM_TEXT}" to confirm` });
      return;
    }
    setDeleting(true);
    try {
      const response = await api.deleteAccount();
      if (response.success) { logout(); navigate('/'); }
      else setDeleteMessage({ type: 'error', text: response.error || 'Failed to delete account' });
    } catch (err) {
      setDeleteMessage({ type: 'error', text: err.message || 'Failed to delete account' });
    } finally { setDeleting(false); }
  };

  // ─── Employee profile ──────────────────────────────────────
  const [empProfile, setEmpProfile] = useState(null);
  const [empLoading, setEmpLoading] = useState(true);
  const orgSlug = currentOrg?.slug;

  useEffect(() => {
    if (!orgSlug) { setEmpLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await employeeApi.getMyProfile(orgSlug);
        if (!cancelled && res.success && res.employee) setEmpProfile(res.employee);
      } catch { /* no linked employee */ }
      if (!cancelled) setEmpLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgSlug]);

  const handleSelfSave = useCallback(async (field, value) => {
    if (!orgSlug) throw new Error('No org');
    // Build payload — handle nested fields like emergencyContact.name
    const dotIdx = field.indexOf('.');
    let payload;
    if (dotIdx > 0) {
      const parent = field.slice(0, dotIdx);
      const child = field.slice(dotIdx + 1);
      payload = { [parent]: { ...(empProfile?.[parent] || {}), [child]: value } };
    } else {
      payload = { [field]: value };
    }
    const res = await employeeApi.updateMyProfile(orgSlug, payload);
    if (!res.success) throw new Error(res.error || 'Failed to save');
    setEmpProfile(prev => {
      if (!prev) return prev;
      if (dotIdx > 0) {
        const parent = field.slice(0, dotIdx);
        const child = field.slice(dotIdx + 1);
        return { ...prev, [parent]: { ...(prev[parent] || {}), [child]: value } };
      }
      return { ...prev, [field]: value };
    });
  }, [orgSlug, empProfile]);

  const fp = useCallback((fieldKey) => {
    return getFieldPermission(fieldKey, 'member', true, false);
  }, []);

  // ─── Derived ───────────────────────────────────────────────
  const orgRole = membership?.orgRole;
  const orgPlan = currentOrg?.plan || 'free';
  const isPro = orgPlan === 'pro' || orgPlan === 'premium' || orgPlan === 'paid';
  const photoUrl = resolvePhotoUrl(user?.picture);

  // Always show Account Security tab (password change, sign out, etc.)
  const showSecurityTab = true;
  const hasEmployee = !!empProfile;

  const tabs = [
    { id: 'preferences', label: 'Preferences', icon: Settings2 },
    ...(hasEmployee ? [
      { id: 'work', label: 'Work Info', icon: Briefcase },
      { id: 'personal', label: 'Personal', icon: Heart },
      { id: 'emergency', label: 'Emergency', icon: Phone },
      { id: 'bank', label: 'Bank & Statutory', icon: CreditCard },
    ] : []),
    ...(showSecurityTab ? [{ id: 'security', label: 'Account Security', icon: Lock }] : []),
  ];

  const label = { display: 'block', font: "500 12.5px/1 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', marginBottom: 7 };
  const hint = { font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '5px 0 0' };
  const iconBox = {
    display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px',
    borderRadius: 'var(--r-2, 12px)', background: 'var(--surface-2)',
    boxShadow: '0 0 0 1px var(--line)',
  };
  const bareInput = {
    width: '100%', background: 'transparent', border: 0, outline: 'none',
    font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)',
  };
  const sectionHead = { font: "600 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: '0 0 14px' };
  const subHead = {
    font: "600 10.5px/1.4 'Inter', system-ui, sans-serif", letterSpacing: '.06em',
    textTransform: 'uppercase', color: 'var(--fg-4)', margin: '24px 0 12px',
  };

  return (
    <>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Breadcrumb */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
          <button
            type="button"
            onClick={() => navigate(`/org/${orgSlug}/home`)}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}
          >
            Home
          </button>
          <span aria-hidden="true">›</span>
          <span style={{ color: 'var(--fg)' }}>My Profile</span>
        </nav>

        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ font: "700 18px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>My Profile</h1>
          <p style={{ font: "400 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '4px 0 0' }}>
            Manage your personal information &amp; preferences
          </p>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          {/* ====== Profile Header Card ====== */}
          <Panel>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 20, padding: 4 }}>
              {/* Left: name, title, info */}
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                {editingName ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <input
                      type="text"
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditingName(false); setNameValue(user?.name || ''); } }}
                      autoFocus
                      aria-label="Your name"
                      style={{
                        maxWidth: 320, width: '100%', padding: '2px 0', background: 'transparent',
                        border: 0, borderBottom: '2px solid var(--brand)', outline: 'none',
                        font: "700 20px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)',
                      }}
                    />
                    <Button size="sm" onClick={handleSaveName} disabled={savingName} aria-label="Save name"
                      iconLeft={savingName ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} />
                    <Button variant="ghost" size="sm" aria-label="Cancel rename"
                      onClick={() => { setEditingName(false); setNameValue(user?.name || ''); }}
                      iconLeft={<X size={15} />} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setNameValue(user?.name || ''); setEditingName(true); }}
                    aria-label="Edit your name"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, cursor: 'pointer',
                      background: 'none', border: 0, padding: 0,
                    }}
                  >
                    <h2 style={{ font: "700 20px/1.3 'Inter', system-ui, sans-serif", letterSpacing: '-0.015em', color: 'var(--fg)', margin: 0 }}>
                      {user?.name || 'User'}
                    </h2>
                    <Pencil size={14} style={{ color: 'var(--fg-4)' }} />
                  </button>
                )}

                <p style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 16px' }}>
                  {empProfile?.designation || user?.senderTitle || 'No title set'}
                </p>

                {/* Info grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px 32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ flexShrink: 0, width: 62, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Company</span>
                    <span style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {currentCompany?.name || currentOrg?.name || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ flexShrink: 0, width: 62, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Email</span>
                    <span style={{ font: "400 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.email || '-'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flexShrink: 0, width: 62, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Role</span>
                    <Chip tone={orgRole === 'owner' ? 'warn' : orgRole === 'admin' ? 'purple' : 'neutral'}>
                      {orgRole ? orgRole.charAt(0).toUpperCase() + orgRole.slice(1) : 'Member'}
                    </Chip>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flexShrink: 0, width: 62, font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Plan</span>
                    <Chip tone={isPro ? 'warn' : 'neutral'}>
                      {isPro && <Crown size={11} />}
                      {isPro ? 'Pro' : 'Free'}
                    </Chip>
                  </div>
                </div>
              </div>

              {/* Right: avatar */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={handlePhotoUpload}
                />
                <button
                  type="button"
                  onMouseEnter={() => setPhotoHover(true)}
                  onMouseLeave={() => setPhotoHover(false)}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Change profile photo"
                  style={{
                    position: 'relative', width: 108, height: 108, padding: 0, cursor: 'pointer',
                    borderRadius: 'var(--r-3, 16px)', overflow: 'hidden', border: 0,
                    background: 'var(--brand-soft)', display: 'block',
                  }}
                >
                  {photoUrl ? (
                    <img src={photoUrl} alt="" referrerPolicy="no-referrer"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{
                      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      font: "700 30px/1 'Inter', system-ui, sans-serif", color: 'var(--fg)',
                    }}>
                      {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                    </span>
                  )}
                  <span style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,.6)', transition: 'opacity 180ms',
                    opacity: photoHover || uploadingPhoto ? 1 : 0,
                  }}>
                    {uploadingPhoto
                      ? <Loader2 size={22} style={{ color: '#fff' }} className="animate-spin" />
                      : <Camera size={22} style={{ color: '#fff' }} />}
                  </span>
                </button>

                {user?.hasCustomPhoto && !uploadingPhoto && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeletePhoto(); }}
                    title="Remove custom photo"
                    aria-label="Remove custom photo"
                    style={{
                      position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: 99,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      background: 'var(--surface-3)', border: '1px solid var(--line-2)', color: 'var(--fg-4)',
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          </Panel>

          {/* ====== Tabs ====== */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line-2)', overflowX: 'auto' }}>
            {tabs.map((tab) => {
              const on = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={on ? 'page' : undefined}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
                    padding: '9px 14px', marginBottom: -1, cursor: 'pointer',
                    background: 'none', border: 0,
                    borderBottom: `2px solid ${on ? 'var(--brand)' : 'transparent'}`,
                    font: "500 12.5px/1.3 'Inter', system-ui, sans-serif",
                    color: on ? 'var(--fg)' : 'var(--fg-4)',
                  }}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* --- Preferences --- */}
          {activeTab === 'preferences' && (
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
                <div>
                  <label htmlFor="mp-workphone" style={label}>Work Phone</label>
                  <div style={iconBox}>
                    <Phone size={17} style={{ flexShrink: 0, color: 'var(--fg-4)' }} />
                    <input id="mp-workphone" type="text" value={workPhone} style={bareInput}
                      onChange={(e) => setWorkPhone(e.target.value)} placeholder="e.g. +1 (555) 123-4567" />
                  </div>
                </div>
                <div>
                  <label htmlFor="mp-workmobile" style={label}>Work Mobile</label>
                  <div style={iconBox}>
                    <Smartphone size={17} style={{ flexShrink: 0, color: 'var(--fg-4)' }} />
                    <input id="mp-workmobile" type="text" value={workMobile} style={bareInput}
                      onChange={(e) => setWorkMobile(e.target.value)} placeholder="e.g. +1 (555) 987-6543" />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="mp-worklocation" style={label}>Work Location</label>
                <div style={iconBox}>
                  <MapPin size={17} style={{ flexShrink: 0, color: 'var(--fg-4)' }} />
                  <input id="mp-worklocation" type="text" value={workLocation} style={bareInput}
                    onChange={(e) => setWorkLocation(e.target.value)} placeholder="e.g. New York, NY / Remote" />
                </div>
              </div>

              <div>
                <span style={label}>Company</span>
                <div style={iconBox}>
                  <Building2 size={17} style={{ flexShrink: 0, color: 'var(--fg-4)' }} />
                  <span style={{ font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{currentCompany?.name || '-'}</span>
                </div>
                <p style={hint}>Your default company. Switch companies from the header dropdown.</p>
              </div>

              {/* Timezone — drives how every datetime renders for this user.
                  Auto-detected from the browser on first login; can be changed
                  here to e.g. lock Toronto-time when working from elsewhere. */}
              <div>
                <label htmlFor="mp-timezone" style={label}>Timezone</label>
                <div style={iconBox}>
                  <Globe size={17} style={{ flexShrink: 0, color: 'var(--fg-4)' }} />
                  <select id="mp-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}
                    style={{ ...bareInput, cursor: 'pointer' }}>
                    <option value="">Use browser default ({browserTz})</option>
                    {tzChoices.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
                <p style={hint}>
                  Sample: {formatDateTime(new Date(), { user: { timezone: timezone || browserTz }, showZone: true })}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
                <div>
                  <span style={label}>Email</span>
                  <div style={iconBox}>
                    <Mail size={17} style={{ flexShrink: 0, color: 'var(--fg-4)' }} />
                    <span style={{ font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{user?.email || '-'}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Button onClick={handleSavePreferences} disabled={savingPrefs || !prefsChanged}
                  iconLeft={savingPrefs ? <Loader2 size={15} className="animate-spin" /> : prefsSaved ? <CheckCircle size={15} /> : undefined}>
                  {savingPrefs ? 'Saving...' : prefsSaved ? 'Saved' : 'Save changes'}
                </Button>
                {prefsChanged && !savingPrefs && (
                  <span style={{ font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Unsaved changes</span>
                )}
              </div>
            </div>
          )}

          {/* --- Work Info (read-only) --- */}
          {activeTab === 'work' && hasEmployee && (
            <Panel>
              <div style={{ padding: 4 }}>
                <h3 style={sectionHead}>Work Information</h3>
                <div>
                  <InfoRow label="Employee ID" value={empProfile.employeeId} />
                  <InfoRow label="Email" value={empProfile.email} />
                  <InfoRow label="Phone" value={empProfile.phone} />
                  <InfoRow label="Department" value={empProfile.departmentName || empProfile.department} />
                  <InlineField label="Designation" field="designation" value={empProfile.designation} type="text"
                    editable onSave={handleSelfSave} placeholder="e.g. Senior Engineer" />
                  <InfoRow label="Manager" value={empProfile.managerName || empProfile.manager} />
                  <InfoRow label="Joining Date" value={formatDateUTC(empProfile.joiningDate) || '—'} />
                  <InfoRow label="Employment" value={empProfile.employmentType ? empProfile.employmentType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'} />
                </div>
              </div>
            </Panel>
          )}

          {/* --- Personal (editable) --- */}
          {activeTab === 'personal' && hasEmployee && (
            <Panel>
              <div style={{ padding: 4 }}>
                <h3 style={sectionHead}>Personal Information</h3>
                <div>
                  <InlineField label="Private Email" field="privateEmail" value={empProfile.privateEmail} type="email"
                    editable={fp('privateEmail').editable} required={fp('privateEmail').required} onSave={handleSelfSave} placeholder="Personal email" />
                  <InlineField label="Private Phone" field="privatePhone" value={empProfile.privatePhone} type="phone"
                    editable={fp('privatePhone').editable} required={fp('privatePhone').required} onSave={handleSelfSave} placeholder="Personal phone" />
                  <InlineField label="Date of Birth" field="dateOfBirth" value={empProfile.dateOfBirth} type="date"
                    editable={fp('dateOfBirth').editable} required={fp('dateOfBirth').required} onSave={handleSelfSave} />
                  <InlineField label="Gender" field="gender" value={empProfile.gender} type="select"
                    editable={fp('gender').editable} required={fp('gender').required} onSave={handleSelfSave}
                    options={[{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }]} />
                  <InlineField label="Blood Group" field="bloodGroup" value={empProfile.bloodGroup} type="select"
                    editable={fp('bloodGroup').editable} onSave={handleSelfSave}
                    options={['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(v => ({ value: v, label: v }))} />
                  <InlineField label="Father's Name" field="fatherName" value={empProfile.fatherName} type="text"
                    editable={fp('fatherName').editable} required={fp('fatherName').required} onSave={handleSelfSave} />
                  <InlineField label="Spouse Name" field="spouseName" value={empProfile.spouseName} type="text"
                    editable={fp('spouseName').editable} onSave={handleSelfSave} />
                  <InlineField label="Nationality" field="nationality" value={empProfile.nationality} type="text"
                    editable={fp('nationality').editable} onSave={handleSelfSave} />
                  <InlineField label="Marital Status" field="maritalStatus" value={empProfile.maritalStatus} type="select"
                    editable={fp('maritalStatus').editable} onSave={handleSelfSave}
                    options={[{ value: 'Single', label: 'Single' }, { value: 'Married', label: 'Married' }, { value: 'Divorced', label: 'Divorced' }, { value: 'Widowed', label: 'Widowed' }]} />
                  <InlineField label="Religion" field="religion" value={empProfile.religion} type="text"
                    editable={fp('religion').editable} onSave={handleSelfSave} />
                </div>

                {/* Address */}
                <h4 style={subHead}>Address</h4>
                <div>
                  <InlineField label="Street" field="address.street" value={empProfile.address?.street} type="text"
                    editable={fp('address.street').editable} onSave={handleSelfSave} />
                  <InlineField label="Street 2" field="address.street2" value={empProfile.address?.street2} type="text"
                    editable={fp('address.street2').editable} onSave={handleSelfSave} />
                  <InlineField label="City" field="address.city" value={empProfile.address?.city} type="text"
                    editable={fp('address.city').editable} onSave={handleSelfSave} />
                  <InlineField label="State" field="address.state" value={empProfile.address?.state} type="text"
                    editable={fp('address.state').editable} onSave={handleSelfSave} />
                  <InlineField label="ZIP" field="address.zip" value={empProfile.address?.zip} type="text"
                    editable={fp('address.zip').editable} onSave={handleSelfSave} />
                  <InlineField label="Country" field="address.country" value={empProfile.address?.country} type="text"
                    editable={fp('address.country').editable} onSave={handleSelfSave} />
                </div>
              </div>
            </Panel>
          )}

          {/* --- Emergency Contact (editable) --- */}
          {activeTab === 'emergency' && hasEmployee && (
            <Panel>
              <div style={{ padding: 4 }}>
                <h3 style={sectionHead}>Emergency Contact</h3>
                <div>
                  <InlineField label="Name" field="emergencyContact.name" value={empProfile.emergencyContact?.name} type="text"
                    editable={fp('emergencyContact.name').editable} onSave={handleSelfSave} placeholder="Contact name" />
                  <InlineField label="Phone" field="emergencyContact.phone" value={empProfile.emergencyContact?.phone} type="phone"
                    editable={fp('emergencyContact.phone').editable} onSave={handleSelfSave} placeholder="Contact phone" />
                  <InlineField label="Relation" field="emergencyContact.relation" value={empProfile.emergencyContact?.relation} type="text"
                    editable={fp('emergencyContact.relation').editable} onSave={handleSelfSave} placeholder="e.g. Father, Spouse" />
                </div>
              </div>
            </Panel>
          )}

          {/* --- Bank & Statutory (read-only for self, masked) --- */}
          {activeTab === 'bank' && hasEmployee && (
            <div style={{ display: 'grid', gap: 18 }}>
              <Panel>
                <div style={{ padding: 4 }}>
                  <h3 style={sectionHead}>Bank Details</h3>
                  <div>
                    <InfoRow label="Account No." value={empProfile.bankDetails?.accountNumber ? maskAccount(empProfile.bankDetails.accountNumber) : '—'} />
                    <InfoRow label="IFSC" value={empProfile.bankDetails?.ifsc} />
                    <InfoRow label="PAN" value={empProfile.bankDetails?.pan} />
                    <InfoRow label="Bank Name" value={empProfile.bankDetails?.bankName} />
                  </div>
                </div>
              </Panel>
              <Panel>
                <div style={{ padding: 4 }}>
                  <h3 style={sectionHead}>Statutory</h3>
                  <div>
                    <InfoRow label="Aadhaar" value={empProfile.statutory?.aadhaar ? maskAadhaar(empProfile.statutory.aadhaar) : '—'} />
                    <InfoRow label="UAN" value={empProfile.statutory?.uan} />
                    <InfoRow label="PF Number" value={empProfile.statutory?.pfNumber} />
                    <InfoRow label="ESIC Number" value={empProfile.statutory?.esicNumber} />
                  </div>
                </div>
              </Panel>
            </div>
          )}

          {/* --- Account Security --- */}
          {activeTab === 'security' && showSecurityTab && (
            <div style={{ display: 'grid', gap: 18 }}>
              {/* Password */}
              <Panel>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 4 }}>
                  <span style={{
                    flexShrink: 0, width: 38, height: 38, borderRadius: 'var(--r-2, 12px)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--surface-3)', color: 'var(--fg-4)',
                  }}>
                    <Lock size={18} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ ...sectionHead, margin: '0 0 4px' }}>Password</h3>
                    <p style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 12px' }}>
                      {!hasExistingPassword
                        ? 'You signed up with Google. You can set a password to enable email login.'
                        : 'Change your password to keep your account secure.'}
                    </p>

                    {passwordSuccess && (
                      <Callout tone="brand" icon={<CheckCircle size={15} />} style={{ marginBottom: 12 }}>
                        {passwordSuccess}
                      </Callout>
                    )}

                    {!showPasswordForm ? (
                      <Button variant="secondary" size="sm"
                        onClick={() => { setShowPasswordForm(true); setPasswordError(''); setPasswordSuccess(''); }}>
                        {hasExistingPassword ? 'Change Password' : 'Set Password'}
                      </Button>
                    ) : (
                      <div style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
                        {passwordError && <Callout tone="danger">{passwordError}</Callout>}

                        {hasExistingPassword && (
                          <Field label="Current Password" htmlFor="mp-curpw">
                            <div style={{ position: 'relative' }}>
                              <Input
                                id="mp-curpw"
                                type={showCurrentPw ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="Enter current password"
                                style={{ paddingRight: 38 }}
                              />
                              <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)}
                                aria-label={showCurrentPw ? 'Hide current password' : 'Show current password'}
                                style={pwToggle}>
                                {showCurrentPw ? <EyeOff size={15} /> : <Eye size={15} />}
                              </button>
                            </div>
                          </Field>
                        )}

                        <Field label="New Password" htmlFor="mp-newpw">
                          <div style={{ position: 'relative' }}>
                            <Input
                              id="mp-newpw"
                              type={showNewPw ? 'text' : 'password'}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Minimum 10 characters"
                              style={{ paddingRight: 38 }}
                            />
                            <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                              aria-label={showNewPw ? 'Hide new password' : 'Show new password'}
                              style={pwToggle}>
                              {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                          {newPassword && (
                            <div style={{ display: 'flex', gap: 4, marginTop: 6 }} aria-hidden="true">
                              {[1, 2, 3, 4].map((level) => (
                                <span key={level} style={{
                                  height: 4, flex: 1, borderRadius: 99,
                                  background: getPasswordStrength(newPassword) >= level
                                    ? level <= 1 ? 'var(--danger)' : level <= 2 ? 'var(--warn-ink)' : level <= 3 ? 'var(--warn-ink)' : 'var(--brand)'
                                    : 'var(--line-2)',
                                }} />
                              ))}
                            </div>
                          )}
                        </Field>

                        <Field label="Confirm Password" htmlFor="mp-confirmpw"
                          error={confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match' : undefined}>
                          <div style={{ position: 'relative' }}>
                            <Input
                              id="mp-confirmpw"
                              type={showConfirmPw ? 'text' : 'password'}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="Re-enter new password"
                              style={{ paddingRight: 38 }}
                            />
                            <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)}
                              aria-label={showConfirmPw ? 'Hide confirm password' : 'Show confirm password'}
                              style={pwToggle}>
                              {showConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                        </Field>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
                          <Button size="sm" onClick={handlePasswordSubmit}
                            disabled={savingPassword || !newPassword || newPassword !== confirmPassword}
                            iconLeft={savingPassword ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}>
                            {hasExistingPassword ? 'Change Password' : 'Set Password'}
                          </Button>
                          <Button variant="ghost" size="sm"
                            onClick={() => { setShowPasswordForm(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              {/* Sessions */}
              <Panel>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 4 }}>
                  <span style={{
                    flexShrink: 0, width: 38, height: 38, borderRadius: 'var(--r-2, 12px)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--surface-3)', color: 'var(--fg-4)',
                  }}>
                    <Shield size={18} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ ...sectionHead, margin: '0 0 4px' }}>Active Sessions</h3>
                    <p style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 12px' }}>
                      Manage your active sessions across devices.
                    </p>
                    <Button variant="secondary" size="sm"
                      onClick={() => { logout(); navigate('/find-workspace'); }}
                      iconLeft={<LogOut size={14} />}>
                      Sign out everywhere
                    </Button>
                  </div>
                </div>
              </Panel>

              {/* Delete Account — admin/owner only */}
              {(orgRole === 'owner' || orgRole === 'admin') && (
                <Panel style={{ boxShadow: '0 0 0 1px color-mix(in srgb, var(--danger) 30%, transparent)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 4 }}>
                    <span style={{
                      flexShrink: 0, width: 38, height: 38, borderRadius: 'var(--r-2, 12px)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--danger-soft)', color: 'var(--danger)',
                    }}>
                      <Trash2 size={18} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ ...sectionHead, margin: '0 0 4px' }}>Delete Account</h3>
                      <p style={{ font: "400 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '0 0 12px' }}>
                        Permanently delete your account and all associated data. This action cannot be undone.
                      </p>
                      <Button variant="secondary" size="sm" style={{ color: 'var(--danger)' }}
                        onClick={() => setShowDeleteModal(true)}>
                        Delete my account
                      </Button>
                    </div>
                  </div>
                </Panel>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Loading indicator for employee profile */}
      {empLoading && (
        <div style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 'var(--r-2, 12px)',
          background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line-2)',
          font: "400 11px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
        }}>
          <Loader2 size={12} className="animate-spin" /> Loading employee profile...
        </div>
      )}

      {/* Delete Account Modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        size="sm"
        tone="danger"
        icon={<AlertTriangle size={16} />}
        title="Delete Account"
        sub="This action is permanent"
        footer={(
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button
              variant="secondary" size="sm" block onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== CONFIRM_TEXT || deleting}
              style={{ color: 'var(--danger)' }}
              iconLeft={deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            >
              Delete Account
            </Button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <p style={{ font: "400 12.5px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', margin: '0 0 10px' }}>
              This will permanently delete your portal account, including:
            </p>
            <ul style={{ display: 'grid', gap: 3, margin: 0, paddingLeft: 18, font: "400 12px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
              <li>Your profile, settings, and preferences</li>
              <li>Email sequences and automation rules</li>
              <li>Usage history and statistics</li>
            </ul>
            <p style={{ font: "400 11px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', margin: '10px 0 0' }}>
              Note: Your leads data will be preserved and not deleted.
            </p>
          </div>

          <Field
            label={<>To confirm, type <code style={{
              padding: '1px 5px', borderRadius: 5, background: 'var(--surface-3)',
              color: 'var(--fg)', font: "500 11px/1.5 ui-monospace, monospace",
            }}>{CONFIRM_TEXT}</code></>}
            htmlFor="mp-delete-confirm"
          >
            <Input
              id="mp-delete-confirm"
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={CONFIRM_TEXT}
              autoComplete="off"
            />
          </Field>

          {deleteMessage.text && (
            <Callout tone={deleteMessage.type === 'error' ? 'danger' : 'brand'}>{deleteMessage.text}</Callout>
          )}
        </div>
      </Modal>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

const pwToggle = {
  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
  display: 'inline-flex', cursor: 'pointer', background: 'none', border: 0,
  padding: 0, color: 'var(--fg-4)',
};

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 140px) 1fr', gap: 8, padding: '7px 0' }}>
      <span style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{label}</span>
      <span style={{ font: "400 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>
        {value || <span style={{ color: 'var(--fg-4)' }}>—</span>}
      </span>
    </div>
  );
}

function maskAccount(acc) {
  if (!acc || acc.length < 4) return acc || '—';
  return '••••' + acc.slice(-4);
}

function maskAadhaar(aadhaar) {
  if (!aadhaar || aadhaar.length < 4) return aadhaar || '—';
  return '•••• •••• ' + aadhaar.slice(-4);
}
