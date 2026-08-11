import { FilterChip } from './FilterChip';

/** Yes/Any toggle chip. Controlled: `checked` + `onChange(nextBool)`. */
export function BooleanChip({ label, checked = false, onChange, onLabel = 'Yes', anyLabel = 'Any' }) {
  return (
    <FilterChip
      label={label}
      value={checked ? onLabel : anyLabel}
      active={checked}
      onClick={() => onChange?.(!checked)}
      onRemove={checked ? () => onChange?.(false) : undefined}
    />
  );
}
