const MARKS = {
  outreach: s => (
    <>
      <circle cx="18" cy="46" r="7" fill="currentColor" />
      <path d="M27 38q9-9 20-11" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".95" />
      <path d="M29 31q13-11 26-9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".6" />
      <path d="M31 24q15-13 30-7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".3" />
    </>
  ),
  timesheet: s => (
    <>
      <rect x="9" y="14" width="46" height="9" rx="4" fill="currentColor" opacity=".32" />
      <rect x="9" y="27" width="32" height="9" rx="4" fill="currentColor" opacity=".62" />
      <rect x="9" y="40" width="40" height="9" rx="4" fill="currentColor" />
      <circle cx="51" cy="44.5" r="7" stroke="currentColor" strokeWidth="2.5" />
    </>
  ),
  crm: s => (
    <>
      {[0, 1, 2, 3].map(i => (
        <rect key={i} x={9 + i * 5} y={13 + i * 8} width={46 - i * 10} height="6" rx="3" fill="currentColor" opacity={1 - i * 0.19} />
      ))}
      <circle cx="32" cy="51" r="4.5" fill="currentColor" />
    </>
  ),
  ats: s => (
    <>
      <circle cx="22" cy="24" r="10" fill="currentColor" opacity=".42" />
      <circle cx="42" cy="24" r="10" fill="currentColor" opacity=".85" />
      <path d="M9 53q13-17 23-17t23 17z" fill="currentColor" />
    </>
  ),
  payroll: s => (
    <>
      <rect x="7" y="24" width="47" height="21" rx="4" fill="currentColor" opacity=".3" />
      <rect x="11" y="19" width="47" height="21" rx="4" fill="currentColor" opacity=".58" />
      <rect x="15" y="14" width="43" height="21" rx="4" fill="currentColor" />
    </>
  ),
  employee: s => (
    <>
      {[[14, 14], [33, 14], [52, 14], [14, 33], [33, 33], [14, 52], [33, 52]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6.5" fill="currentColor" opacity={i === 2 ? 0.28 : 0.68} />
      ))}
      <rect x="45" y="45" width="14" height="14" rx="5" fill="currentColor" />
    </>
  ),
  contacts: s => (
    <>
      <rect x="9" y="13" width="46" height="38" rx="7" fill="currentColor" opacity=".14" />
      <rect x="9" y="13" width="46" height="38" rx="7" stroke="currentColor" strokeWidth="2" opacity=".55" />
      <circle cx="23" cy="28" r="5.5" fill="currentColor" />
      <rect x="33" y="24" width="15" height="3" rx="1.5" fill="currentColor" />
      <rect x="33" y="30" width="11" height="3" rx="1.5" fill="currentColor" opacity=".55" />
      <rect x="14" y="40" width="36" height="3" rx="1.5" fill="currentColor" opacity=".38" />
    </>
  ),
  sign: s => (
    <>
      <path d="M8 41q6-17 16-11 6 4 0 13-4 6 4 4 12-2 22-19" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="51" cy="28" r="3.5" fill="currentColor" />
      <rect x="20" y="51" width="30" height="3" rx="1.5" fill="currentColor" opacity=".38" />
    </>
  ),
  todo: s => (
    <>
      <rect x="9" y="12" width="15" height="15" rx="5" fill="currentColor" />
      <rect x="30" y="15" width="25" height="4" rx="2" fill="currentColor" opacity=".32" />
      <rect x="30" y="22" width="18" height="4" rx="2" fill="currentColor" opacity=".32" />
      <rect x="9" y="35" width="15" height="15" rx="5" stroke="currentColor" strokeWidth="2.5" />
      <rect x="30" y="38" width="22" height="4" rx="2" fill="currentColor" opacity=".55" />
      <rect x="30" y="45" width="13" height="4" rx="2" fill="currentColor" opacity=".55" />
    </>
  ),
  invoicing: s => (
    <>
      <rect x="13" y="9" width="38" height="46" rx="6" fill="currentColor" opacity=".14" />
      <rect x="13" y="9" width="38" height="46" rx="6" stroke="currentColor" strokeWidth="2" opacity=".5" />
      <path d="M13 15a6 6 0 016-6h26a6 6 0 016 6v3H13z" fill="currentColor" />
      <rect x="20" y="26" width="18" height="3.5" rx="1.75" fill="currentColor" opacity=".68" />
      <rect x="20" y="34" width="24" height="3.5" rx="1.75" fill="currentColor" opacity=".4" />
      <rect x="20" y="44" width="13" height="4.5" rx="2" fill="currentColor" />
    </>
  ),
  incentive: s => (
    <>
      {[0, 1, 2, 3, 4, 5].map(i => {
        const a = ((i * 60 - 90) * Math.PI) / 180;
        return <line key={i} x1={32 + Math.cos(a) * 17} y1={32 + Math.sin(a) * 17} x2={32 + Math.cos(a) * 27} y2={32 + Math.sin(a) * 27} stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".5" />;
      })}
      <circle cx="32" cy="32" r="14" fill="currentColor" />
    </>
  ),
  kb: s => (
    <>
      <path d="M8 18a4 4 0 014-4h19v38H12a4 4 0 01-4-4z" fill="currentColor" opacity=".34" />
      <path d="M56 18a4 4 0 00-4-4H33v38h19a4 4 0 004-4z" fill="currentColor" opacity=".72" />
      <rect x="14" y="23" width="12" height="2.5" rx="1.25" fill="currentColor" opacity=".8" />
      <rect x="14" y="29" width="9" height="2.5" rx="1.25" fill="currentColor" opacity=".5" />
    </>
  ),
  settings: s => (
    <>
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
        const a = (i * 45 * Math.PI) / 180;
        const x = 32 + Math.cos(a) * 22, y = 32 + Math.sin(a) * 22;
        return <rect key={i} x={x - 3.2} y={y - 3.2} width="6.4" height="6.4" rx="2" fill="currentColor" opacity=".5" transform={`rotate(${i * 45} ${x} ${y})`} />;
      })}
      <circle cx="32" cy="32" r="13.5" stroke="currentColor" strokeWidth="3" />
      <circle cx="32" cy="32" r="5" fill="currentColor" />
    </>
  ),
};

function fallback() {
  const out = [];
  [16, 27, 38, 49].forEach(y => [16, 27, 38, 49].forEach(x => {
    out.push(<circle key={`${x}-${y}`} cx={x} cy={y} r="3.2" fill="currentColor" opacity={(x + y) % 22 === 0 ? 0.95 : 0.36} />);
  }));
  return out;
}

/** App identity marks. Draw in currentColor, so they inherit the app accent and adapt to theme. */
export function BrandMark({ id, size = 32, color, style, ...rest }) {
  const draw = MARKS[id];
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', color, ...style }}
      {...rest}
    >
      {draw ? draw(size) : fallback()}
    </svg>
  );
}

export const BRAND_MARK_IDS = Object.keys(MARKS);
