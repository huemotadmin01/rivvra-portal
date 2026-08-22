/* Deprecated shim (phase 1).
 *
 * ConfigList and ConfigDot were promoted into `components/ds/Surface/
 * ConfigList.jsx` — they are presentational and had no app-layer coupling,
 * so nothing had to stay behind. These re-exports keep the five existing
 * call sites working for one phase under their old `*V2` names.
 *
 * New pages: import { ConfigList, ConfigDot } from '@/components/ds'.
 * This file is deleted at the end of phase 2.
 */
export { ConfigList as ConfigListV2, ConfigDot } from '../../ds';
