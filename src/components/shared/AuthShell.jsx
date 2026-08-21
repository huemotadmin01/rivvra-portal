import { Logo } from '../ds';

// ============================================================================
// AuthShell.jsx — the centred-card layout every logged-out page shares
// ============================================================================
//
// The five auth pages (org login, forgot/reset password, find workspace,
// invite accept) all draw the same thing: a full-height brand backdrop, a
// header block (icon tile, mark + title, one line of explanation), a card, and
// a footer of links. Legacy repeated that markup five times, which is why the
// pages had drifted apart on card width, padding and heading size.
//
// It lives in `shared/` rather than `ds/` because it is Rivvra-specific
// furniture — it hard-codes the brand mark and the marketing backdrop. It is
// BUILT from ds primitives and tokens, so it themes like everything else.
//
// ── These pages sit OUTSIDE the ds shell, and outside the theme ─────────────
// `legacy-bridge.css` only rewrites legacy Tailwind under `.ds-shell`, and a
// logged-out route is not inside it — so here the legacy `dark-*` classes
// really are fixed dark, with no bridge to fall back on.
//
// MEASURED, so it is not assumed: these routes never receive `data-theme` at
// all. `ThemeToggle` is the only thing that sets it, and it does not mount
// logged-out — a visitor with `rivvra.theme='light'` stored still gets
// `data-theme=null` here, and the tokens resolve to their `:root` (dark)
// values. So this shell renders DARK today, exactly as legacy did.
//
// The tokens are therefore not a theming fix for these pages; they are what
// makes the pages correct IF public routes are ever given a theme. Making
// logged-out pages follow the stored preference is a product decision and is
// deliberately NOT taken here.
//
// ── Backdrop, and why the two legacy layers are treated differently ─────────
// Legacy painted `bg-dark-950 mesh-gradient grid-pattern`.
//   • The mesh gradient is five translucent GREEN radials. Green at 8–15%
//     alpha reads on a light surface as well as a dark one, so it is kept
//     as-is — it is brand, not theme.
//   • The grid pattern is `rgba(255,255,255,0.02)` — white lines, which are
//     invisible on a light background. It is redrawn from `--line` so the
//     texture survives in both themes.
// `gradient={false}` matches the pages that never had the backdrop (reset
// password, invite accept, and the org-login loading state), so migrating does
// not quietly add decoration those pages deliberately lacked.
// ============================================================================

const MESH = `
  radial-gradient(at 40% 20%, rgba(34, 197, 94, 0.15) 0px, transparent 50%),
  radial-gradient(at 80% 0%, rgba(34, 197, 94, 0.1) 0px, transparent 50%),
  radial-gradient(at 0% 50%, rgba(34, 197, 94, 0.08) 0px, transparent 50%),
  radial-gradient(at 80% 50%, rgba(16, 185, 129, 0.1) 0px, transparent 50%),
  radial-gradient(at 0% 100%, rgba(34, 197, 94, 0.1) 0px, transparent 50%)
`;

/**
 * Full-height centred layout for logged-out pages.
 *
 * Props:
 *  - icon      : node rendered in the tinted tile above the title. Omit for none.
 *  - title     : heading beside the Rivvra mark.
 *  - sub       : one line under the title.
 *  - brand     : replaces the mark + title row entirely (invite accept shows
 *                the workspace's own name there instead of Rivvra's).
 *  - children  : the card body.
 *  - footer    : links under the card.
 *  - gradient  : draw the mesh + grid backdrop. Default true.
 *  - width     : card max-width in px. Default 448 (legacy `max-w-md`).
 *  - card      : set false to render children bare, for pages whose content is
 *                a status message rather than a form.
 */
export default function AuthShell({
  icon,
  title,
  sub,
  brand,
  children,
  footer,
  gradient = true,
  width = 448,
  card = true,
}) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'var(--bg)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {gradient && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: `${MESH.trim()},
              linear-gradient(var(--line) 1px, transparent 1px),
              linear-gradient(90deg, var(--line) 1px, transparent 1px)`,
            backgroundSize: 'auto, auto, auto, auto, auto, 50px 50px, 50px 50px',
          }}
        />
      )}

      <div style={{ position: 'relative', width: '100%', maxWidth: width }}>
        {(icon || title || sub || brand) && (
          <header style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 26 }}>
            {icon && (
              <div style={{
                width: 60, height: 60, marginBottom: 14,
                borderRadius: 'var(--r-3, 15px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--brand-soft, rgba(34,197,94,.14))',
                boxShadow: 'inset 0 0 0 1px var(--brand-line, rgba(34,197,94,.3))',
                color: 'var(--brand-ink, #4ade80)',
              }}>
                {icon}
              </div>
            )}

            {brand || (title && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Logo size={22} />
                <h1 style={{ font: "700 19px/1.3 'Inter', system-ui, sans-serif", color: 'var(--fg)' }}>{title}</h1>
              </div>
            ))}

            {sub && (
              <p style={{
                font: "450 13px/1.5 'Inter', system-ui, sans-serif",
                color: 'var(--fg-3)', textAlign: 'center', maxWidth: '34ch',
              }}>
                {sub}
              </p>
            )}
          </header>
        )}

        {card ? (
          <div style={{
            borderRadius: 'var(--r-3, 16px)',
            background: 'var(--surface-1)',
            boxShadow: 'inset 0 0 0 1px var(--line), var(--sh-3, 0 14px 34px -10px rgba(0,0,0,.45))',
            padding: 26,
          }}>
            {children}
          </div>
        ) : children}

        {footer && (
          <div style={{
            marginTop: 20, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 7, textAlign: 'center',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
