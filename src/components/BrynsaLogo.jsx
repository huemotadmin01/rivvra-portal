// Rivvra Logo Component - SVG "R" with river flow (scales crisp at any size)
import { useId } from 'react';

function RivvraLogo({ className = "w-5 h-5" }) {
  const uid = useId();
  const gid = `rg${uid}`;
  const mid = `rm${uid}`;

  return (
    <svg viewBox="0 0 64 76" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gid} x1="0" y1="76" x2="64" y2="0">
          <stop offset="0%" stopColor="#16a34a" />
          <stop offset="50%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
        <mask id={mid}>
          <rect width="64" height="76" fill="white" />
          <path
            d="M52 6C44 16 28 12 22 26C16 40 32 42 26 54C20 64 10 60 4 70"
            stroke="black"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </mask>
      </defs>
      <path
        fill={`url(#${gid})`}
        mask={`url(#${mid})`}
        d="M8 4v64h13V44h7l15 24h15L41 42c9-3 15-11 15-20C56 11 48 4 36 4H8zm13 10h14c6 0 9 3 9 8s-3 8-9 8H21V14z"
      />
    </svg>
  );
}

export default RivvraLogo;
