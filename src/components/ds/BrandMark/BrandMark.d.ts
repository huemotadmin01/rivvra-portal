import * as React from 'react';

export type BrandMarkId =
  | 'outreach' | 'timesheet' | 'crm' | 'ats' | 'payroll' | 'employee'
  | 'contacts' | 'sign' | 'todo' | 'invoicing' | 'incentive' | 'kb' | 'settings';

export interface BrandMarkProps extends React.SVGAttributes<SVGSVGElement> {
  /** Which app mark to draw. Unknown ids render the neutral dot-grid fallback. */
  id: BrandMarkId | string;
  /** Rendered width and height in px. */
  size?: number;
  /** Sets `currentColor` — pass the app accent token, e.g. `var(--a-crm)`. */
  color?: string;
}

/** Geometric identity mark for each Rivvra app. Never a stock icon. */
export declare function BrandMark(props: BrandMarkProps): JSX.Element;

/** Every id that has a bespoke mark (everything else falls back). */
export declare const BRAND_MARK_IDS: string[];
