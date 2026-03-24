import { Link } from 'react-router-dom';
import { useBreadcrumbs } from '../../hooks/useBreadcrumbs';
import { ChevronRight } from 'lucide-react';

export default function Breadcrumbs() {
  const crumbs = useBreadcrumbs();

  // Don't show if just the app name or no crumbs
  if (!crumbs || crumbs.length <= 1) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="px-4 md:px-6 py-2 border-b border-dark-800/50 overflow-x-auto scrollbar-hide"
    >
      <ol className="flex items-center gap-1 text-sm whitespace-nowrap">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;

          return (
            <li key={i} className="flex items-center gap-1 min-w-0">
              {i > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-dark-600 flex-shrink-0" />
              )}
              {isLast || !crumb.path ? (
                <span className={`truncate max-w-[200px] ${
                  isLast ? 'text-dark-200 font-medium' : 'text-dark-500'
                }`}>
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.path}
                  className="text-dark-400 hover:text-rivvra-400 transition-colors truncate max-w-[200px]"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
