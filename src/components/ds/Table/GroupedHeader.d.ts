import * as React from 'react';

export interface GroupedHeaderProps extends React.HTMLAttributes<HTMLTableRowElement> {
  label: string;
  count?: number;
  /** Singular record noun, e.g. `'candidate'`. */
  noun?: string;
  /** Override the plural when it isn't `noun + 's'`. */
  nounPlural?: string;
  /** Total column count of the host table. */
  colSpan?: number;
  collapsed?: boolean;
  onToggle?: () => void;
  /** Left accent bar colour — pass an app-accent token. */
  accent?: string;
  /** Initials badge. Derived from `label` if omitted; `''` hides it. */
  avatarText?: string;
  /** Icon badge, replacing the initials. */
  icon?: React.ReactNode;
  /** Pin the header while its group scrolls. */
  sticky?: boolean;
  stickyTop?: number;
  /** Inline stats, right-aligned in the header row. */
  children?: React.ReactNode;
}

/** Collapsible group header row for grouped tables. Renders one full-width `<tr>`. */
export declare function GroupedHeader(props: GroupedHeaderProps): JSX.Element;
