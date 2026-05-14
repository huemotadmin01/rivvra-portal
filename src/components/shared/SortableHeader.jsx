import { useSearchParams } from 'react-router-dom';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

/**
 * SortableHeader — clickable <th> with URL-persisted sort state.
 *
 * 2026-05-13 ATS list-view audit Q4 = A. Single-sort, three-state cycle:
 *   1st click   → sort by this column, asc
 *   2nd click   → flip to desc
 *   3rd click   → clear sort (back to server default)
 *
 * URL params: `sort` (column key) + `dir` (asc|desc).
 *
 *   <SortableHeader column="evaluation">Evaluation</SortableHeader>
 *
 * Inline use inside a normal <thead><tr> — renders a <th>.
 */
export default function SortableHeader({
  column,
  children,
  align = 'left',
  className = '',
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCol = searchParams.get('sort') || '';
  const activeDir = searchParams.get('dir') || '';
  const isActive = activeCol === column;

  const cycle = () => {
    const next = new URLSearchParams(searchParams);
    let newDir = '';
    if (!isActive) {
      newDir = 'asc';
    } else if (activeDir === 'asc') {
      newDir = 'desc';
    } else {
      newDir = ''; // 3rd click clears
    }
    if (newDir) {
      next.set('sort', column);
      next.set('dir', newDir);
    } else {
      next.delete('sort');
      next.delete('dir');
    }
    next.delete('page'); // reset to page 1 on sort change
    setSearchParams(next, { replace: false });
  };

  const Icon = !isActive
    ? ChevronsUpDown
    : activeDir === 'asc' ? ArrowUp : ArrowDown;

  const alignClass = align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : '';

  return (
    <th className={`px-4 py-3 text-${align} text-dark-400 font-medium ${className}`}>
      <button
        type="button"
        onClick={cycle}
        className={`inline-flex items-center gap-1 group hover:text-dark-200 transition-colors ${
          isActive ? 'text-rivvra-300' : ''
        } ${alignClass}`}
      >
        <span>{children}</span>
        <Icon
          size={12}
          className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-30 group-hover:opacity-70'}`}
        />
      </button>
    </th>
  );
}
