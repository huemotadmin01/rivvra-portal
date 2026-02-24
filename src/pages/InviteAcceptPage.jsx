import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Building2, UserPlus, Loader2, AlertTriangle, LogIn, CheckCircle, Mail, Shield } from 'lucide-react';
import { GOOGLE_CLIENT_ID } from '../utils/config';
import api from '../utils/api';

function InviteAcceptPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, updateUser } = useAuth();

  const [inviteToken, setInviteToken] = useState('');
  const [invite, setInvite] = useState(null);
  const [inviteType, setInviteType] = useState(null); // 'org' | 'legacy'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Extract token from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search || location.hash?.split('?')[1] || '');
    const t = params.get('token');
    if (t) {
      setInviteToken(t);
      validateToken(t);
    } else {
      setError('No invite token found');
      setLoading(false);
    }
  }, []);

  // Dual-path validation: try org invite first, fall back to legacy
  async function validateToken(t) {
    try {
      // Try org invite first
      const orgRes = await api.validateOrgInvite(t);
      if (orgRes.success) {
        setInvite(orgRes.invite);
        setInviteType('org');
        setLoading(false);
        return;
      }
    } catch {
      // Org invite not found — try legacy
    }

    try {
      const legacyRes = await api.validateInviteToken(t);
      if (legacyRes.success) {
        setInvite(legacyRes.invite);
        setInviteType('legacy');
      } else {
        setError(legacyRes.error || 'Invalid invite link');
      }
    } catch (err) {
      setError(err.message || 'Invalid or expired invite link');
    } finally {
      setLoading(false);
    }
  }

  // Helper to handle successful accept
  function handleAcceptSuccess(res) {
    localStorage.setItem('rivvra_token', res.token);
    localStorage.setItem('rivvra_user', JSON.stringify(res.user));

    // If onboarding is not completed, redirect to signup page for onboarding questionnaire
    if (!res.user.onboarding?.completed) {
      window.location.href = '/#/signup';
      window.location.reload();
    } else {
      // Onboarding already done — go to home (OrgRedirect will handle org-scoping)
      window.location.href = '/#/home';
      window.location.reload();
    }
  }

  // ── Google Auth Handler ──
  const handleGoogleCredential = useCallback(async (credential) => {
    setGoogleLoading(true);
    setError('');
    try {
      let res;
      if (inviteType === 'org') {
        res = await api.acceptOrgInvite({ token: inviteToken, credential });
      } else {
        res = await api.acceptInvite({ token: inviteToken, credential });
      }
      if (res.success) {
        handleAcceptSuccess(res);
      } else {
        setError(res.error || 'Failed to join');
      }
    } catch (err) {
      setError(err.message || 'Failed to join with Google');
    } finally {
      setGoogleLoading(false);
    }
  }, [inviteToken, inviteType]);

  // Initialize Google Sign-In button
  useEffect(() => {
    if (!invite || loading) return;

    // For existing users who are already logged in, don't need Google button
    const isLoggedInAsInvitee = isAuthenticated && user?.email?.toLowerCase() === invite.email?.toLowerCase();
    if (invite.userExists && isLoggedInAsInvitee) return;

    const loadGoogleScript = () => {
      if (window.google?.accounts) {
        initializeGoogle();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogle;
      document.head.appendChild(script);
    };

    const initializeGoogle = () => {
      if (window.google?.accounts) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response.credential) {
              handleGoogleCredential(response.credential);
            }
          },
        });

        const btnEl = document.getElementById('invite-google-button');
        if (btnEl) {
          window.google.accounts.id.renderButton(btnEl, {
            theme: 'filled_black',
            size: 'large',
            width: 380,
            text: 'continue_with',
          });
        }
      }
    };

    loadGoogleScript();
  }, [invite, loading, handleGoogleCredential, isAuthenticated, user]);

  // ── One-Click Join (existing + logged in) ──
  async function handleOneClickJoin() {
    setSubmitting(true);
    setError('');
    try {
      let res;
      if (inviteType === 'org') {
        res = await api.acceptOrgInvite({ token: inviteToken });
      } else {
        res = await api.acceptInvite({ token: inviteToken });
      }
      if (res.success) {
        handleAcceptSuccess(res);
      } else {
        setError(res.error || 'Failed to join');
      }
    } catch (err) {
      setError(err.message || 'Failed to join');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Navigate to Signup Page with invite context ──
  function handleSignupWithEmail() {
    navigate(`/signup?inviteToken=${inviteToken}`);
  }

  // ── Loading State ──
  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rivvra-500 animate-spin" />
      </div>
    );
  }

  // ── Error State (no invite) ──
  if (error && !invite) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
        <div className="bg-dark-900 border border-dark-700 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Invalid Invite</h2>
          <p className="text-dark-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Determine which UI to show
  const userExists = invite?.userExists;
  const alreadyInTeam = invite?.alreadyInTeam || invite?.alreadyMember;
  const isLoggedInAsInvitee = isAuthenticated && user?.email?.toLowerCase() === invite?.email?.toLowerCase();

  // Display name: org invites show orgName, legacy show companyName
  const displayName = invite?.orgName || invite?.companyName || 'the team';

  // App access badges for org invites
  const appBadges = inviteType === 'org' && invite?.appAccess
    ? Object.entries(invite.appAccess)
        .filter(([, v]) => v.enabled)
        .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1))
    : [];

  // Role display
  const roleLabel = invite?.orgRole === 'admin' ? 'Admin' :
    invite?.orgRole === 'owner' ? 'Owner' :
    invite?.role === 'team_lead' ? 'Team Lead' :
    'Member';

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-rivvra-500/10 flex items-center justify-center mx-auto mb-4">
            {alreadyInTeam ? (
              <CheckCircle className="w-7 h-7 text-rivvra-400" />
            ) : (
              <Building2 className="w-7 h-7 text-rivvra-400" />
            )}
          </div>
          <h1 className="text-xl font-bold text-white mb-2">
            {alreadyInTeam ? `Welcome to ${displayName}` : `Join ${displayName}`}
          </h1>
          <p className="text-dark-400 text-sm">
            {alreadyInTeam ? (
              <>Sign in to access your <span className="text-rivvra-400 font-medium">{displayName}</span> account</>
            ) : (
              <>You've been invited to join as{' '}
              <span className="text-rivvra-400 font-medium">{roleLabel}</span></>
            )}
          </p>
          {!alreadyInTeam && invite.invitedByName && (
            <p className="text-dark-500 text-xs mt-1">Invited by {invite.invitedByName}</p>
          )}

          {/* App access badges for org invites */}
          {appBadges.length > 0 && !alreadyInTeam && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <Shield className="w-3.5 h-3.5 text-dark-500" />
              <span className="text-dark-500 text-xs">Access to:</span>
              {appBadges.map((app) => (
                <span
                  key={app}
                  className="px-2 py-0.5 text-xs rounded-md bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20"
                >
                  {app}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* CASE 1: Existing user, already logged in — One-click join */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {userExists && isLoggedInAsInvitee ? (
          <div className="space-y-4">
            {/* User card */}
            <div className="flex items-center gap-3 p-4 bg-dark-800/60 border border-dark-700/50 rounded-xl">
              {user?.picture ? (
                <img src={user.picture} alt="" className="w-11 h-11 rounded-xl object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rivvra-500/20 to-rivvra-600/20 flex items-center justify-center">
                  <span className="text-sm font-bold text-rivvra-400">
                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.name || 'Unnamed'}</p>
                <p className="text-xs text-dark-400 truncate">{user?.email}</p>
              </div>
              <CheckCircle className="w-5 h-5 text-rivvra-400 flex-shrink-0" />
            </div>

            <button
              onClick={handleOneClickJoin}
              disabled={submitting}
              className="w-full py-3 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  {alreadyInTeam ? 'Continue to Dashboard' : `Join ${displayName}`}
                </>
              )}
            </button>
          </div>

        /* ═══════════════════════════════════════════════════════════ */
        /* CASE 2: Existing user, NOT logged in — Google or password  */
        /* ═══════════════════════════════════════════════════════════ */
        ) : userExists ? (
          <div className="space-y-4">
            <div className="p-4 bg-dark-800/40 border border-dark-700/30 rounded-xl">
              <p className="text-dark-300 text-sm text-center">
                Welcome back, <span className="text-white font-medium">{invite.userName || invite.email}</span>
              </p>
              <p className="text-dark-500 text-xs text-center mt-1">
                {alreadyInTeam ? 'Sign in to access your account' : 'Sign in to join the team'}
              </p>
            </div>

            {/* Google Sign-in */}
            <div className="flex justify-center">
              {googleLoading ? (
                <div className="flex items-center gap-2 py-3 text-dark-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in with Google...
                </div>
              ) : (
                <div id="invite-google-button" />
              )}
            </div>

            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-dark-700" />
              <span className="text-dark-500 text-xs">or sign in with password</span>
              <div className="flex-1 h-px bg-dark-700" />
            </div>

            {/* Redirect to login */}
            <button
              onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/invite?token=${inviteToken}`)}`)}
              className="w-full py-3 bg-dark-800 text-white border border-dark-600 rounded-xl text-sm font-semibold hover:bg-dark-700 transition-colors flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Sign in with Email & Password
            </button>
          </div>

        /* ═══════════════════════════════════════════════════════════ */
        /* CASE 3: New user — Google button + Sign up with Email link */
        /* ═══════════════════════════════════════════════════════════ */
        ) : (
          <div className="space-y-4">
            {/* Info text */}
            <div className="p-4 bg-dark-800/40 border border-dark-700/30 rounded-xl">
              <p className="text-dark-300 text-sm text-center">
                Create your account to join <span className="text-white font-medium">{displayName}</span>
              </p>
              <p className="text-dark-500 text-xs text-center mt-1">{invite.email}</p>
            </div>

            {/* Google Signup */}
            <div className="flex justify-center">
              {googleLoading ? (
                <div className="flex items-center gap-2 py-3 text-dark-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account with Google...
                </div>
              ) : (
                <div id="invite-google-button" />
              )}
            </div>

            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-dark-700" />
              <span className="text-dark-500 text-xs">or</span>
              <div className="flex-1 h-px bg-dark-700" />
            </div>

            {/* Sign up with Email — navigates to SignupPage with invite context */}
            <button
              onClick={handleSignupWithEmail}
              className="w-full py-3 bg-dark-800 text-white border border-dark-600 rounded-xl text-sm font-semibold hover:bg-dark-700 transition-colors flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" />
              Sign up with Email & Password
            </button>
          </div>
        )}

        {/* Footer link */}
        {!(userExists && isLoggedInAsInvitee) && (
          <p className="text-center text-dark-500 text-xs mt-6">
            {userExists ? "Don't have access to this account?" : 'Already have an account?'}{' '}
            <button onClick={() => navigate('/login')} className="text-rivvra-400 hover:text-rivvra-300">
              Go to Login
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

export default InviteAcceptPage;
