import { Link } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { usePlatform } from '../../../context/PlatformContext';
import { useOrg } from '../../../context/OrgContext';
import { useGettingStarted } from '../../WorkspaceGetStarted';
import { buildOnboardingGroups } from '../../../pages/OnboardingHubPage';

/* Sidebar entry point for the onboarding hub — the reason guidance survives
   being skipped. The first-run card can be dismissed from the launcher; this
   rail keeps a permanent, low-noise way back in, showing live progress.

   Hidden once every step is done (or when the server says the org is past the
   onboarding window), so it never becomes furniture for an established org. */
export default function OnboardingRail({ collapsed, variant }) {
  const { orgPath } = usePlatform();
  const { currentOrg } = useOrg();
  const { data } = useGettingStarted(currentOrg?.slug);
  if (!data) return null;

  const apps = new Set(currentOrg?.enabledApps || []);
  const tasks = buildOnboardingGroups({ data, apps, orgPath }).flatMap((g) => g.tasks);
  if (!tasks.length) return null;
  const done = tasks.filter((t) => t.done).length;
  if (done === tasks.length) return null;
  const pct = Math.round((done / tasks.length) * 100);

  // App-bar variant: onboarding is platform-level, so it belongs in the
  // platform chrome rather than inside one app's sidebar (where it read as
  // "an Outreach feature"). Compact by design — the hub holds the detail.
  if (variant === 'appbar') {
    return (
      // `icon-btn` sizes for a square icon, so the label wrapped onto two
      // lines and sat under the theme toggle. This is a pill, not an icon
      // button: it needs its own box, a fixed height and nowrap.
      //
      // `display` deliberately lives in `.setup-chip` (shell.css) rather than
      // in the inline style below. An inline `display` beats any stylesheet,
      // so declaring it here silently defeated the `desktop-only` class this
      // element already carries: the pill kept rendering on phones at 96px,
      // pushing the 392px appbar to 490px and making every page that also
      // shows the month/FY chip scroll sideways. Same trap the `.company-btn`
      // comment in shell.css documents. Do not move it back inline.
      <Link
        to={orgPath('/getting-started')}
        className="setup-chip desktop-only"
        title={`Finish setting up your workspace — ${pct}% complete`}
        style={{
          alignItems: 'center', gap: 6, flexShrink: 0,
          height: 30, padding: '0 10px', marginRight: 4,
          borderRadius: 999, whiteSpace: 'nowrap',
          background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)',
          textDecoration: 'none', color: 'var(--fg-2)',
          font: "550 12px/1 'Inter', system-ui, sans-serif",
        }}
      >
        <Rocket style={{ width: 13, height: 13, color: 'var(--brand-ink)', flexShrink: 0 }} />
        <span>Setup {pct}%</span>
      </Link>
    );
  }

  if (collapsed) {
    return (
      <Link
        to={orgPath('/getting-started')}
        className="sb-item"
        title={`Onboarding hub — ${pct}% complete`}
      >
        <span className="ico"><Rocket style={{ width: 16, height: 16 }} /></span>
      </Link>
    );
  }

  return (
    <Link
      to={orgPath('/getting-started')}
      style={{
        display: 'block', textDecoration: 'none', margin: '0 0 6px',
        padding: '10px 12px', borderRadius: 'var(--r-2, 12px)',
        background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Rocket style={{ width: 14, height: 14, color: 'var(--brand-ink)', flexShrink: 0 }} />
        <span style={{ font: "550 12.5px/1.2 'Inter', system-ui, sans-serif", color: 'var(--fg-2)' }}>
          Onboarding hub
        </span>
      </span>
      <span style={{ display: 'block', height: 4, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--brand)' }} />
      </span>
      <span style={{ display: 'block', font: "400 11.5px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', marginTop: 6 }}>
        {pct}% completed
      </span>
    </Link>
  );
}
