/**
 * Rivvra Design System — the redesign's component library (Slice 0).
 *
 * RULES (from the handoff, docs/REDESIGN.md):
 *  - New/migrated pages import ONLY from '@/components/ds' (this barrel).
 *  - Where a component's .jsx and any doc disagree, the .jsx wins.
 *  - Values (colors, px, motion) are spec — components read the semantic
 *    tokens in src/styles/ds-tokens.css. Do not fork values.
 *  - Naming collisions, resolved: ds `Switch` supersedes legacy
 *    `ToggleSwitch`; ds `Panel` supersedes legacy `SectionCard`; for
 *    confirmations keep legacy shared/ConfirmDialog until the ds one
 *    exists. Legacy components stay until their last call site migrates.
 *
 * The .d.ts files beside each component are the API contract — read them
 * before using a component.
 */
export { BrandMark, BRAND_MARK_IDS } from './BrandMark/BrandMark';
export { Button } from './Button/Button';
export { Avatar } from './Data/Avatar';
export { Chip } from './Data/Chip';
export { Stat } from './Data/Stat';
export { FilterBar } from './Filter/FilterBar';
export { FilterChip } from './Filter/FilterChip';
export { SavedViews } from './Filter/SavedViews';
export { SearchInput } from './Filter/SearchInput';
export { Field, Input } from './Form/Field';
export { Switch, SettingRow } from './Form/Switch';
export { Logo, LogoLockup } from './Logo/Logo';
export { Modal, Drawer } from './Overlay/Modal';
export { Toast, ToastStack } from './Overlay/Toast';
export { EmptyState } from './Surface/EmptyState';
export { Panel } from './Surface/Panel';
export { BulkActionBar } from './Table/BulkActionBar';
export { DataTable } from './Table/DataTable';
export { DensityToggle } from './Table/DensityToggle';
export { GroupedHeader } from './Table/GroupedHeader';
export { Pagination } from './Table/Pagination';
export { SortableHeader } from './Table/SortableHeader';
export { useTheme, ThemeToggle } from './ThemeToggle/ThemeToggle';
