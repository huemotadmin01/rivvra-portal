import { ChevronLeft, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../../context/PlatformContext';
import { Button } from '../../ds';

const STEPS = [
  { key: 'compose', label: 'Compose', num: 1 },
  { key: 'schedule', label: 'Schedule', num: 2 },
  { key: 'review', label: 'Review and Activate', num: 3 },
];

/**
 * Wizard progress header.
 *
 * `handleExit` keeps its native `confirm`. It guards unsaved wizard state —
 * potentially several composed emails — and a native confirm blocks the event
 * loop, so it cannot be click-through dismissed or lost to a re-render. Same
 * reasoning as the destructive guards on the admin pages.
 *
 * A step is clickable only when completed or current: you may go BACK to a step
 * you finished, never skip forward to one you have not.
 */
function WizardStepperV2({ currentStep, completedSteps = [], sequenceName, onStepClick }) {
  const navigate = useNavigate();
  const { orgPath } = usePlatform();

  const currentIndex = STEPS.findIndex(s => s.key === currentStep);

  function handleExit() {
    if (confirm('Leave the wizard? Unsaved changes will be lost.')) {
      navigate(orgPath('/outreach/engage'));
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap', marginBottom: 28, paddingBottom: 14,
      borderBottom: '1px solid var(--line)',
    }}>
      <Button variant="ghost" size="sm" onClick={handleExit} iconLeft={<ChevronLeft size={16} />}>
        Exit
      </Button>

      <ol style={{ display: 'flex', alignItems: 'center', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
        {STEPS.map((step, i) => {
          const isCompleted = completedSteps.includes(step.key);
          const isCurrent = step.key === currentStep;
          const isClickable = isCompleted || isCurrent;
          return (
            <li key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && (
                <span aria-hidden style={{
                  width: 44, height: 1,
                  background: i <= currentIndex ? 'var(--brand)' : 'var(--line-2)',
                }} />
              )}
              <button
                type="button"
                onClick={() => isClickable && onStepClick?.(step.key)}
                disabled={!isClickable}
                aria-current={isCurrent ? 'step' : undefined}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '5px 12px', borderRadius: 999, border: 0,
                  font: "550 12px/1.4 'Inter', system-ui, sans-serif",
                  cursor: isClickable ? 'pointer' : 'default',
                  background: isCurrent || isCompleted ? 'var(--brand-soft)' : 'transparent',
                  color: isCurrent || isCompleted ? 'var(--brand-ink)' : 'var(--fg-4)',
                  boxShadow: isCurrent ? '0 0 0 1px var(--brand)' : 'none',
                  transition: 'background 140ms var(--e-out, ease)',
                }}
              >
                {isCompleted && !isCurrent ? (
                  <Check size={14} />
                ) : (
                  <span style={{
                    width: 20, height: 20, borderRadius: 999,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    font: "700 10px/1 'Inter', system-ui, sans-serif",
                    background: isCurrent ? 'var(--brand)' : 'var(--surface-3)',
                    color: isCurrent ? 'var(--brand-fg, #041209)' : 'var(--fg-4)',
                  }}>
                    {step.num}
                  </span>
                )}
                {step.label}
              </button>
            </li>
          );
        })}
      </ol>

      <div style={{
        font: "450 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg-3)',
        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {sequenceName || 'New Sequence'}
      </div>
    </div>
  );
}

export default WizardStepperV2;
