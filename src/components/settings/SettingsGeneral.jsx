/**
 * SettingsGeneral — Profile, Account & Security section
 * Extracted from the original SettingsPage for the unified platform settings.
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import {
  User, Shield, Trash2, AlertTriangle, Loader2, X, LogOut,
  Mail, Building2, Crown, Briefcase, Check, Users, Globe, Calendar, CreditCard
} from 'lucide-react';
import api from '../../utils/api';
import ComingSoonModal from '../ComingSoonModal';

export default function SettingsGeneral() {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const { currentOrg, membership, isOrgAdmin, isOrgOwner, trial } = useOrg();

  // License data (fetched for org owners/admins)
  const [licenses, setLicenses] = useState(null);
  useEffect(() => {
    if (isOrgAdmin || isOrgOwner) {
      api.getTeamMembers().then(res => {
        if (res.licenses) setLicenses(res.licenses);
      }).catch(() => {});
    }
  }, [isOrgAdmin, isOrgOwner]);

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

  return (
    <>
      <div className="space-y-6">
        {/* Profile Information */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-6">Profile Information</h2>

          <div className="flex items-start gap-6 mb-6">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-20 h-20 rounded-2xl object-cover flex-shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rivvra-400 to-rivvra-600 flex items-center justify-center flex-shrink-0">
                <span className="text-3xl font-bold text-dark-950">
                  {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
            )}
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-white">{user?.name || 'User'}</h3>
              <p className="text-dark-400">{user?.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                  isPro ? 'bg-amber-500/20 text-amber-300' : 'bg-dark-700 text-dark-300'
                }`}>
                  {isPro && <Crown className="w-3 h-3" />}
                  {isPro ? 'Pro Plan' : 'Free Plan'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-400 mb-2">Full Name</label>
              <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                <User className="w-5 h-5 text-dark-500" />
                <span className="text-white">{user?.name || '-'}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-400 mb-2">Email</label>
              <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                <Mail className="w-5 h-5 text-dark-500" />
                <span className="text-white">{user?.email || '-'}</span>
              </div>
            </div>

            <div ref={companyRef}>
              <label className="block text-sm font-medium text-dark-400 mb-2">Company</label>
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

            <div>
              <label className="block text-sm font-medium text-dark-400 mb-2">Title / Designation</label>
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
          </div>
        </div>

        {/* Account Stats */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Account Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Contacts Saved', value: user?.usage?.leadsScraped || 0 },
              { label: 'Emails Generated', value: user?.usage?.emailsGenerated || 0 },
              { label: 'DMs Generated', value: user?.usage?.dmsGenerated || 0 },
              { label: 'CRM Exports', value: user?.usage?.crmExports || 0 },
            ].map((stat, i) => (
              <div key={i} className="p-4 bg-dark-800/50 rounded-xl">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-dark-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Organization Details — visible to owner/admin */}
        {currentOrg && (isOrgOwner || isOrgAdmin) && (
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-rivvra-500/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-rivvra-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Organization</h2>
                <p className="text-sm text-dark-400">{currentOrg.name}</p>
              </div>
              {currentOrg.plan && (
                <span className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                  currentOrg.plan === 'pro' ? 'bg-amber-500/20 text-amber-300' :
                  currentOrg.plan === 'enterprise' ? 'bg-purple-500/20 text-purple-300' :
                  currentOrg.plan === 'trial' ? 'bg-rivvra-500/20 text-rivvra-300' :
                  'bg-dark-700 text-dark-300'
                }`}>
                  <Crown className="w-3 h-3" />
                  {currentOrg.plan === 'pro' ? 'Pro Plan' :
                   currentOrg.plan === 'enterprise' ? 'Enterprise' :
                   currentOrg.plan === 'trial' ? 'Trial' : 'Free Plan'}
                </span>
              )}
            </div>

            {/* Org Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                <Globe className="w-5 h-5 text-dark-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-dark-500">Org URL</p>
                  <p className="text-sm text-white truncate">rivvra.com/#/org/{currentOrg.slug}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                <Mail className="w-5 h-5 text-dark-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-dark-500">Domain</p>
                  <p className="text-sm text-white">{currentOrg.domain || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                <Calendar className="w-5 h-5 text-dark-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-dark-500">Created</p>
                  <p className="text-sm text-white">{currentOrg.createdAt ? new Date(currentOrg.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                <CreditCard className="w-5 h-5 text-dark-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-dark-500">Enabled Apps</p>
                  <p className="text-sm text-white">{currentOrg.enabledApps?.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', ') || '-'}</p>
                </div>
              </div>
            </div>

            {/* License Usage */}
            {licenses && (
              <div>
                <h3 className="text-sm font-medium text-dark-400 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  User Licenses
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="p-4 bg-dark-800/50 rounded-xl">
                    <p className="text-2xl font-bold text-white">{licenses.used || 0}</p>
                    <p className="text-sm text-dark-400">Active Users</p>
                  </div>
                  <div className="p-4 bg-dark-800/50 rounded-xl">
                    <p className="text-2xl font-bold text-white">{licenses.total || 0}</p>
                    <p className="text-sm text-dark-400">Total Licenses</p>
                  </div>
                  <div className="p-4 bg-dark-800/50 rounded-xl">
                    <p className="text-2xl font-bold text-rivvra-400">{licenses.remaining || 0}</p>
                    <p className="text-sm text-dark-400">Available</p>
                  </div>
                  <div className="p-4 bg-dark-800/50 rounded-xl">
                    <p className="text-2xl font-bold text-amber-400">{licenses.pendingInvites || 0}</p>
                    <p className="text-sm text-dark-400">Pending Invites</p>
                  </div>
                </div>
                {/* Usage Bar */}
                <div className="relative h-2 bg-dark-700 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-rivvra-500 rounded-full transition-all"
                    style={{ width: `${licenses.total ? Math.min(100, ((licenses.used || 0) / licenses.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-dark-500 mt-2">
                  {licenses.used || 0} of {licenses.total || 0} licenses used ({licenses.total ? Math.round(((licenses.used || 0) / licenses.total) * 100) : 0}%)
                </p>
              </div>
            )}

            {/* Trial Status */}
            {trial && trial.status !== 'none' && trial.status !== 'converted' && (
              <div className={`mt-6 p-4 rounded-xl border ${
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
            )}
          </div>
        )}

        {/* Security */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Password</h2>
          <p className="text-dark-400 mb-4">
            {user?.googleId && !user?.password
              ? 'You signed up with Google. You can set a password to enable email login.'
              : 'Change your password to keep your account secure.'}
          </p>
          <button
            onClick={() => { setComingSoonFeature('Change Password'); setShowComingSoon(true); }}
            className="px-4 py-2 bg-dark-800 text-white rounded-lg hover:bg-dark-700 transition-colors"
          >
            {user?.googleId && !user?.password ? 'Set Password' : 'Change Password'}
          </button>
        </div>

        {/* Sessions */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Active Sessions</h2>
          <p className="text-dark-400 mb-4">Manage your active sessions across devices.</p>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="flex items-center gap-2 px-4 py-2 bg-dark-800 text-white rounded-lg hover:bg-dark-700 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out everywhere
          </button>
        </div>

        {/* Delete Account */}
        <div className="card p-6 border-red-500/20">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-white mb-2">Delete Account</h2>
              <p className="text-dark-400 mb-4">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
              >
                Delete my account
              </button>
            </div>
          </div>
        </div>
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
                <li>• Your profile, settings, and preferences</li>
                <li>• Email sequences and automation rules</li>
                <li>• Usage history and statistics</li>
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
