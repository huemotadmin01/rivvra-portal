import { Link } from 'react-router-dom';
import Shell from './shell/Shell';
import { Section, Eyebrow } from './shell/ui';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';

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
    parts.push(
      href.startsWith('/')
        ? <Link key={i++} to={href}>{label}</Link>
        : <a key={i++} href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer">{label}</a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function Block({ block }) {
  if (block.p) return <p><Inline text={block.p} /></p>;
  if (block.ul) return <ul>{block.ul.map((item, i) => <li key={i}><Inline text={item} /></li>)}</ul>;
  if (block.callout) return <div className="mk-brand-tint px-5 py-4 my-4"><Inline text={block.callout} /></div>;
  if (block.table) {
    const { head, rows } = block.table;
    return (
      <div className="overflow-x-auto my-4">
        <table className="mk-table">
          <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  return null;
}

export default function LegalDocument({ doc }) {
  useDocumentMeta({ title: doc.title, description: doc.intro, path: `/${doc.slug}` });
  return (
    <Shell>
      <Section className="pt-16 md:pt-24">
        <div className="grid lg:grid-cols-12 gap-10">
          <aside className="lg:col-span-3">
            <Eyebrow>Legal</Eyebrow>
            <h1 className="mk-display mk-h2">{doc.title}</h1>
            <p className="mk-small mt-4">Effective {doc.effectiveDate}<br />Last updated {doc.lastUpdated}</p>
            <nav className="hidden lg:grid gap-2 mt-8 text-[13.5px]" aria-label="Sections">
              {doc.sections.map((s, i) => <a key={s.heading} href={`#s${i + 1}`} style={{ color: 'var(--mk-muted)' }}>{s.heading}</a>)}
            </nav>
            <p className="mk-small mt-8">See also <Link className="mk-accent" to="/terms">Terms</Link> · <Link className="mk-accent" to="/privacy">Privacy</Link></p>
          </aside>
          <div className="lg:col-span-9 mk-prose">
            {doc.intro && <p className="mk-lede" style={{ marginBottom: 32 }}>{doc.intro}</p>}
            {doc.sections.map((s, i) => (
              <section key={s.heading} id={`s${i + 1}`}>
                <h2>{s.heading}</h2>
                {s.blocks.map((b, j) => <Block key={j} block={b} />)}
              </section>
            ))}
          </div>
        </div>
      </Section>
    </Shell>
  );
}
