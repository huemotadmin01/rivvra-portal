/**
 * audit-core.js — the contrast measurement, as a string injected into a page.
 *
 * Exported as source text (not imported) because it runs inside the browser
 * under Playwright's evaluate(). Keeping it in one file means the logic that
 * CI enforces is the same logic you can paste into a devtools console.
 *
 * ── Why this does not parse colours with a regex ────────────────────────────
 * Every ad-hoc version of this check I wrote by hand had the same two bugs,
 * and both produced silent WRONG PASSES as readily as false failures:
 *
 *   1. Alpha was ignored. Reading the first non-transparent ancestor
 *      background and treating `rgba(248,113,113,0.13)` as opaque compares a
 *      colour against itself — a real Callout measured 1.00 when it was 5.69.
 *
 *   2. Modern colour formats were mangled. A `[\d.]+` scrape over
 *      `oklab(0.80 -0.16 0.086 / 0.9)` silently DROPS the minus signs and
 *      reads a green as near-black. Tailwind's alpha modifiers emit oklab, so
 *      this hits real elements.
 *
 * Both are fixed by construction here: colours are resolved by the BROWSER via
 * canvas, so any format it can render (oklab, oklch, color(), named, hex,
 * rgb) resolves exactly, and alpha is recovered rather than assumed.
 *
 *   3. Gradient backdrops were treated as absent. A badge with dark ink on a
 *      `bg-gradient-to-br from-rivvra-400` circle has a TRANSPARENT
 *      backgroundColor, so the walk sailed past it to a dark ancestor and
 *      reported 1.16:1 for text that is actually fine. Now any gradient in the
 *      background chain marks the node unmeasurable.
 *
 * The rule throughout: never silently pass, but never cry wolf either. A gate
 * that false-fails is a gate someone switches off.
 */
export const AUDIT_CORE = String.raw`
(() => {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });

  /**
   * Resolve ANY CSS colour string to {r,g,b,a} in sRGB.
   *
   * Painted twice — once over white, once over black. For a source colour C
   * with alpha a:  Cw = a*C + (1-a)*255,  Cb = a*C
   * so  a = 1 - (Cw - Cb)/255  and  C = Cb / a.
   * This asks the engine what it would actually paint, so no format is parsed
   * by hand and none can be misread.
   */
  const RESOLVE_CACHE = new Map();
  function resolve(css) {
    if (RESOLVE_CACHE.has(css)) return RESOLVE_CACHE.get(css);
    let out;
    try {
      const read = (backdrop) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = backdrop;
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';       // reset so an invalid css leaves a known value
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data;
      };
      const w = read('#fff'), b = read('#000');
      let a = 1 - (w[0] - b[0]) / 255;
      if (!(a > 0.0001)) {
        out = { r: 0, g: 0, b: 0, a: 0 };
      } else {
        a = Math.min(1, Math.max(0, a));
        out = { r: b[0] / a, g: b[1] / a, b: b[2] / a, a };
      }
    } catch {
      out = null;
    }
    RESOLVE_CACHE.set(css, out);
    return out;
  }

  const over = (f, b) => ({
    r: f.a * f.r + (1 - f.a) * b.r,
    g: f.a * f.g + (1 - f.a) * b.g,
    b: f.a * f.b + (1 - f.a) * b.b,
    a: 1,
  });

  /**
   * Composite every translucent ancestor background down to the first opaque
   * one. Returns null if a GRADIENT is encountered before an opaque colour —
   * a gradient has no single colour to compare against, and guessing produces
   * exactly the wrong answer: a dark-ink-on-green-gradient badge measured
   * 1.16:1 against an unrelated dark ancestor, because the gradient's own
   * backgroundColor is transparent. Reported as unmeasurable instead.
   */
  function effectiveBg(el) {
    const stack = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = resolve(cs.backgroundColor);
      if (c && c.a > 0) stack.push(c);
      if (c && c.a >= 0.999) break;
      n = n.parentElement;
    }
    // Nothing opaque found: fall back to the canvas/page backdrop.
    let acc = stack.length && stack[stack.length - 1].a >= 0.999
      ? stack[stack.length - 1]
      : (resolve(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 });
    if (acc.a < 0.999) acc = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - (stack[stack.length - 1] === acc ? 2 : 1); i >= 0; i--) acc = over(stack[i], acc);
    return acc;
  }

  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  /** WCAG "large text": >=24px, or >=18.66px when bold. */
  const isLarge = (cs) => {
    const px = parseFloat(cs.fontSize);
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    return px >= 24 || (px >= 18.66 && bold);
  };

  /** Text this method genuinely cannot measure, reported rather than passed. */
  function unmeasurable(el, cs) {
    const clip = cs.webkitBackgroundClip || cs.backgroundClip;
    if (clip === 'text') return 'gradient-text';           // colour is transparent by design
    if (cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color) return 'text-fill-color';
    if (cs.textShadow && cs.textShadow !== 'none') return null; // shadow helps, never hurts
    return null;
  }

  const results = { checked: 0, failures: [], skipped: [] };
  const root = document.body;
  if (!root) return results;

  for (const el of root.querySelectorAll('*')) {
    // Only elements holding their OWN text; a wrapper's colour is inherited
    // and would be counted twice.
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
    if (!own) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (parseFloat(cs.opacity) === 0) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;

    const why = unmeasurable(el, cs);
    if (why) { results.skipped.push({ text: own.slice(0, 60), reason: why }); continue; }

    const fg = resolve(cs.color);
    if (!fg || fg.a === 0) { results.skipped.push({ text: own.slice(0, 60), reason: 'transparent-text' }); continue; }

    const bg = effectiveBg(el);
    if (!bg) { results.skipped.push({ text: own.slice(0, 60), reason: 'gradient-background' }); continue; }
    // Text with its own alpha sits ON its backdrop.
    const painted = fg.a < 0.999 ? over(fg, bg) : fg;

    const need = isLarge(cs) ? 3 : 4.5;
    const r = ratio(painted, bg);
    results.checked++;
    if (r < need - 0.005) {
      results.failures.push({
        text: own.slice(0, 60),
        ratio: Math.round(r * 100) / 100,
        need,
        color: cs.color,
        fontSize: cs.fontSize,
        selector: (el.tagName.toLowerCase() +
          (el.id ? '#' + el.id : '') +
          (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 6).join('.') : '')).slice(0, 160),
      });
    }
  }
  return results;
})()
`;
