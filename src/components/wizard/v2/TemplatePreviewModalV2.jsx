import { useState } from 'react';
import { Mail, Clock } from 'lucide-react';
import { SEQUENCE_TEMPLATES, getTemplateStats, computeEmailDay } from '../wizardConstants';
import { Modal, Button, Chip } from '../../ds';

const microStyle = { font: "450 11.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' };

/**
 * Template chooser. `SEQUENCE_TEMPLATES` is imported from the shared constants,
 * NOT copied — the template bodies are the starting text of real outbound
 * emails and must not fork.
 */
function TemplatePreviewModalV2({ isOpen, onClose, onSelectTemplate }) {
  const [selectedId, setSelectedId] = useState(SEQUENCE_TEMPLATES[0]?.id || null);

  if (!isOpen) return null;

  const selectedTemplate = SEQUENCE_TEMPLATES.find(t => t.id === selectedId);
  const stats = selectedTemplate ? getTemplateStats(selectedTemplate.steps) : { emails: 0, totalDays: 0 };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      icon={<Mail size={16} />}
      title="Select a template"
      footer={(
        /* Label is legacy's exactly — "Customize template", not "Use". It says
           what actually happens: the steps are copied into the editor for you
           to edit, not applied as-is. Legacy has no Cancel here either; the
           modal's own close affordance is the dismissal. */
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <Button
            onClick={() => selectedTemplate && onSelectTemplate(selectedTemplate.steps)}
            disabled={!selectedTemplate}
          >
            Customize template
          </Button>
        </div>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 200px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }} className="max-sm:!grid-cols-1">
        {/* Template list */}
        <div style={{ display: 'grid', gap: 4 }} role="listbox" aria-label="Templates">
          {SEQUENCE_TEMPLATES.map(template => {
            const on = selectedId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => setSelectedId(template.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '9px 12px', border: 0,
                  borderRadius: 'var(--r-2, 12px)', cursor: 'pointer',
                  font: "450 13px/1.4 'Inter', system-ui, sans-serif",
                  background: on ? 'var(--brand-soft)' : 'transparent',
                  color: on ? 'var(--brand-ink)' : 'var(--fg-2)',
                }}
              >
                {template.name}
                {template.popular && <Chip tone="warn" style={{ marginLeft: 6 }}>Popular</Chip>}
              </button>
            );
          })}
        </div>

        {/* Preview */}
        {selectedTemplate && (
          <div style={{ minWidth: 0 }}>
            <p style={{ ...microStyle, marginBottom: 10 }}>{selectedTemplate.description}</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Chip><Mail size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />{stats.emails} emails</Chip>
              <Chip><Clock size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />{stats.totalDays} days</Chip>
            </div>
            <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {selectedTemplate.steps.map((step, i) => {
                if (step.type !== 'email') return null;
                const day = computeEmailDay(selectedTemplate.steps, i);
                return (
                  <div key={i} style={{
                    padding: 12, borderRadius: 'var(--r-2, 12px)',
                    background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Chip>Day {day}</Chip>
                      <span style={{ font: "550 12.5px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {step.subject}
                      </span>
                    </div>
                    <p style={{ ...microStyle, whiteSpace: 'pre-wrap', margin: 0 }}>{step.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default TemplatePreviewModalV2;
