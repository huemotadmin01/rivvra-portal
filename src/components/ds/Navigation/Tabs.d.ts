import * as React from 'react';

export interface TabItem {
  key: string;
  label: React.ReactNode;
  /** lucide icon component. */
  icon?: React.ComponentType<{ size?: number }>;
  /** Optional badge count rendered after the label. */
  count?: number | null;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Active tab key. Controlled — keep it in the URL where possible. */
  value?: string;
  onChange?: (key: string) => void;
  /** Pin the strip while content scrolls. */
  sticky?: boolean;
  /** Offset for `sticky` — the app bar height (56 in the v2 shell). */
  stickyTop?: number;
  /** Underline colour for the active tab; defaults to brand. */
  accent?: string;
  style?: React.CSSProperties;
}

/** In-page section navigation. Renders a real tablist with arrow-key,
 *  Home and End support. */
export declare function Tabs(props: TabsProps): JSX.Element;
