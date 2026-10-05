import type { ReactNode } from 'react';

import { Icon } from './Icon';

export interface TocItem {
  id: string;
  label: string;
}

export function PageShell({
  kicker,
  title,
  intro,
  toc,
  children,
  updated,
}: {
  kicker: string;
  title: string;
  intro: string;
  toc?: TocItem[];
  children: ReactNode;
  updated?: string;
}) {
  return (
    <div className="tool-page">
      <div className="page-narrow">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <a href="/">Home</a>
            </li>
            <li aria-current="page">{title}</li>
          </ol>
        </nav>

        <header className="article-head">
          <span className="section-kicker">{kicker}</span>
          <h1>{title}</h1>
          <p>{intro}</p>
          {toc && toc.length > 0 && (
            <nav className="toc" aria-label="On this page">
              <h2>On this page</h2>
              <ol>
                {toc.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`}>{item.label}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {updated && (
            <p className="guide-meta" style={{ marginTop: 16 }}>
              Last updated {updated}
            </p>
          )}
        </header>

        <div className="prose article-body">{children}</div>
      </div>
    </div>
  );
}

export function Callout({ children, title = 'Worth knowing' }: { children: ReactNode; title?: string }) {
  return (
    <section
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-subtle)',
        padding: 20,
        marginBottom: 24,
      }}
    >
      <h2 style={{ fontSize: 14, fontFamily: 'var(--font-technical)', letterSpacing: '.02em' }}>
        <Icon name="spark" size={15} /> {title}
      </h2>
      <p style={{ margin: 0, fontSize: 13.5 }}>{children}</p>
    </section>
  );
}

export function RelatedTools({ slugs }: { slugs: { name: string; href: string; summary: string }[] }) {
  if (slugs.length === 0) return null;
  return (
    <section aria-labelledby="related-tools">
      <h2 id="related-tools">Try these instead</h2>
      <div className="related-grid">
        {slugs.map((tool) => (
          <a className="related-card" href={tool.href} key={tool.href}>
            <div>
              <strong>{tool.name}</strong>
              <span>{tool.summary}</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
