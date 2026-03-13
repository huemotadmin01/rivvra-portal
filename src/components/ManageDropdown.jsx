import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown, Upload, ListPlus, Pencil, Tag, Trash2, UserCog
} from 'lucide-react';

function ManageDropdown({ lead, onExportCRM, onAddToSequence, onAddToList, onEditContact, onTagContact, onRemoveContact, onAssignOwner, removeLabel = 'Remove contact' }) {
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
        className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-lg text-sm font-medium text-white transition-colors"
      >
        Manage
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
