import { useState, useEffect } from 'react';
import { X, Search, Plus, Check, RefreshCw } from 'lucide-react';
import api from '../utils/api';

const LIST_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
  'bg-yellow-500', 'bg-cyan-500'
];

function getListColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return LIST_COLORS[Math.abs(hash) % LIST_COLORS.length];
}

function AddToListModal({ isOpen, onClose, lead, onLeadUpdate }) {
  const [lists, setLists] = useState([]);
  const [selectedLists, setSelectedLists] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);

  // Load lists and set initial selection when modal opens
  useEffect(() => {
    if (isOpen && lead) {
      setLoading(true);
      setSearchQuery('');
      setShowCreateInput(false);
      setNewListName('');
      setSelectedLists(lead.lists || []);

      api.getLists()
        .then(response => {
          if (response.success) {
            setLists(response.lists || []);
          }
        })
        .catch(err => console.error('Failed to load lists:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, lead]);

  if (!isOpen || !lead) return null;

  const filteredLists = lists.filter(list =>
    list.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleList = (listName) => {
    setSelectedLists(prev =>
      prev.includes(listName)
        ? prev.filter(n => n !== listName)
        : [...prev, listName]
    );
  };

  const handleCreateList = async () => {
    const trimmed = newListName.trim();
    if (!trimmed) return;

    // Check duplicate
    if (lists.some(l => l.name.toLowerCase() === trimmed.toLowerCase())) {
      setNewListName('');
      setShowCreateInput(false);
      // Auto-select the existing list
      if (!selectedLists.includes(trimmed)) {
        setSelectedLists(prev => [...prev, trimmed]);
      }
      return;
    }

    setCreating(true);
    try {
      const response = await api.createList(trimmed);
      if (response.success) {
        setLists(prev => [response.list, ...prev]);
        setSelectedLists(prev => [...prev, trimmed]);
        setNewListName('');
        setShowCreateInput(false);
      }
    } catch (err) {
      console.error('Failed to create list:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateLeadLists(lead._id, selectedLists);
      const updatedLead = { ...lead, lists: selectedLists };
      onLeadUpdate(updatedLead);
      onClose();
    } catch (err) {
      console.error('Failed to update lead lists:', err);
    } finally {
      setSaving(false);
    }
  };

  // Check if selection changed from initial state
  const initialLists = lead.lists || [];
  const hasChanges =
    selectedLists.length !== initialLists.length ||
    selectedLists.some(l => !initialLists.includes(l)) ||
    initialLists.some(l => !selectedLists.includes(l));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="p-6 pb-4">
          <h2 className="text-xl font-bold text-white">
            Add 1 contact to list
          </h2>
          <p className="text-dark-400 text-sm mt-1">
            Manage all your data in one place for smarter, seamless outreach
          </p>
        </div>

        {/* Search */}
        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500 text-sm"
            />
          </div>
        </div>

        {/* Lists */}
        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          {loading ? (
            <div className="py-8 text-center">
              <div className="w-6 h-6 border-2 border-rivvra-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-dark-500 text-sm">Loading lists...</p>
            </div>
          ) : filteredLists.length === 0 && !showCreateInput ? (
            <div className="py-8 text-center">
              <p className="text-dark-500 text-sm">
                {searchQuery ? 'No lists found' : 'No lists yet. Create one below.'}
              </p>
            </div>
          ) : (
            <>
              {/* My Lists (custom) */}
              {filteredLists.filter(l => !l.isDefault).length > 0 && (
                <>
                  <p className="text-xs text-dark-500 font-medium uppercase tracking-wider mb-2">My Lists</p>
                  <div className="space-y-1">
                    {filteredLists.filter(l => !l.isDefault).map((list) => {
                      const isSelected = selectedLists.includes(list.name);
                      const colorClass = getListColor(list.name);
                      const initial = list.name.charAt(0).toUpperCase();

                      return (
                        <button
                          key={list._id}
                          onClick={() => toggleList(list.name)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                            isSelected
                              ? 'bg-rivvra-500/10 border border-rivvra-500/30'
                              : 'hover:bg-dark-800 border border-transparent'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center flex-shrink-0`}>
                            <span className="text-white text-sm font-bold">{initial}</span>
                          </div>
                          <span className={`text-sm font-medium flex-1 ${isSelected ? 'text-white' : 'text-dark-200'}`}>
                            {list.name}
                          </span>
                          {isSelected && (
                            <Check className="w-4 h-4 text-rivvra-400 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Default Lists */}
              {filteredLists.filter(l => l.isDefault).length > 0 && (
                <>
                  <p className={`text-xs text-dark-500 font-medium uppercase tracking-wider mb-2 ${filteredLists.some(l => !l.isDefault) ? 'mt-4' : ''}`}>Default Lists</p>
                  <div className="space-y-1">
                    {filteredLists.filter(l => l.isDefault).map((list) => {
                      const isSelected = selectedLists.includes(list.name);
                      const colorClass = getListColor(list.name);
                      const initial = list.name.charAt(0).toUpperCase();

                      return (
                        <button
                          key={list._id}
                          onClick={() => toggleList(list.name)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                            isSelected
                              ? 'bg-rivvra-500/10 border border-rivvra-500/30'
                              : 'hover:bg-dark-800 border border-transparent'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center flex-shrink-0`}>
                            <span className="text-white text-sm font-bold">{initial}</span>
                          </div>
                          <span className={`text-sm font-medium flex-1 ${isSelected ? 'text-white' : 'text-dark-200'}`}>
                            {list.name}
                          </span>
                          {isSelected && (
                            <Check className="w-4 h-4 text-rivvra-400 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {/* Inline create new list */}
          {showCreateInput && (
            <div className="mt-2 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center flex-shrink-0">
                <Plus className="w-4 h-4 text-dark-400" />
              </div>
              <input
                type="text"
                placeholder="Enter list name"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateList();
                  if (e.key === 'Escape') {
                    setShowCreateInput(false);
                    setNewListName('');
                  }
                }}
                autoFocus
                disabled={creating}
                className="flex-1 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-rivvra-500 text-sm"
              />
              <button
                onClick={handleCreateList}
                disabled={!newListName.trim() || creating}
                className="px-3 py-2 bg-rivvra-500 text-dark-950 rounded-lg text-sm font-medium hover:bg-rivvra-400 transition-colors disabled:opacity-50"
              >
                {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Add'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 flex items-center justify-between border-t border-dark-800 mt-2">
          <button
            onClick={() => {
              setShowCreateInput(true);
              setNewListName('');
            }}
            className="text-sm font-medium text-rivvra-400 hover:text-rivvra-300 transition-colors"
          >
            Create new list
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-5 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Add to list'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddToListModal;
