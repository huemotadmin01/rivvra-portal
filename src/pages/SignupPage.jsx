import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ArrowRight, ArrowLeft, Mail, Check,
  Building2, Briefcase, Users, Target, Loader2,
  Eye, EyeOff, AlertCircle, Info
} from 'lucide-react';
import RivvraLogo from '../components/BrynsaLogo';
import api from '../utils/api';
import { GOOGLE_CLIENT_ID } from '../utils/config';

// Step configurations
const STEPS = {
  AUTH: 'auth',
  OTP: 'otp',
  PASSWORD: 'password',
  COMPANY: 'company',
  ROLE: 'role',
  TEAM_SIZE: 'team_size',
  USE_CASE: 'use_case',
};

const ROLES = [
  { id: 'founder', label: 'Founder / CEO', icon: '👑' },
  { id: 'sales', label: 'Sales / BD', icon: '💼' },
  { id: 'marketing', label: 'Marketing', icon: '📢' },
  { id: 'recruiter', label: 'Recruiter / HR', icon: '🎯' },
  { id: 'consultant', label: 'Consultant', icon: '💡' },
  { id: 'freelancer', label: 'Freelancer', icon: '🚀' },
  { id: 'other', label: 'Other', icon: '✨' },
];

const TEAM_SIZES = [
  { id: 'solo', label: 'Just me', description: 'Solo entrepreneur' },
  { id: '2-10', label: '2-10', description: 'Small team' },
  { id: '11-50', label: '11-50', description: 'Growing company' },
  { id: '51-200', label: '51-200', description: 'Mid-size business' },
  { id: '200+', label: '200+', description: 'Enterprise' },
];

const USE_CASES = [
  { id: 'lead_gen', label: 'Contact Generation', description: 'Find and reach potential customers', icon: Target },
  { id: 'recruiting', label: 'Recruiting', description: 'Source and hire talent', icon: Users },
  { id: 'sales', label: 'Sales Outreach', description: 'Book more meetings', icon: Briefcase },
  { id: 'marketing', label: 'Marketing Research', description: 'Analyze prospects and markets', icon: Building2 },
];

// Blocked personal email domains
const BLOCKED_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.in',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'aol.com', 'mail.com', 'zoho.com', 'yandex.com',
  'tutanota.com', 'fastmail.com', 'gmx.com', 'gmx.net',
  'rediffmail.com', 'inbox.com',
];

const isWorkEmail = (email) => {
  if (!email || !email.includes('@')) return false;
  const domain = email.toLowerCase().trim().split('@')[1];
  return !BLOCKED_EMAIL_DOMAINS.includes(domain);
};

// Password strength checker
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
  
  if (passed >= 4) {
    strength = 'strong';
    color = 'bg-green-500';
  } else if (passed >= 3) {
    strength = 'medium';
    color = 'bg-yellow-500';
  }
  
  return { checks, strength, color, passed };
};

