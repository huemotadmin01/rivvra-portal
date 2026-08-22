import * as React from 'react';

export interface AccordionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Glyph shown between the chevron and the title. */
  icon?: React.ReactNode;
  title?: React.ReactNode;
  /** One line on what the section controls, and what depends on it. */
  subtitle?: React.ReactNode;
  /** Controlled — the parent owns which sections are open. */
  open?: boolean;
  onToggle?: () => void;
  /** Section body. Rendered only while `open`. */
  children?: React.ReactNode;
}

/** Titled collapsible section, for grouping fields on a settings page. */
export declare function Accordion(props: AccordionProps): JSX.Element;
