import { memo } from 'react';

const ToggleSwitch = memo(function ToggleSwitch({ checked, onChange, size = 'default' }) {
  const sizes = {
    small: { track: 'w-8 h-4', thumb: 'w-3 h-3 top-0.5 left-0.5', translate: 'translate-x-4' },
    default: { track: 'w-10 h-5', thumb: 'w-4 h-4 top-0.5 left-0.5', translate: 'translate-x-5' },
  };
  const s = sizes[size] || sizes.default;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={`relative ${s.track} rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-rivvra-500/50 ${
        checked ? 'bg-rivvra-500' : 'bg-dark-600'
      }`}
    >
      <span
        className={`absolute ${s.thumb} rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? s.translate : ''
        }`}
      />
    </button>
  );
});

export default ToggleSwitch;
