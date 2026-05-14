import { ChevronLeft, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';

const STEPS = [
  { key: 'compose', label: 'Compose', num: 1 },
  { key: 'schedule', label: 'Schedule', num: 2 },
  { key: 'review', label: 'Review and Activate', num: 3 },
];

function WizardStepper({ currentStep, completedSteps = [], sequenceName, onStepClick }) {
  const navigate = useNavigate();
  const { orgPath } = usePlatform();

  const currentIndex = STEPS.findIndex(s => s.key === currentStep);

  function handleExit() {
    if (confirm('Leave the wizard? Unsaved changes will be lost.')) {
      navigate(orgPath('/outreach/engage'));
    }
  }

  return (
    <div className="flex items-center justify-between mb-8 pb-4 border-b border-dark-800">
      {/* Left: Exit */}
      <button
        onClick={handleExit}
        className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Exit
      </button>

      {/* Center: Steps */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const isCompleted = completedSteps.includes(step.key);
          const isCurrent = step.key === currentStep;
          const isClickable = isCompleted || isCurrent;

          return (
            <div key={step.key} className="flex items-center gap-2">
              {i > 0 && (
                <div className={`w-12 h-px ${i <= currentIndex ? 'bg-rivvra-500' : 'bg-dark-700'}`} />
              )}
              <button
                onClick={() => isClickable && onStepClick?.(step.key)}
                disabled={!isClickable}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isCurrent
                    ? 'bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/30'
                    : isCompleted
                    ? 'bg-rivvra-500/10 text-rivvra-400 cursor-pointer hover:bg-rivvra-500/20'
                    : 'text-dark-500 cursor-default'
                }`}
              >
                {isCompleted && !isCurrent ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isCurrent ? 'bg-rivvra-500 text-dark-950' : 'bg-dark-700 text-dark-400'
                  }`}>
                    {step.num}
                  </span>
                )}
                {step.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* Right: Sequence name */}
      <div className="text-sm text-dark-400 truncate max-w-[200px]">
        {sequenceName || 'New Sequence'}
      </div>
    </div>
  );
}

export default WizardStepper;
