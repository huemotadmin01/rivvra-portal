import * as React from 'react';

export interface RecordMetaProps {
  createdAt?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedByName?: string | null;
  /** Single-line variant for tight footers. */
  compact?: boolean;
  style?: React.CSSProperties;
}

/**
 * Record audit footer. Suppresses the Updated line when `updatedAt` is
 * within 2s of `createdAt`, so new records don't claim to have been edited.
 * Renders nothing when both timestamps are absent.
 */
export declare function RecordMeta(props: RecordMetaProps): JSX.Element | null;
