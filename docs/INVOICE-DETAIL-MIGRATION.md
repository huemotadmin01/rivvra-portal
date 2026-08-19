# InvoiceDetail → ds: execution plan

`src/pages/invoicing/InvoiceDetail.jsx` is 5,189 lines — the largest page in the
portal and the one that decides what a customer is billed. It does not fit in a
single working session. This file is the plan, written so the rest is mechanical.

**Branch:** `phase-23/invoice-detail` · **Status:** money layer done, render not.

---

## Done (committed, verified byte-identical)

`src/pages/invoicing/InvoiceDetailV2.jsx` currently holds the head plus two
verified splices and a `return null` marker. It is **not routed** — the route
still renders legacy `InvoiceDetail`, so nothing is user-reachable.

| slice | legacy lines | count |
|---|---|---|
| helpers | 33–111 | 79 |
| data + money layer | 703–1971 | 1,269 |

Helpers covered: `formatDate`, `formatFileSize`, `STATUS_STEPS`, `getStepIndex`,
`getInvoiceTypeLabel`, `listUrlForDoc`, `GST_TREATMENTS`, `CURRENCIES`,
`useDebounce`.

## Remaining

| piece | legacy lines | count |
|---|---|---|
| post-guard derivations (splice verbatim) | 2002–2100 | 99 |
| main render (rewrite) | 2102–3736 | 1,635 |
| 17 sub-components (splice logic, rewrite render) | 3737–5189 | 1,453 |

---

## The money checklist

Every one of these must survive byte-identical. This is the whole risk surface.

### Already spliced (verify still present after assembly)

- `localTotals` — the four `Math.round(x * 100) / 100` returns
- inclusive tax: `taxTotal += lineSubtotal - (lineSubtotal / (1 + tax.rate / 100));`
- exclusive tax: `taxTotal += lineSubtotal * (tax.rate / 100);`
- line subtotal: `const lineSubtotal = qty * price * (1 - discPct / 100);`
- discount reduce: `return s + qty * price * (discPct / 100);`
- unit price 6dp, both sites: `Math.round(rate * 1000000) / 1000000`
- `buildTaxBreakdown`'s rate-weight sum: `const totalRate = entries.reduce((s, e) => s + e.rate, 0);`

### Still to carry across — render-resident

These live *inside* the JSX. Splicing above `return (` would lose all of them.

| legacy line | expression |
|---|---|
| 2006 | `const amountDue = invoice.amountDue ?? invoice.total ?? 0;` |
| 2951 | `const lineTotal = li.subtotal ?? li.amount ?? ((li.quantity \|\| 0) * (li.unitPrice \|\| 0) * (1 - (Number(li.discount) \|\| 0) / 100));` |
| 3038 | same shape, **no** `li.amount` fallback |
| 3088 | same as 3038 |
| 3139 | `const lineTotal = li.total ?? li.subtotal ?? ((li.quantity \|\| 0) * (li.unitPrice \|\| 0));` — **no discount term** |
| 3203–3205 | `taxTotalFallback` |
| 3258–3263 | Net Payable: `invoice.netPayable != null ? invoice.netPayable : ((isDraft ? localTotals.total : invoice.total) - (invoice.tdsAmount \|\| 0))` |
| 2997 | FX line: `{li.originalCurrency} {Number(li.originalAmount).toLocaleString()} @ {Number(li.conversionRate).toFixed(2)}` |
| 3746 | `InlineLineRow`'s own `lineTotal` |

The four `lineTotal` variants are **not interchangeable** — they differ in
fallback chain and whether discount applies. Copy each to its own table.

### Still to carry across — modal money

| legacy line | expression |
|---|---|
| 4100–4101 | TDS: `Math.round((Number(tdsBase) \|\| 0) * tdsRate) / 100`, then `Math.round(computed * 100) / 100` |
| 4109 | `Math.max(0, Math.round(((Number(amountDue) \|\| 0) - tdsAmount) * 100) / 100)` |
| 4211 | `RecordPaymentModal` remaining |
| 4515 | `EmployeeBillRecordPaymentModal` remaining |

---

## Sub-component inventory (legacy 3737–5189)

| component | line | notes |
|---|---|---|
| `InlineLineRow` | 3737 | own `lineTotal`; the editable line row |
| `FormField` | 4006 | trivial |
| `ActionBtn` | 4019 | → ds `Button`; carries legacy's unused-`Icon` lint |
| `RecordPaymentModal` | 4042 | **money** — TDS + remaining |
| `EmployeeBillRecordPaymentModal` | 4470 | **money** — remaining |
| `EmailInvoiceModal` | 4813 | |
| `CreditNoteModal` | 4916 | carries unused-`invoiceNumber` lint |
| `ConfirmModal` | 4982 | → ds `ConfirmDialog` |
| `CancelEInvoiceModal` | 5035 | + `E_INVOICE_CANCEL_REASONS` at 5028 |
| `GstHoldModal` | 5117 | |
| `ModalOverlay` | 5178 | → ds `Modal` |

Inline editors near the top, already inside the helper region or just after:
`EditableField` (113), `ContactLookup` (237), `ProductSearch` (345),
`TaxMultiSelect` (450), `EmployeeSearch` (549).

---

## Lint baseline

Legacy: **13 problems** (10 errors, 3 warnings). Two are React Compiler
diagnostics that must come across with the code that causes them and must not
be silenced:

- `98:3  Cannot access refs during render` — inside `useDebounce`
- `118:21 Calling setState synchronously within an effect can trigger cascading renders`

The unused-var errors on the current WIP file are an artefact of having no
render — every symbol the render will consume reads as unused today. They
resolve when the render lands; they are not new problems.

---

## Verification before shipping

1. Assemble, then re-diff **every** slice above.
2. Re-run the money checklist — each expression present exactly once.
3. `npx esbuild --jsx=automatic <file> --outfile=/dev/null` before lint; a
   bad slice boundary shows up as "Unexpected end of file", and a hand-rolled
   bracket counter cannot find it (regex literals defeat it). Bisect with the
   real parser.
4. Wire `PageSwitch`, build.
5. **Money parity against legacy**: pin the route at the legacy component
   (`<ErrorBoundary><InvoiceDetail /></ErrorBoundary>`), capture Taxable Value /
   each tax row / Discount / Total / TDS / Net Payable / Amount Paid / Amount
   Due, then restore `PageSwitch` and capture the same. They must match to the
   digit. Do this on **three** invoices: a draft, a posted customer invoice with
   tax, and a vendor bill with TDS.
6. Contrast audit, both themes, with the totals panel and at least one modal open.
7. Never trigger: post, send, email, record payment, credit note, delete,
   archive, e-invoice generate/cancel, GST hold. Arm the blocking `fetch`
   interceptor before the page loads.
