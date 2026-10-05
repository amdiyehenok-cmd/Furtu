import { Icon } from '@/components/Icon';
import type { Guide, GuideBlock } from '@/lib/guides';
import { toolPath, getTool } from '@/lib/tools/registry';

function renderBlock(block: GuideBlock, key: string) {
  switch (block.kind) {
    case 'p':
      return <p key={key}>{block.text}</p>;
    case 'h2':
      return (
        <h2 id={block.id} key={key}>
          {block.text}
        </h2>
      );
    case 'ul':
      return (
        <ul key={key}>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key}>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <table key={key}>
          <thead>
            <tr>
              {block.head.map((cell) => (
                <th key={cell} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.join('|')}>
                {row.map((cell, index) => (
                  <td key={`${row[0]}-${index}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'note':
      return (
        <section
          key={key}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-subtle)',
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontSize: 14, fontFamily: 'var(--font-technical)' }}>
            <Icon name="spark" size={15} /> {block.title}
          </h2>
          <p style={{ margin: 0, fontSize: 13.5 }}>{block.text}</p>
        </section>
      );
    case 'tools': {
      const tools = block.slugs.map((slug) => getTool(slug)).filter((tool) => tool !== null);
      if (tools.length === 0) return null;
      return (
        <section key={key} aria-labelledby={`${key}-tools`}>
          <h2 id={`${key}-tools`}>Tools mentioned in this guide</h2>
          <div className="related-grid">
            {tools.map((tool) => (
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
        </section>
      );
    }
    default:
      return null;
  }
}

function tocFrom(guide: Guide) {
  return guide.blocks
    .filter((block): block is Extract<GuideBlock, { kind: 'h2' }> => block.kind === 'h2')
    .map((block) => ({ id: block.id, label: block.text }));
}

export default function GuidePage({ guide }: { guide: Guide }) {
  const toc = tocFrom(guide);

  return (
    <div className="tool-page">
      <div className="page-narrow">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <a href="/">Home</a>
            </li>
            <li>
              <a href="/guides">Guides</a>
            </li>
            <li aria-current="page">{guide.title}</li>
          </ol>
        </nav>

        <header className="article-head">
          <span className="section-kicker">
            Guide · {guide.readingMinutes} min read
          </span>
          <h1>{guide.title}</h1>
          <p>{guide.description}</p>
          {toc.length > 0 && (
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
          <p className="guide-meta" style={{ marginTop: 16 }}>
            Updated{' '}
            {new Date(guide.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </header>

        <div className="prose article-body">
          {guide.blocks.map((block, index) => renderBlock(block, `block-${index}`))}
        </div>
      </div>
    </div>
  );
}
