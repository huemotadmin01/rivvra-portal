import { useState } from 'react';
import { X, UserCog, Loader2 } from 'lucide-react';

function AssignOwnerModal({ isOpen, onClose, teamMembers = [], selectedCount = 1, onConfirm }) {
  const [selectedOwner, setSelectedOwner] = useState('');
  const [assigning, setAssigning] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!selectedOwner) return;
    setAssigning(true);
    try {
      await onConfirm(selectedOwner);
      onClose();
    } catch (err) {
      console.error('Failed to assign owner:', err);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm"
        onClick={() => !assigning && onClose()}
      />
      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <button
          onClick={onClose}
          disabled={assigning}
          className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-rivvra-500/10 flex items-center justify-center">
            <UserCog className="w-6 h-6 text-rivvra-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Assign Owner</h2>
            <p className="text-dark-400 text-sm">
              {selectedCount === 1 ? 'Reassign this contact' : `Reassign ${selectedCount} contacts`}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-dark-300 mb-2">Select team member</label>
          <select
            value={selectedOwner}
            onChange={(e) => setSelectedOwner(e.target.value)}
            className="w-full px-4 py-3 bg-dark-800 border border-dark-600 rounded-xl text-white focus:outline-none focus:border-rivvra-500 transition-colors"
          >
            <option value="">Choose a team member...</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} ({member.email})
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={assigning}
            className="flex-1 px-4 py-2.5 rounded-xl bg-dark-800 text-white font-medium hover:bg-dark-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedOwner || assigning}
            className="flex-1 px-4 py-2.5 rounded-xl bg-rivvra-500 text-dark-950 font-semibold hover:bg-rivvra-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {assigning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <UserCog className="w-4 h-4" />
                Assign
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AssignOwnerModal;
