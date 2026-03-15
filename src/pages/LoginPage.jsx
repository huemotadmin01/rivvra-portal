import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ArrowRight, Loader2, Eye, EyeOff, AlertCircle, Mail, Lock
} from 'lucide-react';
import RivvraLogo from '../components/RivvraLogo';
import { GOOGLE_CLIENT_ID } from '../utils/config';

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithPassword, loginWithGoogle, isAuthenticated } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const from = location.state?.from?.pathname || '/home';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  // Handle Google credential response
  const handleGoogleCredential = useCallback(async (credential) => {
    setGoogleLoading(true);
    setError('');

    try {
      const result = await loginWithGoogle({ credential, isLogin: true });
      if (result.success) {
        navigate(from, { replace: true });
      } else {
        if (result.error === 'User not found') {
          setError('No account found with this Google account. Please contact your admin.');
        } else {
          setError(result.error || 'Google sign in failed');
        }
      }
    } catch (err) {
      setError(err.message || 'Google sign in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [loginWithGoogle, navigate, from]);

  // Initialize Google Sign-In
  useEffect(() => {
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

        // Render the Google button
        window.google.accounts.id.renderButton(
          document.getElementById('google-signin-button'),
          {
            theme: 'filled_black',
            size: 'large',
            width: 400,
            text: 'signin_with',
          }
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
        navigate(from, { replace: true });
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
    <div className="min-h-screen bg-dark-950 mesh-gradient grid-pattern flex">
      {/* Left Panel - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 py-12">
        <div className="max-w-md mx-auto w-full">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 mb-12">
            <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center">
              <RivvraLogo className="w-7 h-7" />
            </div>
            <span className="text-xl font-bold text-white">Rivvra</span>
          </Link>

          {/* Tab Header */}
          <div className="flex mb-8 p-1 bg-dark-800/50 rounded-lg border border-dark-700">
            <div
              className="flex-1 py-2.5 text-center rounded-md text-sm font-medium bg-dark-700 text-white"
            >
              Log In
            </div>
          </div>

          <div className="animate-fade-in">
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Welcome back
                </h1>
                <p className="text-dark-400">
                  Log in to your staffing agency command center.
                </p>
              </div>

              {/* Google Sign-In Button */}
              <div className="relative">
                {googleLoading && (
                  <div className="absolute inset-0 bg-dark-800 rounded-xl flex items-center justify-center z-10">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  </div>
                )}
                <div id="google-signin-button" className="w-full flex justify-center"></div>
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

              {/* Error Display */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Login Form */}
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
                      placeholder="you@company.com"
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

                {/* Forgot Password */}
                <div className="flex justify-end">
                  <Link 
                    to="/forgot-password" 
                    className="text-sm text-rivvra-400 hover:text-rivvra-300"
                  >
                    Forgot password?
                  </Link>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Log in
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              <div className="text-center space-y-2">
                <p className="text-dark-500 text-sm">
                  Forgot your workspace URL?{' '}
                  <Link to="/find-workspace" className="text-rivvra-400 hover:underline">
                    Find it here
                  </Link>
                </p>
              </div>

              <p className="text-center text-xs text-dark-500 pt-4">
                &copy; {new Date().getFullYear()} Rivvra. All rights reserved.{' '}
                <Link to="/privacy" className="hover:text-dark-300">Privacy</Link> and{' '}
                <a href="#" className="hover:text-dark-300">Terms</a>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Decorative */}
      <div className="hidden lg:flex flex-1 bg-dark-900/50 border-l border-dark-800/50 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-rivvra-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-rivvra-400/5 rounded-full blur-2xl" />
        </div>

        <div className="relative max-w-lg space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-4">
              Your staffing agency, one platform.
            </h2>
            <p className="text-dark-400">
              Outreach, timesheets, CRM, and recruiting — all in one place.
            </p>
          </div>

          {/* Platform Preview */}
          <div className="card p-6 space-y-4">
            <div className="text-sm font-medium text-rivvra-400 mb-1">Your apps</div>
            <div className="space-y-2.5">
              {[
                { name: 'Outreach', desc: 'Sequences, leads & email automation', status: 'Live' },
                { name: 'Timesheet', desc: 'Hours, approvals & payroll', status: 'Live' },
                { name: 'CRM', desc: 'Deals, pipeline & clients', status: 'Soon' },
                { name: 'ATS', desc: 'Candidates, interviews & placements', status: 'Soon' },
              ].map((app, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-dark-800/50">
                  <div className={`w-2 h-2 rounded-full ${app.status === 'Live' ? 'bg-rivvra-400' : 'bg-dark-600'}`} />
                  <div className="flex-1">
                    <div className="text-sm text-white">{app.name}</div>
                    <div className="text-xs text-dark-500">{app.desc}</div>
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    app.status === 'Live' ? 'bg-rivvra-500/10 text-rivvra-400' : 'bg-dark-700 text-dark-500'
                  }`}>{app.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;