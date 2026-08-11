import * as React from 'react';

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size' | 'width'> {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  size?: 'sm' | 'md';
  /** CSS width. Default `240`. */
  width?: number | string;
}

/** Search field with a leading glyph and a clear affordance. */
export declare function SearchInput(props: SearchInputProps): JSX.Element;
