import * as React from 'react';

export type Theme = 'dark' | 'light';

export interface ThemeToggleProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current theme — drive from `useTheme()`. */
  theme?: Theme;
  /** Fired with the newly selected theme. */
  onChange?: (theme: Theme) => void;
}

/** Two-up dark/light switch with a sliding thumb. */
export declare function ThemeToggle(props: ThemeToggleProps): JSX.Element;

/**
 * Theme state + persistence. Follows the OS preference until the user picks
 * explicitly, then remembers it in localStorage. Sets `data-theme` on <html>.
 */
export declare function useTheme(): [Theme, (next: Theme) => void];
