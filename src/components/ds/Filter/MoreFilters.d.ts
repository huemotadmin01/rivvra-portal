import * as React from 'react';

export interface MoreFiltersProps {
  /** How many of the contained filters are currently set — badged on the
   *  chip. The caller computes it; the component does not read state. */
  activeCount?: number;
  label?: string;
  /** The filter controls to render inside the popover. */
  children?: React.ReactNode;
}

/** Overflow chip collapsing rarely-used filters into a popover. */
export declare function MoreFilters(props: MoreFiltersProps): JSX.Element;
