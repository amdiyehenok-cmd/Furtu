import { Icon } from '@/components/Icon';
import { popularTools, toolPath } from '@/lib/tools/registry';

export default function NotFoundPage() {
  const suggestions = popularTools(4);

  return (
    <div className="notfound">
      <div>
        <span className="section-kicker">404</span>
        <h1>That page does not exist.</h1>
        <p>
          The link may be out of date, or the tool may have moved. Search the catalogue, or start from one
          of these.
        </p>
        <div className="hero-actions">
          <a className="button primary" href="/tools">
            Browse all tools <Icon name="arrow" size={18} />
          </a>
          <a className="button secondary" href="/">
            Go to the homepage
          </a>
        </div>

        <div className="related-grid" style={{ marginTop: 48, textAlign: 'left' }}>
          {suggestions.map((tool) => (
            <a className="related-card" href={toolPath(tool)} key={tool.slug}>
              <span className="tool-icon mini">
                <Icon name={tool.icon} size={17} />
              </span>
              <div>
                <strong>{tool.name}</strong>
                <span>{tool.summary}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
