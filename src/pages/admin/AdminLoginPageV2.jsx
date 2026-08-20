// ============================================================================
// AdminLoginPageV2.jsx — Rivvra super-admin sign-in, on ds
// ============================================================================
//
// Route: /admin/login. Public — this is the one /admin/* page NOT behind
// SuperAdminRoute, because it is how you get behind it.
//
// ── The whole auth path is spliced verbatim ─────────────────────────────────
// Every branch of it, because each one is a different security outcome:
//
//   • The redirect effect fires only on `isAuthenticated && user?.superAdmin`.
//     An authenticated NON-super-admin stays on this page rather than being
//     bounced into /admin.
//   • Both login paths — password and Google — re-check `result.user
//     ?.superAdmin` AFTER a successful credential exchange and show "Access
//     denied. Super admin privileges required." otherwise. A valid Rivvra user
//     logging in here is authenticated but still refused. Dropping that second
//     check would hand the admin console to any customer.
//   • `googleInitialized` is a ref, not state, so the GSI script is injected
//     once. As a state flag it would re-run the effect and render a second
//     Google button.
//
// The pre-submit validation (`!email.includes('@')`, `!password`) is spliced
// too — it short-circuits before any credential leaves the browser.
//
// ── Kept, not re-themed ─────────────────────────────────────────────────────
// `RivvraLogo` and the `mesh-gradient grid-pattern` backdrop stay. They are the
// brand identity of the auth surfaces, shared with the other sign-in pages, and
// re-theming one of them alone would make the admin login stop looking like the
// rest of the family.
//
// The Google button is rendered by Google's own script into
// `#admin-google-signin-button` with `theme: 'filled_black'`. Its markup is not
// ours to style, and the id is the contract — renaming it silently removes
// Google sign-in.
//
// Not triggered: no credentials were entered. Verification covers rendering,
// the client-side validation messages (which fire before any network call) and
// the accessible names.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { GOOGLE_CLIENT_ID } from '../../utils/config';
import {
  ShieldCheck, Loader2, Eye, EyeOff, AlertCircle, Mail, Lock,
} from 'lucide-react';
import RivvraLogo from '../../components/RivvraLogo';
import { Button, Callout, Field, Input } from '../../components/ds';

// ── Shared render tokens ────────────────────────────────────────────────────
const microStyle = { font: "450 12px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };

// ── Main Page ──────────────────────────────────────────────────────────────
function AdminLoginPageV2() {
  const navigate = useNavigate();
  const { loginWithPassword, loginWithGoogle, isAuthenticated, user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const googleInitialized = useRef(false);

  // If already authenticated as super admin, redirect
  useEffect(() => {
    if (isAuthenticated && user?.superAdmin) {
      navigate('/admin', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Handle Google credential
  const handleGoogleCredential = useCallback(async (credential) => {
    setGoogleLoading(true);
    setError('');
    try {
      const result = await loginWithGoogle({ credential });
      if (result.success) {
        if (result.user?.superAdmin) {
          navigate('/admin', { replace: true });
        } else {
          setError('Access denied. Super admin privileges required.');
        }
      } else {
        setError(result.error || 'Google login failed');
      }
    } catch (err) {
      setError(err.message || 'Google login failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [loginWithGoogle, navigate]);

  // Initialize Google Sign-In
  useEffect(() => {
    if (googleInitialized.current) return;

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
          document.getElementById('admin-google-signin-button'),
          { theme: 'filled_black', size: 'large', width: 400, text: 'signin_with' }
        );
      }
    };

    loadGoogleScript();
  }, [handleGoogleCredential]);

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
        // Check if the user is a super admin
        if (result.user?.superAdmin) {
          navigate('/admin', { replace: true });
        } else {
          setError('Access denied. Super admin privileges required.');
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

  return (
    <div
      data-theme="dark"
      className="mesh-gradient grid-pattern"
      style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Brand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <span style={{
            width: 62, height: 62, borderRadius: 'var(--r-3, 16px)', marginBottom: 14,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--warn-soft)', color: 'var(--warn-ink)',
            boxShadow: '0 0 0 1px var(--warn-soft)',
          }}>
            <ShieldCheck size={30} />
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <RivvraLogo className="w-6 h-6" />
            <span style={{ font: "700 19px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>Rivvra Admin</span>
          </span>
          <p style={microStyle}>Internal admin access only</p>
        </div>

        <div style={{
          borderRadius: 'var(--r-3, 16px)', padding: 24,
          background: 'var(--surface-1)', boxShadow: '0 0 0 1px var(--line), var(--sh-3)',
        }}>
          {error && (
            <div style={{ marginBottom: 16 }}>
              <Callout tone="danger" icon={<AlertCircle size={16} />}>{error}</Callout>
            </div>
          )}

          {/* Google renders its own button into this id — the id IS the
              contract with the GSI script initialised above. */}
          <div style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }}>
            {googleLoading
              ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
                  <span style={microStyle}>Verifying with Google...</span>
                </span>
              )
              : <div id="admin-google-signin-button" />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span style={microStyle}>or sign in with email</span>
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
            <Field label="Email" htmlFor="admin-email">
              <span style={{ position: 'relative', display: 'block' }}>
                <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@rivvra.com"
                  autoComplete="username"
                  style={{ paddingLeft: 36 }}
                />
              </span>
            </Field>

            <Field label="Password" htmlFor="admin-password">
              <span style={{ position: 'relative', display: 'block' }}>
                <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }} />
                <Input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  style={{ paddingLeft: 36, paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 'var(--r-1, 7px)',
                    background: 'none', border: 0, cursor: 'pointer', color: 'var(--fg-4)',
                  }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </span>
            </Field>

            {/* `disabled` is legacy's exactly — loading OR either field empty. */}
            <Button type="submit" block disabled={loading || !email || !password}
              iconLeft={loading ? <Loader2 size={16} className="animate-spin" /> : undefined}>
              Sign in to Admin
            </Button>
          </form>

        </div>

        <p style={{ ...microStyle, textAlign: 'center', marginTop: 18 }}>
          © 2026 Rivvra. Admin access is restricted.
        </p>
      </div>
    </div>
  );
}

export default AdminLoginPageV2;
