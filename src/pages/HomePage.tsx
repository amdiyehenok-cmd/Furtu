import { useMemo, useState } from 'react';

import { Icon } from '@/components/Icon';
import { AdSlot, ADS } from '@/components/AdSlot';
import { useAdsConsent } from '@/lib/ads-consent';
import {
  CATEGORIES,
  categoryPath,
  indexableTools,
  popularTools,
  recentTools,
  toolPath,
  TOOLS,
} from '@/lib/tools/registry';
import { searchTools } from '@/lib/search';

type CategoryFilter = 'all' | (typeof CATEGORIES)[number]['segment'];

/**
 * The homepage, built on the original FURTU design: same hero, same ecosystem
 * rail, same tool grid, same workspace preview, same workflow board, same
 * privacy panel. The only change is that the hardcoded eight-tool array is now
 * read from the registry, so the page can never disagree with the catalogue.
 */
export default function HomePage() {
  const { granted } = useAdsConsent();
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');

  const tabs = useMemo(
    () => [
      { segment: 'all' as const, label: 'All tools' },
      ...CATEGORIES.map((entry) => ({ segment: entry.segment, label: entry.name })),
    ],
    [],
  );

  const visible = useMemo(() => {
    const filtered = indexableTools().filter((tool) => {
      const matchesCategory =
        category === 'all' || CATEGORIES.find((entry) => entry.segment === category)?.id === tool.category;
      return matchesCategory;
    });
    if (!query.trim()) return filtered;
    const allowed = new Set(searchTools(query, 50).map((hit) => hit.tool.slug));
    return filtered.filter((tool) => allowed.has(tool.slug));
  }, [category, query]);

  const featured = popularTools(6);
  const fresh = recentTools(4);
  const totalTools = TOOLS.length;

  return (
    <div className="tool-page">
      {/* --- hero --- */}
      <section className="hero">
        <div className="eyebrow">
          <span className="pulse-dot" /> Fast, private processing
        </div>
        <h1>
          Powerful tools.
          <br />
          <span>Without the complexity.</span>
        </h1>
        <p className="hero-copy">
          Convert, compress, edit and transform your files with {totalTools} fast, private tools that run
          inside your browser. No uploads, no sign-up, no waiting.
        </p>
        <div className="hero-actions">
          <a className="button primary" href="/tools">
            Explore tools <Icon name="arrow" size={18} />
          </a>
          <a className="button secondary" href="#how-it-works">
            See how Furtu works
          </a>
        </div>

        <label className="universal-search" htmlFor="home-search">
          <span className="search-icon-wrap">
            <Icon name="search" size={22} />
          </span>
          <span className="search-placeholder">What do you want to do?</span>
          <span className="search-examples">Try “make this image 200 KB”</span>
          <kbd aria-hidden="true">
            <Icon name="command" size={14} /> K
          </kbd>
          <input
            id="home-search"
            type="text"
            className="visually-hidden"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Furtu tools"
            aria-label="Search Furtu tools"
          />
        </label>

        <div className="trust-row">
          <span>
            <Icon name="lock" size={15} /> Your files never leave your device
          </span>
          <span className="trust-separator" />
          <span>No uploads. No tracking.</span>
        </div>
      </section>

      {/* --- ecosystem rail --- */}
      <section className="ecosystem-section" id="how-it-works">
        <div className="ecosystem">
          <div className="flow-rail top">
            <span />
          </div>
          <div className="flow-step">
            <span className="flow-icon">
              <Icon name="file" />
            </span>
            <div>
              <span className="step-label">INPUT</span>
              <strong>your-file.pdf</strong>
              <small>8.4 MB</small>
            </div>
          </div>
          <div className="flow-step active">
            <span className="flow-icon">
              <Icon name="compress" />
            </span>
            <div>
              <span className="step-label">TRANSFORM</span>
              <strong>Runs in your browser</strong>
              <small>No upload step</small>
            </div>
          </div>
          <div className="flow-step result is-complete">
            <span className="flow-icon">
              <Icon name="download" />
            </span>
            <div>
              <span className="step-label">RESULT</span>
              <strong>Ready to download</strong>
              <small>Private by default</small>
            </div>
          </div>
          <a className="demo-button" href={toolPath(featured[0] ?? TOOLS[0])}>
            Try it now
            <Icon name="arrow" size={16} />
          </a>
        </div>
      </section>

      {/* --- tools --- */}
      <section className="tools-section" id="tools">
        <div className="section-heading">
          <div>
            <span className="section-kicker">ONE PLATFORM</span>
            <h2>Every tool, right where you need it.</h2>
          </div>
          <p>
            A focused collection of precise utilities across {CATEGORIES.length} categories. Discover by
            category, or search for the problem you are trying to solve.
          </p>
        </div>

        <div className="category-tabs" role="tablist" aria-label="Tool categories">
          {tabs.map((tab) => (
            <button
              key={tab.segment}
              role="tab"
              type="button"
              aria-selected={category === tab.segment}
              className={category === tab.segment ? 'selected' : ''}
              onClick={() => setCategory(tab.segment)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="tool-grid">
          {visible.slice(0, 16).map((tool) => (
            <a className="tool-card" href={toolPath(tool)} key={tool.slug}>
              <span className="tool-icon">
                <Icon name={tool.icon} />
              </span>
              <span className="tool-content">
                <strong>{tool.name}</strong>
                <small>{tool.summary}</small>
                <span>
                  {CATEGORIES.find((entry) => entry.id === tool.category)?.name}
                  {tool.popular && <em>Popular</em>}
                </span>
              </span>
              <span className="card-arrow">
                <Icon name="arrow" size={17} />
              </span>
            </a>
          ))}
        </div>

        {visible.length === 0 && (
          <p className="no-results" style={{ padding: 40 }}>
            No tools matched “{query}”. <a href="/tools">Browse the full catalogue</a>.
          </p>
        )}

        <a className="text-link" href="/tools">
          Browse all {totalTools} tools <Icon name="arrow" size={17} />
        </a>
      </section>

      {/* --- workspace --- */}
      <section className="workspace-section" id="workspace">
        <div className="workspace-copy">
          <span className="section-kicker">A BETTER WORKSPACE</span>
          <h2>
            From file to finished,
            <br />
            without the friction.
          </h2>
          <p>
            Every Furtu tool uses one familiar workspace. Clear choices, immediate feedback, and no hidden
            steps — because the same controls should mean the same thing everywhere.
          </p>
          <ul>
            <li>
              <Icon name="check" size={16} /> Process files privately in your browser
            </li>
            <li>
              <Icon name="check" size={16} /> Batch operations with clear progress
            </li>
            <li>
              <Icon name="check" size={16} /> Real limits and honest failure messages
            </li>
          </ul>
        </div>

        <div className="workspace-card">
          <div className="workspace-topbar">
            <div>
              <span>PDF</span>
              <Icon name="chevron" size={13} />
              <strong>Compress PDF</strong>
            </div>
            <span className="private-badge">
              <Icon name="lock" size={13} /> Private
            </span>
          </div>
          <div className="upload-zone">
            <span className="upload-icon">
              <Icon name="upload" size={24} />
            </span>
            <strong>Drop your PDF files here</strong>
            <small>or choose files from your device</small>
            <a className="button primary compact" href={toolPath(TOOLS.find((t) => t.slug === 'compress-pdf') ?? TOOLS[0])}>
              Choose files
            </a>
            <span>PDF · Up to 500 MB per file</span>
          </div>
          <div className="workspace-options">
            <div>
              <small>COMPRESSION</small>
              <strong>Structural</strong>
            </div>
            <div>
              <small>OUTPUT</small>
              <strong>PDF</strong>
            </div>
            <a
              className="icon-button"
              href={toolPath(TOOLS.find((t) => t.slug === 'compress-pdf') ?? TOOLS[0])}
              aria-label="Open Compress PDF"
            >
              <Icon name="arrow" size={17} />
            </a>
          </div>
        </div>
      </section>

      {/* --- categories --- */}
      <section className="tools-section" id="categories" style={{ borderTop: 'none' }}>
        <div className="section-heading">
          <div>
            <span className="section-kicker">CATEGORIES</span>
            <h2>Pick a category, or just search.</h2>
          </div>
          <p>Each category groups tools that share a file type and a task, so related work is one click away.</p>
        </div>
        <div className="tool-grid">
          {CATEGORIES.map((entry) => {
            const count = indexableTools().filter((tool) => tool.category === entry.id).length;
            return (
              <a className="tool-card" href={categoryPath(entry.segment)} key={entry.id}>
                <span className="tool-icon">
                  <Icon name={entry.icon} />
                </span>
                <span className="tool-content">
                  <strong>{entry.name}</strong>
                  <small>{entry.tagline}</small>
                  <span>
                    {count} tool{count === 1 ? '' : 's'} · {entry.formats.slice(0, 3).join(' ')}
                  </span>
                </span>
                <span className="card-arrow">
                  <Icon name="arrow" size={17} />
                </span>
              </a>
            );
          })}
        </div>
      </section>

      {/* --- recent --- */}
      {fresh.length > 0 && (
        <section className="workflow-section" id="new" style={{ paddingTop: 0 }}>
          <div className="section-heading workflow-heading">
            <div>
              <span className="section-kicker">NEW</span>
              <h2>Recently added.</h2>
            </div>
            <p>New tools land in the catalogue regularly, and every one of them works before it is published.</p>
          </div>
          <div className="tool-grid" style={{ marginTop: 40 }}>
            {fresh.map((tool) => (
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
        </section>
      )}

      {/* --- privacy --- */}
      <section className="privacy-section">
        <div className="privacy-symbol">
          <Icon name="lock" size={28} />
        </div>
        <div>
          <span className="section-kicker">PRIVACY, BY DESIGN</span>
          <h2>Your files are yours. Full stop.</h2>
        </div>
        <p>
          Whenever possible, Furtu processes files locally in your browser. They never touch our servers, we
          never store your documents, and we never look inside them. The privacy claim on every tool page is
          derived from how that tool actually works, so it cannot drift away from the truth.
        </p>
        <a className="text-link" href="/privacy">
          How private processing works <Icon name="arrow" size={17} />
        </a>
      </section>

      {/* Below the fold and outside every tool. The one rule that keeps
          monetisation from costing the product more than it earns. */}
      <AdSlot placement={ADS.home} allowed={granted} />
    </div>
  );
}
