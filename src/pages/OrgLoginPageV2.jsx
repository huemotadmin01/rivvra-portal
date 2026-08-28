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
import AuthShell from '../components/shared/AuthShell';
import { Button, Callout, Field, Input, Spinner } from '../components/ds';

// ============================================================================
// OrgLoginPageV2.jsx — the per-org sign-in page, on ds
// ============================================================================
//
// Route: /org/:slug/login, outside OrgProvider — `PageSwitch` calls `useOrg()`,
// which throws there. Ships directly; legacy kept unreferenced.
//
// ── EVERY auth path is spliced byte-identical ───────────────────────────────
// This is the highest-traffic page of the five and the only one that takes a
// password, so nothing below `return (` was retyped. In particular:
//
//   • `checkMembership` and BOTH its callers. After a successful
//     authentication the page verifies the user actually belongs to this org,
//     and if they do not it calls `logout()`. That is the security property of
//     this page: auth succeeding is NOT the same as being allowed in here, and
//     without the logout a stranger stays authenticated on someone else's
//     branded login URL.
//   • `allowedMethods` → `googleAuthEnabled` / `passwordAuthEnabled`. These
//     gate whether the Google button and the password form render AT ALL. An
//     org that has disabled password auth must not be shown a password box, so
//     the two `&&` guards are policy, not layout.
//   • The error strings. "Invalid email or password" is deliberately generic.
//     (Note that Google's "No account found. Ask your org admin to invite you."
//     is NOT generic — it is legacy copy and is preserved as-is rather than
//     changed on my own initiative; flagged in the PR.)
//   • The expired-session banner, which reads and CLEARS
//     `sessionStorage.rivvra_session_expired` so the explanation shows once.
//
// ── The Google button is Google's own widget ────────────────────────────────
// `renderButton` paints into `#org-google-signin-button`, and that id is
// load-bearing — the effect looks it up by id. Its `theme: 'filled_black'` is
// left alone: it is rendered inside Google's iframe, we cannot token it, and
// these routes never receive `data-theme` anyway (measured in phase 45), so
// the surrounding page is always dark and the black button matches.
//
// ── Layout note ─────────────────────────────────────────────────────────────
// The form is NOT in a card in legacy — it is a bare stack on the gradient —
// so `card={false}` here, and the header uses AuthShell's `brand` slot to show
// the ORG's logo and name rather than Rivvra's mark.
// ============================================================================

