import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Building2, Loader2, AlertTriangle, LogIn, CheckCircle, Shield, Lock, Eye, EyeOff, User } from 'lucide-react';
import { GOOGLE_CLIENT_ID } from '../utils/config';
import api from '../utils/api';
import AuthShell from '../components/shared/AuthShell';
import { Button, Callout, Chip, Field, Input, Spinner } from '../components/ds';

// ============================================================================
// InviteAcceptPageV2.jsx — accept a workspace invite, on ds
// ============================================================================
//
// Routes: /invite and /org/:slug/invite, both outside OrgProvider. Ships
// directly; legacy kept unreferenced.
//
// ── Everything above `return (` is the legacy bytes ─────────────────────────
// This page creates accounts and sets passwords, so no handler was retyped.
// Spliced whole and asserted by diff: the token extraction, `validateToken`'s
// DUAL PATH (org invite first, silently falling back to legacy on throw),
// `handleAcceptSuccess`, `handleGoogleCredential`, `handleOneClickJoin`,
// `handleCreatePassword`, the Google init effect, and every derived flag.
//
// The parts that decide what a stranger can do with a link:
//   • `isLoggedInAsInvitee` compares `user.email` to `invite.email`
//     LOWERCASED on both sides. It is what separates "you were invited" from
//     "someone else is signed in on this browser", and it gates the one-click
//     join entirely.
//   • `handleCreatePassword`'s `needsName` — required only for genuinely new
//     users — then the 10-character floor, then the match check, in that
//     order. And `payload.name` takes the LOGGED-IN user's name when they are
//     the invitee, and the typed name otherwise.
//   • `authMethods` → `showGoogle` / `showPassword` / `showDivider`. An org
//     that disabled Google must not be offered a Google button; CASE 1b exists
//     purely because a logged-in user on a password-only org still has to set
//     a password rather than one-click through.
//
// ── Layout normalised to AuthShell, deliberately ────────────────────────────
// Legacy put the branding header INSIDE the card. The shell puts it above.
// That is a real (small) visual change, taken so all five logged-out pages
// share one silhouette — which is the reason the shell exists. Flagged rather
// than smuggled.
//
// The Google button id `invite-google-button` is load-bearing: the effect
// looks it up by id after Google's script loads. It appears in CASE 2 and
// CASE 3, which are mutually exclusive, so only one is ever in the DOM.
// `theme:'filled_black'` stays — Google renders it in its own iframe and these
// routes are always dark (measured in phase 45).
// ============================================================================

// ── Render helpers, hoisted to MODULE scope on purpose ─────────────────────
// Defined inside the component body these would be a NEW component type on
// every render, so React would unmount and remount the inputs — and a
// remounted input loses focus, meaning the password fields would drop focus
// after every keystroke. A build cannot catch that; only typing can.
const cardBox = {
  padding: 16, borderRadius: 'var(--r-2)',
  background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)',
};
const midText = { font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-2)', textAlign: 'center' };
const subText = { font: "450 11.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', textAlign: 'center', marginTop: 4 };
const strong = { color: 'var(--fg)', fontWeight: 500 };
const eyeBtn = {
  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
  display: 'flex', alignItems: 'center', color: 'var(--fg-4)', background: 'none',
};
const leadIcon = {
  position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
  color: 'var(--fg-4)', pointerEvents: 'none',
};

function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      <span style={{ font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  );
}

function GoogleSlot({ busy, busyLabel }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      {busy ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
          <Loader2 size={15} className="animate-spin" /> {busyLabel}
        </span>
      ) : (
        /* id is load-bearing — Google's renderButton looks it up */
        <div id="invite-google-button" />
      )}
    </div>
  );
}

