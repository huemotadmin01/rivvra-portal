import * as React from 'react';

export interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  /** Header label. Omit (along with `actions`) to render a bare surface. */
  title?: React.ReactNode;
  /** Right-aligned header controls — buttons, segmented switches, chips. */
  actions?: React.ReactNode;
  /** Drop body padding, for tables and lists that manage their own insets. */
  flush?: boolean;
  children?: React.ReactNode;
}

/** Surface container with an optional header row. The default content shell. */
export declare function Panel(props: PanelProps): JSX.Element;
