import { useState } from 'react';
import { Mail, PenLine, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../../context/PlatformContext';
import TemplatePreviewModalV2 from './TemplatePreviewModalV2';
import { Button } from '../../ds';

/** First wizard screen: template or scratch. */
function BuilderSelectionV2({ onSelectTemplate, onSelectScratch }) {
  const [showTemplates, setShowTemplates] = useState(false);
  const navigate = useNavigate();
  const { orgPath } = usePlatform();

  const card = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    padding: 32, borderRadius: 'var(--r-3, 16px)', border: 0, cursor: 'pointer',
    background: 'var(--surface-2)', boxShadow: '0 0 0 1px var(--line)',
    transition: 'background 140ms var(--e-out, ease), box-shadow 140ms var(--e-out, ease)',
  };
  const tile = (tone) => ({
    width: 64, height: 64, borderRadius: 'var(--r-3, 16px)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: tone === 'brand' ? 'var(--brand-soft)' : 'var(--surface-3)',
    color: tone === 'brand' ? 'var(--brand-ink)' : 'var(--fg-3)',
  });

  return (
    <div style={{ maxWidth: 768, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <Button variant="ghost" size="sm" onClick={() => navigate(orgPath('/outreach/engage'))}
          iconLeft={<ChevronLeft size={16} />}>
          Back to sequences
        </Button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ font: "700 22px/1.25 'Inter', system-ui, sans-serif", color: 'var(--fg)', margin: '0 0 8px' }}>
          Select a sequence builder to get started
        </h1>
        <p style={{ font: "450 12.5px/1.5 'Inter', system-ui, sans-serif", color: 'var(--fg-3)', margin: 0 }}>
          Whether you use a template or create from scratch, build your sequence with ease
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, maxWidth: 576, margin: '0 auto' }}>
        <button
          type="button"
          onClick={() => setShowTemplates(true)}
          style={card}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 0 1px var(--brand)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 0 1px var(--line)'; }}
        >
          <span style={tile('brand')}><Mail size={30} /></span>
          <span style={{ textAlign: 'center' }}>
            <span style={{ display: 'block', font: "600 14px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 4 }}>
              Email templates
            </span>
            <span style={{ font: "450 11.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
              Enhance our email templates with your personalized touch
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onSelectScratch}
          style={card}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 0 1px var(--brand)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 0 1px var(--line)'; }}
        >
          <span style={tile('neutral')}><PenLine size={30} /></span>
          <span style={{ textAlign: 'center' }}>
            <span style={{ display: 'block', font: "600 14px/1.4 'Inter', system-ui, sans-serif", color: 'var(--fg)', marginBottom: 4 }}>
              Create from scratch
            </span>
            <span style={{ font: "450 11.5px/1.45 'Inter', system-ui, sans-serif", color: 'var(--fg-4)' }}>
              Write original emails and set triggers on your own
            </span>
          </span>
        </button>
      </div>

      {showTemplates && (
        <TemplatePreviewModalV2
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

export default BuilderSelectionV2;