export default function OrgLoginPageV2() {
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

  // If the user was bounced here by an expired session (a request came back
  // 401 → 'rivvra:auth-expired' → auth cleared), explain why rather than
  // looking like a random logout. Reuses the existing error banner.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('rivvra_session_expired')) {
        sessionStorage.removeItem('rivvra_session_expired');
        setError('Your session expired — please sign in again.');
      }
    } catch { /* ignore */ }
  }, []);

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
  //
  // The guard must name EVERY state that renders a branch without the form in
  // it, and `initializeGoogle` must not latch until the container exists.
  //
  // `#org-google-signin-button` lives only in the final return. Four early
  // returns sit above it — orgLoading, orgError, checkingMembership,
  // membershipError — and the guard used to list only the first two. Repro:
  // sign in, open an org login URL you have no access to (the "No Access"
  // branch), then click "Try a different account". That only clears
  // `membershipError`, so the form mounts — but the effect had already run
  // during the membership phase, latched `googleInitialized.current = true`
  // and handed `renderButton` a null element, which GIS ignores silently. The
  // latch then made every later run early-return, so the container stayed
  // empty: a blank gap above a stranded "Or", and no error anywhere.
  //
  // Signed-out visitors never hit it — no membership check runs, so the form
  // is the first branch rendered and the container exists on the first try.
  useEffect(() => {
    if (orgLoading || orgError || checkingMembership || membershipError) return;
    if (googleInitialized.current || !googleAuthEnabled) return;

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
      if (!window.google?.accounts || googleInitialized.current) return;
      // Resolve the target BEFORE latching. A null element makes renderButton
      // a silent no-op, and latching first would burn the one attempt we get.
      // Returning unlatched lets the next effect run retry once the form is up.
      const target = document.getElementById('org-google-signin-button');
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

    loadGoogleScript();
  }, [orgLoading, orgError, checkingMembership, membershipError, googleAuthEnabled, handleGoogleCredential]);

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

  const headText = { font: "700 21px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 8 };
  const bodyText = { font: "450 13.5px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' };
  const strong = { color: 'var(--fg)', fontWeight: 500 };

  // ──────────────────────────────────────────────────────────────────────
  // Render: Loading state
  // ──────────────────────────────────────────────────────────────────────
  if (orgLoading) {
    return (
      <AuthShell gradient={false} card={false}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Spinner size={40} />
          <p style={bodyText}>Loading...</p>
        </div>
      </AuthShell>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render: Error state (org not found / archived)
  // ──────────────────────────────────────────────────────────────────────
  if (orgError) {
    return (
      <AuthShell card={false} tone="neutral" icon={<Building2 size={28} />}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={headText}>
            {orgError.type === '404' ? 'Organization Not Found' :
             orgError.type === '410' ? 'Organization Inactive' :
             'Something went wrong'}
          </h1>
          <p style={{ ...bodyText, marginBottom: 24 }}>
            {orgError.type === '404' && "The organization you're looking for doesn't exist. Check the URL and try again."}
            {orgError.type === '410' && 'This organization is no longer active. Contact the organization admin for more information.'}
            {orgError.type === 'error' && 'We could not load the organization. Please try again later.'}
          </p>
          <Button as="a" href="/find-workspace" variant="secondary" iconRight={<ArrowRight size={15} />}
            onClick={(e) => { e.preventDefault(); navigate('/find-workspace'); }}>
            Find Your Workspace
          </Button>
        </div>
      </AuthShell>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render: Checking membership (after auth, before redirect)
  // ──────────────────────────────────────────────────────────────────────
  if (checkingMembership) {
    return (
      <AuthShell gradient={false} card={false}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Spinner size={40} />
          <p style={bodyText}>Verifying access...</p>
        </div>
      </AuthShell>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render: Membership mismatch (authenticated but wrong org)
  // ──────────────────────────────────────────────────────────────────────
  if (membershipError) {
    return (
      <AuthShell card={false} tone="danger" icon={<AlertCircle size={28} />}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={headText}>No Access</h1>
          <p style={bodyText}>
            {membershipError.email ? (
              <>
                <span style={strong}>{membershipError.email}</span> does not have access to{' '}
                <span style={strong}>{orgInfo?.name || 'this organization'}</span>.
              </>
            ) : (
              <>You don't have access to <span style={strong}>{orgInfo?.name || 'this organization'}</span>.</>
            )}
          </p>
          <p style={{ font: "450 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 8 }}>
            Ask your organization admin to send you an invite.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
            {membershipError.userOrgSlug && (
              <Button
                as="a"
                href={`/org/${membershipError.userOrgSlug}/home`}
                block
                iconRight={<ExternalLink size={15} />}
                onClick={(e) => { e.preventDefault(); navigate(`/org/${membershipError.userOrgSlug}/home`); }}
              >
                Go to {membershipError.userOrgName || 'Your Organization'}
              </Button>
            )}
            <Button
              variant="secondary"
              block
              onClick={() => { setMembershipError(null); setError(''); }}
            >
              Try a different account
            </Button>
          </div>
        </div>
      </AuthShell>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render: Login form
  // ──────────────────────────────────────────────────────────────────────
  return (
    <AuthShell
      card={false}
      brand={(
        <>
          {orgInfo?.logoAvailable ? (
            <img
              src={`${api.baseUrl}/api/org/${slug}/logo`}
              alt={orgInfo.name}
              style={{
                width: 60, height: 60, marginBottom: 14, objectFit: 'contain',
                borderRadius: 'var(--r-3)', background: 'var(--surface-2)',
              }}
            />
          ) : (
            <div style={{
              width: 60, height: 60, marginBottom: 14, borderRadius: 'var(--r-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface-2)', color: 'var(--brand-ink)',
            }}>
              <Building2 size={28} />
            </div>
          )}
          <h1 style={{ font: "700 21px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{orgInfo?.name}</h1>
          <p style={{ ...bodyText, marginTop: 4 }}>Sign in to your workspace</p>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 22 }}>
        {/* Google Sign-In — only if org allows google */}
        {googleAuthEnabled && (
          <div style={{ position: 'relative' }}>
            {googleLoading && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--surface-2)', borderRadius: 'var(--r-2)',
              }}>
                <Loader2 size={18} className="animate-spin" style={{ color: 'var(--fg)' }} />
              </div>
            )}
            {/* id is load-bearing — the effect calls renderButton on it */}
            <div id="org-google-signin-button" style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />
          </div>
        )}

        {/* Divider — only if both methods enabled */}
        {googleAuthEnabled && passwordAuthEnabled && (
          <div style={{ position: 'relative', textAlign: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100%', borderTop: '1px solid var(--line)' }} />
            </div>
            <span style={{
              position: 'relative', padding: '0 14px', background: 'var(--bg)',
              font: "450 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)',
            }}>
              Or
            </span>
          </div>
        )}

        {/* Error Display */}
        {error && <Callout tone="danger" icon={<AlertCircle size={15} />}>{error}</Callout>}

        {/* Login Form — only if org allows password */}
        {passwordAuthEnabled && (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
            <Field label="Email" htmlFor="ol-email">
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
                <Input
                  id="ol-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  disabled={loading}
                  style={{ paddingLeft: 36 }}
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="ol-password">
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
                <Input
                  id="ol-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={loading}
                  style={{ paddingLeft: 36, paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  // A bare 16px eye icon is a 16x16 tap target. This one is
                  // `absolute`, so it pads itself to 24x24 rather than using
                  // the `hit-24` overlay (that class sets `position: relative`
                  // and would break the anchoring). `right` drops 10 -> 6 to
                  // absorb the new 4px padding, so the icon does not move.
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    display: 'flex', alignItems: 'center', padding: 4,
                    color: 'var(--fg-4)', background: 'none',
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            <Button
              type="submit"
              block
              disabled={loading || !email || !password}
              iconLeft={loading ? <Loader2 size={16} className="animate-spin" /> : undefined}
              iconRight={loading ? undefined : <ArrowRight size={16} />}
            >
              {loading ? '' : 'Sign in'}
            </Button>
          </form>
        )}

        {/* Forgot password — only if password auth is shown */}
        {passwordAuthEnabled && (
          <div style={{ textAlign: 'center' }}>
            <Link
              to={`/forgot-password?workspace=${slug}`}
              style={{ font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}
            >
              Forgot your password?
            </Link>
          </div>
        )}

        {/* No signup — ask admin */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
            Don't have access? Ask your org admin to invite you.
          </p>
        </div>

        <p style={{ textAlign: 'center', font: "450 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', paddingTop: 2 }}>
          Powered by{' '}
          <Link to="/" style={{ color: 'var(--fg-3)' }}>Rivvra</Link>
          {' '}&middot;{' '}
          <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fg-3)' }}>Privacy</a>
        </p>
      </div>
    </AuthShell>
  );
}
