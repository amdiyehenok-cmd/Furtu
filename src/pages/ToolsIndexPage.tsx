import { useMemo, useState } from 'react';

import { Icon } from '@/components/Icon';
import { searchTools } from '@/lib/search';
import { CATEGORIES, categoryPath, indexableTools, TOOLS, toolPath } from '@/lib/tools/registry';

export default function ToolsIndexPage() {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return null;
    return searchTools(query, 40).map((hit) => hit.tool);
  }, [query]);

  const byCategory = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        tools: indexableTools().filter((tool) => tool.category === category.id),
      })),
    [],
  );

  return (
    <div className="tool-page">
      <div className="page">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <a href="/">Home</a>
            </li>
            <li aria-current="page">Tools</li>
          </ol>
        </nav>

        <header className="page-head">
          <span className="section-kicker">THE FULL CATALOGUE</span>
          <h1>All tools</h1>
          <p>
            {TOOLS.length} utilities across {CATEGORIES.length} categories. Every one of them works in your
            browser, and every one of them is free. Search by name, or by the problem you are trying to
            solve.
          </p>
        </header>

        <div className="universal-search" style={{ margin: '0 0 40px', cursor: 'text' }}>
          <span className="search-icon-wrap">
            <Icon name="search" size={22} />
          </span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="What do you want to do?"
            aria-label="Search all tools"
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 0,
              background: 'transparent',
              color: 'var(--text)',
              fontSize: 15,
            }}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className="io-btn" onClick={() => setQuery('')}>
              Clear
            </button>
          )}
        </div>

        {results ? (
          <section className="cat-section" style={{ paddingTop: 0 }}>
            <h2>
              {results.length} result{results.length === 1 ? '' : 's'} for “{query}”
            </h2>
            {results.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>
                Nothing matched. Try a plainer phrase — “compress pdf”, “resize image”, “json formatter” — or{' '}
                <a href="/tools">browse by category</a>.
              </p>
            ) : (
              <div className="tool-grid">
                {results.map((tool) => (
                  <a className="tool-card" href={toolPath(tool)} key={tool.slug}>
                    <span className="tool-icon">
                      <Icon name={tool.icon} />
                    </span>
                    <span className="tool-content">
                      <strong>{tool.name}</strong>
                      <small>{tool.summary}</small>
                      <span>{tool.category}</span>
                    </span>
                    <span className="card-arrow">
                      <Icon name="arrow" size={17} />
                    </span>
                  </a>
                ))}
              </div>
            )}
          </section>
        ) : (
          byCategory.map(({ category, tools }) => (
            <section className="cat-section" key={category.id} id={category.segment}>
              <h2>
                <a href={categoryPath(category.segment)} style={{ color: 'inherit' }}>
                  {category.name}{' '}
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 16 }}>({tools.length})</span>
                </a>
              </h2>
              <div className="tool-grid">
                {tools.map((tool) => (
                  <a className="tool-card" href={toolPath(tool)} key={tool.slug} style={{ minHeight: 140 }}>
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
          ))
        )}
      </div>
    </div>
  );
}
