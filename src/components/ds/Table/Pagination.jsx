const SIZES = [25, 50, 100];

function Arrow({ dir, disabled }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: disabled ? 0.3 : 1 }}>
      <path d={dir === 'prev' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

/** Range readout plus page-size select and prev/next. Sits under any list. */
export function Pagination({
  page = 1,
  pageSize = 25,
  total = 0,
  pageSizes = SIZES,
  onPageChange,
  onPageSizeChange,
  noun = 'record',
  style,
  ...rest
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = (enabled) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
    borderRadius: 'var(--r-1, 7px)', color: 'var(--fg-3, #98a4b2)',
    boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
    cursor: enabled ? 'pointer' : 'not-allowed', background: 'transparent',
    transition: 'background 120ms var(--e-out, ease)',
  });

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        padding: '10px 2px', font: "450 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)', ...style,
      }}
      {...rest}
    >
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {total === 0 ? `No ${noun}s` : <>Showing <b style={{ color: 'var(--fg-2, #bac4d0)', fontWeight: 600 }}>{from}–{to}</b> of <b style={{ color: 'var(--fg-2, #bac4d0)', fontWeight: 600 }}>{total.toLocaleString()}</b> {total === 1 ? noun : `${noun}s`}</>}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {onPageSizeChange && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            Rows
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              style={{
                appearance: 'none', padding: '4px 22px 4px 9px', borderRadius: 'var(--r-1, 7px)',
                background: 'var(--surface-2, #141b24)', color: 'var(--fg-2, #bac4d0)',
                boxShadow: 'inset 0 0 0 1px var(--line, rgba(255,255,255,.07))',
                font: "500 12.5px/1 'Inter', system-ui, sans-serif", cursor: 'pointer',
                backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23828e9f' stroke-width='3' stroke-linecap='round'><path d='m6 9 6 6 6-6'/></svg>\")",
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 7px center',
              }}
            >
              {pageSizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)} style={btn(page > 1)}><Arrow dir="prev" disabled={page <= 1} /></button>
          <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 62, textAlign: 'center' }}>Page {page} / {pages}</span>
          <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPageChange?.(page + 1)} style={btn(page < pages)}><Arrow dir="next" disabled={page >= pages} /></button>
        </div>
      </div>
    </div>
  );
}