function PasswordField({ id, label, value, onChange, placeholder, withEye, autoFocus, visible, onToggle, disabled }) {
  return (
    <Field label={label} htmlFor={id}>
      <div style={{ position: 'relative' }}>
        <Lock size={15} style={leadIcon} />
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          style={{ paddingLeft: 33, paddingRight: withEye ? 33 : 12 }}
        />
        {withEye && (
          <button type="button" onClick={onToggle}
            aria-label={visible ? 'Hide password' : 'Show password'} style={eyeBtn}>
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
    </Field>
  );
}

function InviteAcceptPageV2() {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams(); // present when accessed via /org/:slug/invite
  const { user, isAuthenticated } = useAuth();

  const [inviteToken, setInviteToken] = useState('');
  const [invite, setInvite] = useState(null);
  const [inviteType, setInviteType] = useState(null); // 'org' | 'legacy'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Password form state (CASE 3: new user)
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwVisible, setPwVisible] = useState(false);

  // Extract token from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search || location.hash?.split('?')[1] || '');
    const t = params.get('token');
    if (t) {
      setInviteToken(t);
      validateToken(t);
    } else {
      setError('No invite token found');
      setLoading(false);
    }
  }, []);

  // Dual-path validation: try org invite first, fall back to legacy
  async function validateToken(t) {
    try {
      const orgRes = await api.validateOrgInvite(t);
      if (orgRes.success) {
        setInvite(orgRes.invite);
        setInviteType('org');
        setLoading(false);
        return;
      }
    } catch {
      // Org invite not found — try legacy
    }

    try {
      const legacyRes = await api.validateInviteToken(t);
      if (legacyRes.success) {
        setInvite(legacyRes.invite);
        setInviteType('legacy');
      } else {
        setError(legacyRes.error || 'Invalid invite link');
      }
    } catch (err) {
      setError(err.message || 'Invalid or expired invite link');
    } finally {
      setLoading(false);
    }
  }

  // Helper to handle successful accept — go straight to workspace
  function handleAcceptSuccess(res) {
    localStorage.setItem('rivvra_token', res.token);
    localStorage.setItem('rivvra_user', JSON.stringify(res.user));
    // Navigate to the org's home page using clean URL (not hash)
    const orgSlugFromInvite = invite?.orgSlug || slug;
    if (orgSlugFromInvite) {
      window.location.href = `/org/${orgSlugFromInvite}/home`;
    } else {
      window.location.href = '/home';
    }
  }

  // ── Google Auth Handler ──
  const handleGoogleCredential = useCallback(async (credential) => {
    setGoogleLoading(true);
    setError('');
    try {
      let res;
      if (inviteType === 'org') {
        res = await api.acceptOrgInvite({ token: inviteToken, credential });
      } else {
        res = await api.acceptInvite({ token: inviteToken, credential });
      }
      if (res.success) {
        handleAcceptSuccess(res);
      } else {
        setError(res.error || 'Failed to join');
      }
    } catch (err) {
      setError(err.message || 'Failed to join with Google');
    } finally {
      setGoogleLoading(false);
    }
  }, [inviteToken, inviteType]);

  // Initialize Google Sign-In button
  useEffect(() => {
    if (!invite || loading) return;

    const isLoggedInAsInvitee = isAuthenticated && user?.email?.toLowerCase() === invite.email?.toLowerCase();
    if (invite.userExists && isLoggedInAsInvitee) return;

    // Only load Google SDK if google auth is allowed
    const methods = invite.authMethods || ['google'];
    if (!methods.includes('google')) return;

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

        const btnEl = document.getElementById('invite-google-button');
        if (btnEl) {
          window.google.accounts.id.renderButton(btnEl, {
            theme: 'filled_black',
            size: 'large',
            width: 380,
            text: 'continue_with',
          });
        }
      }
    };

    loadGoogleScript();
  }, [invite, loading, handleGoogleCredential, isAuthenticated, user]);

  // ── One-Click Join (existing + logged in) ──
  async function handleOneClickJoin() {
    setSubmitting(true);
    setError('');
    try {
      let res;
      if (inviteType === 'org') {
        res = await api.acceptOrgInvite({ token: inviteToken });
      } else {
        res = await api.acceptInvite({ token: inviteToken });
      }
      if (res.success) {
        handleAcceptSuccess(res);
      } else {
        setError(res.error || 'Failed to join');
      }
    } catch (err) {
      setError(err.message || 'Failed to join');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Create Password (new user or existing user setting password) ──
  async function handleCreatePassword(e) {
    e.preventDefault();
    setError('');

    // Name is only required for truly new users (not logged-in existing users)
    const needsName = !isLoggedInAsInvitee && !userExists;
    if (needsName && !fullName.trim()) {
      setError('Please enter your full name');
      return;
    }
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
      const payload = { token: inviteToken, password };
      // Include name for new users, use existing name for logged-in users
      payload.name = isLoggedInAsInvitee ? (user?.name || user?.email) : fullName.trim();

      let res;
      if (inviteType === 'org') {
        res = await api.acceptOrgInvite(payload);
      } else {
        res = await api.acceptInvite(payload);
      }
      if (res.success) {
        handleAcceptSuccess(res);
      } else {
        setError(res.error || 'Failed to create account');
      }
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  }


  // ── Loading State ──
  if (loading) {
    return (
      <AuthShell gradient={false} card={false}>
        <div style={{ display: 'flex', justifyContent: 'center' }}><Spinner size={32} /></div>
      </AuthShell>
    );
  }

  // ── Error State (no invite) ──
  if (error && !invite) {
    return (
      <AuthShell gradient={false} tone="danger" icon={<AlertTriangle size={26} />} title="Invalid Invite">
        <div style={{ textAlign: 'center' }}>
          <p style={{ font: "450 13px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', marginBottom: 22 }}>{error}</p>
          <Button onClick={() => navigate('/find-workspace')}>Find your workspace</Button>
        </div>
      </AuthShell>
    );
  }

  // Determine which UI to show
  const userExists = invite?.userExists;
  const alreadyInTeam = invite?.alreadyInTeam || invite?.alreadyMember;
  const isLoggedInAsInvitee = isAuthenticated && user?.email?.toLowerCase() === invite?.email?.toLowerCase();

  const displayName = invite?.orgName || invite?.companyName || 'the team';

  const appBadges = inviteType === 'org' && invite?.appAccess
    ? Object.entries(invite.appAccess)
        .filter(([, v]) => v.enabled)
        .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1))
    : [];

  const roleLabel = invite?.orgRole === 'admin' ? 'Admin' :
    invite?.orgRole === 'owner' ? 'Owner' :
    invite?.role === 'team_lead' ? 'Team Lead' :
    'Member';

  // Auth method gating
  const authMethods = invite?.authMethods || ['google'];
  const showGoogle = authMethods.includes('google');
  const showPassword = authMethods.includes('password');
  const showDivider = showGoogle && showPassword;

  // Workspace branding
  const orgSlug = invite?.orgSlug || slug;
  const hasOrgLogo = invite?.orgLogoAvailable && orgSlug;


  return (
    <AuthShell
      brand={(
        <>
          {hasOrgLogo ? (
            <img
              src={`${api.baseUrl}/api/org/${orgSlug}/logo`}
              alt={displayName}
              style={{ width: 60, height: 60, marginBottom: 14, objectFit: 'contain', borderRadius: 'var(--r-3)', background: 'var(--surface-2)' }}
            />
          ) : (
            <div style={{
              width: 56, height: 56, marginBottom: 14, borderRadius: 'var(--r-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--brand-soft)', color: 'var(--brand-ink)',
            }}>
              {alreadyInTeam ? <CheckCircle size={26} /> : <Building2 size={26} />}
            </div>
          )}
          <h1 style={{ font: "700 19px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 8 }}>
            {alreadyInTeam ? `Welcome to ${displayName}` : `Join ${displayName}`}
          </h1>
          <p style={{ font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', textAlign: 'center' }}>
            {alreadyInTeam ? (
              <>Sign in to access your <span style={{ color: 'var(--brand-ink)', fontWeight: 500 }}>{displayName}</span> account</>
            ) : (
              <>You've been invited to join as{' '}
              <span style={{ color: 'var(--brand-ink)', fontWeight: 500 }}>{roleLabel}</span></>
            )}
          </p>
          {!alreadyInTeam && invite.invitedByName && (
            <p style={{ font: "450 11.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 4 }}>
              Invited by {invite.invitedByName}
            </p>
          )}

          {appBadges.length > 0 && !alreadyInTeam && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              <Shield size={13} style={{ color: 'var(--fg-4)' }} />
              <span style={{ font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>Access to:</span>
              {appBadges.map((app) => <Chip key={app} tone="brand">{app}</Chip>)}
            </div>
          )}
        </>
      )}
      footer={(
        <p style={{ font: "450 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
          Powered by <span style={{ color: 'var(--fg-3)' }}>Rivvra</span>
        </p>
      )}
    >
      {error && <div style={{ marginBottom: 16 }}><Callout tone="danger">{error}</Callout></div>}

      {/* ═══ CASE 1: Existing user, already logged in — One-click join ═══
          Only if Google auth is allowed; password-only → show pw form */}
      {userExists && isLoggedInAsInvitee && showGoogle ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ ...cardBox, display: 'flex', alignItems: 'center', gap: 12 }}>
            {user?.picture ? (
              <img src={user.picture} alt="" referrerPolicy="no-referrer"
                style={{ width: 42, height: 42, borderRadius: 'var(--r-2)', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: 42, height: 42, borderRadius: 'var(--r-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--brand-soft)', color: 'var(--brand-ink)',
                font: "700 13px/1 'Inter', system-ui, sans-serif",
              }}>
                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ font: "500 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'Unnamed'}</p>
              <p style={{ font: "450 11.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
            </div>
            <CheckCircle size={18} style={{ color: 'var(--brand-ink)', flexShrink: 0 }} />
          </div>

          <Button block onClick={handleOneClickJoin} disabled={submitting}
            iconLeft={submitting ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}>
            {submitting ? 'Joining...' : (alreadyInTeam ? 'Continue to Dashboard' : `Join ${displayName}`)}
          </Button>
        </div>

      /* ═══ CASE 1b: Logged in but password-only — must set a password ═══ */
      ) : userExists && isLoggedInAsInvitee && !showGoogle ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={cardBox}>
            <p style={midText}>
              <span style={strong}>{user?.name || user?.email}</span>, your admin requires a password for this workspace.
            </p>
            <p style={subText}>Create a password to join</p>
          </div>

          <form onSubmit={handleCreatePassword} style={{ display: 'grid', gap: 12 }}>
            <PasswordField id="ia-pw" label="Password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="Min. 10 characters" withEye autoFocus
              visible={pwVisible} onToggle={() => setPwVisible(!pwVisible)} disabled={submitting} />
            <PasswordField id="ia-confirm" label="Confirm Password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" visible={pwVisible} disabled={submitting} />
            <Button type="submit" block disabled={submitting || !password || !confirmPassword}
              iconLeft={submitting ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}>
              {submitting ? 'Joining...' : 'Create Password & Join'}
            </Button>
          </form>
        </div>

      /* ═══ CASE 2: Existing user, NOT logged in — Google or password ═══ */
      ) : userExists ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={cardBox}>
            <p style={midText}>
              Welcome back, <span style={strong}>{invite.userName || invite.email}</span>
            </p>
            <p style={subText}>
              {alreadyInTeam ? 'Sign in to access your account' : 'Sign in to join the team'}
            </p>
          </div>

          {showGoogle && <GoogleSlot busy={googleLoading} busyLabel="Signing in with Google..." />}
          {showDivider && <Divider label="or sign in with password" />}

          {showPassword && (
            <Button variant="secondary" block onClick={() => navigate(`/find-workspace`)} iconLeft={<LogIn size={15} />}>
              Sign in to your workspace
            </Button>
          )}
        </div>

      /* ═══ CASE 3: New user — Google + inline password creation form ═══ */
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {showGoogle && <GoogleSlot busy={googleLoading} busyLabel="Creating account with Google..." />}
          {showDivider && <Divider label="or create a password" />}

          {showPassword && (
            <form onSubmit={handleCreatePassword} style={{ display: 'grid', gap: 12 }}>
              <Field label="Full Name" htmlFor="ia-name">
                <div style={{ position: 'relative' }}>
                  <User size={15} style={leadIcon} />
                  <Input id="ia-name" type="text" value={fullName}
                    onChange={(e) => setFullName(e.target.value)} placeholder="John Doe"
                    disabled={submitting} autoFocus style={{ paddingLeft: 33 }} />
                </div>
              </Field>

              <PasswordField id="ia-pw" label="Password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Min. 10 characters" withEye
                visible={pwVisible} onToggle={() => setPwVisible(!pwVisible)} disabled={submitting} />
              <PasswordField id="ia-confirm" label="Confirm Password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" visible={pwVisible} disabled={submitting} />

              <Button type="submit" block
                disabled={submitting || !fullName.trim() || !password || !confirmPassword}
                iconLeft={submitting ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}>
                {submitting ? 'Creating account...' : `Join ${displayName}`}
              </Button>
            </form>
          )}
        </div>
      )}
    </AuthShell>
  );
}

export default InviteAcceptPageV2;
