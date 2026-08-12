import * as React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Show the danger ring. Pair with `Field`'s `error`. */
  invalid?: boolean;
}

/** Multi-line text input. The `Input` of a `Field` stack, for prose. */
export declare function Textarea(props: TextareaProps): JSX.Element;
