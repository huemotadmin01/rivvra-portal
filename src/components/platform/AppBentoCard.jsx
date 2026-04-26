import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { warmTimesheetBackend } from '../../utils/timesheetApi';
import { Lock, Puzzle, ArrowRight } from 'lucide-react';
import BrandMark, { hasBrandMark } from './BrandMarks';

const colorConfig = {
  rivvra: { rgb: '34, 197, 94',  iconColor: '#4ade80', glow: 'rgba(34, 197, 94, 0.18)' },
  blue:   { rgb: '59, 130, 246', iconColor: '#60a5fa', glow: 'rgba(59, 130, 246, 0.18)' },
  purple: { rgb: '168, 85, 247', iconColor: '#c084fc', glow: 'rgba(168, 85, 247, 0.18)' },
  orange: { rgb: '249, 115, 22', iconColor: '#fb923c', glow: 'rgba(249, 115, 22, 0.18)' },
  cyan:   { rgb: '6, 182, 212',  iconColor: '#22d3ee', glow: 'rgba(6, 182, 212, 0.18)' },
};

function AppBentoCard({ app, index = 0, locked = false, badge = null, variant = 'tile', accent }) {
  const navigate = useNavigate();
  const { orgPath } = usePlatform();
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const isActive = app.status === 'active' && !locked;
  const colors = colorConfig[accent || app.color] || colorConfig.rivvra;
  const FallbackIcon = app.icon;
  const useBrandMark = hasBrandMark(app.id);
  const eyebrow = (app.category || app.name).toUpperCase();

  const handleClick = () => {
    if (!isActive) return;
    setClicked(true);
    setTimeout(() => navigate(orgPath(app.defaultRoute)), 200);
  };

  const renderMark = (size) => {
    if (useBrandMark) return <BrandMark appId={app.id} size={size} color={colors.iconColor} />;
    const px = Math.round(size * 0.62);
    return <FallbackIcon style={{ color: colors.iconColor, width: px, height: px }} />;
  };

  const baseClasses = `group relative flex rounded-2xl border text-left overflow-hidden transition-all duration-300 ease-out ${isActive ? 'bg-dark-900 cursor-pointer' : 'bg-dark-900/50 border-dark-800/50 cursor-not-allowed opacity-40'}`;
  const baseStyle = {
    animation: `cardEntrance 0.5s ease-out ${index * 0.08}s both`,
    borderColor: isActive && hovered ? `rgba(${colors.rgb}, 0.35)` : 'rgb(30, 41, 59)',
    boxShadow: isActive && hovered ? `0 24px 48px -16px rgba(${colors.rgb}, 0.25), 0 0 0 1px rgba(${colors.rgb}, 0.15)` : 'none',
    transform: clicked ? 'scale(0.97)' : isActive && hovered ? 'translateY(-4px)' : 'translateY(0)',
  };

  if (variant === 'featured') {
    return (
      <button onClick={handleClick} onMouseEnter={() => { setHovered(true); if (app.id === 'timesheet' && isActive) warmTimesheetBackend(); }} onMouseLeave={() => { setHovered(false); setClicked(false); }} disabled={!isActive} className={`${baseClasses} flex-col p-8 min-h-[340px] h-full`} style={baseStyle}>
        <div aria-hidden className="absolute inset-0 pointer-events-none transition-opacity duration-500" style={{ background: `radial-gradient(circle at 25% 15%, ${colors.glow}, transparent 60%)`, opacity: isActive ? (hovered ? 1 : 0.7) : 0.3 }} />
        <Badges app={app} locked={locked} badge={badge} />
        <div className="relative">
          <span className="text-[11px] font-semibold tracking-[0.16em]" style={{ color: colors.iconColor }}>{eyebrow}</span>
        </div>
        <div className="relative flex-1 flex items-center justify-start py-8">
          <div className="rounded-2xl flex items-center justify-center transition-transform duration-300" style={{ width: 120, height: 120, backgroundColor: `rgba(${colors.rgb}, 0.10)`, boxShadow: isActive && hovered ? `0 12px 36px -8px rgba(${colors.rgb}, 0.4)` : 'none', transform: isActive && hovered ? 'scale(1.05)' : 'scale(1)' }}>
            {renderMark(88)}
          </div>
        </div>
        <div className="relative">
          <h3 className="text-3xl font-bold text-white mb-2 tracking-tight">{app.name}</h3>
          <p className="text-dark-400 text-sm leading-relaxed mb-6 max-w-[80%]">{app.description}</p>
          {isActive && (
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300" style={{ backgroundColor: hovered ? colors.iconColor : `rgba(${colors.rgb}, 0.15)`, color: hovered ? '#0a0f0d' : colors.iconColor }}>
              Open {app.name}<ArrowRight className="w-4 h-4" />
            </span>
          )}
        </div>
      </button>
    );
  }

  if (variant === 'secondary') {
    return (
      <button onClick={handleClick} onMouseEnter={() => { setHovered(true); if (app.id === 'timesheet' && isActive) warmTimesheetBackend(); }} onMouseLeave={() => { setHovered(false); setClicked(false); }} disabled={!isActive} className={`${baseClasses} flex-col p-6 min-h-[160px] h-full justify-between`} style={baseStyle}>
        <Badges app={app} locked={locked} badge={badge} />
        <span className="text-[10px] font-semibold tracking-[0.14em]" style={{ color: colors.iconColor }}>{eyebrow}</span>
        <div className="flex items-end gap-4 mt-4">
          <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 64, height: 64, backgroundColor: `rgba(${colors.rgb}, 0.10)`, transform: isActive && hovered ? 'scale(1.06)' : 'scale(1)', transition: 'transform 0.3s' }}>
            {renderMark(44)}
          </div>
          <div className="min-w-0 pb-1">
            <h3 className="text-xl font-bold text-white leading-tight mb-0.5">{app.name}</h3>
            <p className="text-dark-400 text-sm leading-snug truncate">{app.description}</p>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button onClick={handleClick} onMouseEnter={() => { setHovered(true); if (app.id === 'timesheet' && isActive) warmTimesheetBackend(); }} onMouseLeave={() => { setHovered(false); setClicked(false); }} disabled={!isActive} className={`${baseClasses} flex-col p-5 min-h-[160px] h-full`} style={baseStyle}>
      <Badges app={app} locked={locked} badge={badge} />
      <span className="text-[10px] font-semibold tracking-[0.14em] mb-3" style={{ color: colors.iconColor }}>{eyebrow}</span>
      <div className="rounded-xl flex items-center justify-center mb-3 transition-transform duration-300" style={{ width: 52, height: 52, backgroundColor: `rgba(${colors.rgb}, 0.10)`, transform: isActive && hovered ? 'scale(1.08)' : 'scale(1)' }}>
        {renderMark(36)}
      </div>
      <h3 className="text-base font-bold text-white mb-1">{app.name}</h3>
      <p className="text-dark-400 text-xs leading-snug">{app.description}</p>
    </button>
  );
}

function Badges({ app, locked, badge }) {
  return (
    <>
      {app.status !== 'active' && (
        <span className="absolute top-3 right-3 px-2 py-0.5 bg-dark-700 text-dark-400 text-[10px] rounded-full font-medium z-10">Coming Soon</span>
      )}
      {locked && app.status === 'active' && (
        <span className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] rounded-full font-medium z-10"><Lock className="w-3 h-3" />No Access</span>
      )}
      {badge && !locked && app.status === 'active' && (
        <span className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] rounded-full font-medium z-10"><Puzzle className="w-3 h-3" />{badge.label}</span>
      )}
    </>
  );
}

export default AppBentoCard;
