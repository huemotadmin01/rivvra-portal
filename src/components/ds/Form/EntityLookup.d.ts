import * as React from 'react';

export interface EntityOption {
  value: string;
  label: string;
  /** Secondary line under the label — job title, email, whatever disambiguates. */
  sub?: string;
}

export interface EntityLookupProps {
  /** Row label. Unused by `variant='button'`. */
  label?: string;
  /** Key handed back to `onSelect`. */
  field?: string;
  /** Selected id, or '' for none. */
  value?: string;
  /** Read-mode text for the selection, usually denormalised onto the record. */
  displayValue?: React.ReactNode;
  /** Called with '' when the picker opens, then per keystroke (250ms debounce). */
  search: (query: string) => Promise<EntityOption[]>;
  /** MUST reject to signal failure — the row then shows an inline error. */
  onSelect: (field: string | undefined, value: string) => Promise<void>;
  /** Adds a "Create <query>" entry; must resolve to the created option. */
  onCreate?: (name: string) => Promise<EntityOption>;
  editable?: boolean;
  /** Offers "— None —". Row variant only. */
  allowClear?: boolean;
  variant?: 'row' | 'button' | 'inline';
  /** Does selecting commit the value? Default true. Pass false on create
   *  forms, where a "saved" tick would claim a write that never happened. */
  confirmsSave?: boolean;
  /** `variant='button'` trigger text. Default "Add". */
  triggerLabel?: string;
  placeholder?: string;
  /** Read-mode link target for the current selection. */
  href?: string;
  /**
   * Gates whether `href` is offered. Resolve false for an id that no longer
   * points at a linkable record — a person field holding a legacy id with no
   * employee row, say — and the link is hidden rather than 404ing. The link
   * stays hidden until the probe resolves true, so a slow or failing probe
   * never flashes a broken link. Omit for an unconditional link.
   */
  hrefProbe?: (value: string) => Promise<boolean> | boolean;
  /** Label column width in px. Default 140. */
  labelWidth?: number;
}

/**
 * Type-to-search record picker for sets too large to preload — the async
 * sibling of `InlineComboField`.
 *
 * Pessimistic save (see InlineField): `onSelect` must reject on failure, and
 * the error surfaces in read mode because the popover has already closed.
 * Out-of-order responses are discarded, so a slow early query can't overwrite
 * a later one. Enter commits only when exactly one result remains.
 */
export declare function EntityLookup(props: EntityLookupProps): JSX.Element;
