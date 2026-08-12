import * as React from 'react';

export interface MeterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current amount. Clamped to `[0, max]` — a stale total can push a computed
   *  percentage past 100, and that would overflow the track. */
  value?: number;
  /** Denominator. Default `100`, i.e. `value` is already a percentage. */
  max?: number;
  /** Leading text. Also becomes the progressbar's accessible name when it is
   *  a plain string. */
  label?: React.ReactNode;
  /** Right-aligned readout, pre-formatted — `"48%"`, `"12 / 30"`. Omit to hide. */
  readout?: React.ReactNode;
  /** Fill colour. Defaults to the brand green. */
  color?: string;
  /** Track height: 5 / 7 / 10px. */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * A proportion as a track and a fill. Renders a real `role="progressbar"`.
 *
 * Use it for "how far along" or "what share of the total"; reach for a chart
 * only when the question is a distribution or a trend over time.
 */
export declare function Meter(props: MeterProps): JSX.Element;
