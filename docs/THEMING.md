# Theming — how light/dark actually works

Written because the answer surprised us, and because it changes what the
redesign has to finish before dark mode counts as shipped.

---

## The one thing to know

**Light/dark is a property of the v2 shell, not of migrated pages.**

Two facts establish it:

- The theme switch exists in exactly one place: `components/platform/v2/AppBarV2.jsx`.
  The legacy shell has no toggle and is always dark.
- Every one of the ~1,070 rules in `components/platform/v2/legacy-bridge.css`
  is scoped under `.ds-shell`. The bridge remaps the legacy fixed-value
  Tailwind scale (`dark-800`, `text-white`, `text-emerald-400`) onto semantic
  tokens.

Put those together: **turn `uiV2` on and the whole app themes — migrated or
not** — because any legacy page rendered inside the v2 shell has its palette
translated on the way through.

This is why an unmigrated page like `expenses/ExpenseDetail`, 1,323 lines that
this project has never touched, renders correctly in light theme today.

### What follows from it

Migrating a page to `ds/` is a consistency and maintainability decision. It is
**not** what buys you dark mode. The two goals were bundled and are separable:
the theming work is essentially done, while the design-system migration is
roughly a sixth complete and its remaining pages need new archetypes designed
before they can start.

---

## The failure modes the bridge cannot fix by itself

A class-remapping bridge has exactly two blind spots. Both are now closed, and
both are worth recognising if a new one appears.

### 1. Colours set inline

An inline `style` outranks any stylesheet rule short of `!important`, so the
bridge cannot reach it.

`components/ResizableTable.jsx` pinned its sticky columns with a hardcoded
near-black background — a sticky cell must paint something opaque or the
scrolling columns show through it. In light theme those columns stayed black.
On Customer Invoices, the invoice numbers inside them measured a **1.00
contrast ratio**: text exactly the same colour as its background, invisible.

Fixed with a variable-with-fallback: the component reads
`var(--rt-sticky-head, rgb(31 31 35))`, and the bridge defines the variable
under `.ds-shell`. The variable is deliberately **not** defined at `:root`, so
the legacy shell falls through to the original colour and production renders
byte-identically. That pattern is the escape hatch for any future inline
colour.

### 2. An accent that is readable but not readable *enough*

Accent text was originally left unbridged on the theory that "emerald, red,
amber and blue read acceptably in both themes". Measurement disproved it — a
`text-emerald-400` chip on its own tint came in at 1.64:1 — and an earlier pass
remapped accent text by meaning (emerald/green/teal → brand, red/rose → danger,
amber/orange/yellow → warn, blue/sky/cyan/indigo/purple → info).

That got the chips to ~4.35, which is *nearly* the 4.5 floor and easy to
declare done. It wasn't. On paper a 10% tint barely darkens the surface, so an
accent sitting on its own tint has almost no background to contrast against.

Fixed by splitting the role: `--brand-ink` and `--warn-ink` are the colours for
text **on** a soft tint, separate from `--brand`/`--warn`, which remain the
button fill and the active-tab underline where the existing values are already
correct. In dark theme the ink tokens alias the accent — nothing changes.
Danger (5.63) and info (5.77) already cleared the floor and got no override.

| token | light value | on its tint |
|---|---|---|
| `--brand-ink` | `#12652F` | 4.37 → **6.25** |
| `--warn-ink` | `#9A4708` | 4.35 → **5.55** |

Both `ds/Chip` and the bridge's accent-text rules read the ink tokens, so the
one change covers migrated and legacy chips alike.

---

### 3. `opacity-*` on top of an already-correct colour — OPEN

Found during this pass, **not fixed.** The bridge remaps colours; it cannot
remap opacity, and opacity is what fails here.

The statutory report pages carry explanatory copy in `text-[11px] opacity-60`
and similar. The colour underneath is already the right token — the extra
dimming is a habit from the dark theme, where a muted colour on near-black
still had headroom. On paper it does not:

| page | worst | text |
|---|---|---|
| `invoicing/reports/tax` | 2.67 | "Output GST − ITC (books)" |
| `invoicing/reports/tds` | 2.67 | "owed to govt by the 7th" |
| `invoicing/reports/receivables` | 3.17 | "31-60 Days" |
| `invoicing/reports/payables` | 3.17 | "31-60 Days" |
| `invoicing/reports/profitability` | 3.23 | "Total Costs" |

There are **518 `opacity-{40,50,60,70}` occurrences across 192 legacy files**,
so this is not a per-file edit. Two candidate fixes, neither taken here
because both are judgement calls:

- **Raise the floor in the bridge** — e.g. `.ds-shell .opacity-60 { opacity: .82 }`.
  One small block, no page edits. But `opacity` is also used on icons and
  decorative glyphs, so it would lighten those too.
- **Stop using opacity for muted text** and let the `--fg-*` ramp carry it.
  Correct, but it is a real sweep across those 192 files.

Worth noting the failures are concentrated in the tax/GST report explanatory
copy — text added by the July readability pass specifically so people could
understand the numbers.

---

## Auditing

The recipe lives in `REDESIGN-QA.md` (added on the phase-6a group-1 branch).
Four things produce false failures; the last two were found here.

1. **Sampling during the theme cross-fade returns interpolated colours.** It
   reproduced twice doing this work — once reporting a perfectly legible
   sidebar at 1.67, once a 3.04 on a button that settles at 7.11. Let the
   transition finish before you believe a number.
2. **Ancestor visibility.** Use `el.checkVisibility({ checkOpacity: true,
   checkVisibilityCSS: true })`; checking only the element's own
   `display`/`visibility`/`opacity` misses text inside a hidden wrapper.
3. **Disabled controls are WCAG-exempt** but `ds/Button` dims them to
   `opacity: .45`, so a locked primary button reports about 2.2 every time.
4. **Gradients read as transparent.** `getComputedStyle(el).backgroundColor`
   returns `rgba(0,0,0,0)` when the background is a `linear-gradient`, so a
   naive audit composites the text onto whatever is *behind* the element and
   reports nonsense. `ds/Avatar` paints
   `linear-gradient(140deg, var(--brand-hi), var(--brand-lo))` with
   `--brand-fg` text: every avatar on every list page reports a 1.00 ratio and
   every one is fine. Skip any element with a non-`none` `backgroundImage`
   anywhere in its ancestor chain, or resolve it by sampling the rendered
   pixel instead.

A practical note: the naive audit is O(elements × depth) canvas reads and
takes tens of seconds on a 300-element page. Memoising the effective
background per element — each element's is its own background composited over
its parent's — brings a full page to about 40ms.
