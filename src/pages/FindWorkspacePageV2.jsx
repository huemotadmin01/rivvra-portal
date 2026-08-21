import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, Search, CheckCircle2, ArrowLeft } from 'lucide-react';
import api from '../utils/api';
import AuthShell from '../components/shared/AuthShell';
import { Button, Callout, Field, Input } from '../components/ds';

// ============================================================================
// FindWorkspacePageV2.jsx — "email me my workspace URL", on ds
// ============================================================================
//
// Route: /find-workspace, outside OrgProvider. `PageSwitch` calls `useOrg()`,
// which THROWS outside the provider, so it cannot gate this route — same as
// /admin/*. Ships directly; legacy is kept unreferenced so the revert is a
// one-line import change.
//
// ── Copy that is security-relevant and spliced verbatim ─────────────────────
// The success state says "If an account exists with {email}, we've sent your
// workspace URL." That hedge is deliberate: it must not confirm or deny that
// the address is registered, or the page becomes an account-enumeration
// oracle. It reads like ordinary reassurance, which is exactly why it is easy
// to "improve" into a leak. It is copied character for character, and the
// success state is shown for BOTH outcomes, as legacy did.
//
// ── Carried across unchanged ────────────────────────────────────────────────
//   • `handleSubmit`'s validation (`!email.includes('@')`) and its
//     result.success / result.error / catch branches.
//   • The submit gate `disabled={loading || !email}`.
//   • "Try a different email" resetting BOTH `sent` and `email`.
//   • The Document Vault footer link — ex-employees whose workspace access has
//     ended still need Form-16 and experience letters, and this is the only
//     route to it from a logged-out state.
// ============================================================================

function FindWorkspacePageV2() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await api.findWorkspace(email);
      if (result.success) {
        setSent(true);
      } else {
        setError(result.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const linkStyle = { color: 'var(--brand-ink)', textDecoration: 'none' };

  return (
    <AuthShell
      icon={<Search size={26} />}
      title="Find your workspace"
      sub="Enter your email and we'll send your workspace login URL."
      footer={(
        <>
          <p style={{ font: "450 13px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
            <Link to="/" style={{ ...linkStyle, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ArrowLeft size={12} /> Back to home
            </Link>
          </p>
          {/* Ex-employees whose workspace access has ended can still reach
              their official documents (Form-16, experience letter, …). */}
          <p style={{ font: "450 11.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
            Former employee? <Link to="/document-vault" style={linkStyle}>Open your Document Vault</Link>
          </p>
        </>
      )}
    >
      {sent ? (
        <div style={{ textAlign: 'center', display: 'grid', gap: 14, justifyItems: 'center' }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--brand-soft)',
            boxShadow: 'inset 0 0 0 1px var(--brand-line)',
            color: 'var(--brand-ink)',
          }}>
            <CheckCircle2 size={28} />
          </div>
          <div>
            <h3 style={{ font: "600 16px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 6 }}>
              Check your inbox
            </h3>
            <p style={{ font: "450 13px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' }}>
              If an account exists with <span style={{ color: 'var(--fg)', fontWeight: 500 }}>{email}</span>,
              we've sent your workspace URL. Check your email (including spam folder).
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setSent(false); setEmail(''); }}>
            Try a different email
          </Button>
        </div>
      ) : (
        <>
          {error && <div style={{ marginBottom: 18 }}><Callout tone="danger">{error}</Callout></div>}

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
            <Field label="Email address" htmlFor="fw-email">
              <div style={{ position: 'relative' }}>
                <Mail
                  size={16}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-4)', pointerEvents: 'none' }}
                />
                <Input
                  id="fw-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  disabled={loading}
                  autoFocus
                  style={{ paddingLeft: 36 }}
                />
              </div>
            </Field>

            <Button
              type="submit"
              block
              disabled={loading || !email}
              iconLeft={loading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            >
              {loading ? '' : 'Send workspace URL'}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

export default FindWorkspacePageV2;
