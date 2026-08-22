// ============================================================================
// accent.js — making an arbitrary customer brand colour legible.
// ============================================================================
//
// The careers pages are white-labelled: `org.branding.primaryColor` is chosen
// by the customer and Rivvra never sees it before it renders. It gets used two
// ways, and the raw value is wrong for both:
//
//   as INK   — the hero's accent half, stat-tile numbers, on #fafafa
//   as FILL  — the CTA buttons, with hardcoded white text on top
//
// Huemot's teal (#2bb3b3) measured 2.45:1 as ink and 2.56:1 as fill-under-white
// on staging. Both fail. And they fail in opposite directions, so there is no
// single rule like "always use white" that fixes it — a dark accent breaks the
// ink usage, a light accent breaks the fill usage, and a mid-luminance accent
// like teal breaks both at once.
//
// So: pick the foreground by luminance, and darken the ink until it clears the
// bar. Nothing here changes the brand colour a customer picked — the fill stays
// exactly their colour, and the ink is the nearest legible version of it.
// ============================================================================

const clamp255 = (n) => Math.min(255, Math.max(0, Math.round(n)));

/** '#rgb' | '#rrggbb' -> [r,g,b]. Returns null for anything else. */
export function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const toHex = (rgb) => '#' + rgb.map((c) => clamp255(c).toString(16).padStart(2, '0')).join('');

/** WCAG relative luminance. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two rgb triples. */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const NEAR_BLACK = [24, 24, 27];   // zinc-900
const WHITE = [255, 255, 255];

/**
 * Foreground for text sitting ON `accent` as a filled surface.
 * Returns whichever of white / zinc-900 contrasts better — so a pale brand
 * colour gets dark text instead of the invisible white it used to get.
 */
export function readableOn(accent, fallback = '#5b6cff') {
  const rgb = parseHex(accent) || parseHex(fallback) || [91, 108, 255];
  return contrast(rgb, WHITE) >= contrast(rgb, NEAR_BLACK) ? '#ffffff' : '#18181b';
}

/**
 * The accent, darkened just enough to be readable AS TEXT on `bg`.
 *
 * `large` picks WCAG's 3:1 bar for 24px+/19px-bold display text instead of
 * 4.5:1, which keeps the headline much closer to the customer's actual colour.
 * Returns the accent untouched when it already passes.
 */
export function accentInk(accent, { bg = '#fafafa', large = false, fallback = '#5b6cff' } = {}) {
  const target = large ? 3.0 : 4.5;
  const bgRgb = parseHex(bg) || [250, 250, 250];
  let rgb = parseHex(accent) || parseHex(fallback) || [91, 108, 255];
  if (contrast(rgb, bgRgb) >= target) return toHex(rgb);

  // Walk toward black in 2% steps. 50 steps always reaches black, which is the
  // maximum contrast available against a light background, so this terminates
  // with the best value even for an accent that can never hit the target.
  for (let i = 0; i < 50; i++) {
    rgb = rgb.map((c) => c * 0.98);
    if (contrast(rgb, bgRgb) >= target) break;
  }
  return toHex(rgb);
}
