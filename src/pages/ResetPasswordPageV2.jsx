/**
 * ResetPasswordPage — Set or reset password using a token link.
 * Route: /reset-password?token=xxx (public, no auth required)
 *
 * Admin sends reset/set link from Settings > Users & Teams.
 * User clicks link in email → lands here → enters new password → auto-login.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle, ShieldCheck } from 'lucide-react';
import api from '../utils/api';
import AuthShell from '../components/shared/AuthShell';
import { Button, Callout, Field, Input, Spinner } from '../components/ds';

// ============================================================================
// ResetPasswordPageV2.jsx — set/reset password from a token link, on ds
// ============================================================================
//
// Route: /reset-password, outside OrgProvider — `PageSwitch` calls `useOrg()`,
// which throws there, so it cannot gate this. Ships directly; legacy kept
// unreferenced.
//
// ── `getPasswordStrength` is spliced BYTE-IDENTICAL, Tailwind and all ───────
// It is the only thing telling a user whether their password is any good, and
// its five score steps (>=10 chars, >=14 chars, an uppercase, a digit, a
// symbol) are a security judgement, not styling. So the function is copied
// exactly — including the `bg-red-500` / `bg-yellow-500` / `bg-blue-500` /
// `bg-green-500` strings it returns — and the class is translated to a token
// at RENDER time via STRENGTH_TONE below.
//
// Editing the function to return tokens directly would have been tidier and
// would have put a security-relevant scoring function into the diff for a
// purely cosmetic reason. It is not worth it.
//
// ── Carried across unchanged ────────────────────────────────────────────────
//   • The 10-character floor in `handleSubmit`, checked BEFORE the match test
//     so a short-and-mismatched password reports the length first, as legacy.
//   • The auto-login block: `rivvra_token` + `rivvra_user` into localStorage,
//     then `location.href = '/#/home'` and a reload after exactly 1500ms. The
//     hash route and the reload are both load-bearing.
//   • `res.success && res.valid` for the token probe, and `res.success &&
//     res.token` for the write — both halves required, both directions.
//   • The three places copy forks on `tokenInfo?.type === 'set'` (heading,
//     success heading, submit label). "Set" and "Reset" are different events
//     to the person reading them.
//   • The submit gate, which additionally refuses when the two fields differ,
//     so the mismatch cannot be submitted at all.
//
// ── Deliberately NOT carried across ─────────────────────────────────────────
// Legacy imported `useAuth` and destructured `loginWithToken`, then never used
// it — the auto-login writes localStorage directly instead. Dropping the dead
// import removes an unused auth surface from a password page; the actual login
// path is unchanged.
// ============================================================================

/** Legacy strength class → ds token. The scoring function keeps its original
 *  return value; only this lookup is new. */
const STRENGTH_TONE = {
  'bg-red-500': 'var(--danger)',
  'bg-yellow-500': 'var(--warn)',
  'bg-blue-500': 'var(--info)',
  'bg-green-500': 'var(--brand)',
};

