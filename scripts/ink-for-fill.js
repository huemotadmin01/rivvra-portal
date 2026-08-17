#!/usr/bin/env node
/* global process */
// eslint.config.js applies globals.browser to every js/jsx file — this is the
// first Node-run script in the repo, so it declares its own globals.
/**
 * Decides the ink for `text-white` sitting on a saturated Tailwind fill, and
 * prints the two selector lists in legacy-bridge.css.
 *
 * Why this exists: `text-white` means two things in the legacy UI — "the
 * bright text tier" (on a dark surface, which the bridge themes) and "the
 * label on a coloured pill" (on a fill that does NOT change with the theme).
 * The second kind needs a fixed ink, and which fixed ink depends on the
 * lightness of that specific fill — not on its colour family. blue-700 and
 * blue-400 want opposite inks.
 *
 * Usage:  node scripts/ink-for-fill.js            # audit fills found in src/
 *         node scripts/ink-for-fill.js --css      # emit the CSS lists
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Tailwind v3 palette, restricted to the families used with text-white. */
const PALETTE = {
  red: { 400: '#F87171', 500: '#EF4444', 600: '#DC2626', 700: '#B91C1C', 900: '#7F1D1D', 950: '#450A0A' },
  blue: { 400: '#60A5FA', 500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8', 950: '#172554' },
  teal: { 400: '#2DD4BF', 500: '#14B8A6', 600: '#0D9488', 700: '#0F766E' },
  emerald: { 400: '#34D399', 500: '#10B981', 600: '#059669', 700: '#047857', 950: '#022C22' },
  green: { 400: '#4ADE80', 500: '#22C55E', 600: '#16A34A', 700: '#15803D' },
  amber: { 400: '#FBBF24', 500: '#F59E0B', 600: '#D97706', 700: '#B45309', 950: '#451A03' },
  orange: { 400: '#FB923C', 500: '#F97316', 600: '#EA580C', 700: '#C2410C' },
  indigo: { 200: '#C7D2FE', 400: '#818CF8', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA' },
  purple: { 400: '#C084FC', 500: '#A855F7', 600: '#9333EA', 700: '#7E22CE' },
  fuchsia: { 400: '#E879F9', 500: '#D946EF', 600: '#C026D3', 700: '#A21CAF', 950: '#4A044E' },
  zinc: { 100: '#F4F4F5', 800: '#27272A', 900: '#18181B' },
};

/** The two candidate inks. Both are literals — see the header comment. */
const LIGHT_INK = '#FFFFFF';
const DARK_INK = '#16191D';
const AA = 4.5;

const parse = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const channel = (x) => {
  const c = x / 255;
  return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
};
const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

function contrast(a, b) {
  const [x, y] = [luminance(parse(a)), luminance(parse(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Every `bg-<family>-<step>` that shares a class attribute with text-white. */
function fillsUsedWithTextWhite(root) {
  const found = new Map();
  const families = Object.keys(PALETTE).join('|');
  const attr = /"[^"]*\btext-white\b[^"]*"|'[^']*\btext-white\b[^']*'/g;
  const fill = new RegExp(`bg-(${families})-(\\d{3})`, 'g');

  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.jsx?$/.test(name)) {
        const src = readFileSync(path, 'utf8');
        for (const [cls] of src.matchAll(attr))
          for (const [, family, step] of cls.matchAll(fill))
            found.set(`${family}-${step}`, (found.get(`${family}-${step}`) || 0) + 1);
      }
    }
  })(root);

  return found;
}

const used = fillsUsedWithTextWhite('src');
const light = [];
const dark = [];
const unknown = [];

for (const [key, count] of [...used].sort()) {
  const [family, step] = key.split('-');
  const hex = PALETTE[family]?.[step];
  if (!hex) { unknown.push(key); continue; }
  const onWhite = contrast(LIGHT_INK, hex);
  const onDark = contrast(DARK_INK, hex);
  (onWhite >= onDark ? light : dark).push({
    key, count, hex, ratio: Math.max(onWhite, onDark), passes: Math.max(onWhite, onDark) >= AA,
  });
}

if (process.argv.includes('--css')) {
  const sel = (rows) => rows.map((r) => `.ds-shell .bg-${r.key}.text-white`).join(',\n');
  console.log(`${sel(light)} { color: ${LIGHT_INK}; }\n`);
  console.log(`${sel(dark)} { color: ${DARK_INK}; }`);
} else {
  const show = (title, rows) => {
    console.log(`\n${title}`);
    for (const r of rows)
      console.log(
        `  ${r.key.padEnd(14)} ${String(r.count).padStart(3)} uses  ` +
        `${r.ratio.toFixed(2).padStart(5)}:1  ${r.passes ? 'ok' : 'BELOW AA'}`,
      );
  };
  show(`white ink (${light.length})`, light);
  show(`near-black ink (${dark.length})`, dark);
  if (unknown.length) show(`not in PALETTE — add them (${unknown.length})`, unknown.map((k) => ({ key: k, count: 0, ratio: 0, passes: false })));

  const failing = [...light, ...dark].filter((r) => !r.passes);
  console.log(`\n${failing.length} fill(s) below AA with either ink${failing.length ? ': ' + failing.map((f) => `${f.key} ${f.ratio.toFixed(2)}`).join(', ') : ''}`);
  process.exitCode = unknown.length ? 1 : 0;
}
