/**
 * Rivvra Design System — the redesign's component library (Slice 0).
 *
 * RULES (from the handoff, docs/REDESIGN.md):
 *  - New/migrated pages import ONLY from '@/components/ds' (this barrel).
 *  - Where a component's .jsx and any doc disagree, the .jsx wins.
 *  - Values (colors, px, motion) are spec — components read the semantic
 *    tokens in src/styles/ds-tokens.css. Do not fork values.
 *  - Naming collisions, resolved: ds `Switch` supersedes legacy
 *    `ToggleSwitch`; ds `Panel` supersedes legacy `SectionCard`; ds
 *    `ConfirmDialog` supersedes legacy `shared/ConfirmDialog` (same props,
 *    except Enter no longer confirms a `danger` dialog); ds `EntityLookup`
 *    supersedes `shared/ContactLookup` and `shared/EmployeeLookup`.
 *    Legacy components stay until their last call site migrates.
 *
 * The .d.ts files beside each component are the API contract — read them
 * before using a component.
 */
export { BrandMark, BRAND_MARK_IDS } from './BrandMark/BrandMark';
export {
  Skeleton, SkeletonPage, SkeletonHeader, SkeletonCardGrid, SkeletonTabs,
  SkeletonTable, SkeletonCardList, SkeletonTwoCard, SkeletonSearchBar,
  SkeletonPendingList, SkeletonConfig, SkeletonInline, SkeletonEditor,
} from './Feedback/Skeleton';
export { Spinner, PageSpinner } from './Feedback/Spinner';
export { Button } from './Button/Button';
export { Avatar } from './Data/Avatar';
export { Chip } from './Data/Chip';
export { RecordMeta } from './Data/RecordMeta';
export { Stat } from './Data/Stat';
export { ArchivedToggle } from './Filter/ArchivedToggle';
export { BooleanChip } from './Filter/BooleanChip';
export { FilterBar } from './Filter/FilterBar';
export { GroupByChip } from './Filter/GroupByChip';
export { MoreFilters } from './Filter/MoreFilters';
export { RangeFilter } from './Filter/RangeFilter';
export { SelectChip } from './Filter/SelectChip';
export { FilterChip } from './Filter/FilterChip';
export { SavedViews } from './Filter/SavedViews';
export { SearchInput } from './Filter/SearchInput';
export { ComboBox } from './Form/ComboBox';
export { EditableHeading } from './Form/EditableHeading';
export { EntityLookup } from './Form/EntityLookup';
export { Field, Input } from './Form/Field';
export { InlineComboField } from './Form/InlineComboField';
export { InlineField } from './Form/InlineField';
export { InlineSelect } from './Form/InlineSelect';
export { Select } from './Form/Select';
export { Textarea } from './Form/Textarea';
export { Switch, SettingRow } from './Form/Switch';
export { TagPicker } from './Form/TagPicker';
export { Logo, LogoLockup } from './Logo/Logo';
export { StageBar } from './Navigation/StageBar';
export { Tabs } from './Navigation/Tabs';
export { ConfirmDialog } from './Overlay/ConfirmDialog';
export { Modal, Drawer } from './Overlay/Modal';
export { Toast, ToastStack } from './Overlay/Toast';
export { ConfigList, ConfigDot } from './Surface/ConfigList';
export { EmptyState } from './Surface/EmptyState';
export { PageHeader } from './Surface/PageHeader';
export { Panel } from './Surface/Panel';
export { BulkActionBar } from './Table/BulkActionBar';
export { DataTable } from './Table/DataTable';
export { DensityToggle } from './Table/DensityToggle';
export { GroupedHeader } from './Table/GroupedHeader';
export { Pagination } from './Table/Pagination';
export { SortableHeader } from './Table/SortableHeader';
export { useTheme, ThemeToggle } from './ThemeToggle/ThemeToggle';
