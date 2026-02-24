import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import { warmTimesheetBackend } from '../../utils/timesheetApi';
import { Lock } from 'lucide-react';

const colorConfig = {
  rivvra: {
    rgb: '34, 197, 94',       // rivvra-500 green
    iconBg: 'rgba(34, 197, 94, 0.1)',
    iconBgHover: 'rgba(34, 197, 94, 0.2)',
    iconColor: '#4ade80',     // rivvra-400
  },
  blue: {
    rgb: '59, 130, 246',
    iconBg: 'rgba(59, 130, 246, 0.1)',
    iconBgHover: 'rgba(59, 130, 246, 0.2)',
    iconColor: '#60a5fa',
  },
  purple: {
    rgb: '168, 85, 247',
    iconBg: 'rgba(168, 85, 247, 0.1)',
    iconBgHover: 'rgba(168, 85, 247, 0.2)',
    iconColor: '#c084fc',
  },
  orange: {
    rgb: '249, 115, 22',
    iconBg: 'rgba(249, 115, 22, 0.1)',
    iconBgHover: 'rgba(249, 115, 22, 0.2)',
    iconColor: '#fb923c',
  },
};

function AppCard({ app, index = 0, locked = false }) {
  const navigate = useNavigate();
  const { orgPath } = usePlatform();
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const isActive = app.status === 'active' && !locked;
  const colors = colorConfig[app.color] || colorConfig.rivvra;

  const handleClick = () => {
    if (!isActive) return;
    setClicked(true);
    setTimeout(() => {
      navigate(orgPath(app.defaultRoute));
    }, 200);
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => { setHovered(true); if (app.id === 'timesheet' && isActive) warmTimesheetBackend(); }}
      onMouseLeave={() => { setHovered(false); setClicked(false); }}
      disabled={!isActive}
      className={`group relative flex flex-col items-center justify-center p-6 rounded-2xl border text-center
        transition-all duration-300 ease-out
        ${isActive
          ? 'bg-dark-900 cursor-pointer'
          : 'bg-dark-900/50 border-dark-800/50 cursor-not-allowed opacity-40'
        }
        ${clicked ? 'scale-90' : isActive && hovered ? '-translate-y-1.5' : ''}
      `}
      style={{
        animation: `cardEntrance 0.5s ease-out ${index * 0.1}s both`,
        borderColor: isActive && hovered ? `rgba(${colors.rgb}, 0.3)` : 'rgb(30, 41, 59)',
        boxShadow: isActive && hovered
          ? `0 20px 40px -12px rgba(${colors.rgb}, 0.15), 0 0 0 1px rgba(${colors.rgb}, 0.1)`
          : 'none',
        transform: clicked
          ? 'scale(0.92)'
          : isActive && hovered
            ? 'translateY(-6px)'
            : 'translateY(0)',
      }}
    >
      {/* Coming Soon Badge */}
      {app.status !== 'active' && (
        <span className="absolute top-3 right-3 px-2 py-0.5 bg-dark-700 text-dark-400 text-xs rounded-full font-medium">
          Coming Soon
        </span>
      )}

      {/* No Access Badge */}
      {locked && app.status === 'active' && (
        <span className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs rounded-full font-medium">
          <Lock className="w-3 h-3" />
          No Access
        </span>
      )}

      {/* Icon */}
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center mb-3 transition-all duration-300"
        style={{
          backgroundColor: isActive && hovered ? colors.iconBgHover : colors.iconBg,
          boxShadow: isActive && hovered ? `0 8px 24px -4px rgba(${colors.rgb}, 0.25)` : 'none',
          transform: isActive && hovered ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        <app.icon
          className="w-7 h-7 transition-transform duration-300"
          style={{ color: colors.iconColor }}
        />
      </div>

      {/* Name */}
      <h3 className={`font-semibold text-sm mb-1 transition-colors duration-200 ${isActive ? 'text-white' : 'text-dark-300'}`}>
        {app.name}
      </h3>

      {/* Description */}
      <p className="text-dark-400 text-xs leading-relaxed">{app.description}</p>
    </button>
  );
}

export default AppCard;
