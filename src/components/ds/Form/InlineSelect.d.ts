import * as React from 'react';

export interface InlineSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Current value. Controlled — pair with `onChange`. */
  value?: string | number;
  /** Standard select change handler; read `e.target.value`. */
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  /** `<option>` elements. */
  children?: React.ReactNode;
}

/**
 * Compact native select sized for toolbars and filter strips. Native by
 * design: OS keyboard handling and mobile pickers come for free.
 */
export declare function InlineSelect(props: InlineSelectProps): JSX.Element;
