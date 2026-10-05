import { Icon } from '@/components/Icon';
import { guidePath, sortedGuides } from '@/lib/guides';

export default function GuidesPage() {
  const guides = sortedGuides();

  return (
    <div className="tool-page">
      <div className="page">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <a href="/">Home</a>
            </li>
            <li aria-current="page">Guides</li>
          </ol>
        </nav>

        <header className="page-head">
          <span className="section-kicker">GUIDES</span>
          <h1>Guides</h1>
          <p>
            Practical explanations of the problems these tools actually solve — what works, what does not, and
            what the limits are. Written to be useful on their own, not to lead somewhere else.
          </p>
        </header>

        <section className="cat-section" style={{ paddingTop: 0 }}>
          <div className="guide-list">
            {guides.map((guide) => (
              <a className="guide-card" href={guidePath(guide.slug)} key={guide.slug}>
                <span>Guide · {guide.readingMinutes} min read</span>
                <strong>{guide.title}</strong>
                <small>{guide.description}</small>
                <span className="guide-meta">
                  Updated{' '}
                  {new Date(guide.updated).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="cat-section">
          <div className="privacy-section" style={{ margin: 0, gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}>
            <div className="privacy-symbol">
              <Icon name="file" size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: 22 }}>Looking for a tool instead?</h2>
              <p style={{ margin: '10px 0 0' }}>
                Every guide links to the tools it mentions, and the full catalogue is one click away.
              </p>
              <a className="text-link" href="/tools" style={{ marginTop: 14 }}>
                Browse all tools <Icon name="arrow" size={17} />
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
