/**
 * Skeleton family — loading placeholders for every page archetype.
 *
 * Shapes match the legacy `components/Skeletons.jsx` one-for-one so a page
 * can swap without its loading state jumping; only the delivery changed
 * (Tailwind `dark-800` → semantic tokens, so these theme correctly in
 * light mode, which the legacy ones do not).
 *
 * Rule of thumb: a skeleton should occupy the same space the real content
 * will, so the page does not reflow when data lands.
 */

const PULSE = 'ds-skeleton-pulse 1.5s cubic-bezier(.4,0,.6,1) infinite';

/** Keyframes injected once per mount — cheap, and keeps the family
 *  self-contained rather than depending on shell.css. */
function PulseKeyframes() {
  return <style>{'@keyframes ds-skeleton-pulse{0%,100%{opacity:1}50%{opacity:.45}}'}</style>;
}

const bar = (extra = {}) => ({
  background: 'var(--surface-3, #1c242f)',
  borderRadius: 'var(--r-1, 7px)',
  ...extra,
});

const panel = {
  background: 'var(--surface-1, #0e131a)',
  borderRadius: 'var(--r-3, 14px)',
  boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
};

/** Single placeholder bar. The primitive the rest are built from. */
export function Skeleton({ width = '100%', height = 12, radius, dim = 1, style }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block', width, height,
        background: 'var(--surface-3, #1c242f)',
        borderRadius: radius ?? 'var(--r-1, 7px)',
        opacity: dim,
        ...style,
      }}
    />
  );
}

/** Pulse wrapper for a whole page's skeleton. */
export function SkeletonPage({ children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: PULSE, ...style }}>
      <PulseKeyframes />
      {children}
    </div>
  );
}

/** Page title + subtitle, optionally with an action button. */
export function SkeletonHeader({ withButton = false, titleWidth = 180, subtitleWidth = 260 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton width={titleWidth} height={26} />
        <Skeleton width={subtitleWidth} height={14} dim={0.6} />
      </div>
      {withButton && <Skeleton width={110} height={34} radius="var(--r-2, 10px)" />}
    </div>
  );
}

/** Row of stat / summary cards. */
export function SkeletonCardGrid({ count = 3, minWidth = 170 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ ...panel, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Skeleton width={110} height={14} />
            <Skeleton width={18} height={18} dim={0.6} />
          </div>
          <Skeleton width={95} height={30} />
          <Skeleton width={80} height={11} dim={0.4} />
        </div>
      ))}
    </div>
  );
}

/** Filter tabs / pill row. */
export function SkeletonTabs({ widths = [72, 80, 64, 56] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {widths.map((w, i) => <Skeleton key={i} width={w} height={30} radius="var(--r-2, 10px)" />)}
    </div>
  );
}

/** Table with a header band and body rows. Mirrors DataTable's own
 *  built-in loading rows — use this only for tables not rendered by
 *  DataTable (which handles its own `loading` prop). */
export function SkeletonTable({ rows = 6, cols = 4 }) {
  return (
    <div style={{ ...panel, overflow: 'hidden' }}>
      <div style={{ background: 'var(--surface-2, #141b24)', height: 40 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderTop: '1px solid var(--line, rgba(255,255,255,.07))' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width={150} height={14} />
            <Skeleton width={100} height={11} dim={0.5} />
          </div>
          {Array.from({ length: Math.min(cols - 1, 4) }).map((_, j) => (
            <Skeleton key={j} width={[64, 84, 56, 72][j % 4]} height={14} dim={0.6} />
          ))}
          <Skeleton width={56} height={20} radius={999} />
        </div>
      ))}
    </div>
  );
}

/** List of card rows. */
export function SkeletonCardList({ count = 5 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ ...panel, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width={200} height={14} />
            <Skeleton width="60%" height={11} dim={0.5} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Skeleton width={64} height={20} radius={999} />
            <Skeleton width={16} height={16} dim={0.6} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Two side-by-side detail cards. */
export function SkeletonTwoCard() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ ...panel, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Skeleton width={130} height={14} />
            <Skeleton width={64} height={20} radius={999} />
          </div>
          <Skeleton width={165} height={11} dim={0.5} />
          <Skeleton width={110} height={11} dim={0.4} />
          <Skeleton width={130} height={30} />
          <Skeleton width={195} height={11} dim={0.3} />
        </div>
      ))}
    </div>
  );
}

/** Search input + action buttons row. */
export function SkeletonSearchBar({ buttons = 2 }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
      <Skeleton width="auto" height={38} radius="var(--r-2, 10px)" dim={0.5} style={{ flex: 1, minWidth: 200 }} />
      {Array.from({ length: buttons }).map((_, i) => <Skeleton key={i} width={96} height={34} radius="var(--r-2, 10px)" />)}
    </div>
  );
}

/** Panel with a titled header and a divided list — approvals, queues. */
export function SkeletonPendingList({ count = 4 }) {
  return (
    <div style={{ ...panel, overflow: 'hidden' }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--line, rgba(255,255,255,.07))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Skeleton width={150} height={16} />
        <Skeleton width={64} height={14} dim={0.6} />
      </div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderTop: i ? '1px solid var(--line, rgba(255,255,255,.07))' : 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width={180} height={14} />
            <Skeleton width={130} height={11} dim={0.5} />
          </div>
          <Skeleton width={48} height={14} dim={0.6} />
        </div>
      ))}
    </div>
  );
}

/** Config page: card sections each holding a short list. */
export function SkeletonConfig({ sections = 2, rows = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} style={{ ...panel, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Skeleton width={130} height={16} />
            <Skeleton width={96} height={30} radius="var(--r-2, 10px)" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: rows }).map((_, j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Skeleton width={30} height={30} radius="var(--r-2, 10px)" />
                <Skeleton width="auto" height={14} dim={0.6} style={{ flex: 1, maxWidth: 300 }} />
                <Skeleton width={30} height={14} dim={0.4} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact skeleton for a sub-section — config tabs, drawer bodies. */
export function SkeletonInline({ rows = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 0', animation: PULSE }}>
      <PulseKeyframes />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skeleton width="auto" height={14} style={{ flex: 1, maxWidth: 200 }} />
          <Skeleton width={64} height={14} dim={0.4} />
        </div>
      ))}
    </div>
  );
}

/** Centered skeleton for full-screen editor routes. */
export function SkeletonEditor() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', animation: PULSE }}>
      <PulseKeyframes />
      <div style={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 16, padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Skeleton width={200} height={26} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Skeleton width={80} height={34} radius="var(--r-2, 10px)" />
            <Skeleton width={80} height={34} radius="var(--r-2, 10px)" />
          </div>
        </div>
        <div style={{ ...panel, height: 400 }} />
      </div>
    </div>
  );
}
