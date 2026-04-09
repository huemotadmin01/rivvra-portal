import { Check } from 'lucide-react';

const STEPS = [
  { key: 'personal', label: 'Personal Details', num: 1 },
  { key: 'family', label: 'Family & Emergency', num: 2 },
  { key: 'bank', label: 'Bank & Statutory', num: 3 },
  { key: 'education', label: 'Education', num: 4 },
  { key: 'review', label: 'Review & Submit', num: 5 },
];

export default function OnboardingStepper({ currentStep }) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-2xl mx-auto py-6">
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isUpcoming = i > currentIdx;

        return (
          <div key={step.key} className="flex items-center">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  isCompleted
                    ? 'bg-rivvra-500 text-dark-950'
                    : isCurrent
                    ? 'bg-rivvra-500/20 border-2 border-rivvra-500 text-rivvra-400'
                    : 'bg-dark-800 border-2 border-dark-600 text-dark-500'
                }`}
              >
                {isCompleted ? <Check size={16} strokeWidth={3} /> : step.num}
              </div>
              <span
                className={`text-xs mt-1.5 whitespace-nowrap ${
                  isCurrent
                    ? 'text-rivvra-400 font-medium'
                    : isCompleted
                    ? 'text-dark-300'
                    : 'text-dark-500'
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={`w-12 sm:w-16 h-0.5 mt-[-18px] ${
                  i < currentIdx ? 'bg-rivvra-500' : 'bg-dark-700'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export { STEPS };
