import * as React from 'react';

export type ConfigFieldType = 'text' | 'toggle' | 'colorSwatch' | 'number' | 'select' | 'checkboxList';

export interface ConfigField {
  key: string;
  label: string;
  type?: ConfigFieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
  defaultValue?: unknown;
  /** select / colorSwatch / checkboxList options. colorSwatch entries also
   *  carry `swatch` (a CSS color). */
  options?: Array<{ value: string | number; label?: string; swatch?: string }>;
}

export interface ConfigListProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  /** Singular noun used in copy: "No {noun}s yet", "Delete this {noun}". */
  noun?: string;
  /** Overrides `noun` in the modal title when they differ. */
  modalTitle?: string;
  items?: any[];
  loading?: boolean;
  /** Search box appears once there are more than 5 items. */
  searchable?: boolean;
  searchKeys?: string[];
  /** DataTable columns; defaults to a dot + name column. */
  columns?: any[];
  fields?: ConfigField[];
  /** Omit to hide the New button. Throwing shows the message inline. */
  onCreate?: (values: Record<string, any>) => Promise<void> | void;
  onUpdate?: (item: any, values: Record<string, any>) => Promise<void> | void;
  /** Omit to hide every delete affordance. */
  onDelete?: (item: any) => Promise<void> | void;
  /** False hides the row trash; delete then lives only in the edit modal. */
  rowDelete?: boolean;
  /** Per-item confirm copy. Never promise an outcome the server refuses —
   *  several entities are 400-blocked while in use. */
  deleteConfirm?: (item: any) => { title: string; message: string };
  headerActions?: React.ReactNode;
  /** Extra per-row controls rendered before Edit. */
  rowActions?: (item: any) => React.ReactNode;
  /** Rendered between the header and the search box. */
  toolbar?: React.ReactNode;
  emptyText?: React.ReactNode;
}

/** Master-data list: card table + search + create/edit modal + confirmed
 *  delete. The repeated shape behind every config page. */
export declare function ConfigList(props: ConfigListProps): JSX.Element;

export interface ConfigDotProps { color?: string }
/** Small colored dot used in config table name cells. */
export declare function ConfigDot(props: ConfigDotProps): JSX.Element;
