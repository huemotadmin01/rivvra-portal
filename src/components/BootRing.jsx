/**
 * The pre-shell loading ring — ProtectedRoute, SuperAdminRoute and
 * ShellSwitch all hold on this while auth / the org resolve.
 *
 * Two properties matter, both learned the hard way:
 *
 * 1. ds PageSpinner geometry (24px, thin, neutral track). The previous
 *    48px thick green ring was pixel-for-pixel the V1 spinner, so every
 *    reload looked like "V1 flashing" no matter how correctly it was themed.
 *
 * 2. It does not exist until 400ms after NAVIGATION START — not component
 *    mount. A warm reload reaches the app in under 400ms, so a normal
 *    refresh renders background only: there is no spinner to flash. The
 *    delay is computed from performance.now() (≈ time since navigation
 *    start) so the boot splash in index.html and every React phase share
 *    one clock — if the splash's ring is already visible, the React ring
 *    appears with zero delay instead of blinking off and on again.
 */
const RING_REVEAL_MS = 400;

function BootRing({ color = 'var(--brand, #22c55e)' }) {
  const delay = Math.max(0, RING_REVEAL_MS - performance.now());
  return (
    <>
      <div
        style={{
          width: 24, height: 24, borderRadius: 9999,
          border: '3px solid var(--line-2, rgba(127,138,150,.25))',
          borderTopColor: color,
          opacity: 0,
          animation: `ds-spin .7s linear infinite, boot-ring-in .2s ease ${Math.round(delay)}ms forwards`,
        }}
      />
      <style>{'@keyframes ds-spin{to{transform:rotate(360deg)}}@keyframes boot-ring-in{to{opacity:1}}'}</style>
    </>
  );
}

export default BootRing;
