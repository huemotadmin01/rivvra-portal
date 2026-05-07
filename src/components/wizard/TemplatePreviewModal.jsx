import { useState } from 'react';
import { X, Mail, Clock } from 'lucide-react';
import { SEQUENCE_TEMPLATES, getTemplateStats, computeEmailDay } from './wizardConstants';

function TemplatePreviewModal({ isOpen, onClose, onSelectTemplate }) {
  const [selectedId, setSelectedId] = useState(SEQUENCE_TEMPLATES[0]?.id || null);

  if (!isOpen) return null;

  const selectedTemplate = SEQUENCE_TEMPLATES.find(t => t.id === selectedId);
  const stats = selectedTemplate ? getTemplateStats(selectedTemplate.steps) : { emails: 0, totalDays: 0 };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <h2 className="text-lg font-semibold text-white">Select a template</h2>
          <button onClick={onClose} className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left — Template list */}
          <div className="w-56 border-r border-dark-700 overflow-y-auto p-3 space-y-1">
            {SEQUENCE_TEMPLATES.map(template => (
              <button
                key={template.id}
                onClick={() => setSelectedId(template.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  selectedId === template.id
                    ? 'bg-rivvra-500/10 text-rivvra-400 border border-rivvra-500/20'
                    : 'text-dark-300 hover:bg-dark-800 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{template.name}</span>
                  {template.popular && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-rivvra-500/10 text-rivvra-400 rounded-full">Popular</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Right — Preview */}
          <div className="flex-1 overflow-y-auto p-5">
            {selectedTemplate ? (
              <>
                {/* Preview header */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-dark-500 uppercase tracking-wider font-semibold">Preview</span>
                  <span className="text-xs text-dark-400">
                    {stats.emails} automated emails | {stats.totalDays} days
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-white mb-1">{selectedTemplate.name}</h3>
                <p className="text-sm text-dark-400 mb-6">{selectedTemplate.description}</p>

                <div className="h-px bg-dark-700 mb-5" />

                {/* Email previews */}
                <div className="space-y-4">
                  {selectedTemplate.steps.map((step, i) => {
                    if (step.type === 'wait') return null;

                    const emailNum = selectedTemplate.steps.slice(0, i + 1).filter(s => s.type === 'email').length;
                    const day = computeEmailDay(selectedTemplate.steps, i);

                    return (
                      <div key={i}>
                        {/* Day badge */}
                        <div className="flex items-center gap-2 mb-2">
                          <Mail className="w-3.5 h-3.5 text-dark-500" />
                          <span className="text-xs font-semibold text-dark-400">Day {day}</span>
                        </div>

                        {/* Email card */}
                        <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
                          <p className="text-sm font-medium text-white mb-2">
                            Subject: {step.subject}
                          </p>
                          <p className="text-xs text-dark-400 whitespace-pre-line line-clamp-3">
                            {step.body}
                          </p>
                        </div>

                        {/* Wait indicator */}
                        {i + 1 < selectedTemplate.steps.length && selectedTemplate.steps[i + 1]?.type === 'wait' && (
                          <div className="flex items-center gap-2 mt-3 ml-4">
                            <Clock className="w-3 h-3 text-dark-600" />
                            <span className="text-xs text-dark-500">
                              {selectedTemplate.steps[i + 1].days} days after the previous email - if no reply
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-dark-500 text-sm">
                Select a template to preview
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-4 border-t border-dark-700">
          <button
            onClick={() => onSelectTemplate([...selectedTemplate.steps])}
            disabled={!selectedTemplate}
            className="px-6 py-2.5 bg-rivvra-500 text-dark-950 rounded-xl text-sm font-semibold hover:bg-rivvra-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Customize template
          </button>
        </div>
      </div>
    </div>
  );
}

export default TemplatePreviewModal;
