export interface GroupByOption { value: string; label: string }

export interface GroupByChipProps {
  options?: GroupByOption[];
  /** Active grouping key; '' means ungrouped. Controlled. */
  value?: string;
  onChange?: (next: string) => void;
  label?: string;
  /** Value text when ungrouped. Default "None". */
  noneLabel?: string;
}

/** Chip that picks the grouping dimension for a list. */
export declare function GroupByChip(props: GroupByChipProps): JSX.Element;
