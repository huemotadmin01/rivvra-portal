import * as React from 'react';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  /** Opacity multiplier for secondary bars. Default 1. */
  dim?: number;
  style?: React.CSSProperties;
}
/** Single placeholder bar — the primitive the family is built from. */
export declare function Skeleton(props: SkeletonProps): JSX.Element;

/** Pulse wrapper for a full-page skeleton. */
export declare function SkeletonPage(props: { children?: React.ReactNode; style?: React.CSSProperties }): JSX.Element;
export declare function SkeletonHeader(props: { withButton?: boolean; titleWidth?: number; subtitleWidth?: number }): JSX.Element;
export declare function SkeletonCardGrid(props: { count?: number; minWidth?: number }): JSX.Element;
export declare function SkeletonTabs(props: { widths?: number[] }): JSX.Element;
/** For tables NOT rendered by DataTable — DataTable owns its `loading` state. */
export declare function SkeletonTable(props: { rows?: number; cols?: number }): JSX.Element;
export declare function SkeletonCardList(props: { count?: number }): JSX.Element;
export declare function SkeletonTwoCard(): JSX.Element;
export declare function SkeletonSearchBar(props: { buttons?: number }): JSX.Element;
export declare function SkeletonPendingList(props: { count?: number }): JSX.Element;
export declare function SkeletonConfig(props: { sections?: number; rows?: number }): JSX.Element;
export declare function SkeletonInline(props: { rows?: number }): JSX.Element;
export declare function SkeletonEditor(): JSX.Element;
