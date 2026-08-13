import { Star } from 'lucide-react';

/**
 * RatingStars — a small star rating, read-only or interactive.
 *
 * Replaces `EvalStars`, which existed twice (CrmPipeline and AtsPipeline) and
 * had drifted apart. Each copy had the bug the other had fixed:
 *
 *   - CRM's rendered bare `<Star>` icons with an `onClick`, so an interactive
 *     rating was mouse-only; but it did call `stopPropagation`, which matters
 *     because these sit inside cards that are themselves clickable AND
 *     draggable.
 *   - ATS's rendered real `<button>`s, so it was keyboard-reachable; but it
 *     omitted `stopPropagation`, so rating a card would also open it.
 *
 * This takes the correct half of each: real buttons when interactive, and the
 * click always contained. Neither call site was actually passing `onChange`
 * when this was written — both rendered read-only — so the interactive path
 * was dead code in both files, which is how the two managed to diverge without
 * anyone noticing.
 *
 * Read-only renders no buttons at all: a control nobody can operate should not
 * be in the tab order.
 */
export function RatingStars({
  value = 0,
  max = 3,
  size = 14,
  onChange,
  label = 'Rating',
  style,
  ...rest
}) {
  const interactive = typeof onChange === 'function';

  return (
    <div
      role={interactive ? 'group' : 'img'}
      aria-label={interactive ? label : `${label}: ${value} of ${max}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, ...style }}
      {...rest}
    >
      {Array.from({ length: max }, (_, idx) => {
        const i = idx + 1;
        const on = i <= value;
        const star = (
          <Star
            size={size}
            style={{
              color: on ? 'var(--warn)' : 'var(--fg-faint)',
              fill: on ? 'var(--warn)' : 'none',
              display: 'block',
            }}
          />
        );
        if (!interactive) return <span key={i}>{star}</span>;
        return (
          <button
            key={i}
            type="button"
            // Contained on purpose: these live inside cards that are both
            // clickable and draggable, so a bubbling click would open the
            // record the user was only trying to rate.
            onClick={(e) => { e.stopPropagation(); onChange(i === value ? 0 : i); }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`${label}: ${i} of ${max}`}
            aria-pressed={on}
            style={{
              display: 'grid', placeItems: 'center', padding: 0, border: 'none',
              background: 'transparent', cursor: 'pointer', lineHeight: 0,
            }}
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}
