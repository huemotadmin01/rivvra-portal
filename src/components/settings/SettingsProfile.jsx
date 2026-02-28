/**
 * SettingsProfile — Odoo-style User Profile page
 * Shows personal info, preferences, account security & statistics.
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import {
  User, Shield, Trash2, AlertTriangle, Loader2, X, LogOut,
  Mail, Building2, Crown, Briefcase, Check, BarChart3, Lock, Settings2
} from 'lucide-react';
import api from '../../utils/api';
import ComingSoonModal from '../ComingSoonModal';

export default function SettingsProfile() {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const { currentOrg, membership } = useOrg();

  const [activeProfileTab, setActiveProfileTab] = useState('preferences');

  // Title
  const [senderTitle, setSenderTitle] = useState(user?.senderTitle || '');
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleSaved, setTitleSaved] = useState(false);

  const handleSaveTitle = async () => {
    setSavingTitle(true);
    try {
      const res = await api.updateProfile({ senderTitle });
      if (res.success) {
        updateUser({ senderTitle });
        setTitleSaved(true);
        setTimeout(() => setTitleSaved(false), 2000);
      }
    } catch {
      /* ignore */
    } finally {
      setSavingTitle(false);
    }
  };

  // Company
  const [companyName, setCompanyName] = useState(user?.onboarding?.companyName || '');
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
  const [searchingCompanies, setSearchingCompanies] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);
  const companyRef = useRef(null);

  const handleCompanySearch = async (value) => {
    setCompanyName(value);
    setCompanySaved(false);
    if (value.length < 2) { setCompanySuggestions([]); setShowCompanySuggestions(false); return; }
    setSearchingCompanies(true);
    try {
      const res = await api.searchCompanies(value);
      if (res.success && res.companies.length > 0) {
        setCompanySuggestions(res.companies);
        setShowCompanySuggestions(true);
      } else {
        setCompanySuggestions([]);
        setShowCompanySuggestions(false);
      }
    } catch {
      setCompanySuggestions([]);
    } finally {
      setSearchingCompanies(false);
    }
  };

  const selectCompany = (company) => {
    setCompanyName(company.name);
    setShowCompanySuggestions(false);
    setCompanySuggestions([]);
  };

  const handleSaveCompany = async () => {
    if (!companyName.trim()) return;
    setSavingCompany(true);
    try {
      const res = await api.updateProfile({ companyName: companyName.trim() });
      if (res.success) {
        updateUser({ onboarding: { ...user?.onboarding, companyName: companyName.trim() } });
        setCompanySaved(true);
        setTimeout(() => setCompanySaved(false), 2000);
      }
    } catch { /* ignore */ } finally { setSavingCompany(false); }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (companyRef.current && !companyRef.current.contains(e.target)) setShowCompanySuggestions(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const CONFIRM_TEXT = 'DELETE MY ACCOUNT';

  // Coming soon
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonFeature, setComingSoonFeature] = useState('');

  const isPro = user?.plan === 'pro';

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== CONFIRM_TEXT) {
      setMessage({ type: 'error', text: `Please type "${CONFIRM_TEXT}" to confirm` });
      return;
    }
    setDeleting(true);
    try {
      const response = await api.deleteAccount();
      if (response.success) { logout(); navigate('/'); }
      else setMessage({ type: 'error', text: response.error || 'Failed to delete account' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete account' });
    } finally { setDeleting(false); }
  };

  const orgRole = membership?.orgRole;

  const profileTabs = [
    { id: 'preferences', label: 'Preferences', icon: Settings2 },
    { id: 'security', label: 'Account Security', icon: Lock },
    { id: 'statistics', label: 'Statistics', icon: BarChart3 },
  ];

  return (
    <>
      <div className="space-y-6">
        {/* ====== Odoo-style Profile Header Card ====== */}
        <div className="card p-6">
          <div className="flex items-start gap-6">
            {/* Left: Name, title, info */}
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-white mb-1">{user?.name || 'User'}</h2>
              <p className="text-dark-400 text-sm mb-4">
                {user?.senderTitle || 'No title set'}
              </p>

              {/* Two-column info grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-dark-500 w-16 flex-shrink-0">Company</span>
                  <span className="text-sm text-white truncate">{user?.onboarding?.companyName || currentOrg?.name || '-'}</span>
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

            {/* Right: Avatar */}
            <div className="flex-shrink-0">
              {user?.picture ? (
                <img src={user.picture} alt="" className="w-24 h-24 rounded-2xl object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-rivvra-400 to-rivvra-600 flex items-center justify-center">
                  <span className="text-3xl font-bold text-dark-950">
                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ====== Horizontal Tab Bar ====== */}
        <div className="border-b border-dark-700">
          <div className="flex gap-1">
            {profileTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveProfileTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeProfileTab === tab.id
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
        {activeProfileTab === 'preferences' && (
          <div className="space-y-6">
            {/* Title / Designation */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Title / Designation</label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl flex-1">
                  <Briefcase className="w-5 h-5 text-dark-500 flex-shrink-0" />
                  <input
                    type="text"
                    value={senderTitle}
                    onChange={(e) => { setSenderTitle(e.target.value); setTitleSaved(false); }}
                    placeholder="e.g. CEO & Co-Founder"
                    className="bg-transparent text-white w-full outline-none placeholder:text-dark-600"
                  />
                </div>
                <button
                  onClick={handleSaveTitle}
                  disabled={savingTitle || senderTitle === (user?.senderTitle || '')}
                  className="px-4 py-3 bg-rivvra-500 text-dark-950 rounded-xl hover:bg-rivvra-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 text-sm font-medium"
                >
                  {savingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : titleSaved ? <Check className="w-4 h-4" /> : 'Save'}
                </button>
              </div>
              <p className="text-xs text-dark-600 mt-1">Used as {'{{senderTitle}}'} placeholder in email sequences</p>
            </div>

            {/* Company */}
            <div ref={companyRef}>
              <label className="block text-sm font-medium text-dark-300 mb-2">Company</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                    <Building2 className="w-5 h-5 text-dark-500 flex-shrink-0" />
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => handleCompanySearch(e.target.value)}
                      onFocus={() => { if (companySuggestions.length > 0) setShowCompanySuggestions(true); }}
                      placeholder="Search or enter company name"
                      className="bg-transparent text-white w-full outline-none placeholder:text-dark-600"
                      autoComplete="off"
                    />
                    {searchingCompanies && <Loader2 className="w-4 h-4 text-dark-500 animate-spin flex-shrink-0" />}
                  </div>
                  {showCompanySuggestions && companySuggestions.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-dark-800 border border-dark-600 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                      {companySuggestions.map((c) => (
                        <button key={c._id} onClick={() => selectCompany(c)} className="w-full px-4 py-2.5 text-left hover:bg-dark-700 transition-colors flex items-center gap-3 first:rounded-t-xl last:rounded-b-xl">
                          {c.logo ? <img src={c.logo} alt="" className="w-6 h-6 rounded object-contain bg-white/10" /> : <Building2 className="w-5 h-5 text-dark-500" />}
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">{c.name}</p>
                            {(c.domain || c.industry) && <p className="text-xs text-dark-500 truncate">{[c.domain, c.industry].filter(Boolean).join(' · ')}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSaveCompany}
                  disabled={savingCompany || !companyName.trim() || companyName.trim() === (user?.onboarding?.companyName || '')}
                  className="px-4 py-3 bg-rivvra-500 text-dark-950 rounded-xl hover:bg-rivvra-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 text-sm font-medium"
                >
                  {savingCompany ? <Loader2 className="w-4 h-4 animate-spin" /> : companySaved ? <Check className="w-4 h-4" /> : 'Save'}
                </button>
              </div>
            </div>

            {/* Read-only fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Full Name</label>
                <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                  <User className="w-5 h-5 text-dark-500" />
                  <span className="text-white">{user?.name || '-'}</span>
                </div>
                <p className="text-xs text-dark-600 mt-1">Managed by your Google account</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Email</label>
                <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                  <Mail className="w-5 h-5 text-dark-500" />
                  <span className="text-white">{user?.email || '-'}</span>
                </div>
                <p className="text-xs text-dark-600 mt-1">Managed by your Google account</p>
              </div>
            </div>
          </div>
        )}

        {/* --- Account Security Tab --- */}
        {activeProfileTab === 'security' && (
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
                    {user?.googleId && !user?.password
                      ? 'You signed up with Google. You can set a password to enable email login.'
                      : 'Change your password to keep your account secure.'}
                  </p>
                  <button
                    onClick={() => { setComingSoonFeature('Change Password'); setShowComingSoon(true); }}
                    className="px-3 py-1.5 bg-dark-800 text-dark-300 rounded-lg hover:bg-dark-700 hover:text-white transition-colors text-sm"
                  >
                    {user?.googleId && !user?.password ? 'Set Password' : 'Change Password'}
                  </button>
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
                    onClick={() => { logout(); navigate('/login'); }}
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

        {/* --- Statistics Tab --- */}
        {activeProfileTab === 'statistics' && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Contacts Saved', value: user?.usage?.leadsScraped || 0, icon: User },
                { label: 'Emails Generated', value: user?.usage?.emailsGenerated || 0, icon: Mail },
                { label: 'DMs Generated', value: user?.usage?.dmsGenerated || 0, icon: Mail },
                { label: 'CRM Exports', value: user?.usage?.crmExports || 0, icon: BarChart3 },
              ].map((stat, i) => (
                <div key={i} className="card p-5 text-center">
                  <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center mx-auto mb-3">
                    <stat.icon className="w-5 h-5 text-dark-400" />
                  </div>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-dark-400 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
            {message.text && (
              <div className={`p-3 rounded-lg mb-4 text-sm ${message.type === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                {message.text}
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

      <ComingSoonModal isOpen={showComingSoon} onClose={() => setShowComingSoon(false)} feature={comingSoonFeature} />
    </>
  );
}
