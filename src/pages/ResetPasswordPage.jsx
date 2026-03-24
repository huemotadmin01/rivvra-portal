/**
 * ResetPasswordPage — Set or reset password using a token link.
 * Route: /reset-password?token=xxx (public, no auth required)
 *
 * Admin sends reset/set link from Settings > Users & Teams.
 * User clicks link in email → lands here → enters new password → auto-login.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle, ShieldCheck } from 'lucide-react';
import api from '../utils/api';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { loginWithToken } = useAuth();

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

  // Loading state
  if (validating) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-rivvra-500 animate-spin mx-auto mb-3" />
          <p className="text-dark-400">Validating your link...</p>
        </div>
      </div>
    );
  }

  // Token error state
  if (tokenError) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Invalid Link</h1>
          <p className="text-dark-400 mb-6">{tokenError}</p>
          <button
            onClick={() => navigate('/find-workspace')}
            className="px-6 py-2.5 bg-rivvra-500 text-white rounded-xl hover:bg-rivvra-600 transition-colors font-medium"
          >
            Find your workspace
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">
            {tokenInfo?.type === 'set' ? 'Password Set!' : 'Password Reset!'}
          </h1>
          <p className="text-dark-400">Redirecting you to Rivvra...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-rivvra-500/10 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7 text-rivvra-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            {tokenInfo?.type === 'set' ? 'Set Your Password' : 'Reset Your Password'}
          </h1>
          {tokenInfo?.email && (
            <p className="text-dark-400 text-sm">for {tokenInfo.email}</p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* New Password */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">New Password</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Lock className="w-5 h-5 text-dark-500" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 10 characters"
                className="w-full pl-10 pr-10 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {/* Strength meter */}
            {password && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i <= strength.level ? strength.color : 'bg-dark-700'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-dark-400">{strength.label}</p>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Confirm Password</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Lock className="w-5 h-5 text-dark-500" />
              </div>
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full pl-10 pr-10 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
              >
                {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || !password || !confirmPassword || password !== confirmPassword}
            className="w-full py-3 bg-rivvra-500 text-white rounded-xl font-semibold hover:bg-rivvra-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Setting password...
              </>
            ) : (
              tokenInfo?.type === 'set' ? 'Set Password' : 'Reset Password'
            )}
          </button>
        </form>

        <p className="text-center text-dark-500 text-xs mt-4">
          Need help? Contact your organization administrator.
        </p>
      </div>
    </div>
  );
}
