export interface BooleanChipProps {
  label: string;
  /** Controlled on/off state. */
  checked?: boolean;
  onChange?: (next: boolean) => void;
  /** Value text when on. Default "Yes". */
  onLabel?: string;
  /** Value text when off. Default "Any". */
  anyLabel?: string;
}

/** Two-state filter chip for boolean predicates. */
export declare function BooleanChip(props: BooleanChipProps): JSX.Element;
