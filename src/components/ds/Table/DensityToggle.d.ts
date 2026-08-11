import * as React from 'react';

export interface DensityToggleProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  density?: 'comfortable' | 'compact';
  onChange?: (density: 'comfortable' | 'compact') => void;
}

/** Comfortable / compact row-height switch. Pairs with `DataTable`'s `density`. */
export declare function DensityToggle(props: DensityToggleProps): JSX.Element;
