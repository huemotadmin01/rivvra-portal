// Persistent STAGING ribbon — rendered on every page, cannot be dismissed.
// People run staging and production side by side; without an always-visible
// marker they WILL act on the wrong one. Gated on VITE_STAGING at build time,
// so production builds tree-shake this to nothing.
const IS_STAGING = import.meta.env.VITE_STAGING === 'true';

export default function StagingBanner() {
  if (!IS_STAGING) return null;
  return (
    <div
      // z-[100]: above app chrome and BulkActionBar (80), above modals
      // (90/91) and toasts (95) — the environment marker outranks everything.
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 h-6 bg-amber-500 text-black text-[11px] font-bold tracking-[0.2em] uppercase select-none pointer-events-none"
      role="status"
      aria-label="Staging environment"
    >
      Staging — test data only
    </div>
  );
}
