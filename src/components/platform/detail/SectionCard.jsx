/**
 * SectionCard — shared primitive for detail pages.
 *
 * Used by ContactDetail, EmployeeDetail, and the Employee quick-create
 * flow. Keeps the "titled card with icon + body" pattern consistent across
 * modules so new detail pages (CRM, ATS, …) compose the same way.
 *
 * Props:
 *   title    string   — section heading (optional; omit for bare cards)
 *   icon     Component — lucide-react icon component (optional)
 *   action   ReactNode — right-aligned action slot in the header (e.g. an "Edit" button)
 *   className string   — extra classes on the outer wrapper
 *   children ReactNode — card body
 */
export default function SectionCard({ title, icon: Icon, action, className = '', children }) {
  return (
    <div className={`card p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={16} className="text-dark-400" />}
            {title && <h3 className="text-white font-semibold text-sm">{title}</h3>}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
