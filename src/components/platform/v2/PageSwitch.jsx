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
  const { currentOrg } = useOrg();
  return currentOrg?.uiV2 === true ? <V2 {...props} /> : <Legacy {...props} />;
}

export default PageSwitch;
