// ============================================================================
// WorkspaceNoAccess.jsx — the blocking answer when /org/:slug/ names a
// workspace you can't open
// ============================================================================
//
// Now that the slug selects the workspace, "you asked for a workspace you're
// not in" is a real outcome and it gets a real page. Deliberately NOT a
// redirect: silently bouncing to your own workspace is the exact failure the
// slug work removes — you asked for B and the app quietly showed you A under
// B's name. So this renders instead of the app, and nothing mounts underneath.
//
// Two shapes, same page:
//   forbidden — the workspace exists, you're not a member
//   notFound  — no workspace with that slug (typo, deleted, renamed org)
//
// Visually this is the sibling of the "No Access" branch in OrgLoginPageV2;
// same AuthShell, same escape hatches (go to your own workspace / switch
// account), so the two never look like different products.
// ============================================================================

import { useNavigate } from 'react-router-dom';
import { AlertCircle, ExternalLink, SearchX } from 'lucide-react';
import AuthShell from './shared/AuthShell';
import { Button } from './ds';
import { useAuth } from '../context/AuthContext';

const headText = { font: "700 21px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 8 };
const bodyText = { font: "450 13.5px/1.55 'Inter', system-ui, sans-serif", color: 'var(--fg-3)' };
const hintText = { font: "450 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-4)', marginTop: 8 };
const strong = { color: 'var(--fg)', fontWeight: 500 };

function WorkspaceNoAccess({ slug, reason = 'forbidden' }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const ownSlug = user?.defaultOrgSlug || null;
  const notFound = reason === 'notFound';

  return (
    <AuthShell
      card={false}
      tone={notFound ? 'neutral' : 'danger'}
      icon={notFound ? <SearchX size={28} /> : <AlertCircle size={28} />}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={headText}>{notFound ? 'Workspace not found' : 'No access'}</h1>

        <p style={bodyText}>
          {notFound ? (
            <>
              There's no workspace at <span style={strong}>/org/{slug}</span>. It may have been
              renamed, or the link may be mistyped.
            </>
          ) : (
            <>
              {user?.email ? <span style={strong}>{user.email}</span> : 'Your account'} doesn't have
              access to <span style={strong}>{slug}</span>.
            </>
          )}
        </p>

        {!notFound && (
          <p style={hintText}>
            If you should have access, ask an admin of that workspace to invite you.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          {ownSlug && ownSlug !== slug && (
            <Button
              as="a"
              href={`/org/${ownSlug}/home`}
              block
              iconRight={<ExternalLink size={15} />}
              onClick={(e) => { e.preventDefault(); navigate(`/org/${ownSlug}/home`); }}
            >
              Go to your workspace
            </Button>
          )}
          {/* Signing out is the honest route to "a different account": clearing
              local state alone would leave the same session in place and land
              the user right back here. */}
          <Button
            variant="secondary"
            block
            onClick={() => { logout?.(); navigate(`/org/${slug}/login`, { replace: true }); }}
          >
            Sign in with a different account
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}

export default WorkspaceNoAccess;
