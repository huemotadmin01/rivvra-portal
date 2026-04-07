import { X, Sparkles } from 'lucide-react';

function ComingSoonModal({ isOpen, onClose, feature }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-fade-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-amber-400" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            Work in Progress
          </h2>

          <p className="text-dark-400 mb-6">
            <span className="text-white font-medium">{feature || 'This feature'}</span> is currently being built and will be available soon.
          </p>

          <div className="bg-dark-800/50 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-medium text-white mb-2">Pro Plan Includes:</h3>
            <ul className="text-sm text-dark-400 space-y-1">
              <li>✨ AI Email Generation</li>
              <li>✨ LinkedIn DM Writer</li>
              <li>✨ CRM Integration</li>
              <li>✨ Bulk Export</li>
              <li>✨ Priority Support</li>
            </ul>
          </div>

          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-dark-950 font-semibold hover:from-amber-400 hover:to-orange-400 transition-all"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export default ComingSoonModal;
