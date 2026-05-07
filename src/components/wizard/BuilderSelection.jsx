import { useState } from 'react';
import { Mail, PenLine, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../context/PlatformContext';
import TemplatePreviewModal from './TemplatePreviewModal';

function BuilderSelection({ onSelectTemplate, onSelectScratch }) {
  const [showTemplates, setShowTemplates] = useState(false);
  const navigate = useNavigate();
  const { orgPath } = usePlatform();

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate(orgPath('/outreach/engage'))}
        className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition-colors mb-8"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to sequences
      </button>

      {/* Heading */}
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-white mb-2">
          Select a sequence builder to get started
        </h1>
        <p className="text-dark-400 text-sm">
          Whether you use a template or create from scratch, build your sequence with ease
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-6 max-w-xl mx-auto">
        {/* Email Templates */}
        <button
          onClick={() => setShowTemplates(true)}
          className="flex flex-col items-center gap-4 p-8 bg-dark-800/50 border border-dark-700 rounded-2xl hover:border-rivvra-500/40 hover:bg-dark-800 transition-all group"
        >
          <div className="w-16 h-16 rounded-2xl bg-rivvra-500/10 flex items-center justify-center group-hover:bg-rivvra-500/20 transition-colors">
            <Mail className="w-8 h-8 text-rivvra-400" />
          </div>
          <div className="text-center">
            <h3 className="text-base font-semibold text-white mb-1">Email templates</h3>
            <p className="text-xs text-dark-400">Enhance our email templates with your personalized touch</p>
          </div>
        </button>

        {/* Create from scratch */}
        <button
          onClick={onSelectScratch}
          className="flex flex-col items-center gap-4 p-8 bg-dark-800/50 border border-dark-700 rounded-2xl hover:border-rivvra-500/40 hover:bg-dark-800 transition-all group"
        >
          <div className="w-16 h-16 rounded-2xl bg-dark-700/50 flex items-center justify-center group-hover:bg-dark-700 transition-colors">
            <PenLine className="w-8 h-8 text-dark-300" />
          </div>
          <div className="text-center">
            <h3 className="text-base font-semibold text-white mb-1">Create from scratch</h3>
            <p className="text-xs text-dark-400">Write original emails and set triggers on your own</p>
          </div>
        </button>
      </div>

      {/* Template Modal */}
      {showTemplates && (
        <TemplatePreviewModal
          isOpen={showTemplates}
          onClose={() => setShowTemplates(false)}
          onSelectTemplate={(steps) => {
            setShowTemplates(false);
            onSelectTemplate(steps);
          }}
        />
      )}
    </div>
  );
}

export default BuilderSelection;
