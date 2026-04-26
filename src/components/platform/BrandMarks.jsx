import React from 'react';

const Wrap = ({ size = 56, children }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block' }} aria-hidden="true">{children}</svg>
);

const MarkOutreach = ({ size }) => (
  <Wrap size={size}>
    <circle cx="20" cy="44" r="6" fill="#4ade80" />
    <path d="M28 36 q8 -8 18 -10" stroke="#4ade80" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.9" />
    <path d="M30 30 q12 -10 24 -8" stroke="#4ade80" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.6" />
    <path d="M32 24 q14 -12 28 -6" stroke="#4ade80" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.3" />
  </Wrap>
);
const MarkTimesheet = ({ size }) => (
  <Wrap size={size}>
    <rect x="10" y="14" width="44" height="8" rx="3" fill="#60a5fa" opacity="0.35" />
    <rect x="10" y="26" width="32" height="8" rx="3" fill="#60a5fa" opacity="0.65" />
    <rect x="10" y="38" width="40" height="8" rx="3" fill="#60a5fa" />
    <circle cx="50" cy="42" r="6" fill="#1d4ed8" stroke="#60a5fa" strokeWidth="2" />
  </Wrap>
);
const MarkCRM = ({ size }) => (
  <Wrap size={size}>
    {[0,1,2,3].map((i) => (<rect key={i} x={10 + i*4} y={14 + i*4} width={44 - i*8} height="6" rx="3" fill="#34d399" opacity={1 - i*0.18} />))}
    <circle cx="32" cy="50" r="4" fill="#34d399" />
  </Wrap>
);
const MarkATS = ({ size }) => (
  <Wrap size={size}>
    <circle cx="22" cy="26" r="10" fill="#c084fc" opacity="0.45" />
    <circle cx="42" cy="26" r="10" fill="#c084fc" opacity="0.85" />
    <path d="M10 52 q12 -16 22 -16 q10 0 22 16" fill="#c084fc" />
  </Wrap>
);
const MarkPayroll = ({ size }) => (
  <Wrap size={size}>
    <rect x="8" y="22" width="48" height="22" rx="3" fill="#fbbf24" opacity="0.35" />
    <rect x="12" y="18" width="48" height="22" rx="3" fill="#fbbf24" opacity="0.65" />
    <rect x="16" y="14" width="44" height="22" rx="3" fill="#fbbf24" />
    <circle cx="38" cy="25" r="5" fill="none" stroke="#92400e" strokeWidth="2" />
    <text x="38" y="28.5" textAnchor="middle" fontSize="7" fontWeight="800" fill="#92400e">$</text>
  </Wrap>
);
const MarkEmployee = ({ size }) => (
  <Wrap size={size}>
    {[[14,14],[34,14],[54,14],[14,34],[34,34],[14,54],[34,54]].map(([x,y],i) => (<circle key={i} cx={x} cy={y} r="6" fill="#fb923c" opacity={i===2?0.3:0.7} />))}
    <rect x="46" y="42" width="14" height="14" rx="4" fill="#fb923c" />
    <path d="M50 49 l3 3 5 -6" stroke="#020617" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Wrap>
);
const MarkContacts = ({ size }) => (
  <Wrap size={size}>
    <rect x="10" y="14" width="44" height="36" rx="6" fill="#22d3ee" opacity="0.18" stroke="#22d3ee" strokeWidth="1.5" />
    <circle cx="22" cy="28" r="5" fill="#22d3ee" />
    <rect x="32" y="24" width="16" height="3" rx="1.5" fill="#22d3ee" />
    <rect x="32" y="30" width="12" height="3" rx="1.5" fill="#22d3ee" opacity="0.6" />
    <rect x="14" y="40" width="36" height="3" rx="1.5" fill="#22d3ee" opacity="0.4" />
    <path d="M44 14 v10 l4 -3 4 3 v-10" fill="#0e7490" />
  </Wrap>
);
const MarkSign = ({ size }) => (
  <Wrap size={size}>
    <path d="M8 42 q6 -16 16 -10 q6 4 0 12 q-4 6 4 4 q12 -2 22 -18" stroke="#818cf8" strokeWidth="4" fill="none" strokeLinecap="round" />
    <circle cx="50" cy="30" r="3" fill="#818cf8" />
    <path d="M48 50 h12" stroke="#818cf8" strokeWidth="2" opacity="0.5" />
  </Wrap>
);
const MarkTodo = ({ size }) => (
  <Wrap size={size}>
    <rect x="10" y="12" width="14" height="14" rx="4" fill="#2dd4bf" />
    <path d="M14 19 l3 3 5 -6" stroke="#020617" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="28" y="14" width="26" height="4" rx="2" fill="#2dd4bf" opacity="0.35" />
    <rect x="28" y="22" width="20" height="4" rx="2" fill="#2dd4bf" opacity="0.35" />
    <rect x="10" y="32" width="14" height="14" rx="4" fill="none" stroke="#2dd4bf" strokeWidth="2" />
    <rect x="28" y="34" width="22" height="4" rx="2" fill="#2dd4bf" opacity="0.55" />
    <rect x="28" y="42" width="14" height="4" rx="2" fill="#2dd4bf" opacity="0.55" />
  </Wrap>
);

