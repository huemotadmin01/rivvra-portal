import * as React from 'react';

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Metric name, e.g. "Placements". */
  label?: React.ReactNode;
  /** Headline figure, pre-formatted — "1,284", "₹4.2Cr", "12.4%". */
  value?: React.ReactNode;
  /** Percentage change. Sign sets the arrow direction. Omit to hide. */
  delta?: number | null;
  /** Comparison basis, e.g. "vs last quarter". */
  note?: React.ReactNode;
  /** ~14px glyph, tinted by `color`. */
  icon?: React.ReactNode;
  /** Accent for the icon tile and sparkline. Defaults to the brand green. */
  color?: string;
  /** Trend values for the corner sparkline. Needs 2+ points. */
  points?: number[];
  /**
   * Set for metrics where DOWN is good (time-to-fill, unread backlog). Flips
   * the tone only — the arrow still follows the sign, so a green down-arrow
   * reads as "falling, and that's the win".
   */
  invert?: boolean;
}

/** KPI card with delta, comparison note, and an optional corner sparkline. */
export declare function Stat(props: StatProps): JSX.Element;
