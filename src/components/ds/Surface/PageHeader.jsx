/** Page title block: heading + optional sub-line on the left, actions on
 *  the right. The standard top of every list, config and detail page. */
export function PageHeader({ title, sub, actions, style, ...rest }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap', marginBottom: 16, ...style,
      }}
      {...rest}
    >
      <div style={{ minWidth: 0 }}>
        <h1 style={{ font: "var(--t-title, 650 22px/1.2 'Inter', system-ui, sans-serif)", color: 'var(--fg, #eef2f6)', letterSpacing: '-0.015em' }}>
          {title}
        </h1>
        {sub && (
          <p style={{ font: "450 13px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-4, #828e9f)', marginTop: 4 }}>
            {sub}
          </p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}
