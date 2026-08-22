import { Check } from 'lucide-react';

/**
 * Stepper — numbered progress through a linear, multi-step form.
 *
 * Distinct from `StageBar`, which is a row of pipeline chips for a record that
 * can move backwards: a Stepper counts forward through a wizard the user is
 * currently filling in, and shows how much is left.
 *
 * The state lives in the *fill and the ring*, never in the ink. The obvious
 * design — brand ink on a 20% wash of the same brand for the active step —
 * measures 4.22 against a 4.5 floor, which is the accent-on-its-own-tint
 * failure this system has hit repeatedly. Here every numeral is `--fg` and
 * every label is a neutral, so the contrast does not depend on the accent at
 * all. Done vs current stays legible without colour: done shows a check,
 * current shows its number inside a ring.
 */
export function Stepper({ steps = [], value, style, ...rest }) {
  const currentIdx = steps.findIndex((s) => s.id === value);

  return (
    <nav
      aria-label="Progress"
      style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        width: '100%', padding: '24px 0', ...style,
      }}
      {...rest}
    >
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;

        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                aria-current={current ? 'step' : undefined}
                style={{
                  width: 34, height: 34, borderRadius: 99, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  font: "600 12.5px/1 'Inter', system-ui, sans-serif",
                  color: current || done ? 'var(--fg)' : 'var(--fg-4)',
                  background: current || done ? 'var(--brand-soft)' : 'var(--surface-2)',
                  boxShadow: `inset 0 0 0 2px ${current ? 'var(--brand)' : done ? 'var(--brand-line)' : 'var(--line-2)'}`,
                  transition: 'background-color 180ms, box-shadow 180ms',
                }}
              >
                {done
                  ? <Check size={15} strokeWidth={3} style={{ color: 'var(--brand-ink)' }} aria-hidden="true" />
                  : step.num ?? i + 1}
              </div>
              <span
                style={{
                  marginTop: 6, whiteSpace: 'nowrap',
                  font: `${current ? 500 : 400} 11px/1.4 'Inter', system-ui, sans-serif`,
                  color: current ? 'var(--fg)' : done ? 'var(--fg-3)' : 'var(--fg-4)',
                }}
              >
                {step.label}
              </span>
            </div>

            {i < steps.length - 1 && (
              <div
                aria-hidden="true"
                style={{
                  width: 'clamp(20px, 5vw, 64px)', height: 2, marginTop: -22,
                  background: done ? 'var(--brand)' : 'var(--line-2)',
                  transition: 'background-color 180ms',
                }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
