import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/** Building blocks for the light marketing surface. Colour comes from
 *  marketing.css tokens only; Tailwind here is layout. */

export function Section({ children, className = '', tight = false, line = false, id }) {
  return (
    <section id={id} className={`mk-section ${tight ? 'mk-section--tight' : ''} ${line ? 'mk-section--line' : ''} ${className}`}>
      <div className="mk-wrap">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }) {
  return <p className="mk-eyebrow mb-4">{children}</p>;
}

export function Heading({ as: Tag = 'h2', size = 'h2', children, className = '' }) {
  return <Tag className={`mk-display mk-${size} ${className}`}>{children}</Tag>;
}

export function Button({ to, href, onClick, variant = 'primary', size, children, arrow = false, className = '', ...rest }) {
  const cls = `mk-btn mk-btn--${variant} ${size ? `mk-btn--${size}` : ''} ${className}`;
  const inner = (<>{children}{arrow && <ArrowRight style={{ width: 16, height: 16 }} />}</>);
  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>;
  if (href) return <a href={href} className={cls} target="_blank" rel="noopener noreferrer" {...rest}>{inner}</a>;
  return <button type="button" onClick={onClick} className={cls} {...rest}>{inner}</button>;
}

/** Product screenshot in a hairline frame. Images are 2400×1500 WebPs under
 *  /shots; width/height are declared so nothing shifts while they load. */
export function Shot({ src, alt, caption, bar = true, crop, priority = false, className = '' }) {
  return (
    <figure className={`m-0 ${className}`}>
      <div className={`mk-shot ${bar ? 'mk-shot--bar' : ''} ${crop ? `mk-shot--${crop}` : ''}`}>
        <img src={src} alt={alt} width="2400" height="1500" loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : undefined} />
      </div>
      {caption && <figcaption className="mk-shot-caption">{caption}</figcaption>}
    </figure>
  );
}

export function AppIcon({ app, size = 40 }) {
  const Icon = app.icon;
  return (
    <span className={`mk-app-icon mk-app-icon--${app.tint}`} style={{ width: size, height: size }} aria-hidden="true">
      <Icon />
    </span>
  );
}

export function CtaBand({ title, text, onTalk }) {
  return (
    <Section line>
      <div className="mk-brand-tint px-6 py-12 md:px-14 md:py-16 grid md:grid-cols-[1fr_auto] gap-8 items-center">
        <div>
          <h2 className="mk-display mk-h2">{title}</h2>
          <p className="mk-lede mt-3">{text}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button to="/signup" size="lg" arrow>Start for free</Button>
          <Button variant="secondary" size="lg" onClick={onTalk}>Talk to us</Button>
        </div>
      </div>
    </Section>
  );
}
