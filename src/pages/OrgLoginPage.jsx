/**
 * OrgLoginPage — Branded login page for a specific organization.
 * Route: /org/:slug/login (public — no ProtectedRoute wrapper)
 *
 * Shows org name + logo, email/password + Google SSO, no signup option.
 * After auth, validates org membership before redirecting.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ArrowRight, Loader2, Eye, EyeOff, AlertCircle, Mail, Lock, Building2, ExternalLink
} from 'lucide-react';
import { GOOGLE_CLIENT_ID } from '../utils/config';
import api from '../utils/api';

export default function OrgLoginPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { loginWithPassword, loginWithGoogle, isAuthenticated, user, logout } = useAuth();

  // Org public info
  const [orgInfo, setOrgInfo] = useState(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState(null); // { type: '404' | '410' | 'error', message }

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  // Membership check state
  const [checkingMembership, setCheckingMembership] = useState(false);
  const [membershipError, setMembershipError] = useState(null); // { email, userOrgSlug }

  const googleInitialized = useRef(false);

  // ──────────────────────────────────────────────────────────────────────
  // Fetch org public info on mount
  // ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchOrg() {
      try {
        const res = await api.getOrgPublicInfo(slug);
        if (cancelled) return;
        if (res.success) {
          setOrgInfo(res.org);
        } else {
          setOrgError({ type: 'error', message: res.error || 'Failed to load organization' });
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err.message || '';
        if (msg.includes('not found') || msg.includes('404')) {
          setOrgError({ type: '404', message: 'Organization not found' });
        } else if (msg.includes('no longer active') || msg.includes('410')) {
          setOrgError({ type: '410', message: 'This organization is no longer active' });
        } else {
          setOrgError({ type: 'error', message: 'Failed to load organization' });
        }
      } finally {
        if (!cancelled) setOrgLoading(false);
      }
    }
    fetchOrg();
    return () => { cancelled = true; };
  }, [slug]);

  // ──────────────────────────────────────────────────────────────────────
  // Check org membership — used after login and on mount if already authed
  // ──────────────────────────────────────────────────────────────────────
  const checkMembership = useCallback(async () => {
    setCheckingMembership(true);
    setMembershipError(null);
    setError('');
    try {
      const res = await api.request('/api/org/by-user/me');
      if (res.success && res.org?.slug === slug) {
        // User is in this org — redirect to home
        navigate(`/org/${slug}/home`, { replace: true });
        return true;
      } else {
        // User is authenticated but not in this org
        setMembershipError({
          email: user?.email,
          userOrgSlug: res.org?.slug || null,
          userOrgName: res.org?.name || null,
        });
        return false;
      }
    } catch {
      setError('Failed to verify organization access. Please try again.');
      return false;
    } finally {
      setCheckingMembership(false);
    }
  }, [slug, navigate, user?.email]);

  // If already authenticated on mount, check membership immediately
  useEffect(() => {
    if (isAuthenticated && orgInfo && !orgError) {
      checkMembership();
    }
  }, [isAuthenticated, orgInfo, orgError, checkMembership]);

  // ──────────────────────────────────────────────────────────────────────
  // Google SSO
  // ──────────────────────────────────────────────────────────────────────
  const handleGoogleCredential = useCallback(async (credential) => {
    setGoogleLoading(true);
    setError('');
    setMembershipError(null);

    try {
      const result = await loginWithGoogle({ credential, isLogin: true });
      if (result.success) {
        // Auth succeeded — now verify org membership
        const memberOk = await checkMembership();
        if (!memberOk) {
          // Not in this org — logout so they don't stay authenticated on wrong page
          logout();
        }
      } else {
        if (result.error === 'User not found') {
          setError("No account found. Ask your org admin to invite you.");
        } else {
          setError(result.error || 'Google sign in failed');
        }
      }
    } catch (err) {
      setError(err.message || 'Google sign in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [loginWithGoogle, checkMembership, logout]);

  // Derive allowed auth methods from org info
  const allowedMethods = orgInfo?.authSettings?.allowedMethods || ['google'];
  const googleAuthEnabled = allowedMethods.includes('google');
  const passwordAuthEnabled = allowedMethods.includes('password');

  // Initialize Google Sign-In
  useEffect(() => {
    if (orgLoading || orgError || googleInitialized.current || !googleAuthEnabled) return;

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
      if (window.google?.accounts && !googleInitialized.current) {
        googleInitialized.current = true;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response.credential) {
              handleGoogleCredential(response.credential);
            }
          },
        });
        window.google.accounts.id.renderButton(
          document.getElementById('org-google-signin-button'),
          { theme: 'filled_black', size: 'large', width: 400, text: 'signin_with' }
        );
      }
    };

    loadGoogleScript();
  }, [orgLoading, orgError, handleGoogleCredential]);

  // ──────────────────────────────────────────────────────────────────────
  // Email + Password login
  // ──────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setLoading(true);
    setError('');
    setMembershipError(null);

    try {
      const result = await loginWithPassword(email, password);
      if (result.success) {
        // Auth succeeded — now verify org membership
        const memberOk = await checkMembership();
        if (!memberOk) {
          logout();
        }
      } else {
        setError(result.error || 'Invalid email or password');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Render: Loading state
  // ──────────────────────────────────────────────────────────────────────
  if (orgLoading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-rivvra-500/30 border-t-rivvra-500 rounded-full animate-spin" />
          <p className="text-dark-400">Loading...</p>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render: Error state (org not found / archived)
  // ──────────────────────────────────────────────────────────────────────
  if (orgError) {
    return (
      <div className="min-h-screen bg-dark-950 mesh-gradient grid-pattern flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mx-auto">
            <Building2 className="w-8 h-8 text-dark-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {orgError.type === '404' ? 'Organization Not Found' :
               orgError.type === '410' ? 'Organization Inactive' :
               'Something went wrong'}
            </h1>
            <p className="text-dark-400">
              {orgError.type === '404' && "The organization you're looking for doesn't exist. Check the URL and try again."}
              {orgError.type === '410' && 'This organization is no longer active. Contact the organization admin for more information.'}
              {orgError.type === 'error' && 'We could not load the organization. Please try again later.'}
            </p>
          </div>
          <Link
            to="/find-workspace"
            className="inline-flex items-center gap-2 px-6 py-3 bg-dark-800 text-white rounded-xl hover:bg-dark-700 transition-colors"
          >
            Find Your Workspace
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render: Checking membership (after auth, before redirect)
  // ──────────────────────────────────────────────────────────────────────
  if (checkingMembership) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-rivvra-500/30 border-t-rivvra-500 rounded-full animate-spin" />
          <p className="text-dark-400">Verifying access...</p>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render: Membership mismatch (authenticated but wrong org)
  // ──────────────────────────────────────────────────────────────────────
  if (membershipError) {
    return (
      <div className="min-h-screen bg-dark-950 mesh-gradient grid-pattern flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">No Access</h1>
            <p className="text-dark-400">
              {membershipError.email ? (
                <>
                  <span className="text-white font-medium">{membershipError.email}</span> does not have access to{' '}
                  <span className="text-white font-medium">{orgInfo?.name || 'this organization'}</span>.
                </>
              ) : (
                <>You don't have access to <span className="text-white font-medium">{orgInfo?.name || 'this organization'}</span>.</>
              )}
            </p>
            <p className="text-dark-500 text-sm mt-2">
              Ask your organization admin to send you an invite.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {membershipError.userOrgSlug && (
              <Link
                to={`/org/${membershipError.userOrgSlug}/home`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-rivvra-500 text-dark-950 rounded-xl font-semibold hover:bg-rivvra-400 transition-colors"
              >
                Go to {membershipError.userOrgName || 'Your Organization'}
                <ExternalLink className="w-4 h-4" />
              </Link>
            )}
            <button
              onClick={() => { setMembershipError(null); setError(''); }}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-dark-800 text-white rounded-xl hover:bg-dark-700 transition-colors"
            >
              Try a different account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render: Login form
  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-950 mesh-gradient grid-pattern flex items-center justify-center p-4">
      <div className="max-w-md mx-auto w-full">
        {/* Org Branding */}
        <div className="flex flex-col items-center mb-10">
          {orgInfo?.logoAvailable ? (
            <img
              src={`${api.baseUrl}/api/org/${slug}/logo`}
              alt={orgInfo.name}
              className="w-16 h-16 rounded-2xl object-contain bg-dark-800 mb-4"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4">
              <Building2 className="w-8 h-8 text-rivvra-400" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">{orgInfo?.name}</h1>
          <p className="text-dark-400 mt-1">Sign in to your workspace</p>
        </div>

        <div className="animate-fade-in">
          <div className="space-y-6">
            {/* Google Sign-In — only if org allows google */}
            {googleAuthEnabled && (
              <div className="relative">
                {googleLoading && (
                  <div className="absolute inset-0 bg-dark-800 rounded-xl flex items-center justify-center z-10">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  </div>
                )}
                <div id="org-google-signin-button" className="w-full flex justify-center" />
              </div>
            )}

            {/* Divider — only if both methods enabled */}
            {googleAuthEnabled && passwordAuthEnabled && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-dark-700" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-dark-950 text-dark-500">Or</span>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Login Form — only if org allows password */}
            {passwordAuthEnabled && <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="input-field pl-12"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="input-field pl-12 pr-12"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>}

            {/* Forgot password — only if password auth is shown */}
            {passwordAuthEnabled && (
              <div className="text-center">
                <Link to={`/forgot-password?workspace=${slug}`} className="text-sm text-dark-400 hover:text-rivvra-400 transition-colors">
                  Forgot your password?
                </Link>
              </div>
            )}

            {/* No signup — ask admin */}
            <div className="text-center">
              <p className="text-dark-500 text-sm">
                Don't have access? Ask your org admin to invite you.
              </p>
            </div>

            <p className="text-center text-xs text-dark-600 pt-2">
              Powered by{' '}
              <Link to="/" className="text-dark-400 hover:text-dark-300">Rivvra</Link>
              {' '}&middot;{' '}
              <Link to="/privacy" className="hover:text-dark-400">Privacy</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
