import * as React from 'react';

export interface StageItem {
  id: string;
  label: string;
}

export interface StageBarProps {
  /** In pipeline order. Filter out terminal stages before passing them in. */
  stages?: StageItem[];
  /** Current stage id. Everything before it renders as done. */
  value?: string;
  onSelect?: (stageId: string) => void;
  /** Mark every chip as behind — for a record past the visible row. */
  allPast?: boolean;
  /** `lost` recolours the row for a terminal-negative record. */
  tone?: 'default' | 'lost';
  /** False renders a static indicator instead of buttons. */
  interactive?: boolean;
  /** Secondary tooltip text per stage id (e.g. when it was entered). */
  hints?: Record<string, string>;
}

/**
 * Linear pipeline chips: done behind, current highlighted, rest pending.
 *
 * Presentational only — it does not know whether a move is legal or what to
 * confirm first. The caller owns that and receives `onSelect(stageId)`.
 */
export declare function StageBar(props: StageBarProps): JSX.Element;
