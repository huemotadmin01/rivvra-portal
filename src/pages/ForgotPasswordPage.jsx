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
import RivvraLogo from '../components/BrynsaLogo';
import api from '../utils/api';

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

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspace = searchParams.get('workspace');
  const backToLogin = workspace ? `/org/${workspace}/login` : '/login';

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
    <div className="min-h-screen bg-dark-950 mesh-gradient grid-pattern flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rivvra-500/20 to-emerald-500/20 border border-rivvra-500/30 flex items-center justify-center mb-4">
            <KeyRound className="w-8 h-8 text-rivvra-400" />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <RivvraLogo className="w-6 h-6" />
            <span className="text-xl font-bold text-white">Reset password</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="h-1 bg-dark-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rivvra-500 to-rivvra-400 transition-all duration-500"
              style={{ width: `${getProgress()}%` }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-dark-900/80 border border-dark-800 rounded-2xl p-8 backdrop-blur-sm">
          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* ========= Step 1: Email ========= */}
          {step === STEPS.EMAIL && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Forgot your password?</h1>
                <p className="text-dark-400 text-sm">
                  Enter your email and we'll send a 6-digit code to reset your password.
                </p>
              </div>

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(''); }}
                      placeholder="you@company.com"
                      className="input-field pl-12"
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Send reset code
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ========= Step 2: OTP ========= */}
          {step === STEPS.OTP && (
            <div className="space-y-6">
              <button
                onClick={() => { setStep(STEPS.EMAIL); setError(''); }}
                className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Check your email</h1>
                <p className="text-dark-400 text-sm">
                  We sent a 6-digit code to{' '}
                  <span className="text-white font-medium">{email}</span>
                </p>
              </div>

              <form onSubmit={handleOtpSubmit} className="space-y-6">
                <div className="flex gap-3 justify-center">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
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
                      className="w-12 h-14 text-center text-xl font-bold bg-dark-800 border border-dark-700 rounded-xl text-white focus:border-rivvra-500 focus:ring-1 focus:ring-rivvra-500 outline-none transition-colors"
                      disabled={loading}
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.join('').length !== 6}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Verify code
                      <Check className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-sm text-dark-500 text-center">
                {countdown > 0 ? (
                  `Resend code in ${countdown}s`
                ) : (
                  <button
                    onClick={handleSendOtp}
                    className="text-rivvra-400 hover:text-rivvra-300"
                  >
                    Resend code
                  </button>
                )}
              </p>
            </div>
          )}

          {/* ========= Step 3: New Password ========= */}
          {step === STEPS.PASSWORD && (
            <div className="space-y-6">
              <button
                onClick={() => { setStep(STEPS.OTP); setError(''); }}
                className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Set new password</h1>
                <p className="text-dark-400 text-sm">
                  Create a strong password for your account.
                </p>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-4">
                {/* New Password */}
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a new password"
                      className="input-field pl-12 pr-12"
                      disabled={loading}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  {/* Strength indicator */}
                  {password && (
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i <= passwordStrength.passed ? passwordStrength.color : 'bg-dark-700'
                            }`}
                          />
                        ))}
                      </div>
                      <p className={`text-xs ${
                        passwordStrength.strength === 'weak' ? 'text-red-400' :
                        passwordStrength.strength === 'medium' ? 'text-yellow-400' :
                        'text-green-400'
                      }`}>
                        {passwordStrength.strength === 'weak' && 'Weak password'}
                        {passwordStrength.strength === 'medium' && 'Medium strength'}
                        {passwordStrength.strength === 'strong' && 'Strong password'}
                      </p>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <span className={passwordStrength.checks.length ? 'text-green-400' : 'text-dark-500'}>
                          {passwordStrength.checks.length ? '✓' : '○'} At least 10 characters
                        </span>
                        <span className={passwordStrength.checks.uppercase ? 'text-green-400' : 'text-dark-500'}>
                          {passwordStrength.checks.uppercase ? '✓' : '○'} Uppercase letter
                        </span>
                        <span className={passwordStrength.checks.lowercase ? 'text-green-400' : 'text-dark-500'}>
                          {passwordStrength.checks.lowercase ? '✓' : '○'} Lowercase letter
                        </span>
                        <span className={passwordStrength.checks.number ? 'text-green-400' : 'text-dark-500'}>
                          {passwordStrength.checks.number ? '✓' : '○'} Number
                        </span>
                        <span className={passwordStrength.checks.special ? 'text-green-400' : 'text-dark-500'}>
                          {passwordStrength.checks.special ? '✓' : '○'} Special character
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="input-field pl-12 pr-12"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                  )}
                  {confirmPassword && password === confirmPassword && (
                    <p className="text-xs text-green-400 mt-1">✓ Passwords match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || passwordStrength.strength === 'weak' || password !== confirmPassword || !password}
                  className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Reset password
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <Link
            to={backToLogin}
            className="inline-flex items-center gap-2 text-sm text-dark-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
