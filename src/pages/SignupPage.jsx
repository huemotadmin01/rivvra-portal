import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ArrowRight, ArrowLeft, Mail, Check,
  Building2, Briefcase, Users, Target, Loader2,
  Eye, EyeOff, AlertCircle, Info
} from 'lucide-react';
import RivvraLogo from '../components/RivvraLogo';
import api from '../utils/api';
import { GOOGLE_CLIENT_ID } from '../utils/config';

// Step configurations
const STEPS = {
  AUTH: 'auth',
  OTP: 'otp',
  PASSWORD: 'password',
  COMPANY: 'company',
  BUSINESS_TYPE: 'business_type',
  TEAM_SIZE: 'team_size',
  GOALS: 'goals',
  WORKSPACE_PREFS: 'workspace_prefs',
};

// What kind of organization — drives copy + sensible app defaults.
const BUSINESS_TYPES = [
  { id: 'staffing_agency', label: 'Staffing / Recruiting agency', icon: '🧑‍💼' },
  { id: 'internal_hr', label: 'Internal HR / People team', icon: '🏢' },
  { id: 'rpo', label: 'RPO / Managed services', icon: '⚙️' },
  { id: 'consultancy', label: 'Consultancy', icon: '💡' },
  { id: 'other', label: 'Something else', icon: '✨' },
];

const TEAM_SIZES = [
  { id: 'solo', label: 'Just me', description: 'Solo / founder' },
  { id: '2-5', label: '2–5', description: 'Small team' },
  { id: '6-25', label: '6–25', description: 'Growing team' },
  { id: '26-100', label: '26–100', description: 'Established' },
  { id: '100+', label: '100+', description: 'Large org' },
];

// Primary goals (multi-select) — each maps to apps the backend enables
// (mirror of GOAL_APPS in the API). `apps` is shown to the user so app
// enablement is a visible choice, not a surprise.
const GOAL_OPTIONS = [
  { id: 'recruit', label: 'Fill roles / recruit', icon: '🎯', apps: 'ATS · Contacts' },
  { id: 'clients', label: 'Manage clients & deals', icon: '🤝', apps: 'CRM · Contacts' },
  { id: 'payroll', label: 'Run payroll & HR', icon: '💸', apps: 'Payroll · Employees · Timesheets' },
  { id: 'outreach', label: 'Outbound outreach', icon: '📣', apps: 'Outreach · Contacts' },
  { id: 'invoicing', label: 'Invoicing & payments', icon: '🧾', apps: 'Invoicing' },
];

