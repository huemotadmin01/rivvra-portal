import { useState, useEffect } from 'react';
import api from '../utils/api';

/* Onboarding data source, shared by every onboarding surface: the hub page
   (/getting-started), the launcher/dashboard teaser, and the sidebar rail.

   GET /api/org/:slug/getting-started returns `show:false` for orgs outside the
   onboarding window (older than 30 days, non-admins, or dismissed) and
   otherwise the record counts + config detections that decide each task's
   completion. Nothing here is self-reported — a task is done when the
   workspace actually has the thing.

   The file kept its name because it began life as the dismissible welcome
   card; the card is now `OnboardingHubTeaser`, and the task list lives on
   `pages/OnboardingHubPage.jsx`. */
/* Returns:
     data      — task/config payload when onboarding is AVAILABLE (admin,
                 org inside the 30-day window), regardless of dismissal. The
                 hub page and sidebar rail use this, so "Hide" can never
                 strand a user with no way back to their onboarding.
     dismissed — whether the user hid the teaser. Only the teaser honors it.
     dismiss   — hides the teaser (persisted per member).
     restore   — un-hides it (used by the hub page, so the entry point can
                 always be brought back without support). */
export function useGettingStarted(orgSlug) {
  const [data, setData] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!orgSlug) return;
    api.request(`/api/org/${orgSlug}/getting-started`)
      .then((res) => {
        if (res?.available) setData(res);
        setDismissed(!!res?.dismissed);
      })
      .catch(() => {});
  }, [orgSlug]);
  const dismiss = () => {
    setDismissed(true);
    api.request(`/api/org/${orgSlug}/getting-started/dismiss`, { method: 'POST' }).catch(() => {});
  };
  const restore = () => {
    setDismissed(false);
    api.request(`/api/org/${orgSlug}/getting-started/restore`, { method: 'POST' }).catch(() => {});
  };
  return { data, dismissed, dismiss, restore };
}

export default useGettingStarted;
