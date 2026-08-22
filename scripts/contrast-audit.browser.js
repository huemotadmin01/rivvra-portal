/**
 * Contrast audit, injected into the page. Returns every text node whose ink
 * fails WCAG AA against its COMPOSITED background.
 *
 * The value of this thing is entirely in what it refuses to report. Six
 * false-failure modes were found the hard way over this migration; each is
 * guarded below and labelled with the shape of the bug it was hiding.
 *
 *   window.__contrastAudit()        -> { checked, failCount, fails, skipped }
 */
window.__contrastAudit = function contrastAudit({ threshold = 4.5, largeThreshold = 3.0 } = {}) {
  /**
   * Resolve any CSS colour to sRGB by painting it.
   *
   * FALSE-FAILURE #7 — the colour space one. This used to canvas-round-trip
   * only `rgb`/`color`/`oklch` and fall through to a numeric regex otherwise.
   * Chrome hands back `oklab(0.685 -0.0912 -0.1422 / 0.15)` for a Tailwind
   * `bg-sky-500/15`, the regex `[\d.]+` silently dropped the minus signs and
   * read L/a/b as R/G/B — a near-black at 15%. Every such background composited
   * to a plausible-looking grey and the node was reported as failing when the
   * real ratio was a pass (measured 4.29 reported vs 5.27 actual on the
   * ActivityPanel "Changes" chip). A fabricated background is worse than no
   * measurement, because it reads like a finding. Paint everything.
   */
  const parseColor = (s) => {
    if (!s || s === 'none') return null;
    const ctx = contrastAudit._ctx || (contrastAudit._ctx =
      document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
    // fillStyle silently keeps its previous value when handed something it
    // cannot parse, so seed a sentinel and check the assignment actually took.
    ctx.fillStyle = '#000000';
    ctx.fillStyle = s;
    const took = ctx.fillStyle;
    ctx.fillStyle = '#ffffff';
    ctx.fillStyle = s;
    if (ctx.fillStyle !== took) return null; // unparseable in both directions
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };

  const channel = (x) => {
    const c = x / 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  };
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  const ratio = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  /** Composite every ancestor background down to an opaque colour. */
  function backgroundOf(el) {
    let acc = null;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      // GUARD 4 — a gradient ancestor has no single colour to measure against.
      // Reporting these produced a run of "failures" on cards that were fine.
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { gradient: true };
      const c = parseColor(cs.backgroundColor);
      if (!c || c[3] === 0) continue;
      acc = acc === null ? c : [...over(acc, c), Math.min(1, acc[3] + c[3])];
      if (acc[3] >= 0.999) return { color: acc.slice(0, 3) };
    }
    const page = parseColor(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
    return { color: acc ? over(acc, page) : page.slice(0, 3) };
  }

  const fails = [];
  const skipped = { hidden: 0, disabled: 0, gradient: 0, empty: 0 };
  let checked = 0;

  for (const el of document.querySelectorAll('body *')) {
    // Only leaf-ish text: the node that actually paints the glyphs.
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
    if (!text) { skipped.empty++; continue; }

    // GUARD 1 — <style>/<script> text lands in textContent. Keyframe stops
    // ("0%", "50%", "100%") were being reported as failing text.
    if (/^(STYLE|SCRIPT|TITLE|NOSCRIPT)$/.test(el.tagName)) { skipped.empty++; continue; }

    const cs = getComputedStyle(el);

    // GUARD 2 — ancestor visibility. An element inside a closed dropdown or an
    // unmounted tab panel computes styles that are never painted.
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) { skipped.hidden++; continue; }
    if (!el.getClientRects().length) { skipped.hidden++; continue; }

    // GUARD 3 — disabled controls are exempt from AA by spec.
    if (el.closest('[disabled],[aria-disabled="true"]')) { skipped.disabled++; continue; }

    // GUARD 6 — SVG paints with `fill`, not `color`. Auditing `color` on SVG
    // text meant every chart label in the app went unchecked for months.
    const isSvg = el.ownerSVGElement || el.tagName === 'text' || el.tagName === 'tspan';
    const inkSource = isSvg ? (cs.fill && cs.fill !== 'none' ? cs.fill : cs.color) : cs.color;
    const ink = parseColor(inkSource);
    if (!ink || ink[3] === 0) { skipped.hidden++; continue; }

    const bg = backgroundOf(el);
    if (bg.gradient) { skipped.gradient++; continue; }

    const size = parseFloat(cs.fontSize);
    const bold = +cs.fontWeight >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? largeThreshold : threshold;

    const r = ratio(over(ink, bg.color), bg.color);
    checked++;
    if (r < need) {
      fails.push({
        t: text.slice(0, 40),
        r: +r.toFixed(2),
        need,
        px: +size.toFixed(1),
        ink: inkSource,
        bg: `rgb(${bg.color.map(Math.round).join(',')})`,
        cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 60),
      });
    }
  }

  return { checked, failCount: fails.length, fails, skipped };
};
'ready';
