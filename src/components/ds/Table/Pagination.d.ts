import * as React from 'react';

export interface PaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  page?: number;
  pageSize?: number;
  total?: number;
  /** Page-size options. Default `[25, 50, 100]`. */
  pageSizes?: number[];
  onPageChange?: (page: number) => void;
  /** Omit to hide the rows-per-page select. */
  onPageSizeChange?: (size: number) => void;
  /** Singular noun for the range readout, e.g. `'invoice'`. */
  noun?: string;
}

/** Range readout plus page-size select and prev/next. Sits under any list. */
export declare function Pagination(props: PaginationProps): JSX.Element;
