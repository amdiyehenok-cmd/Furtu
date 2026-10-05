import { Icon } from '@/components/Icon';
import { CATEGORY_BY_SEGMENT, relatedTools, toolPath, toolsByCategory } from '@/lib/tools/registry';
import type { ToolDefinition } from '@/lib/tools/types';

export default function CategoryPage({ segment }: { segment: string }) {
  const category = CATEGORY_BY_SEGMENT.get(segment);
  const tools = category ? toolsByCategory(category.id) : [];

  if (!category) {
    return (
      <div className="notfound">
        <div>
          <h1>Category not found</h1>
          <p>That category does not exist.</p>
          <div className="hero-actions">
            <a className="button primary" href="/tools">
              Browse all tools
            </a>
          </div>
        </div>
      </div>
    );
  }

  // A representative tool from each other category, so the page is a hub
  // rather than a dead end.
  const crossLinks = tools.slice(0, 3);

  return (
    <div className="tool-page">
      <div className="page">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <a href="/">Home</a>
            </li>
            <li>
              <a href="/tools">Tools</a>
            </li>
            <li aria-current="page">{category.name}</li>
          </ol>
        </nav>

        <header className="cat-hero">
          <span className="section-kicker">{category.name}</span>
          <h1>{category.name} tools</h1>
          <p>{category.description}</p>
          <span className="cat-count">
            <Icon name={category.icon} size={13} />
            {tools.length} tools · {category.formats.join(', ')} · processed locally
          </span>
        </header>

        <section className="cat-section" style={{ paddingTop: 34 }}>
          <div className="tool-grid is-wide">
            {tools.map((tool) => (
              <a className="tool-card" href={toolPath(tool)} key={tool.slug}>
                <span className="tool-icon">
                  <Icon name={tool.icon} />
                </span>
                <span className="tool-content">
                  <strong>{tool.name}</strong>
                  <small>{tool.summary}</small>
                  <span>
                    {tool.keywords[0]}
                    {tool.popular && <em>Popular</em>}
                  </span>
                </span>
                <span className="card-arrow">
                  <Icon name="arrow" size={17} />
                </span>
              </a>
            ))}
          </div>
        </section>

        {crossLinks.length > 0 && (
          <section className="cat-section">
            <h2>Common {category.name.toLowerCase()} jobs</h2>
            <div className="prose">
              <p>
                Most people arrive here with one of a handful of jobs in mind. These three cover the
                majority of it, and each one is a working tool rather than a description of one.
              </p>
            </div>
            <div className="related-grid">
              {crossLinks.map((tool) => (
                <RelatedCard tool={tool} key={tool.slug} />
              ))}
            </div>
          </section>
        )}

        {tools[0] && (
          <section className="cat-section">
            <h2>Where to go next</h2>
            <div className="prose">
              <p>These are the tools people usually reach for alongside the {category.name.toLowerCase()} work.</p>
            </div>
            <div className="related-grid">
              {relatedTools(tools[0], 6)
                .filter((tool) => tool.category !== category.id)
                .slice(0, 3)
                .map((tool) => (
                  <RelatedCard tool={tool} key={tool.slug} />
                ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function RelatedCard({ tool }: { tool: ToolDefinition }) {
  return (
    <a className="related-card" href={toolPath(tool)}>
      <span className="tool-icon mini">
        <Icon name={tool.icon} size={17} />
      </span>
      <div>
        <strong>{tool.name}</strong>
        <span>{tool.summary}</span>
      </div>
    </a>
  );
}