const HEARD_FROM_OPTIONS = [
  { id: 'google', label: 'Google search' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'referral', label: 'Referral' },
  { id: 'twitter', label: 'X / Twitter' },
  { id: 'other', label: 'Other' },
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
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Invite token (from InviteAcceptPage redirect)
  const [inviteToken, setInviteToken] = useState('');
  const [inviteData, setInviteData] = useState(null);

  // Questionnaire data
  const [formData, setFormData] = useState({
    companyName: '',
    senderTitle: '',
    country: '',          // ISO code: 'IN' | 'US' | 'CA' — sets the default company's country/currency
    businessType: '',     // staffing_agency | internal_hr | rpo | consultancy | other
    teamSize: '',
    goals: [],            // multi-select; drives which apps get enabled
    heardFrom: '',        // attribution
    seedSampleData: false, // opt-in: seed removable example data (default = clean)
  });

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
  // Google-auth invitees have no inviteToken in the URL — detect them by source.
  const [joinedViaInvite, setJoinedViaInvite] = useState(false);

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
        setJoinedViaInvite(true);
        api.getProfile().then(res => {
          if (res.success && res.user?.companyName) {
            setInviteCompanyName(res.user.companyName);
            setFormData(prev => ({ ...prev, companyName: prev.companyName || res.user.companyName }));
          }
        }).catch(() => {});
      }
    }
  }, [isAuthenticated]);

  // If authenticated, skip auth steps and go straight to company/org creation
  useEffect(() => {
    if (isAuthenticated && currentStep === STEPS.AUTH) {
      const user = JSON.parse(localStorage.getItem('rivvra_user') || '{}');
      setCurrentStep(STEPS.COMPANY);
      checkDomainForExistingOrg(user.email || email);
    }
  }, [isAuthenticated]);

  // OTP countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Whether new-workspace registration is open (super-admin toggle). Invite
  // signups join an existing workspace and are always allowed. null = loading.
  const [registrationOpen, setRegistrationOpen] = useState(null);
  useEffect(() => {
    if (inviteToken) { setRegistrationOpen(true); return; }
    api.getRegistrationStatus()
      .then(r => setRegistrationOpen(r?.open !== false))
      .catch(() => setRegistrationOpen(true)); // fail open
  }, [inviteToken]);

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
        setTimeout(() => navigate('/find-workspace'), 3000);
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

    if (!agreeTerms) {
      setError('Please accept the Terms of Service and Privacy Policy to continue');
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
        // Skip auth steps, go to company/org creation
        const user = result.user;
        setCurrentStep(STEPS.COMPANY);
        checkDomainForExistingOrg(user.email || email);
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

  // Company autocomplete REMOVED: it surfaced other customers' company names
  // from the shared directory during signup — confusing, and matching an
  // existing name grants nothing (the domain-match banner already covers
  // "your team is here"). New workspaces just type their own name.

  // Invitees join an EXISTING workspace: the founder questionnaire (business
  // type, team size, goals, sample data) doesn't apply to them — they get a
  // single confirm-your-details step instead.
  const isInviteFlow = !!(inviteToken || inviteData || joinedViaInvite);

  // Handle questionnaire navigation
  const questionnaireOrder = isInviteFlow
    ? [STEPS.COMPANY]
    : [STEPS.COMPANY, STEPS.BUSINESS_TYPE, STEPS.TEAM_SIZE, STEPS.GOALS, STEPS.WORKSPACE_PREFS];

  const handleQuestionnaireNext = () => {
    const currentIndex = questionnaireOrder.indexOf(currentStep);
    if (currentIndex < questionnaireOrder.length - 1) {
      setCurrentStep(questionnaireOrder[currentIndex + 1]);
    } else {
      handleComplete();
    }
  };

  const handleQuestionnaireBack = () => {
    const currentIndex = questionnaireOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(questionnaireOrder[currentIndex - 1]);
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

      // Route into the freshly-created workspace. (Plain "/home" isn't a real
      // route — app pages live under /org/:slug — so it fell through to the
      // marketing landing page.)
      let slug = data.user?.defaultOrgSlug || data.org?.slug;
      if (!slug) {
        try { slug = JSON.parse(localStorage.getItem('rivvra_user') || '{}').defaultOrgSlug; } catch { /* ignore */ }
      }
      navigate(slug ? `/org/${slug}/home` : '/find-workspace');
    } catch (err) {
      // Workspace creation failed server-side (ORG_CREATION_FAILED) or the
      // request itself died. Silently bouncing to /find-workspace stranded the
      // user with no workspace and no explanation — surface it and let them
      // press Finish again (the API adopts a half-created org on retry).
      console.error('Failed to save onboarding data:', err);
      setError(err?.message || 'We could not create your workspace. Please try again.');
      setLoading(false);
    }
  };

  // Calculate progress against the steps THIS user will actually see.
  const getProgress = () => {
    const steps = [STEPS.AUTH, STEPS.OTP, STEPS.PASSWORD, ...questionnaireOrder];
    const currentIndex = steps.indexOf(currentStep);
    return Math.round(((currentIndex + 1) / steps.length) * 100);
  };

  const inQuestionnaire = questionnaireOrder.includes(currentStep);
  const progressLabel = isInviteFlow
    ? `Join ${inviteData?.companyName || inviteCompanyName || 'your team'}`
    : (inQuestionnaire ? 'Set up your workspace' : 'Create account');

  const passwordStrength = checkPasswordStrength(password);

  // Registration temporarily closed (super-admin toggle) — invite signups bypass.
  if (registrationOpen === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950 px-6">
        <div className="max-w-md w-full text-center">
          <Link to="/" className="inline-flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center">
              <RivvraLogo className="w-7 h-7" />
            </div>
            <span className="text-xl font-bold text-white">Rivvra</span>
          </Link>
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-8">
            <h1 className="text-2xl font-bold text-white mb-3">Sign-ups are temporarily closed</h1>
            <p className="text-dark-400 text-sm leading-relaxed">
              We've paused new workspace registrations while we put the finishing touches on Rivvra.
              We'll reopen soon — thanks for your patience.
            </p>
            <p className="text-dark-500 text-sm mt-4">
              Already have an account?{' '}
              <Link to="/login" className="text-rivvra-400 hover:text-rivvra-300 font-medium">Log in</Link>
            </p>
            <p className="text-dark-500 text-xs mt-6">
              Need access now? Email{' '}
              <a href="mailto:team@rivvra.com" className="text-rivvra-400 hover:text-rivvra-300">team@rivvra.com</a>.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
              <span className="text-dark-400">{progressLabel}</span>
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

              <p className="text-xs text-dark-500 text-center">
                By continuing, you agree to Rivvra's{' '}
                <Link to="/terms" target="_blank" className="text-rivvra-400 hover:text-rivvra-300 underline">Terms of Service</Link>
                {' '}and{' '}
                <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="text-rivvra-400 hover:text-rivvra-300 underline">Privacy Policy</a>.
              </p>

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
                      autoFocus={index === 0}
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

                {/* Terms acceptance — account is created on this submit */}
                <label className="flex items-start gap-3 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    disabled={loading}
                    className="mt-0.5 w-4 h-4 rounded border-dark-600 bg-dark-800 text-rivvra-500 focus:ring-rivvra-500"
                  />
                  <span className="text-xs text-dark-400 leading-relaxed">
                    I agree to Rivvra's{' '}
                    <Link to="/terms" target="_blank" className="text-rivvra-400 hover:text-rivvra-300 underline" onClick={(e) => e.stopPropagation()}>Terms of Service</Link>
                    {' '}and{' '}
                    <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="text-rivvra-400 hover:text-rivvra-300 underline" onClick={(e) => e.stopPropagation()}>Privacy Policy</a>
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading || !fullName || passwordStrength.strength === 'weak' || password !== confirmPassword || !agreeTerms}
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

          {/* Step 4: Company Name + Title (both required).
              Invite flow: this is the ONLY questionnaire step — confirm
              details and finish; the founder questionnaire is skipped. */}
          {currentStep === STEPS.COMPANY && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-white mb-1.5">
                  {isInviteFlow ? 'Almost there' : 'Tell us about your work'}
                </h1>
                <p className="text-dark-400 text-sm">
                  {isInviteFlow
                    ? `Confirm your details to join ${inviteData?.companyName || inviteCompanyName || 'your team'}.`
                    : 'This helps us set up your workspace.'}
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
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      placeholder="Acme Inc."
                      className="input-field pl-12"
                      autoComplete="organization"
                    />
                  )}
                </div>
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
                <p className="text-xs text-dark-500 mt-1">Appears in your email signature when you contact candidates and clients.</p>
              </div>

              {/* Country — sets the default company's country & currency.
                  Invitees join an existing workspace, so no country question. */}
              {!isInviteFlow && (
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Where is your company based? <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { code: 'IN', name: 'India', flag: '🇮🇳', cur: 'INR' },
                    { code: 'US', name: 'United States', flag: '🇺🇸', cur: 'USD' },
                    { code: 'CA', name: 'Canada', flag: '🇨🇦', cur: 'CAD' },
                  ].map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setFormData({ ...formData, country: c.code })}
                      className={`rounded-xl border p-3 text-center transition-all ${
                        formData.country === c.code
                          ? 'border-rivvra-500 bg-rivvra-500/10'
                          : 'border-dark-700 bg-dark-800/50 hover:border-dark-500'
                      }`}
                    >
                      <div className="text-2xl mb-1">{c.flag}</div>
                      <div className="text-sm font-medium text-white">{c.name}</div>
                      <div className="text-[11px] text-dark-500">{c.cur}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-dark-500 mt-1">Sets your company&apos;s currency and regional defaults. You can change it later.</p>
              </div>
              )}

              <button
                onClick={handleQuestionnaireNext}
                disabled={loading
                  || !(formData.companyName || inviteCompanyName).trim()
                  || !formData.senderTitle.trim()
                  || (!isInviteFlow && !formData.country)}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {isInviteFlow ? 'Finish' : 'Continue'}
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Step 5: Business type */}
          {currentStep === STEPS.BUSINESS_TYPE && (
            <div className="space-y-6">
              <button
                onClick={handleQuestionnaireBack}
                className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div>
                <h1 className="text-2xl font-bold text-white mb-1.5">
                  What best describes your business?
                </h1>
                <p className="text-dark-400 text-sm">
                  We'll tailor Rivvra to how you work.
                </p>
              </div>

              <div className="space-y-2">
                {BUSINESS_TYPES.map((bt) => (
                  <button
                    key={bt.id}
                    onClick={() => setFormData({ ...formData, businessType: bt.id })}
                    className={`w-full px-3.5 py-2.5 rounded-lg border text-left transition-all flex items-center gap-3 ${
                      formData.businessType === bt.id
                        ? 'border-rivvra-500 bg-rivvra-500/10'
                        : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                    }`}
                  >
                    <span className="text-xl">{bt.icon}</span>
                    <span className="font-medium text-white flex-1 text-sm">{bt.label}</span>
                    {formData.businessType === bt.id && <Check className="w-4 h-4 text-rivvra-400" />}
                  </button>
                ))}
              </div>

              <button
                onClick={handleQuestionnaireNext}
                disabled={!formData.businessType}
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
                <h1 className="text-2xl font-bold text-white mb-1.5">
                  How big is your team?
                </h1>
                <p className="text-dark-400 text-sm">
                  Helps us size your workspace defaults.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {TEAM_SIZES.map((size) => (
                  <button
                    key={size.id}
                    onClick={() => setFormData({ ...formData, teamSize: size.id })}
                    className={`px-3.5 py-2.5 rounded-lg border text-left transition-all ${
                      formData.teamSize === size.id
                        ? 'border-rivvra-500 bg-rivvra-500/10'
                        : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                    }`}
                  >
                    <span className="font-medium text-white block text-sm">{size.label}</span>
                    <span className="text-xs text-dark-400">{size.description}</span>
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

          {/* Step 7: Goals (multi-select) */}
          {currentStep === STEPS.GOALS && (
            <div className="space-y-6">
              <button
                onClick={handleQuestionnaireBack}
                className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div>
                <h1 className="text-2xl font-bold text-white mb-1.5">
                  What do you want to do first?
                </h1>
                <p className="text-dark-400 text-sm">
                  Pick all that apply — we'll switch on the right apps for you.
                  To-Do and Documents are always included, and admins can enable
                  any app later in Settings.
                </p>
              </div>

              <div className="space-y-2">
                {GOAL_OPTIONS.map((g) => {
                  const selected = formData.goals.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      onClick={() => setFormData({
                        ...formData,
                        goals: selected
                          ? formData.goals.filter((x) => x !== g.id)
                          : [...formData.goals, g.id],
                      })}
                      className={`w-full px-3.5 py-2.5 rounded-lg border text-left transition-all flex items-center gap-3 ${
                        selected
                          ? 'border-rivvra-500 bg-rivvra-500/10'
                          : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                      }`}
                    >
                      <span className="text-xl">{g.icon}</span>
                      <span className="flex-1">
                        <span className="font-medium text-white block">{g.label}</span>
                        <span className="text-xs text-dark-500">Enables {g.apps}</span>
                      </span>
                      <span className={`w-5 h-5 rounded border flex items-center justify-center ${selected ? 'bg-rivvra-500 border-rivvra-500' : 'border-dark-600'}`}>
                        {selected && <Check className="w-3.5 h-3.5 text-dark-950" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleQuestionnaireNext}
                disabled={formData.goals.length === 0}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Step 8: Workspace preferences (attribution + sample data) */}
          {currentStep === STEPS.WORKSPACE_PREFS && (
            <div className="space-y-6">
              <button
                onClick={handleQuestionnaireBack}
                className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div>
                <h1 className="text-2xl font-bold text-white mb-1.5">
                  One last thing
                </h1>
                <p className="text-dark-400 text-sm">
                  Choose how your workspace should start.
                </p>
              </div>

              {/* Sample data choice */}
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => setFormData({ ...formData, seedSampleData: true })}
                  className={`px-3.5 py-2.5 rounded-lg border text-left transition-all ${
                    formData.seedSampleData
                      ? 'border-rivvra-500 bg-rivvra-500/10'
                      : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                  }`}
                >
                  <span className="font-medium text-white block text-sm">Start with example data</span>
                  <span className="text-xs text-dark-400">Explore with sample jobs &amp; candidates. Remove anytime in one click.</span>
                </button>
                <button
                  onClick={() => setFormData({ ...formData, seedSampleData: false })}
                  className={`px-3.5 py-2.5 rounded-lg border text-left transition-all ${
                    !formData.seedSampleData
                      ? 'border-rivvra-500 bg-rivvra-500/10'
                      : 'border-dark-700 bg-dark-800/50 hover:border-dark-600'
                  }`}
                >
                  <span className="font-medium text-white block text-sm">Start with a clean workspace</span>
                  <span className="text-xs text-dark-400">Empty and ready for your real data.</span>
                </button>
              </div>

              {/* Attribution (optional) */}
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">How did you hear about us? <span className="text-dark-500 font-normal">(optional)</span></label>
                <div className="flex flex-wrap gap-2">
                  {HEARD_FROM_OPTIONS.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setFormData({ ...formData, heardFrom: formData.heardFrom === h.id ? '' : h.id })}
                      className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                        formData.heardFrom === h.id
                          ? 'border-rivvra-500 bg-rivvra-500/10 text-white'
                          : 'border-dark-700 bg-dark-800/50 text-dark-300 hover:border-dark-600'
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleComplete}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating your workspace…
                  </>
                ) : (
                  <>
                    Create my workspace
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
              <p className="text-xs text-dark-500 text-center">
                We'll set up your company, pipelines and defaults — takes a few seconds.
              </p>
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
            <h2 className="text-2xl font-bold text-white mb-3">One platform, fourteen apps</h2>
            <p className="text-dark-400">Outreach, hiring, timesheets, payroll, invoicing &amp; more — built for staffing agencies.</p>
          </div>

          {/* App Preview Cards — every one of these is LIVE. This panel used
              to mark ATS and CRM "Soon", telling staffing agencies the two
              apps they came for weren't ready. */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: 'ATS', desc: 'Recruiting & placements' },
              { name: 'CRM', desc: 'Deals & pipeline' },
              { name: 'Outreach', desc: 'Find & email leads' },
              { name: 'Invoicing', desc: 'Invoices & payments' },
              { name: 'Payroll & ESS', desc: 'Hours, payslips & approvals' },
              { name: 'Sign', desc: 'E-signatures' },
            ].map((app, i) => (
              <div key={i} className="card p-4 text-left">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-white">{app.name}</span>
                </div>
                <p className="text-xs text-dark-400">{app.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-dark-500">
            + 8 more — To-Do, Documents, Expenses, Leave, Timesheets, Assets, Knowledge Base, Careers site
          </p>

          {/* Value Props */}
          <div className="space-y-2">
            {['Free forever plan — all 14 apps included', 'Per-seat pricing — pay only as you grow', 'Invite your whole team in seconds'].map((feature, i) => (
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