function SignupPage() {
  const navigate = useNavigate();
  const { signupWithPassword, loginWithGoogle, isAuthenticated, token } = useAuth();

  const [currentStep, setCurrentStep] = useState(STEPS.AUTH);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  // Password setup data
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Invite token (from InviteAcceptPage redirect)
  const [inviteToken, setInviteToken] = useState('');
  const [inviteData, setInviteData] = useState(null);

  // Questionnaire data
  const [formData, setFormData] = useState({
    companyName: '',
    role: '',
    senderTitle: '',
    teamSize: '',
    useCase: '',
  });

  // Company autocomplete
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingCompanies, setSearchingCompanies] = useState(false);

  // Domain-based workspace detection
  const [domainMatch, setDomainMatch] = useState(null);

  // Check if email domain has existing workspace (non-blocking)
  const checkDomainForExistingOrg = useCallback((emailToCheck) => {
    if (!emailToCheck || inviteToken) return; // Skip for invite flows
    api.checkDomain(emailToCheck).then(res => {
      if (res.success && res.match) {
        setDomainMatch({ orgName: res.orgName });
      }
    }).catch(() => {}); // Fail silently
  }, [inviteToken]);

  // Check for invite token in URL and validate it
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash?.split('?')[1] || '');
    const token = params.get('inviteToken');
    if (token) {
      setInviteToken(token);
      // Validate invite to get email and company name
      api.validateInviteToken(token).then(res => {
        if (res.success) {
          setInviteData(res.invite);
          setEmail(res.invite.email);
        }
      }).catch(() => {});
    }
  }, []);

  // Track company name from invite context (either inviteData or user's existing company)
  const [inviteCompanyName, setInviteCompanyName] = useState('');

  // Pre-fill company name from invite data when available
  useEffect(() => {
    if (inviteData?.companyName && !formData.companyName) {
      setInviteCompanyName(inviteData.companyName);
      setFormData(prev => ({ ...prev, companyName: inviteData.companyName }));
    }
  }, [inviteData]);

  // When user is authenticated (e.g. Google invite), check if they have a companyId and fetch company name
  useEffect(() => {
    if (isAuthenticated && !inviteCompanyName) {
      const storedUser = JSON.parse(localStorage.getItem('rivvra_user') || '{}');
      // If user already has a company name from their profile/company
      if (storedUser.companyName) {
        setInviteCompanyName(storedUser.companyName);
        setFormData(prev => ({ ...prev, companyName: prev.companyName || storedUser.companyName }));
      } else if (storedUser.companyId && storedUser.source?.includes('invite')) {
        // User was created via invite (Google auth) — fetch their company name from profile
        api.getProfile().then(res => {
          if (res.success && res.user?.companyName) {
            setInviteCompanyName(res.user.companyName);
            setFormData(prev => ({ ...prev, companyName: prev.companyName || res.user.companyName }));
          }
        }).catch(() => {});
      }
    }
  }, [isAuthenticated]);

  // Only redirect if authenticated AND onboarding is already completed
  useEffect(() => {
    if (isAuthenticated && currentStep === STEPS.AUTH) {
      const user = JSON.parse(localStorage.getItem('rivvra_user') || '{}');
      if (user.onboarding?.completed) {
        navigate('/home');
      } else {
        setCurrentStep(STEPS.COMPANY);
        checkDomainForExistingOrg(user.email || email);
      }
    }
  }, [isAuthenticated]);

  // OTP countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Handle email submission
  const handleEmailSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    // Skip work email check if user is coming from an invite
    if (!inviteToken && !isWorkEmail(email)) {
      setError('Please use your work email (e.g. you@company.com). Personal emails like Gmail, Outlook, Yahoo are not allowed.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.sendOtp(email, true, inviteToken || undefined); // pass invite token if present
      if (response.success) {
        setCurrentStep(STEPS.OTP);
        setCountdown(60);
      } else {
        setError(response.error || 'Failed to send OTP');
      }
    } catch (err) {
      // Check if user already exists
      if (err.message === 'Account already exists') {
        setError('An account with this email already exists. Please log in instead.');
        // Optionally redirect after a delay
        setTimeout(() => navigate('/login'), 3000);
      } else {
        setError(err.message || 'Failed to send OTP. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP input
  const handleOtpChange = (index, value) => {
    if (value.length > 1) return;
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  // Handle OTP paste
  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (/^\d+$/.test(pastedData)) {
      const newOtp = pastedData.split('').concat(Array(6 - pastedData.length).fill(''));
      setOtp(newOtp);
    }
  };

  // Handle OTP verification - just verify, don't login yet
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
      // Verify OTP only (don't create user yet)
      const response = await api.verifyOtpOnly(email, otpString);
      if (response.success) {
        // Move to password setup
        setCurrentStep(STEPS.PASSWORD);
      } else {
        setError(response.error || 'Invalid OTP');
        setOtp(['', '', '', '', '', '']);
      }
    } catch (err) {
      setError(err.message || 'Verification failed');
      setOtp(['', '', '', '', '', '']);
    } finally {
      setLoading(false);
    }
  };

  // Handle password setup
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    
    // Validate
    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }
    
    const strengthResult = checkPasswordStrength(password);
    if (strengthResult.strength === 'weak') {
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
      // Complete signup with password (pass inviteToken if from invite flow)
      const result = await signupWithPassword(email, otp.join(''), fullName.trim(), password, inviteToken || undefined);

      if (result.success) {
        setCurrentStep(STEPS.COMPANY);
        checkDomainForExistingOrg(email);
      } else {
        setError(result.error || 'Failed to create account');
      }
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // Handle Google credential response
  const handleGoogleCredential = useCallback(async (credential) => {
    setGoogleLoading(true);
    setError('');

    try {
      const result = await loginWithGoogle({ credential, isSignup: true });
      if (result.success) {
        // Check if user needs onboarding
        const user = result.user;
        if (user.onboarding?.completed) {
          navigate('/home');
        } else {
          setCurrentStep(STEPS.COMPANY);
          checkDomainForExistingOrg(user.email || email);
        }
      } else {
        setError(result.error || 'Google sign up failed');
      }
    } catch (err) {
      setError(err.message || 'Google sign up failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [loginWithGoogle, navigate]);

  // Initialize Google Sign-In
  useEffect(() => {
    if (currentStep !== STEPS.AUTH) return;

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
        const buttonElement = document.getElementById('google-signup-button');
        if (buttonElement) {
          window.google.accounts.id.renderButton(
            buttonElement,
            {
              theme: 'filled_black',
              size: 'large',
              width: 400,
              text: 'signup_with',
            }
          );
        }
      }
    };

    loadGoogleScript();
  }, [currentStep, handleGoogleCredential]);

  // Handle company name change with autocomplete
  const handleCompanyNameChange = async (value) => {
    setFormData({ ...formData, companyName: value });
    
    if (value.length < 2) {
      setCompanySuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearchingCompanies(true);
    try {
      const response = await api.searchCompanies(value);
      if (response.success && response.companies.length > 0) {
        setCompanySuggestions(response.companies);
        setShowSuggestions(true);
      } else {
        setCompanySuggestions([]);
        setShowSuggestions(false);
      }
    } catch (err) {
      console.error('Company search error:', err);
      setCompanySuggestions([]);
    } finally {
      setSearchingCompanies(false);
    }
  };

  // Select company from suggestions
  const selectCompany = (company) => {
    setFormData({ ...formData, companyName: company.name });
    setShowSuggestions(false);
    setCompanySuggestions([]);
  };

  // Handle questionnaire navigation
  const handleQuestionnaireNext = () => {
    const stepOrder = [STEPS.COMPANY, STEPS.ROLE, STEPS.TEAM_SIZE, STEPS.USE_CASE];
    const currentIndex = stepOrder.indexOf(currentStep);
    
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    } else {
      handleComplete();
    }
  };

  const handleQuestionnaireBack = () => {
    const stepOrder = [STEPS.COMPANY, STEPS.ROLE, STEPS.TEAM_SIZE, STEPS.USE_CASE];
    const currentIndex = stepOrder.indexOf(currentStep);
    
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const data = await api.saveOnboarding(formData);
      console.log('Onboarding saved:', data);

      // If backend returned a new token (with org context), update auth
      if (data.token) {
        localStorage.setItem('rivvra_token', data.token);
        if (data.user) {
          localStorage.setItem('rivvra_user', JSON.stringify(data.user));
        }
      }

      navigate('/home');
    } catch (err) {
      console.error('Failed to save onboarding data:', err);
      navigate('/home');
    }
  };

  // Calculate progress
  const getProgress = () => {
    const steps = [STEPS.AUTH, STEPS.OTP, STEPS.PASSWORD, STEPS.COMPANY, STEPS.ROLE, STEPS.TEAM_SIZE, STEPS.USE_CASE];
    const currentIndex = steps.indexOf(currentStep);
    return Math.round(((currentIndex + 1) / steps.length) * 100);
  };

  const passwordStrength = checkPasswordStrength(password);

  return (
    <div className="min-h-screen flex bg-dark-950">
      {/* Left Panel - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 lg:px-16 py-12">
        <div className="max-w-md mx-auto w-full">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center">
              <RivvraLogo className="w-7 h-7" />
            </div>
            <span className="text-xl font-bold text-white">Rivvra</span>
          </Link>

          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-dark-400">Create account</span>
              <span className="text-rivvra-400">{getProgress()}%</span>
            </div>
            <div className="h-1 bg-dark-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-rivvra-500 to-rivvra-400 transition-all duration-500"
                style={{ width: `${getProgress()}%` }}
              />
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1: Email */}
          {currentStep === STEPS.AUTH && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  {inviteToken ? `Join ${inviteData?.companyName || 'Team'}` : 'Create your account'}
                </h1>
                <p className="text-dark-400">
                  {inviteToken
                    ? 'Verify your email to complete signup.'
                    : 'Set up your staffing agency workspace in minutes.'}
                </p>
              </div>

              {/* Google Sign-Up Button — hide for invite flow (they already chose email path) */}
              {!inviteToken && (
                <>
                  <div className="relative">
                    {googleLoading && (
                      <div className="absolute inset-0 bg-dark-800 rounded-xl flex items-center justify-center z-10">
                        <Loader2 className="w-5 h-5 animate-spin text-white" />
                      </div>
                    )}
                    <div id="google-signup-button" className="w-full flex justify-center"></div>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-dark-800"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-dark-950 text-dark-500">Or</span>
                    </div>
                  </div>
                </>
              )}

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    {inviteToken ? 'Email' : 'Work Email'} <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(''); }}
                      placeholder="you@company.com"
                      className={`input-field pl-12 ${inviteToken ? 'opacity-60 cursor-not-allowed' : ''}`}
                      disabled={loading || !!inviteToken}
                    />
                  </div>
                  {!inviteToken && (
                    <p className="text-xs text-dark-500 mt-1.5">Use your company email. Personal emails (Gmail, Outlook, Yahoo) are not allowed.</p>
                  )}
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
                      Continue with Email
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-sm text-dark-500 text-center">
                Already have an account?{' '}
                <Link to="/find-workspace" className="text-rivvra-400 hover:text-rivvra-300">
                  Find your workspace
                </Link>
              </p>
            </div>
          )}

          {/* Step 2: OTP Verification */}
          {currentStep === STEPS.OTP && (
            <div className="space-y-6">
              <button
                onClick={() => setCurrentStep(STEPS.AUTH)}
                className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Check your email
                </h1>
                <p className="text-dark-400">
                  We sent a verification code to{' '}
                  <span className="text-white">{email}</span>
                </p>
              </div>

              <form onSubmit={handleOtpSubmit} className="space-y-6">
                <div className="flex gap-3 justify-center">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      id={`otp-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value.replace(/\D/g, ''))}
                      onPaste={index === 0 ? handleOtpPaste : undefined}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !digit && index > 0) {
                          document.getElementById(`otp-${index - 1}`)?.focus();
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
                      Verify email
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
                    onClick={handleEmailSubmit}
                    className="text-rivvra-400 hover:text-rivvra-300"
                  >
                    Resend code
                  </button>
                )}
              </p>
            </div>
          )}

          {/* Step 3: Password Setup */}
          {currentStep === STEPS.PASSWORD && (
            <div className="space-y-6">
              <button
                onClick={() => setCurrentStep(STEPS.OTP)}
                className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Set up your account
                </h1>
                <p className="text-dark-400">
                  Create a secure password for your account.
                </p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="input-field"
                    disabled={loading}
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a password"
                      className="input-field pr-12"
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
                  
                  {/* Password Strength Indicator */}
                  {password && (
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i <= passwordStrength.passed 
                                ? passwordStrength.color 
                                : 'bg-dark-700'
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
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="input-field pr-12"
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
                  disabled={loading || !fullName || passwordStrength.strength === 'weak' || password !== confirmPassword}
                  className="btn-primary w-full flex items-center justify-center gap-2 mt-6"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Step 4: Company Name + Title (both required) */}
          {currentStep === STEPS.COMPANY && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Tell us about your work
                </h1>
                <p className="text-dark-400">
                  This helps us set up your workspace.
                </p>
              </div>

              {/* Domain match warning */}
              {domainMatch && !inviteToken && !inviteCompanyName && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-white font-medium">
                        Your team at {domainMatch.orgName} is already on Rivvra
                      </p>
                      <p className="text-xs text-dark-400 mt-1">
                        Ask your admin to send you an invite instead of creating a new workspace.
                        If you need a separate workspace, continue below.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Company Name — locked if user joined via invite */}
              <div className="relative">
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Company Name <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                  {inviteToken || inviteCompanyName ? (
                    <input
                      type="text"
                      value={formData.companyName || inviteCompanyName}
                      disabled
                      className="input-field pl-12 opacity-60 cursor-not-allowed"
                    />
                  ) : (
                    <input
                      type="text"
                      value={formData.companyName}
                      onChange={(e) => handleCompanyNameChange(e.target.value)}
                      onFocus={() => companySuggestions.length > 0 && setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Acme Inc."
                      className="input-field pl-12"
                      autoComplete="off"
                    />
                  )}
                  {searchingCompanies && (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 animate-spin" />
                  )}
                </div>

                {/* Company Suggestions Dropdown */}
                {!inviteToken && !inviteCompanyName && showSuggestions && companySuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-dark-800 border border-dark-700 rounded-xl shadow-xl overflow-hidden">
                    {companySuggestions.map((company) => (
                      <button
                        key={company._id}
                        type="button"
                        onClick={() => selectCompany(company)}
                        className="w-full px-4 py-3 text-left hover:bg-dark-700 transition-colors flex items-center gap-3"
                      >
                        {company.logo ? (
                          <img src={company.logo} alt="" className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-dark-600 flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-dark-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium truncate">{company.name}</div>
                          {(company.industry || company.domain) && (
                            <div className="text-sm text-dark-400 truncate">
                              {company.industry || company.domain}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Title / Designation (required) */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Your Title / Designation <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                  <input
                    type="text"
                    value={formData.senderTitle}
                    onChange={(e) => setFormData({ ...formData, senderTitle: e.target.value })}
                    placeholder="e.g. CEO & Co-Founder"
                    className="input-field pl-12"
                  />
                </div>
                <p className="text-xs text-dark-500 mt-1">Used in email templates as {'{{senderTitle}}'}</p>
              </div>

              <button
                onClick={handleQuestionnaireNext}
                disabled={!formData.companyName.trim() || !formData.senderTitle.trim()}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Step 5: Role */}
          {currentStep === STEPS.ROLE && (
            <div className="space-y-6">
              <button
                onClick={handleQuestionnaireBack}
                className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  What's your role?
                </h1>
                <p className="text-dark-400">
                  We'll customize Rivvra for your workflow.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {ROLES.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setFormData({ ...formData, role: role.id })}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      formData.role === role.id
                        ? 'border-rivvra-500 bg-rivvra-500/10'
                        : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                    }`}
                  >
                    <span className="text-2xl mb-2 block">{role.icon}</span>
                    <span className="font-medium text-white">{role.label}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={handleQuestionnaireNext}
                disabled={!formData.role}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Step 6: Team Size */}
          {currentStep === STEPS.TEAM_SIZE && (
            <div className="space-y-6">
              <button
                onClick={handleQuestionnaireBack}
                className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  How big is your team?
                </h1>
                <p className="text-dark-400">
                  We'll recommend the right plan for you.
                </p>
              </div>

              <div className="space-y-3">
                {TEAM_SIZES.map((size) => (
                  <button
                    key={size.id}
                    onClick={() => setFormData({ ...formData, teamSize: size.id })}
                    className={`w-full p-4 rounded-xl border text-left transition-all flex items-center justify-between ${
                      formData.teamSize === size.id
                        ? 'border-rivvra-500 bg-rivvra-500/10'
                        : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                    }`}
                  >
                    <div>
                      <span className="font-medium text-white block">{size.label}</span>
                      <span className="text-sm text-dark-400">{size.description}</span>
                    </div>
                    {formData.teamSize === size.id && (
                      <Check className="w-5 h-5 text-rivvra-400" />
                    )}
                  </button>
                ))}
              </div>

              <button
                onClick={handleQuestionnaireNext}
                disabled={!formData.teamSize}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Step 7: Use Case */}
          {currentStep === STEPS.USE_CASE && (
            <div className="space-y-6">
              <button
                onClick={handleQuestionnaireBack}
                className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  What will you use Rivvra for?
                </h1>
                <p className="text-dark-400">
                  We'll set up your workspace accordingly.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {USE_CASES.map((useCase) => (
                  <button
                    key={useCase.id}
                    onClick={() => setFormData({ ...formData, useCase: useCase.id })}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      formData.useCase === useCase.id
                        ? 'border-rivvra-500 bg-rivvra-500/10'
                        : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                    }`}
                  >
                    <useCase.icon className={`w-6 h-6 mb-3 ${
                      formData.useCase === useCase.id ? 'text-rivvra-400' : 'text-dark-500'
                    }`} />
                    <span className="font-medium text-white block">{useCase.label}</span>
                    <span className="text-sm text-dark-400">{useCase.description}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={handleComplete}
                disabled={!formData.useCase || loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Get started
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Decorative */}
      <div className="hidden lg:flex flex-1 bg-dark-900/50 border-l border-dark-800/50 items-center justify-center p-12 relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-rivvra-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-rivvra-400/5 rounded-full blur-2xl" />
        </div>

        {/* Content */}
        <div className="relative max-w-lg text-center space-y-8">
          <div>
            <h2 className="text-2xl font-bold text-white mb-3">One platform, every app you need</h2>
            <p className="text-dark-400">Outreach, timesheets, CRM, and recruiting — built for staffing agencies.</p>
          </div>

          {/* App Preview Cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: 'Outreach', desc: 'Email sequences & leads', color: 'rivvra', live: true },
              { name: 'Timesheet', desc: 'Hours, payroll & approvals', color: 'blue', live: true },
              { name: 'CRM', desc: 'Deals & pipeline', color: 'purple', live: false },
              { name: 'ATS', desc: 'Recruiting & placements', color: 'orange', live: false },
            ].map((app, i) => (
              <div key={i} className={`card p-4 text-left ${!app.live ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-white">{app.name}</span>
                  {!app.live && <span className="text-[10px] text-dark-500">Soon</span>}
                </div>
                <p className="text-xs text-dark-400">{app.desc}</p>
              </div>
            ))}
          </div>

          {/* Value Props */}
          <div className="space-y-2">
            {['14-day free trial, all apps included', 'Per-seat pricing — pay for what you use', 'Invite your whole team in seconds'].map((feature, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-rivvra-400 flex-shrink-0" />
                <span className="text-dark-300">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SignupPage;