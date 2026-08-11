import * as React from 'react';

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  /** Fired with the next value. */
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name — required when there is no visible label beside it. */
  label?: string;
}

/** Binary toggle with a spring-eased thumb. */
export declare function Switch(props: SwitchProps): JSX.Element;

export interface SettingRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  /** One line on what this changes. Prefer consequence over restatement. */
  description?: React.ReactNode;
  /** Right-aligned control — a `Switch`, `Input`, or select button. */
  control?: React.ReactNode;
}

/** Settings row: label, description, and a right-aligned control. */
export declare function SettingRow(props: SettingRowProps): JSX.Element;
