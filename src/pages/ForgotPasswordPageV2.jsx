/**
 * ForgotPasswordPage — Self-service password reset via OTP.
 * Route: /forgot-password (public, no auth required)
 *
 * 3-step flow:
 *   1. Enter email → sends OTP
 *   2. Enter OTP → verifies
 *   3. Set new password → resets + auto-login
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Mail, Lock, Loader2,
  AlertCircle, Check, Eye, EyeOff, KeyRound,
} from 'lucide-react';
import api from '../utils/api';
import AuthShell from '../components/shared/AuthShell';
import { Button, Callout, Field, Input } from '../components/ds';

// ============================================================================
// ForgotPasswordPageV2.jsx — self-service OTP password reset, on ds
// ============================================================================
//
// Route: /forgot-password, outside OrgProvider. Ships directly; legacy kept
// unreferenced. Last of the five logged-out pages.
//
// ── Everything above `return (` is the legacy bytes ─────────────────────────
// Spliced by script and asserted identical by diff: `checkPasswordStrength`,
// the countdown effect, `handleSendOtp`, `handleOtpChange`, `handleOtpPaste`,
// `handleOtpSubmit`, `handleResetPassword` and `getProgress`.
//
// ── The OTP box ids are LOAD-BEARING ────────────────────────────────────────
// `handleOtpChange` advances focus with
// `document.getElementById('reset-otp-' + (index+1))`, backspace on an empty
// box walks back the same way, and a failed verify clears all six and focuses
// `reset-otp-0`. Renaming those ids would not break the build and would not
// break a click — it would only stop the focus hopping, which is the entire
// ergonomics of a six-box code field. They are kept exactly.
//
// Also kept exactly: paste is bound to box 0 ONLY, and is digits-only
// (`/^\d+$/`), padding short pastes to six. Per-key input is separately
// stripped with `.replace(/\D/g, '')`, so a pasted "12 34 56" and a typed
// letter are both handled.
//
// ── `checkPasswordStrength` keeps its Tailwind return values ────────────────
// Same decision as ResetPasswordPageV2: the five checks and the
// passed>=4 / >=3 thresholds are a security judgement, and `strength==='weak'`
// BLOCKS submit. The function is copied exactly — `bg-red-500` and friends
// included — and the class is mapped to a token at render via STRENGTH_TONE.
//
// ── Render helpers are at MODULE scope, deliberately ────────────────────────
// Defined inside the component they would be a new type each render, React
// would remount the inputs, and a remounted input loses focus — which on a
// six-box OTP field would be catastrophic and invisible to the build. This is
// the bug caught in phase 48; it is not repeated here.
//
// ── Layout note ─────────────────────────────────────────────────────────────
// Legacy put the progress bar between the header and the card; the shell has
// no slot there, so it is the first thing inside the card. Small, real, and
// flagged rather than smuggled — as with phase 48.
// ============================================================================

const STEPS = { EMAIL: 'email', OTP: 'otp', PASSWORD: 'password' };

// Password strength checker (same as SignupPage)
const checkPasswordStrength = (password) => {
  const checks = {
    length: password.length >= 10,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  let strength = 'weak';
  let color = 'bg-red-500';
  if (passed >= 4) { strength = 'strong'; color = 'bg-green-500'; }
  else if (passed >= 3) { strength = 'medium'; color = 'bg-yellow-500'; }
  return { checks, strength, color, passed };
};

/** Legacy strength class → ds token. The scoring function is untouched. */
const STRENGTH_TONE = {
  'bg-red-500': 'var(--danger)',
  'bg-yellow-500': 'var(--warn)',
  'bg-green-500': 'var(--brand)',
};
/** Label ink per strength, matching legacy's text-red/yellow/green-400. */
const STRENGTH_INK = { weak: 'var(--danger)', medium: 'var(--warn-ink)', strong: 'var(--brand-ink)' };

const leadIcon = {
  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
  color: 'var(--fg-4)', pointerEvents: 'none',
};
const eyeBtn = {
  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
  display: 'flex', alignItems: 'center', color: 'var(--fg-4)', background: 'none',
};
const stepTitle = { font: "700 20px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 8 };
const stepSub = { font: "450 13px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' };

function BackButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none',
        font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)',
      }}
    >
      <ArrowLeft size={15} /> Back
    </button>
  );
}

/** One of the five rules under the strength meter. */
function Rule({ ok, children }) {
  return (
    <span style={{ font: "450 11.5px/1.5 'Inter', system-ui, sans-serif", color: ok ? 'var(--brand-ink)' : 'var(--fg-4)' }}>
      {ok ? '✓' : '○'} {children}
    </span>
  );
}

