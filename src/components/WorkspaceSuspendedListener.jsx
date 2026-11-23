import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * 2026-11-23: a workspace suspended by a Rivvra super admin answers every
 * request with 403 ORG_SUSPENDED. The API client broadcasts
 * `rivvra:org-suspended`; this shows ONE clear full-screen message instead of
 * every page failing in its own way. Mount once inside AuthProvider.
 *
 * Never shown on /admin/* (the super-admin console is not workspace-scoped),
 * and it goes away by itself when the person moves to another address — e.g.
 * a different workspace they belong to.
 */
export default function WorkspaceSuspendedListener() {
  const { logout } = useAuth();
  const [at, setAt] = useState(null); // pathname prefix that was suspended

  useEffect(() => {
    const prefix = () => {
      const m = window.location.pathname.match(/^\/org\/[^/]+/);
      return m ? m[0] : window.location.pathname;
    };
    const onSuspended = () => { if (!window.location.pathname.startsWith('/admin')) setAt(prefix()); };
    const onMove = () => setAt((cur) => (cur && !window.location.pathname.startsWith(cur) ? null : cur));
    window.addEventListener('rivvra:org-suspended', onSuspended);
    window.addEventListener('popstate', onMove);
    const t = setInterval(onMove, 1000); // SPA navigations do not fire popstate
    return () => { window.removeEventListener('rivvra:org-suspended', onSuspended); window.removeEventListener('popstate', onMove); clearInterval(t); };
  }, []);

  if (!at) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ws-suspended-title"
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'var(--bg, #f7f6f2)', display: 'grid', placeItems: 'center', padding: 24 }}
    >
      <div style={{ maxWidth: 460, textAlign: 'center', font: "400 15px/1.6 'Inter', system-ui, sans-serif", color: 'var(--fg-2, #444)' }}>
        <div style={{ fontSize: 34, marginBottom: 12 }} aria-hidden="true">⏸</div>
        <h1 id="ws-suspended-title" style={{ font: "700 22px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg, #111)', margin: '0 0 10px' }}>
          This workspace is suspended
        </h1>
        <p style={{ margin: '0 0 6px' }}>
          Nobody can use it for now. Your data is safe and nothing has been deleted.
        </p>
        <p style={{ margin: '0 0 22px' }}>
          Please contact Rivvra support, or your workspace owner, to have it re-activated.
        </p>
        <button
          type="button"
          onClick={() => { logout(); window.location.assign('/login'); }}
          style={{ font: "550 14px/1 'Inter', system-ui, sans-serif", padding: '11px 18px', borderRadius: 10, border: 'none', background: 'var(--fg, #111)', color: 'var(--bg, #f7f6f2)', cursor: 'pointer' }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
