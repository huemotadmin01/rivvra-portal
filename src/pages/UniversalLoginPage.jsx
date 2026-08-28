/**
 * UniversalLoginPage — Salesforce-style single login for any organization.
 * Route: /login (public — no ProtectedRoute wrapper)
 *
 * The user enters email + password (or Google) on one page. Because
 * portal_users.email is globally unique, the backend resolves the account
 * without an org slug. After auth we call /api/auth/my-orgs:
 *   - 1 org   → redirect straight to /org/<slug>/home
 *   - 2+ orgs → show a workspace picker
 *   - 0 orgs  → "no workspace access" message
 *
 * If the resolved org enforces SSO (password disabled), the login endpoint
 * returns code:'SSO_REQUIRED' + orgSlug and we bounce to the branded
 * /org/<slug>/login where the correct method is shown. The branded
 * /org/:slug/login and the /find-workspace recovery page are untouched.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ArrowRight, Loader2, Eye, EyeOff, AlertCircle, Mail, Lock, Building2, ArrowLeft
} from 'lucide-react';
import { GOOGLE_CLIENT_ID } from '../utils/config';
import RivvraLogo from '../components/RivvraLogo';
import api from '../utils/api';

export default function UniversalLoginPage() {
  const navigate = useNavigate();
  const { loginWithPassword, loginWithGoogle, isAuthenticated } = useAuth();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  // Post-auth routing state
  const [resolving, setResolving] = useState(false);
  const [orgChoices, setOrgChoices] = useState(null); // array when picker is shown
  const [noAccess, setNoAccess] = useState(false);

  const googleInitialized = useRef(false);

  // ──────────────────────────────────────────────────────────────────────
  // After auth: resolve the user's orgs and route accordingly.
  // ──────────────────────────────────────────────────────────────────────
  const resolveAndRoute = useCallback(async () => {
    setResolving(true);
    setError('');
    try {
      const res = await api.getMyOrgs();
      const orgs = (res && res.success && Array.isArray(res.orgs)) ? res.orgs : [];
      if (orgs.length === 1) {
        navigate(`/org/${orgs[0].slug}/home`, { replace: true });
      } else if (orgs.length > 1) {
        setOrgChoices(orgs);
        setResolving(false);
      } else {
        setNoAccess(true);
        setResolving(false);
      }
    } catch {
      setError('Signed in, but we could not load your workspaces. Please try again.');
      setResolving(false);
    }
  }, [navigate]);

  // If already authenticated on mount, skip the form and route.
  useEffect(() => {
    if (isAuthenticated) {
      resolveAndRoute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ──────────────────────────────────────────────────────────────────────
  // Google SSO
  // ──────────────────────────────────────────────────────────────────────
  const handleGoogleCredential = useCallback(async (credential) => {
    setGoogleLoading(true);
    setError('');
    try {
      const result = await loginWithGoogle({ credential, isLogin: true });
      if (result.success) {
        await resolveAndRoute();
      } else if (result.code === 'SSO_REQUIRED' && result.orgSlug) {
        navigate(`/org/${result.orgSlug}/login`);
      } else {
        setError(result.error || 'Google sign in failed');
      }
    } catch (err) {
      setError(err.message || 'Google sign in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [loginWithGoogle, resolveAndRoute, navigate]);

  // Initialize Google Sign-In (universal page always offers Google)
  useEffect(() => {
    // `resolving` / `orgChoices` / `noAccess` each render a branch with no
    // button container, and each must be a dependency too — the target guard
    // below only helps if the effect actually runs again once the form mounts.
    if (resolving || orgChoices || noAccess) return;
    if (googleInitialized.current || isAuthenticated) return;

    // Resolve the target BEFORE latching the ref — same defect fixed in
    // OrgLoginPage. This page also renders a container-less branch ("Loading
    // your workspace…" while orgs resolve), and a null element makes
    // renderButton a silent no-op. Latching first would spend the single
    // attempt on a container that does not exist yet and leave the button
    // permanently missing; returning unlatched lets the next run retry.
    const initializeGoogle = () => {
      if (!window.google?.accounts || googleInitialized.current) return;
      const target = document.getElementById('universal-google-signin-button');
      if (!target) return;

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
        target,
        { theme: 'filled_black', size: 'large', width: 400, text: 'signin_with' }
      );
    };

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
  }, [isAuthenticated, resolving, orgChoices, noAccess, handleGoogleCredential]);

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
    try {
      const result = await loginWithPassword(email, password);
      if (result.success) {
        await resolveAndRoute();
      } else if (result.code === 'SSO_REQUIRED' && result.orgSlug) {
        // Org enforces SSO — send them to their branded page.
        navigate(`/org/${result.orgSlug}/login`);
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
  // Render: resolving / redirecting
  // ──────────────────────────────────────────────────────────────────────
  if (resolving) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-rivvra-500/30 border-t-rivvra-500 rounded-full animate-spin" />
          <p className="text-dark-400">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render: workspace picker (user belongs to 2+ orgs)
  // ──────────────────────────────────────────────────────────────────────
  if (orgChoices) {
    return (
      <div className="min-h-screen bg-dark-950 mesh-gradient grid-pattern flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-2 mb-2">
              <RivvraLogo className="w-6 h-6" />
              <span className="text-xl font-bold text-white">Choose a workspace</span>
            </div>
            <p className="text-dark-400 text-sm text-center">
              You have access to multiple workspaces. Pick one to continue.
            </p>
          </div>
          <div className="space-y-3">
            {orgChoices.map((org) => (
              <button
                key={org.slug}
                onClick={() => navigate(`/org/${org.slug}/home`)}
                className="w-full flex items-center gap-4 p-4 bg-dark-900/80 border border-dark-800 rounded-xl hover:border-rivvra-500/50 hover:bg-dark-800/80 transition-colors text-left"
              >
                {org.logoAvailable ? (
                  <img
                    src={`${api.baseUrl}/api/org/${org.slug}/logo`}
                    alt={org.name}
                    className="w-10 h-10 rounded-xl object-contain bg-dark-800 flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-rivvra-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium truncate">{org.name}</p>
                  {org.status === 'alumni' && (
                    <p className="text-dark-500 text-xs">Read-only access</p>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-dark-500 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render: no workspace access (authenticated but 0 memberships)
  // ──────────────────────────────────────────────────────────────────────
  if (noAccess) {
    return (
      <div className="min-h-screen bg-dark-950 mesh-gradient grid-pattern flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">No workspace access</h1>
            <p className="text-dark-400">
              Your account isn't a member of any workspace yet. Ask your org admin to send you an invite.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-dark-800 text-white rounded-xl hover:bg-dark-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render: login form
  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-dark-950 mesh-gradient grid-pattern flex items-center justify-center p-4">
      {/* Width capped to 400px so the email/password inputs align exactly
          with the fixed-width (400px) Google button. */}
      <div className="max-w-[400px] mx-auto w-full">
        {/* Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rivvra-500/20 to-emerald-500/20 border border-rivvra-500/30 flex items-center justify-center mb-4">
            <RivvraLogo className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white">Sign in to Rivvra</h1>
          <p className="text-dark-400 text-sm mt-2 text-center">
            Use your work email — we'll take you to the right workspace.
          </p>
        </div>

        <div className="animate-fade-in">
          <div className="space-y-5">
            {/* Google Sign-In */}
            <div className="relative">
              {googleLoading && (
                <div className="absolute inset-0 bg-dark-800 rounded-xl flex items-center justify-center z-10">
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                </div>
              )}
              <div id="universal-google-signin-button" className="w-full flex justify-center" />
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-dark-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-dark-950 text-dark-500">Or</span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
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
                    autoFocus
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
                  {/* `p-1` lifts a bare 20px icon to a 28px tap target, and
                      right-4 -> right-3 absorbs the padding so the icon stays
                      put. It also had no accessible name at all — a screen
                      reader announced an unlabelled button. */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-dark-500 hover:text-dark-300"
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
            </form>

            {/* Forgot password */}
            <div className="text-center">
              <Link to="/forgot-password" className="text-sm text-dark-400 hover:text-rivvra-400 transition-colors">
                Forgot your password?
              </Link>
            </div>

            {/* Recovery / help */}
            <div className="text-center">
              <p className="text-dark-500 text-sm">
                Can't access your account?{' '}
                <Link to="/find-workspace" className="text-rivvra-400 hover:text-rivvra-300">
                  Find your workspace
                </Link>
              </p>
            </div>

            <p className="text-center text-xs text-dark-600 pt-2">
              <Link to="/" className="text-dark-400 hover:text-dark-300">Back to home</Link>
              {' '}&middot;{' '}
              <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="hover:text-dark-400">Privacy</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
