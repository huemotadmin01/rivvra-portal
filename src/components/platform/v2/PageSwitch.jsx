import { useOrg } from '../../../context/OrgContext';

/**
 * Per-surface v2-vs-legacy selection, keyed on the org's `uiV2` flag.
 *
 * This lived as a local function inside App.jsx, which meant only ROUTES could
 * use it. That was fine until the payroll config pages, which are dual-use:
 * each one is both a `/payroll/*` route AND a tab inside
 * `components/settings/SettingsPayroll`. Switching only the route would have
 * left the same feature rendering two different UIs depending on how you
 * reached it — the exact "two places disagreed" shape behind several bugs
 * already logged in REDESIGN-QA.md.
 *
 * Extracted so both entry points switch on the same flag, in the same commit.
 * Extra props pass straight through, so an embedded caller keeps its own:
 *
 *   <PageSwitch v2={PTMasterPageV2} legacy={PTMasterPage} embedded />
 */
export function PageSwitch({ v2: V2, legacy: Legacy, ...props }) {
  const { currentOrg, loading } = useOrg();

  // Do not choose until the org is known. `currentOrg` starts null on every
  // hard reload, and `null?.uiV2 === true` is false — so without this the
  // legacy page won for the whole fetch window, then swapped to v2 when the
  // org arrived. That is not just a flash of the wrong theme: the legacy page
  // MOUNTS, runs its effects and fires its own data requests, and all of it is
  // thrown away. Every reload on a uiV2 org paid for two page loads.
  //
  // Gate on `loading && !currentOrg`, never on `loading` alone — a background
  // refresh sets loading true again with an org already in hand, and blanking
  // the page mid-session would be worse than the bug.
  if (loading && !currentOrg) return null;

  return currentOrg?.uiV2 === true ? <V2 {...props} /> : <Legacy {...props} />;
}

export default PageSwitch;
