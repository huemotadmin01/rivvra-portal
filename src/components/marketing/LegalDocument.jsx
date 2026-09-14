import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import MarketingLayout from './MarketingLayout';

/**
 * Renders a legal document from src/content/legal/*.js inside the marketing
 * shell. The same content module feeds scripts/build-legal-static.mjs, so
 * the /terms route and terms-of-service.html can never drift again.
 */

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

// Inline [label](href) → <a> / <Link>. Internal paths stay client-side.
function Inline({ text }) {
  const parts = [];
  let last = 0;
  let m;
  let i = 0;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const [, label, href] = m;
    const cls = 'text-rivvra-400 hover:text-rivvra-300 transition-colors underline-offset-2 hover:underline';
    parts.push(
      href.startsWith('/')
        ? <Link key={i++} to={href} className={cls}>{label}</Link>
        : <a key={i++} href={href} className={cls} target={href.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer">{label}</a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function Block({ block }) {
  if (block.p) return <p><Inline text={block.p} /></p>;
  if (block.ul) {
    return (
      <ul className="list-disc list-outside pl-5 space-y-2">
        {block.ul.map((item, i) => <li key={i}><Inline text={item} /></li>)}
      </ul>
    );
  }
  if (block.callout) {
    return (
      <div className="rounded-xl border border-rivvra-500/25 bg-rivvra-500/[0.06] px-5 py-4 text-dark-200">
        <Inline text={block.callout} />
      </div>
    );
  }
  if (block.table) {
    const { head, rows } = block.table;
    return (
      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <table className="w-full text-[14px]">
          <thead className="bg-white/[0.03] text-dark-400 text-left">
            <tr>{head.map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-white/[0.06]">
                {r.map((c, j) => <td key={j} className={`px-4 py-2.5 align-top ${j === 0 ? 'text-white font-medium whitespace-nowrap' : ''}`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

export default function LegalDocument({ doc }) {
  return (
    <MarketingLayout>
      <main className="relative z-10 max-w-3xl mx-auto px-6 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-dark-400 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to home
        </Link>

        <h1 className="text-4xl font-bold text-white mb-3">{doc.title}</h1>
        <p className="text-dark-400 text-sm mb-6">
          Effective {doc.effectiveDate} · Last updated {doc.lastUpdated}
        </p>
        {doc.intro && <p className="text-dark-300 text-[17px] leading-relaxed mb-12 max-w-2xl">{doc.intro}</p>}

        <div className="space-y-10 text-dark-300 leading-relaxed">
          {doc.sections.map((s) => (
            <section key={s.heading} className="space-y-4">
              <h2 className="text-xl font-semibold text-white">{s.heading}</h2>
              {s.blocks.map((b, i) => <Block key={i} block={b} />)}
            </section>
          ))}
        </div>

        <p className="mt-14 text-sm text-dark-500">
          See also: <Link to="/terms" className="text-rivvra-400 hover:text-rivvra-300">Terms of Service</Link> · <Link to="/privacy" className="text-rivvra-400 hover:text-rivvra-300">Privacy Policy</Link>
        </p>
      </main>
    </MarketingLayout>
  );
}
