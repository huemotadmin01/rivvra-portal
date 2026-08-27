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
export function useGettingStarted(orgSlug) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!orgSlug) return;
    api.request(`/api/org/${orgSlug}/getting-started`)
      .then((res) => { if (res?.show) setData(res); })
      .catch(() => {});
  }, [orgSlug]);
  const dismiss = () => {
    setData(null);
    api.request(`/api/org/${orgSlug}/getting-started/dismiss`, { method: 'POST' }).catch(() => {});
  };
  return { data, dismiss };
}

export default useGettingStarted;
