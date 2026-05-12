/**
 * StageBadge — shared stage chip used across ATS list / detail pages.
 *
 * 2026-05-12 audit P1 #12: this used to be redefined in three places
 * (AtsApplications, AtsJobDetail with the same 7-color hash + AtsCandidateDetail
 * with grayscale), so the same stage rendered in different colours
 * depending on which screen you looked at. One source of truth now.
 *
 * Color choice: deterministic hash of the stage name into a 7-colour
 * palette. Same name → same colour, every time, everywhere. Falls
 * back to a neutral chip when the name is empty.
 */

const STAGE_COLORS = [
  'bg-blue-500/10 text-blue-400',
  'bg-purple-500/10 text-purple-400',
  'bg-amber-500/10 text-amber-400',
  'bg-emerald-500/10 text-emerald-400',
  'bg-pink-500/10 text-pink-400',
  'bg-cyan-500/10 text-cyan-400',
  'bg-orange-500/10 text-orange-400',
];

export function stageColorClass(name) {
  if (!name) return 'bg-dark-700 text-dark-300';
  const hash = String(name).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return STAGE_COLORS[hash % STAGE_COLORS.length];
}

export default function StageBadge({ stage, stageName, className = '' }) {
  const name = stageName || stage?.name || '';
  if (!name) {
    return <span className="text-dark-500 text-xs">—</span>;
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageColorClass(name)} ${className}`}>
      {name}
    </span>
  );
}
