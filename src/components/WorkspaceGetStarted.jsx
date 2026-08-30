import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
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
   `pages/OnboardingHubPage.jsx`.

   ── Why this is a module-level store and not per-component useState ──
   2026-08-30 (QA): the header "Setup N%" chip read 0% while the hub page read
   36%, at the same time, on the same screen. Both call the same
   `buildOnboardingGroups` with the same inputs — but each caller used to own a
   private `useState` + an effect keyed only on `orgSlug`. `OnboardingRail`
   lives in `AppBarV2`, persistent chrome that mounts once per FULL page load,
   and `orgSlug` never changes during SPA navigation — so the chip never
   refetched and displayed a snapshot from first shell mount for the rest of
   the session. A hard reload made it agree again, which is the signature.

   The mismatch was the visible symptom; the real defect was that COMPLETING A
   STEP never updated the header. `buildOnboardingGroups` was already "the
   single definition" of the task list — this makes the data behind it single
   -sourced too. One fetch, one snapshot, every surface re-renders together. */

const EMPTY = { data: null, dismissed: false };

let currentSlug = null;
let snapshot = EMPTY;      // stable reference — useSyncExternalStore requires it
let inflight = null;       // { slug, promise } — dedupes concurrent callers
let lastFetchedAt = 0;
const listeners = new Set();

/* Route changes trigger a refetch so finishing a task and navigating back
   updates every surface. The endpoint runs several count queries and the prod
   cluster is an M0, so ordinary navigation is throttled; explicit invalidation
   (`refresh`, dismiss, restore) always bypasses it. */
const MIN_REFETCH_MS = 30_000;

function emit(next) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

/** Fetch the onboarding payload into the shared store.
 *  @param {string} orgSlug
 *  @param {{force?: boolean}} [opts] force skips the navigation throttle.
 *  @returns {Promise<void>} */
export function refreshGettingStarted(orgSlug, { force = false } = {}) {
  const slug = orgSlug || currentSlug;
  if (!slug) return Promise.resolve();
  if (inflight && inflight.slug === slug) return inflight.promise;
  if (!force && Date.now() - lastFetchedAt < MIN_REFETCH_MS) return Promise.resolve();

  const promise = api.request(`/api/org/${slug}/getting-started`)
    .then((res) => {
      lastFetchedAt = Date.now();
      // Clearing `data` when the server says `available:false` is deliberate.
      // The old per-component hook only ever assigned on the truthy branch, so
      // a workspace that aged out of the onboarding window kept rendering the
      // rail until reload. That was invisible while each surface fetched once;
      // now that we refetch, honour the server.
      emit({ data: res?.available ? res : null, dismissed: !!res?.dismissed });
    })
    // A failed refresh must not blank a surface that is already showing
    // correct data — leave the previous snapshot in place.
    .catch(() => {})
    .finally(() => { if (inflight && inflight.promise === promise) inflight = null; });

  inflight = { slug, promise };
  return promise;
}

/* Returns:
     data      — task/config payload when onboarding is AVAILABLE (admin,
                 org inside the 30-day window), regardless of dismissal. The
                 hub page and sidebar rail use this, so "Hide" can never
                 strand a user with no way back to their onboarding.
     dismissed — whether the user hid the teaser. Only the teaser honors it.
     dismiss   — hides the teaser (persisted per member).
     restore   — un-hides it (used by the hub page, so the entry point can
                 always be brought back without support).
     refresh   — force a refetch (call after completing a step in-place). */
export function useGettingStarted(orgSlug) {
  const { data, dismissed } = useSyncExternalStore(subscribe, getSnapshot);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!orgSlug) return;
    if (currentSlug !== orgSlug) {
      // Switching workspace must not show the previous org's progress.
      currentSlug = orgSlug;
      lastFetchedAt = 0;
      inflight = null;
      emit(EMPTY);
    }
    refreshGettingStarted(orgSlug);
  }, [orgSlug, pathname]);

  const dismiss = () => {
    emit({ ...snapshot, dismissed: true });
    api.request(`/api/org/${orgSlug}/getting-started/dismiss`, { method: 'POST' }).catch(() => {});
  };
  const restore = () => {
    emit({ ...snapshot, dismissed: false });
    api.request(`/api/org/${orgSlug}/getting-started/restore`, { method: 'POST' }).catch(() => {});
  };
  const refresh = () => refreshGettingStarted(orgSlug, { force: true });

  return { data, dismissed, dismiss, restore, refresh };
}

export default useGettingStarted;
