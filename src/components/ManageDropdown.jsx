import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown, Upload, ListPlus, Pencil, Tag, Trash2, UserCog, Archive, ArchiveRestore, MoreHorizontal,
} from 'lucide-react';

function ManageDropdown({
  lead,
  onExportCRM, onAddToSequence, onAddToList, onEditContact, onTagContact,
  onRemoveContact, onAssignOwner, onArchive, onUnarchive,
  removeLabel = 'Remove contact',
  // 2026-11-03: a 30px "⋯" trigger instead of the wide "Manage ▾" button, for
  // the contacts table (same menu, same actions).
  compact = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 192;
      const dropdownHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      setDropdownPosition({
        ...(openAbove
          ? { top: rect.top - dropdownHeight - 4 }
          : { top: rect.bottom + 4 }),
        left: rect.right - dropdownWidth,
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on scroll
  useEffect(() => {
    if (isOpen) {
      const handleScroll = () => setIsOpen(false);
      window.addEventListener('scroll', handleScroll, true);
      return () => window.removeEventListener('scroll', handleScroll, true);
    }
  }, [isOpen]);

  const handleAction = (action, e) => {
    e.stopPropagation();
    setIsOpen(false);
    action();
  };

  const menuItems = [
    {
      icon: Upload,
      label: 'Export to CRM',
      action: onExportCRM,
    },
    {
      icon: ListPlus,
      label: 'Add to sequence',
      action: onAddToSequence,
    },
    {
      icon: ListPlus,
      label: 'Add to list',
      action: onAddToList,
    },
    {
      icon: Pencil,
      label: 'Edit contact',
      action: onEditContact,
    },
    onAssignOwner ? {
      icon: UserCog,
      label: 'Assign owner',
      action: onAssignOwner,
    } : null,
    {
      icon: Tag,
      label: 'Tag contact',
      action: onTagContact,
    },
    // Archive / Unarchive — platform-wide soft-park action. Visible only when
    // a handler is wired and reflects the lead's current archived state.
    lead?.archived && onUnarchive ? {
      icon: ArchiveRestore,
      label: 'Unarchive',
      action: onUnarchive,
    } : null,
    !lead?.archived && onArchive ? {
      icon: Archive,
      label: 'Archive',
      action: onArchive,
    } : null,
    {
      icon: Trash2,
      label: removeLabel,
      action: onRemoveContact,
      danger: true,
    },
  ].filter(Boolean);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        {...(compact
          ? {
            'aria-label': `More actions for ${lead?.name || 'contact'}`,
            title: 'More actions',
            'aria-expanded': isOpen,
            style: {
              width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--line-2, rgba(255,255,255,.11))',
              background: isOpen ? 'var(--surface-3, #1c242f)' : 'var(--surface-2, #141b24)',
              color: 'var(--fg-2, #bac4d0)',
            },
          }
          : { className: 'flex items-center gap-1.5 px-3 py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-lg text-sm font-medium text-white transition-colors' })}
      >
        {compact ? <MoreHorizontal size={16} /> : (
          <>
            Manage
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-48 bg-dark-800 border border-dark-600 rounded-xl shadow-xl py-1 overflow-hidden"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            zIndex: 9999,
          }}
        >
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={(e) => handleAction(item.action, e)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                item.danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-dark-200 hover:bg-dark-700'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

export default ManageDropdown;
