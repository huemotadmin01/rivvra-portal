import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { GOOGLE_CLIENT_ID } from '../../utils/config';
import {
  ShieldCheck, Loader2, Eye, EyeOff, AlertCircle, Mail, Lock
} from 'lucide-react';
import RivvraLogo from '../../components/RivvraLogo';

function AdminLoginPage() {
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
    <div className="min-h-screen bg-dark-950 mesh-gradient grid-pattern flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center mb-4">
            <ShieldCheck className="w-8 h-8 text-amber-400" />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <RivvraLogo className="w-6 h-6" />
            <span className="text-xl font-bold text-white">Rivvra Admin</span>
          </div>
          <p className="text-dark-400 text-sm">Internal admin access only</p>
        </div>

        {/* Login Card */}
        <div className="bg-dark-900/80 border border-dark-800 rounded-2xl p-8 backdrop-blur-sm">
          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Google Sign-In */}
          <div className="mb-6">
            {googleLoading && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                <span className="ml-2 text-dark-400 text-sm">Verifying with Google...</span>
              </div>
            )}
            <div id="admin-google-signin-button" className="w-full flex justify-center" />
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-dark-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-dark-900 px-3 text-dark-500">or sign in with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@rivvra.com"
                  className="input-field pl-12"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Password
              </label>
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-dark-950 font-semibold text-sm hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  Sign in to Admin
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-dark-500 mt-6">
          &copy; {new Date().getFullYear()} Rivvra. Admin access is restricted.
        </p>
      </div>
    </div>
  );
}

export default AdminLoginPage;
