import * as React from 'react';

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  /** Guidance shown above the control. Explain the consequence, not the format. */
  hint?: React.ReactNode;
  /** Validation message. Presence switches the field to its error state. */
  error?: React.ReactNode;
  /** Appends a danger-toned asterisk to the label. */
  required?: boolean;
  /** Wire to the control's `id` so the label is clickable. */
  htmlFor?: string;
  /** The control itself — an `Input`, select, or textarea. */
  children?: React.ReactNode;
}

/** Labelled form control with hint and error text. */
export declare function Field(props: FieldProps): JSX.Element;

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Show the danger ring. Pair with `Field`'s `error`. */
  invalid?: boolean;
}

/** Text input styled to the system. Forwards its ref to the `<input>`. */
export declare const Input: React.ForwardRefExoticComponent<
  InputProps & React.RefAttributes<HTMLInputElement>
>;
