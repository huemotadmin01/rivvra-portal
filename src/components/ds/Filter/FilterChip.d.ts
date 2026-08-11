import * as React from 'react';

export interface FilterChipProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onClick'> {
  /** Field name, rendered dimmer than the value. */
  label?: string;
  /** Applied value. */
  value?: React.ReactNode;
  /** Shows the remove ✕. Omit for a read-only chip. */
  onRemove?: () => void;
  /** Makes the chip body clickable — open an edit popover. */
  onClick?: () => void;
  /** Render the dashed "add filter" affordance instead. */
  add?: boolean;
  /** Brand-tinted state for the chip currently being edited. */
  active?: boolean;
  children?: React.ReactNode;
}

/** One applied filter: `field: value`, removable. */
export declare function FilterChip(props: FilterChipProps): JSX.Element;
