import * as React from 'react';

export interface StepperStep {
  id: string;
  label: string;
  /** Numeral shown before the step is done. Defaults to its 1-based index. */
  num?: number;
}

export interface StepperProps extends React.HTMLAttributes<HTMLElement> {
  /** In order. Everything before `value` renders as done. */
  steps?: StepperStep[];
  /** Current step id. */
  value?: string;
  style?: React.CSSProperties;
}

/**
 * Numbered progress through a linear, multi-step form.
 *
 * Use over `StageBar` when the user is filling something in and needs to see
 * how much is left; `StageBar` is for a record moving through a pipeline it can
 * also move back down.
 *
 * Presentational and non-interactive by design — a wizard step is reached by
 * passing validation, not by clicking ahead, so there is nothing to select.
 *
 * State is carried by the fill and the ring; numerals are always `--fg` and
 * labels are neutrals. Do not recolour the ink to the accent: accent-on-its-own
 * -tint measures ~4.2 against the 4.5 floor.
 */
export declare function Stepper(props: StepperProps): JSX.Element;
