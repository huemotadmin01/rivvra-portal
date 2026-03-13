// Rivvra Logo — bold neon-green vortex/spiral SVG icon (scales crisp at any size)
import { useMemo } from 'react';

function RivvraLogo({ className = "w-5 h-5" }) {
  const gid = useMemo(() => `rv_${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gid} x1="0" y1="64" x2="64" y2="0">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      {/* Flowing spiral vortex */}
      <path
        d="M 46 8 C 60 14 64 40 44 54 C 28 64 8 54 8 36 C 8 20 22 12 34 18 C 44 24 44 38 34 42 C 26 44 22 36 26 30"
        stroke={`url(#${gid})`}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      {/* Sparkle accent at spiral start */}
      <circle cx="48" cy="5" r="2.5" fill="#34d399" />
    </svg>
  );
}

export default RivvraLogo;
