import { Chip } from '../../components/ds';

/**
 * Plan pill for the super-admin surfaces.
 *
 * This function was duplicated character-for-character in
 * `AdminWorkspacesPage` and `AdminOverviewPage`. The two copies agreed, but
 * nothing kept them agreeing — add a plan tier to one and the other silently
 * falls back to the `free` styling. One definition now.
 *
 * The tone map preserves legacy's grouping exactly: `free` reads as info,
 * every paid tier below enterprise shares one tone, and `enterprise` is
 * distinct. An unknown plan falls back to `free`, as legacy did.
 */
const PLAN_TONE = {
  free: 'info',
  core: 'brand',
  all_apps: 'brand',
  pro: 'brand',
  enterprise: 'purple',
};

export function PlanBadge({ plan }) {
  return (
    <Chip tone={PLAN_TONE[plan] || PLAN_TONE.free} uppercase>
      {(plan || 'free').toUpperCase()}
    </Chip>
  );
}
