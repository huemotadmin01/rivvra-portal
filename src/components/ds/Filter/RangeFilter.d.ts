export interface RangeFilterProps {
  label: string;
  /** Input type — drives the native picker. Default 'date'. */
  type?: 'date' | 'number';
  from?: string;
  to?: string;
  onFromChange?: (next: string) => void;
  onToChange?: (next: string) => void;
}

/** From/to range pair sized for a MoreFilters popover. */
export declare function RangeFilter(props: RangeFilterProps): JSX.Element;
