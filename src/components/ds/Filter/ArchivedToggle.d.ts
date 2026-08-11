export interface ArchivedToggleProps {
  /** True when the archived segment is active. Controlled. */
  archived?: boolean;
  onChange?: (archived: boolean) => void;
  /** Optional counts rendered inline on each segment. */
  activeCount?: number | null;
  archivedCount?: number | null;
}

/** Platform-wide Active / Archived segmented switch. */
export declare function ArchivedToggle(props: ArchivedToggleProps): JSX.Element;
