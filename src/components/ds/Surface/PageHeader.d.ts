import * as React from 'react';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: React.ReactNode;
  /** Secondary line under the title — counts, scope, description. */
  sub?: React.ReactNode;
  /** Right-aligned action buttons. */
  actions?: React.ReactNode;
}

/** Standard page title block. */
export declare function PageHeader(props: PageHeaderProps): JSX.Element;
