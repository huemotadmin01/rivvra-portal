import * as React from 'react';

export interface RatingStarsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Filled stars. */
  value?: number;
  /** Total stars. Default 3. */
  max?: number;
  /** Star size in px. Default 14. */
  size?: number;
  /**
   * Omit for a read-only rating — which renders NO buttons, because a control
   * nobody can operate should not be in the tab order. Supplied, each star
   * becomes a real button and clicking the current value clears it to 0.
   * Clicks are always contained, so a card underneath does not also fire.
   */
  onChange?: (next: number) => void;
  /** Accessible name. Default "Rating". */
  label?: string;
}

/** Small star rating, read-only or interactive. Supersedes the two divergent
 *  `EvalStars` copies in CrmPipeline and AtsPipeline. */
export declare function RatingStars(props: RatingStarsProps): JSX.Element;
