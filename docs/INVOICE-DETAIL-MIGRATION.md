# InvoiceDetail → ds: execution record

`src/pages/invoicing/InvoiceDetail.jsx` is 5,189 lines — the largest page in the
portal and the one that decides what a customer is billed. This file was the
plan; it is now the record of how it was done and what was verified.

**Status: DONE.** `InvoiceDetailV2.jsx` (4,977 lines) is routed behind
`PageSwitch`.

---

## How it was assembled

Not hand-written. `scratchpad/id-assemble.py` concatenates the legacy file's
line ranges with written render chunks, and prints a manifest mapping every
splice to its position in the output. The manifest is what the verification step
diffs back, so "byte-identical" is a checked claim rather than a careful intent.

**19 verbatim slices, 2,051 spliced lines, 0 mismatches.**

| slice | legacy | lines |
|---|---|---|
| helpers | 33–109 | 77 |
| `EditableField` logic | 113–145 | 33 |
| `ContactLookup` logic | 237–284 | 48 |
| `ProductSearch` logic | 345–403 | 59 |
| `TaxMultiSelect` logic | 450–497 | 48 |
| `EmployeeSearch` logic | 549–628 | 80 |
| **main data + money layer** | 703–1971 | **1,269** |
| main derivations | 2002–2100 | 99 |
| `InlineLineRow` sig + `lineTotal` | 3737–3746 | 10 |
| `InlineLineRow` handlers | 3750–3768 | 19 |
| `RecordPaymentModal` state | 4042–4058 | 17 |
| **`RecordPaymentModal` money** | 4063–4211 | **149** |
| `EmployeeBillRecordPaymentModal` state | 4470–4489 | 20 |
| `EmployeeBillRecordPaymentModal` money | 4494–4561 | 68 |
| `EmailInvoiceModal` state / submit | 4813–4819, 4824–4843 | 27 |
| `CreditNoteModal` state / submit | 4916–4921, 4926–4941 | 22 |
| `E_INVOICE_CANCEL_REASONS` | 5028–5033 | 6 |

Rewritten: the render of every component above, the loading/error guard
(legacy 1972–2001), plus `FormField`, `ActionBtn`, `CancelEInvoiceModal`,
`GstHoldModal`. `ConfirmModal` and `ModalOverlay` are **deleted** — ds
`ConfirmDialog` and `Modal` replace them.

## The money checklist

26 expressions, each asserted by exact string count on both sides. All present
exactly as often in V2 as in legacy. The four `lineTotal` variants are not
interchangeable and were each copied to its own table:

| branch | expression |
|---|---|
| EMPBI | `li.subtotal ?? li.amount ?? (qty * price * (1 - disc/100))` |
| vendor bill | `li.subtotal ?? (qty * price * (1 - disc/100))` |
| customer invoice | `li.subtotal ?? (qty * price * (1 - disc/100))` |
| draft fallback | `li.total ?? li.subtotal ?? (qty * price)` — **no discount term** |

One check reads 2 in legacy and 3 in V2: `Math.round(rate * 1000000) / 1000000`.
The third occurrence is the docblock at the top of the new file quoting it. Both
real call sites are inside the verified main slice.

## Lint

Legacy **13 problems (10 errors, 3 warnings)**. V2 **13 problems (10 errors,
3 warnings)** — the same set, at the shifted line numbers, including the two
React Compiler diagnostics that must travel with the code that causes them:

- `Cannot access refs during render` — inside `useDebounce`
- `Calling setState synchronously within an effect` — `EditableField`'s
  value-sync effect

Neither is silenced.

## Money parity against legacy

The route was pinned at the legacy component, the same five documents loaded,
and the totals panel captured on both sides.

| document | result |
|---|---|
| `INV/26-27/07/0001` — posted, IGST 18% | **identical** |
| `BILL/26-27/07/0002` — vendor bill, GST 18%, fully paid | **identical** |
| `EMPBI/26-27/07/0005` — employee bill | **identical** |
| `EZ/26-27/07/0001` — posted, no tax | **identical** |
| draft | **identical** |

Character-for-character, including the ₹ lakh grouping.

### The draft was driven, not just read

A static totals panel on a posted invoice reads from `invoice.total` — it does
not exercise `localTotals` at all. So the draft's line was typed into on both
sides with the same input and the results compared:

| | V2 | legacy |
|---|---|---|
| qty 3 × rate ₹12,345.67 → line amount | ₹37,037.01 | ₹37,037.01 |
| Taxable Value | ₹37,037.01 | ₹37,037.01 |
| IGST 18% (`buildTaxBreakdown`) | ₹6,666.66 | ₹6,666.66 |
| Total | ₹43,703.67 | ₹43,703.67 |

Every resulting `PUT` was rejected by the interceptor. The draft was re-read
from the API afterwards: qty 1, unit price 0, no taxes, totals 0 — unchanged.

### TDS was driven too

In `RecordPaymentModal` on the ₹2,35,905.60 invoice, toggling TDS and picking
194J @ 10% produced base 199920 → TDS 19992 → net 215913.6, and a summary of
Due ₹2,35,905.60 / TDS Credit −₹19,992.00 / Payment Received −₹2,15,913.60 /
Remaining ₹0.00. Nothing was submitted.

## Not verifiable on this data

Staging holds **no invoice with a TDS amount, no draft with a non-zero stored
total, and no invoice with a discount**. So the totals panel's **TDS / Net
Payable rows and the Discount row never rendered**. Byte-identity and the
string-count assertions are the guarantee there — stated plainly rather than
implied by a passing screenshot.

## Contrast

Four document types × two themes, plus `RecordPaymentModal` (with the TDS block
expanded), `CreditNoteModal` and `GstHoldModal`: **0 failures**, 94–180 nodes
per page.

Two runs reported failures that were not real, and both are worth keeping:

1. **The colour-space bug — a harness defect, now fixed.** The audit reported
   the `ActivityPanel` "Changes" chip at 4.29. Measuring by hand off a canvas
   gave **5.27**. `parseColor` canvas-round-tripped `rgb`/`color`/`oklch` but
   *not* `oklab`, which is what Chrome computes a Tailwind `bg-sky-500/15` to;
   the numeric fallback read L/a/b as R/G/B and the `[\d.]+` regex silently
   dropped the minus signs, fabricating a plausible grey background. It now
   paints every colour through the canvas. **A fabricated background is worse
   than no measurement, because it reads like a finding.**
2. **The theme cross-fade, for the fifth time.** A dark run reported 25 failures,
   all sidebar nav items, all at exactly 1.67. A screenshot showed them plainly
   legible. Settled, re-ran: 0. The signature is an identical failure count on
   every page in the sweep — that means shell chrome caught mid-transition, not
   a page defect.

## ds change this required

`Input`, `Select` and `Textarea` now `forwardRef`. `EditableField` focuses and
selects the control the moment it opens; without a real DOM handle, click-to-edit
puts the caret nowhere. `.d.ts` declarations updated to
`ForwardRefExoticComponent`. Three other v2 pages re-checked after the change.

## Not triggered

Post, send, email, record payment, credit note, delete, archive, e-invoice
generate/cancel, GST hold. A blocking `fetch`/XHR interceptor was armed for the
session; the only writes it caught were the five auto-saves from driving the
draft, and the draft was verified unchanged afterwards.

**One thing to know about the interceptor:** it did not survive a Vite full
reload triggered mid-session by editing `App.jsx`. It was caught by checking
`window.__armed` before the next interactive step, and re-armed. Check the flag,
do not assume it.