export default function ForgotPasswordPageV2() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspace = searchParams.get('workspace');
  const backToLogin = workspace ? `/org/${workspace}/login` : '/find-workspace';

  const [step, setStep] = useState(STEPS.EMAIL);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // ---------- Step 1: Send OTP ----------
  const handleSendOtp = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await api.forgotPassword(email);
      if (result.success) {
        setStep(STEPS.OTP);
        setCountdown(60);
      } else {
        setError(result.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Failed to send reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email]);

  // ---------- Step 2: OTP handlers ----------
  const handleOtpChange = (index, value) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      document.getElementById(`reset-otp-${index + 1}`)?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (/^\d+$/.test(pastedData)) {
      const newOtp = pastedData.split('').concat(Array(6 - pastedData.length).fill(''));
      setOtp(newOtp);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    const otpString = otp.join('');
    if (otpString.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await api.verifyOtpOnly(email, otpString);
      if (result.success) {
        setStep(STEPS.PASSWORD);
      } else {
        setError(result.error || 'Invalid or expired code. Please try again.');
        setOtp(['', '', '', '', '', '']);
        document.getElementById('reset-otp-0')?.focus();
      }
    } catch (err) {
      setError(err.message || 'Invalid or expired code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      document.getElementById('reset-otp-0')?.focus();
    } finally {
      setLoading(false);
    }
  };

  // ---------- Step 3: Reset password ----------
  const passwordStrength = checkPasswordStrength(password);

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (passwordStrength.strength === 'weak') {
      setError('Please choose a stronger password');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await api.resetPassword(email, otp.join(''), password);
      if (result.success) {
        // Auto-login
        if (result.token) {
          localStorage.setItem('rivvra_token', result.token);
        }
        if (result.user) {
          localStorage.setItem('rivvra_user', JSON.stringify(result.user));
        }
        // Redirect
        const redirectTo = workspace ? `/org/${workspace}/home` : '/home';
        navigate(redirectTo, { replace: true });
      } else {
        setError(result.error || 'Failed to reset password');
      }
    } catch (err) {
      // If OTP is invalid/expired, go back to OTP step
      if (err.message?.includes('Invalid') || err.message?.includes('expired')) {
        setError(err.message);
        setOtp(['', '', '', '', '', '']);
        setStep(STEPS.OTP);
      } else {
        setError(err.message || 'Password reset failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------- Progress ----------
  const getProgress = () => {
    const steps = [STEPS.EMAIL, STEPS.OTP, STEPS.PASSWORD];
    return Math.round(((steps.indexOf(step) + 1) / steps.length) * 100);
  };


  return (
    <AuthShell
      icon={<KeyRound size={26} />}
      title="Reset password"
      footer={(
        <Link
          to={backToLogin}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)',
          }}
        >
          <ArrowLeft size={15} /> Back to Login
        </Link>
      )}
    >
      {/* Progress bar — legacy had this above the card; the shell has no slot
          there, so it leads the card instead. */}
      <div style={{ height: 4, borderRadius: 'var(--r-full)', background: 'var(--line-2)', overflow: 'hidden', marginBottom: 22 }}>
        <div style={{
          height: '100%', width: `${getProgress()}%`, background: 'var(--brand)',
          transition: 'width 500ms ease',
        }} />
      </div>

      {error && <div style={{ marginBottom: 22 }}><Callout tone="danger" icon={<AlertCircle size={15} />}>{error}</Callout></div>}

      {/* ========= Step 1: Email ========= */}
      {step === STEPS.EMAIL && (
        <div style={{ display: 'grid', gap: 22 }}>
          <div>
            <h1 style={stepTitle}>Forgot your password?</h1>
            <p style={stepSub}>
              Enter your email and we'll send a 6-digit code to reset your password.
            </p>
          </div>

          <form onSubmit={handleSendOtp} style={{ display: 'grid', gap: 16 }}>
            <Field label="Email address" htmlFor="fp-email">
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={leadIcon} />
                <Input
                  id="fp-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@company.com"
                  disabled={loading}
                  autoFocus
                  style={{ paddingLeft: 36 }}
                />
              </div>
            </Field>

            <Button type="submit" block disabled={loading || !email}
              iconLeft={loading ? <Loader2 size={16} className="animate-spin" /> : undefined}
              iconRight={loading ? undefined : <ArrowRight size={16} />}>
              {loading ? '' : 'Send reset code'}
            </Button>
          </form>
        </div>
      )}

      {/* ========= Step 2: OTP ========= */}
      {step === STEPS.OTP && (
        <div style={{ display: 'grid', gap: 22 }}>
          <BackButton onClick={() => { setStep(STEPS.EMAIL); setError(''); }} />

          <div>
            <h1 style={stepTitle}>Check your email</h1>
            <p style={stepSub}>
              We sent a 6-digit code to{' '}
              <span style={{ color: 'var(--fg)', fontWeight: 500 }}>{email}</span>
            </p>
          </div>

          <form onSubmit={handleOtpSubmit} style={{ display: 'grid', gap: 22 }}>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {otp.map((digit, index) => (
                <input
                  key={index}
                  /* id is load-bearing — focus advance and reset look it up */
                  id={`reset-otp-${index}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value.replace(/\D/g, ''))}
                  onPaste={index === 0 ? handleOtpPaste : undefined}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !digit && index > 0) {
                      document.getElementById(`reset-otp-${index - 1}`)?.focus();
                    }
                  }}
                  disabled={loading}
                  aria-label={`Digit ${index + 1} of 6`}
                  style={{
                    width: 46, height: 54, textAlign: 'center',
                    font: "700 19px/1 'Inter', system-ui, sans-serif",
                    color: 'var(--fg)', background: 'var(--surface-2)',
                    borderRadius: 'var(--r-2)', border: '1px solid var(--line)',
                    outline: 'none', transition: 'border-color 120ms ease',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; }}
                />
              ))}
            </div>

            <Button type="submit" block disabled={loading || otp.join('').length !== 6}
              iconLeft={loading ? <Loader2 size={16} className="animate-spin" /> : undefined}
              iconRight={loading ? undefined : <Check size={16} />}>
              {loading ? '' : 'Verify code'}
            </Button>
          </form>

          <p style={{ font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textAlign: 'center' }}>
            {countdown > 0 ? (
              `Resend code in ${countdown}s`
            ) : (
              <button type="button" onClick={handleSendOtp}
                style={{ background: 'none', color: 'var(--brand-ink)', font: "450 13px/1.5 'Inter', system-ui, sans-serif" }}>
                Resend code
              </button>
            )}
          </p>
        </div>
      )}

      {/* ========= Step 3: New Password ========= */}
      {step === STEPS.PASSWORD && (
        <div style={{ display: 'grid', gap: 22 }}>
          <BackButton onClick={() => { setStep(STEPS.OTP); setError(''); }} />

          <div>
            <h1 style={stepTitle}>Set new password</h1>
            <p style={stepSub}>Create a strong password for your account.</p>
          </div>

          <form onSubmit={handleResetPassword} style={{ display: 'grid', gap: 16 }}>
            <div>
              <Field label="New Password" htmlFor="fp-pw">
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={leadIcon} />
                  <Input
                    id="fp-pw"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a new password"
                    disabled={loading}
                    autoFocus
                    style={{ paddingLeft: 36, paddingRight: 36 }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'} style={eyeBtn}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              {/* Strength indicator — `passwordStrength.color` is the legacy
                  Tailwind class the untouched checker returns. */}
              {password && (
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} style={{
                        height: 4, flex: 1, borderRadius: 'var(--r-full)',
                        background: i <= passwordStrength.passed
                          ? (STRENGTH_TONE[passwordStrength.color] || 'var(--line-2)')
                          : 'var(--line-2)',
                        transition: 'background 140ms ease',
                      }} />
                    ))}
                  </div>
                  <p style={{ font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: STRENGTH_INK[passwordStrength.strength] }}>
                    {passwordStrength.strength === 'weak' && 'Weak password'}
                    {passwordStrength.strength === 'medium' && 'Medium strength'}
                    {passwordStrength.strength === 'strong' && 'Strong password'}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <Rule ok={passwordStrength.checks.length}>At least 10 characters</Rule>
                    <Rule ok={passwordStrength.checks.uppercase}>Uppercase letter</Rule>
                    <Rule ok={passwordStrength.checks.lowercase}>Lowercase letter</Rule>
                    <Rule ok={passwordStrength.checks.number}>Number</Rule>
                    <Rule ok={passwordStrength.checks.special}>Special character</Rule>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Field label="Confirm Password" htmlFor="fp-confirm">
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={leadIcon} />
                  <Input
                    id="fp-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    disabled={loading}
                    invalid={!!confirmPassword && password !== confirmPassword}
                    style={{ paddingLeft: 36, paddingRight: 36 }}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'} style={eyeBtn}>
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
              {confirmPassword && password !== confirmPassword && (
                <p style={{ font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--danger)', marginTop: 4 }}>
                  Passwords do not match
                </p>
              )}
              {confirmPassword && password === confirmPassword && (
                <p style={{ font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--brand-ink)', marginTop: 4 }}>
                  ✓ Passwords match
                </p>
              )}
            </div>

            <Button type="submit" block
              disabled={loading || passwordStrength.strength === 'weak' || password !== confirmPassword || !password}
              iconLeft={loading ? <Loader2 size={16} className="animate-spin" /> : undefined}
              iconRight={loading ? undefined : <ArrowRight size={16} />}>
              {loading ? '' : 'Reset password'}
            </Button>
          </form>
        </div>
      )}
    </AuthShell>
  );
}