// ── NEW MARKS ──────────────────────────────────────────────────────────────
// Invoicing — invoice document with line items + accent strip
const MarkInvoicing = ({ size }) => (
  <Wrap size={size}>
    <rect x="14" y="10" width="36" height="44" rx="3" fill="#f472b6" opacity="0.18" stroke="#f472b6" strokeWidth="1.5" />
    <rect x="14" y="10" width="36" height="6" fill="#f472b6" />
    <rect x="20" y="22" width="20" height="3" rx="1.5" fill="#f472b6" opacity="0.7" />
    <rect x="20" y="29" width="24" height="3" rx="1.5" fill="#f472b6" opacity="0.45" />
    <rect x="20" y="36" width="16" height="3" rx="1.5" fill="#f472b6" opacity="0.45" />
    <rect x="20" y="46" width="14" height="4" rx="1.5" fill="#f472b6" />
    <text x="42" y="50" fontSize="6" fontWeight="800" fill="#f472b6">$</text>
  </Wrap>
);
// Expenses — receipt with zigzag bottom + circle stamp
const MarkExpenses = ({ size }) => (
  <Wrap size={size}>
    <path d="M14 8 h36 v40 l-4 4 -4 -4 -4 4 -4 -4 -4 4 -4 -4 -4 4 -4 -4 -4 4 z" fill="#f87171" opacity="0.25" stroke="#f87171" strokeWidth="1.5" />
    <rect x="20" y="18" width="22" height="3" rx="1.5" fill="#f87171" opacity="0.8" />
    <rect x="20" y="25" width="16" height="3" rx="1.5" fill="#f87171" opacity="0.5" />
    <rect x="20" y="32" width="20" height="3" rx="1.5" fill="#f87171" opacity="0.5" />
    <circle cx="44" cy="38" r="6" fill="#f87171" />
    <text x="44" y="41" textAnchor="middle" fontSize="7" fontWeight="800" fill="#0a0f0d">✓</text>
  </Wrap>
);
// Incentive — trophy / award medal with rays
const MarkIncentive = ({ size }) => (
  <Wrap size={size}>
    {[0,1,2,3,4,5].map((i) => {
      const a = (i * 60 - 90) * Math.PI / 180;
      const x1 = 32 + Math.cos(a) * 16, y1 = 32 + Math.sin(a) * 16;
      const x2 = 32 + Math.cos(a) * 26, y2 = 32 + Math.sin(a) * 26;
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />;
    })}
    <circle cx="32" cy="32" r="14" fill="#facc15" />
    <path d="M28 30 l4 4 6 -8" stroke="#0a0f0d" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Wrap>
);
// Knowledge Base — open book with bookmark
const MarkKnowledgeBase = ({ size }) => (
  <Wrap size={size}>
    <path d="M10 16 h20 v36 h-20 a4 4 0 0 1 -4 -4 v-28 a4 4 0 0 1 4 -4 z" fill="#a78bfa" opacity="0.35" />
    <path d="M54 16 h-20 v36 h20 a4 4 0 0 0 4 -4 v-28 a4 4 0 0 0 -4 -4 z" fill="#a78bfa" opacity="0.7" />
    <rect x="14" y="22" width="14" height="2.5" rx="1" fill="#a78bfa" />
    <rect x="14" y="28" width="11" height="2.5" rx="1" fill="#a78bfa" opacity="0.7" />
    <rect x="14" y="34" width="13" height="2.5" rx="1" fill="#a78bfa" opacity="0.7" />
    <rect x="36" y="22" width="14" height="2.5" rx="1" fill="#0a0f0d" opacity="0.4" />
    <rect x="36" y="28" width="11" height="2.5" rx="1" fill="#0a0f0d" opacity="0.3" />
    <path d="M40 8 v18 l4 -3 4 3 v-18 z" fill="#7c3aed" />
  </Wrap>
);
// Settings — concentric gear-like rings with center dot
const MarkSettings = ({ size }) => (
  <Wrap size={size}>
    {[0,1,2,3,4,5,6,7].map((i) => {
      const a = (i * 45) * Math.PI / 180;
      const x = 32 + Math.cos(a) * 22, y = 32 + Math.sin(a) * 22;
      return <rect key={i} x={x - 3} y={y - 3} width="6" height="6" rx="1.5" fill="#94a3b8" opacity="0.55" transform={`rotate(${i * 45} ${x} ${y})`} />;
    })}
    <circle cx="32" cy="32" r="14" fill="none" stroke="#94a3b8" strokeWidth="2.5" />
    <circle cx="32" cy="32" r="5" fill="#94a3b8" />
  </Wrap>
);

const MarkFallback = ({ size }) => (
  <Wrap size={size}>
    {[14,26,38,50].map((y) => [14,26,38,50].map((x) => (
      <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="currentColor" opacity={(x+y)%12===0?1:0.4} />
    )))}
  </Wrap>
);

const REGISTRY = {
  outreach: MarkOutreach, timesheet: MarkTimesheet, crm: MarkCRM, ats: MarkATS,
  payroll: MarkPayroll, employee: MarkEmployee, contacts: MarkContacts,
  sign: MarkSign, todo: MarkTodo,
  invoicing: MarkInvoicing, expenses: MarkExpenses, incentive: MarkIncentive,
  kb: MarkKnowledgeBase, knowledge_base: MarkKnowledgeBase, knowledgebase: MarkKnowledgeBase,
  settings: MarkSettings,
};

export default function BrandMark({ appId, size = 56, color }) {
  const Comp = REGISTRY[appId] || MarkFallback;
  if (Comp === MarkFallback && color) {
    return <span style={{ color, display: 'inline-block', lineHeight: 0 }}><Comp size={size} /></span>;
  }
  return <Comp size={size} />;
}

export const hasBrandMark = (appId) => Object.prototype.hasOwnProperty.call(REGISTRY, appId);
