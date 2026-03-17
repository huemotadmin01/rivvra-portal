/**
 * MyProfilePage — Standalone Odoo-style profile page
 * Accessed from header avatar menu → "My Profile"
 * Route: /org/:slug/my-profile
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { useCompany } from '../context/CompanyContext';
import { API_BASE_URL } from '../utils/config';
import {
  User, Shield, Trash2, AlertTriangle, Loader2, X, LogOut,
  Mail, Building2, Crown, Briefcase, Check, Lock, Settings2,
  Eye, EyeOff, CheckCircle, Camera, Phone, Smartphone, MapPin, Pencil,
  Heart, CreditCard
} from 'lucide-react';
import api from '../utils/api';
import employeeApi from '../utils/employeeApi';
import InlineField from '../components/shared/InlineField';
import { getFieldPermission } from '../config/employeeFieldPermissions';

/** Resolve picture URL — API-relative paths need base URL prefix */
function resolvePhotoUrl(picture) {
  if (!picture) return null;
  if (picture.startsWith('/api/')) return `${API_BASE_URL}${picture}`;
  return picture;
}

export default function MyProfilePage() {
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
  const [senderTitle, setSenderTitle] = useState(user?.senderTitle || '');
  const [workPhone, setWorkPhone] = useState(user?.workPhone || '');
  const [workMobile, setWorkMobile] = useState(user?.workMobile || '');
  const [workLocation, setWorkLocation] = useState(user?.workLocation || '');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  const prefsChanged =
    senderTitle !== (user?.senderTitle || '') ||
    workPhone !== (user?.workPhone || '') ||
    workMobile !== (user?.workMobile || '') ||
    workLocation !== (user?.workLocation || '');

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    setPrefsSaved(false);
    try {
      const res = await api.updateProfile({
        senderTitle: senderTitle.trim(),
        workPhone: workPhone.trim(),
        workMobile: workMobile.trim(),
        workLocation: workLocation.trim(),
      });
      if (res.success) {
        updateUser({
          senderTitle: senderTitle.trim(),
          workPhone: workPhone.trim(),
          workMobile: workMobile.trim(),
          workLocation: workLocation.trim(),
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

  // Show Account Security only if user has a password (hide for Google-only users)
  const showSecurityTab = hasExistingPassword;
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

  return (
    <>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">My Profile</h1>
          <p className="text-dark-400 mt-1">Manage your personal information & preferences</p>
        </div>

        <div className="space-y-6">
          {/* ====== Profile Header Card ====== */}
          <div className="card p-6">
            <div className="flex items-start gap-6">
              {/* Left: Name, title, info */}
              <div className="flex-1 min-w-0">
                {/* Editable name */}
                {editingName ? (
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="text"
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditingName(false); setNameValue(user?.name || ''); } }}
                      autoFocus
                      className="text-2xl font-bold text-white bg-transparent border-b-2 border-rivvra-500 outline-none py-0.5 w-full max-w-xs"
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={savingName}
                      className="p-1.5 rounded-lg bg-rivvra-500 text-dark-950 hover:bg-rivvra-400 transition-colors"
                    >
                      {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => { setEditingName(false); setNameValue(user?.name || ''); }}
                      className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setNameValue(user?.name || ''); setEditingName(true); }}
                    className="group flex items-center gap-2 mb-1"
                  >
                    <h2 className="text-2xl font-bold text-white">{user?.name || 'User'}</h2>
                    <Pencil className="w-4 h-4 text-dark-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}

                <p className="text-dark-400 text-sm mb-4">
                  {user?.senderTitle || 'No title set'}
                </p>

                {/* Two-column info grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-dark-500 w-16 flex-shrink-0">Company</span>
                    <span className="text-sm text-white truncate">{currentCompany?.name || currentOrg?.name || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-dark-500 w-16 flex-shrink-0">Email</span>
                    <span className="text-sm text-white truncate">{user?.email || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-dark-500 w-16 flex-shrink-0">Role</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      orgRole === 'owner' ? 'bg-amber-500/20 text-amber-300' :
                      orgRole === 'admin' ? 'bg-purple-500/20 text-purple-300' :
                      'bg-dark-700 text-dark-300'
                    }`}>
                      {orgRole ? orgRole.charAt(0).toUpperCase() + orgRole.slice(1) : 'Member'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-dark-500 w-16 flex-shrink-0">Plan</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      isPro ? 'bg-amber-500/20 text-amber-300' : 'bg-dark-700 text-dark-300'
                    }`}>
                      {isPro && <Crown className="w-3 h-3" />}
                      {isPro ? 'Pro' : 'Free'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Avatar with upload */}
              <div className="flex-shrink-0 relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <div
                  className="relative w-28 h-28 rounded-2xl overflow-hidden cursor-pointer group"
                  onMouseEnter={() => setPhotoHover(true)}
                  onMouseLeave={() => setPhotoHover(false)}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {photoUrl ? (
                    <img src={photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-rivvra-400 to-rivvra-600 flex items-center justify-center">
                      <span className="text-3xl font-bold text-dark-950">
                        {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                      </span>
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className={`absolute inset-0 bg-dark-950/60 flex items-center justify-center transition-opacity ${
                    photoHover || uploadingPhoto ? 'opacity-100' : 'opacity-0'
                  }`}>
                    {uploadingPhoto ? (
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    ) : (
                      <Camera className="w-6 h-6 text-white" />
                    )}
                  </div>
                </div>

                {/* Delete photo button */}
                {user?.hasCustomPhoto && !uploadingPhoto && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeletePhoto(); }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-dark-800 border border-dark-600 flex items-center justify-center text-dark-400 hover:text-red-400 hover:border-red-500/50 transition-colors"
                    title="Remove custom photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ====== Horizontal Tab Bar ====== */}
          <div className="border-b border-dark-700">
            <div className="flex gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === tab.id
                      ? 'border-rivvra-500 text-rivvra-400'
                      : 'border-transparent text-dark-400 hover:text-white hover:border-dark-600'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ====== Tab Content ====== */}

          {/* --- Preferences Tab --- */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              {/* Title / Designation */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Title / Designation</label>
                <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                  <Briefcase className="w-5 h-5 text-dark-500 flex-shrink-0" />
                  <input
                    type="text"
                    value={senderTitle}
                    onChange={(e) => setSenderTitle(e.target.value)}
                    placeholder="e.g. CEO & Co-Founder"
                    className="bg-transparent text-white w-full outline-none placeholder:text-dark-600"
                  />
                </div>
                <p className="text-xs text-dark-600 mt-1">{'Used as {{senderTitle}} placeholder in email sequences'}</p>
              </div>

              {/* Work Phone + Work Mobile */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Work Phone</label>
                  <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                    <Phone className="w-5 h-5 text-dark-500 flex-shrink-0" />
                    <input
                      type="text"
                      value={workPhone}
                      onChange={(e) => setWorkPhone(e.target.value)}
                      placeholder="e.g. +1 (555) 123-4567"
                      className="bg-transparent text-white w-full outline-none placeholder:text-dark-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Work Mobile</label>
                  <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                    <Smartphone className="w-5 h-5 text-dark-500 flex-shrink-0" />
                    <input
                      type="text"
                      value={workMobile}
                      onChange={(e) => setWorkMobile(e.target.value)}
                      placeholder="e.g. +1 (555) 987-6543"
                      className="bg-transparent text-white w-full outline-none placeholder:text-dark-600"
                    />
                  </div>
                </div>
              </div>

              {/* Work Location */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Work Location</label>
                <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                  <MapPin className="w-5 h-5 text-dark-500 flex-shrink-0" />
                  <input
                    type="text"
                    value={workLocation}
                    onChange={(e) => setWorkLocation(e.target.value)}
                    placeholder="e.g. New York, NY / Remote"
                    className="bg-transparent text-white w-full outline-none placeholder:text-dark-600"
                  />
                </div>
              </div>

              {/* Company (read-only) */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Company</label>
                <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                  <Building2 className="w-5 h-5 text-dark-500" />
                  <span className="text-white">{currentCompany?.name || '-'}</span>
                </div>
                <p className="text-xs text-dark-600 mt-1">Your default company. Switch companies from the header dropdown.</p>
              </div>

              {/* Read-only fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Email</label>
                  <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                    <Mail className="w-5 h-5 text-dark-500" />
                    <span className="text-white">{user?.email || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Save button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSavePreferences}
                  disabled={savingPrefs || !prefsChanged}
                  className="px-5 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl hover:bg-rivvra-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm font-semibold"
                >
                  {savingPrefs ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : prefsSaved ? (
                    <><CheckCircle className="w-4 h-4" /> Saved</>
                  ) : (
                    'Save changes'
                  )}
                </button>
                {prefsChanged && !savingPrefs && (
                  <span className="text-xs text-dark-500">Unsaved changes</span>
                )}
              </div>
            </div>
          )}

          {/* --- Work Info Tab (read-only) --- */}
          {activeTab === 'work' && hasEmployee && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Work Information</h3>
              <div className="space-y-0.5">
                <InfoRow label="Employee ID" value={empProfile.employeeId} />
                <InfoRow label="Email" value={empProfile.email} />
                <InfoRow label="Phone" value={empProfile.phone} />
                <InfoRow label="Department" value={empProfile.departmentName || empProfile.department} />
                <InfoRow label="Designation" value={empProfile.designation} />
                <InfoRow label="Manager" value={empProfile.managerName || empProfile.manager} />
                <InfoRow label="Joining Date" value={empProfile.joiningDate ? new Date(empProfile.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
                <InfoRow label="Employment" value={empProfile.employmentType ? empProfile.employmentType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'} />
              </div>
            </div>
          )}

          {/* --- Personal Tab (editable) --- */}
          {activeTab === 'personal' && hasEmployee && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Personal Information</h3>
              <div className="space-y-0.5">
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
              <h4 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mt-6 mb-3">Address</h4>
              <div className="space-y-0.5">
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
          )}

          {/* --- Emergency Contact Tab (editable) --- */}
          {activeTab === 'emergency' && hasEmployee && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Emergency Contact</h3>
              <div className="space-y-0.5">
                <InlineField label="Name" field="emergencyContact.name" value={empProfile.emergencyContact?.name} type="text"
                  editable={fp('emergencyContact.name').editable} onSave={handleSelfSave} placeholder="Contact name" />
                <InlineField label="Phone" field="emergencyContact.phone" value={empProfile.emergencyContact?.phone} type="phone"
                  editable={fp('emergencyContact.phone').editable} onSave={handleSelfSave} placeholder="Contact phone" />
                <InlineField label="Relation" field="emergencyContact.relation" value={empProfile.emergencyContact?.relation} type="text"
                  editable={fp('emergencyContact.relation').editable} onSave={handleSelfSave} placeholder="e.g. Father, Spouse" />
              </div>
            </div>
          )}

          {/* --- Bank & Statutory Tab (read-only for self) --- */}
          {activeTab === 'bank' && hasEmployee && (
            <div className="space-y-6">
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Bank Details</h3>
                <div className="space-y-0.5">
                  <InfoRow label="Account No." value={empProfile.bankDetails?.accountNumber ? maskAccount(empProfile.bankDetails.accountNumber) : '—'} />
                  <InfoRow label="IFSC" value={empProfile.bankDetails?.ifsc} />
                  <InfoRow label="PAN" value={empProfile.bankDetails?.pan} />
                  <InfoRow label="Bank Name" value={empProfile.bankDetails?.bankName} />
                </div>
              </div>
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Statutory</h3>
                <div className="space-y-0.5">
                  <InfoRow label="Aadhaar" value={empProfile.statutory?.aadhaar ? maskAadhaar(empProfile.statutory.aadhaar) : '—'} />
                  <InfoRow label="UAN" value={empProfile.statutory?.uan} />
                  <InfoRow label="PF Number" value={empProfile.statutory?.pfNumber} />
                  <InfoRow label="ESIC Number" value={empProfile.statutory?.esicNumber} />
                </div>
              </div>
            </div>
          )}

          {/* --- Account Security Tab --- */}
          {activeTab === 'security' && showSecurityTab && (
            <div className="space-y-6">
              {/* Password */}
              <div className="card p-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center flex-shrink-0">
                    <Lock className="w-5 h-5 text-dark-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-white mb-1">Password</h3>
                    <p className="text-xs text-dark-400 mb-3">
                      {!hasExistingPassword
                        ? 'You signed up with Google. You can set a password to enable email login.'
                        : 'Change your password to keep your account secure.'}
                    </p>

                    {passwordSuccess && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-xs mb-3">
                        <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        {passwordSuccess}
                      </div>
                    )}

                    {!showPasswordForm ? (
                      <button
                        onClick={() => { setShowPasswordForm(true); setPasswordError(''); setPasswordSuccess(''); }}
                        className="px-3 py-1.5 bg-dark-800 text-dark-300 rounded-lg hover:bg-dark-700 hover:text-white transition-colors text-sm"
                      >
                        {hasExistingPassword ? 'Change Password' : 'Set Password'}
                      </button>
                    ) : (
                      <div className="space-y-3 max-w-sm">
                        {passwordError && (
                          <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                            {passwordError}
                          </div>
                        )}

                        {hasExistingPassword && (
                          <div>
                            <label className="block text-xs text-dark-400 mb-1">Current Password</label>
                            <div className="relative">
                              <input
                                type={showCurrentPw ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-rivvra-500 pr-10"
                                placeholder="Enter current password"
                              />
                              <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300">
                                {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs text-dark-400 mb-1">New Password</label>
                          <div className="relative">
                            <input
                              type={showNewPw ? 'text' : 'password'}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-rivvra-500 pr-10"
                              placeholder="Minimum 10 characters"
                            />
                            <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300">
                              {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {newPassword && (
                            <div className="flex gap-1 mt-1.5">
                              {[1, 2, 3, 4].map((level) => (
                                <div key={level} className={`h-1 flex-1 rounded-full transition-colors ${
                                  getPasswordStrength(newPassword) >= level
                                    ? level <= 1 ? 'bg-red-500' : level <= 2 ? 'bg-orange-500' : level <= 3 ? 'bg-yellow-500' : 'bg-green-500'
                                    : 'bg-dark-700'
                                }`} />
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs text-dark-400 mb-1">Confirm Password</label>
                          <div className="relative">
                            <input
                              type={showConfirmPw ? 'text' : 'password'}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-rivvra-500 pr-10"
                              placeholder="Re-enter new password"
                            />
                            <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300">
                              {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {confirmPassword && newPassword !== confirmPassword && (
                            <p className="text-[10px] text-red-400 mt-1">Passwords do not match</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={handlePasswordSubmit}
                            disabled={savingPassword || !newPassword || newPassword !== confirmPassword}
                            className="px-4 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-medium hover:bg-rivvra-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                          >
                            {savingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            {hasExistingPassword ? 'Change Password' : 'Set Password'}
                          </button>
                          <button
                            onClick={() => { setShowPasswordForm(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }}
                            className="px-4 py-2 text-dark-400 hover:text-white text-sm transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sessions */}
              <div className="card p-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-dark-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-white mb-1">Active Sessions</h3>
                    <p className="text-xs text-dark-400 mb-3">Manage your active sessions across devices.</p>
                    <button
                      onClick={() => { logout(); navigate('/find-workspace'); }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-dark-800 text-dark-300 rounded-lg hover:bg-dark-700 hover:text-white transition-colors text-sm"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign out everywhere
                    </button>
                  </div>
                </div>
              </div>

              {/* Delete Account */}
              <div className="card p-5 border-red-500/20">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-white mb-1">Delete Account</h3>
                    <p className="text-xs text-dark-400 mb-3">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors text-sm"
                    >
                      Delete my account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Loading indicator for employee profile */}
      {empLoading && (
        <div className="fixed bottom-4 right-4 bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-dark-400 z-10">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading employee profile...
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <button onClick={() => setShowDeleteModal(false)} className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Delete Account</h2>
                <p className="text-dark-400 text-sm">This action is permanent</p>
              </div>
            </div>
            <div className="mb-6">
              <p className="text-dark-300 mb-4">This will permanently delete your portal account, including:</p>
              <ul className="text-dark-400 text-sm space-y-1 mb-4">
                <li>Your profile, settings, and preferences</li>
                <li>Email sequences and automation rules</li>
                <li>Usage history and statistics</li>
              </ul>
              <p className="text-dark-500 text-xs mb-4">Note: Your leads data will be preserved and not deleted.</p>
              <p className="text-dark-400 text-sm">
                To confirm, please type <span className="text-white font-mono bg-dark-800 px-2 py-0.5 rounded">{CONFIRM_TEXT}</span> below:
              </p>
            </div>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={CONFIRM_TEXT}
              className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-red-500 mb-4"
            />
            {deleteMessage.text && (
              <div className={`p-3 rounded-lg mb-4 text-sm ${deleteMessage.type === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                {deleteMessage.text}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 text-white font-medium hover:bg-dark-700 transition-colors">Cancel</button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== CONFIRM_TEXT || deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4" /> Delete Account</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function InfoRow({ label, value }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-2">
      <span className="text-dark-400 text-sm">{label}</span>
      <span className="text-white text-sm">{value || <span className="text-dark-600">—</span>}</span>
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