export default function ResetPasswordPageV2() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // Token validation
  const [validating, setValidating] = useState(true);
  const [tokenInfo, setTokenInfo] = useState(null); // { valid, type, email }
  const [tokenError, setTokenError] = useState('');

  // Form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setTokenError('No reset token found. Please use the link from your email.');
      setValidating(false);
      return;
    }

    (async () => {
      try {
        const res = await api.validateResetToken(token);
        if (res.success && res.valid) {
          setTokenInfo(res);
        } else {
          setTokenError('This link is invalid or has expired. Please ask your administrator to send a new one.');
        }
      } catch {
        setTokenError('This link is invalid or has expired. Please ask your administrator to send a new one.');
      } finally {
        setValidating(false);
      }
    })();
  }, [token]);

  // Password strength
  const getPasswordStrength = (pw) => {
    if (!pw) return { level: 0, label: '', color: '' };
    let score = 0;
    if (pw.length >= 10) score++;
    if (pw.length >= 14) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { level: 1, label: 'Weak', color: 'bg-red-500' };
    if (score <= 2) return { level: 2, label: 'Fair', color: 'bg-yellow-500' };
    if (score <= 3) return { level: 3, label: 'Good', color: 'bg-blue-500' };
    return { level: 4, label: 'Strong', color: 'bg-green-500' };
  };

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.setPasswordWithToken(token, password);
      if (res.success && res.token) {
        setSuccess(true);
        // Auto-login: store token and user, then redirect
        localStorage.setItem('rivvra_token', res.token);
        localStorage.setItem('rivvra_user', JSON.stringify(res.user));
        setTimeout(() => {
          window.location.href = '/#/home';
          window.location.reload();
        }, 1500);
      } else {
        setError(res.error || 'Failed to set password');
      }
    } catch (err) {
      setError(err.message || 'Failed to set password. The link may have expired.');
    } finally {
      setSubmitting(false);
    }
  };

  const eyeBtn = {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
    display: 'flex', alignItems: 'center', color: 'var(--fg-4)', background: 'none',
  };
  const lockIcon = {
    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
    color: 'var(--fg-4)', pointerEvents: 'none',
  };

  // Loading state
  if (validating) {
    return (
      <AuthShell gradient={false} card={false}>
        <div style={{ textAlign: 'center' }}>
          <Spinner size={28} />
          <p style={{ font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', marginTop: 12 }}>
            Validating your link...
          </p>
        </div>
      </AuthShell>
    );
  }

  // Token error state
  if (tokenError) {
    return (
      <AuthShell
        gradient={false}
        card={false}
        icon={<AlertCircle size={28} />}
        tone="danger"
      >
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ font: "700 20px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 8 }}>
            Invalid Link
          </h1>
          <p style={{ font: "450 13.5px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', marginBottom: 22 }}>
            {tokenError}
          </p>
          <Button onClick={() => navigate('/find-workspace')}>Find your workspace</Button>
        </div>
      </AuthShell>
    );
  }

  // Success state
  if (success) {
    return (
      <AuthShell gradient={false} card={false} icon={<CheckCircle size={28} />}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ font: "700 20px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 8 }}>
            {tokenInfo?.type === 'set' ? 'Password Set!' : 'Password Reset!'}
          </h1>
          <p style={{ font: "450 13.5px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
            Redirecting you to Rivvra...
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      gradient={false}
      icon={<ShieldCheck size={26} />}
      title={tokenInfo?.type === 'set' ? 'Set Your Password' : 'Reset Your Password'}
      sub={tokenInfo?.email ? `for ${tokenInfo.email}` : undefined}
      footer={(
        <p style={{ font: "450 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
          Need help? Contact your organization administrator.
        </p>
      )}
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 18 }}>
        {error && (
          <Callout tone="danger" icon={<AlertCircle size={15} />}>{error}</Callout>
        )}

        <div>
          <Field label="New Password" htmlFor="rp-pw">
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={lockIcon} />
              <Input
                id="rp-pw"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 10 characters"
                autoFocus
                style={{ paddingLeft: 34, paddingRight: 34 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={eyeBtn}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          {/* Strength meter — `strength.color` is the legacy Tailwind class the
              untouched scoring function returns; STRENGTH_TONE maps it here. */}
          {password && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: 4, flex: 1, borderRadius: 'var(--r-full, 999px)',
                      background: i <= strength.level
                        ? (STRENGTH_TONE[strength.color] || 'var(--line-2)')
                        : 'var(--line-2)',
                      transition: 'background 140ms ease',
                    }}
                  />
                ))}
              </div>
              <p style={{ font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
                {strength.label}
              </p>
            </div>
          )}
        </div>

        <div>
          <Field label="Confirm Password" htmlFor="rp-confirm">
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={lockIcon} />
              <Input
                id="rp-confirm"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                invalid={!!confirmPassword && password !== confirmPassword}
                style={{ paddingLeft: 34, paddingRight: 34 }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                style={eyeBtn}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          {confirmPassword && password !== confirmPassword && (
            <p style={{ font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger)', marginTop: 4 }}>
              Passwords do not match
            </p>
          )}
        </div>

        <Button
          type="submit"
          block
          disabled={submitting || !password || !confirmPassword || password !== confirmPassword}
          iconLeft={submitting ? <Loader2 size={15} className="animate-spin" /> : undefined}
        >
          {submitting
            ? 'Setting password...'
            : (tokenInfo?.type === 'set' ? 'Set Password' : 'Reset Password')}
        </Button>
      </form>
    </AuthShell>
  );
}
