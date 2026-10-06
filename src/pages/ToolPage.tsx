import { Icon } from '@/components/Icon';
import { AdSlot, ADS } from '@/components/AdSlot';
import { ToolWorkspace } from '@/components/workspace/ToolWorkspace';
import { formatBytes } from '@/lib/format';
import {
  CATEGORY_BY_ID,
  relatedTools,
  siblingTools,
  toolPath,
  toolsByCategory,
} from '@/lib/tools/registry';
import type { ToolDefinition } from '@/lib/tools/types';
import { SITE } from '@/lib/site';

/**
 * The SEO page template from the brief, rendered from tool metadata.
 *
 * The order is deliberate: breadcrumb, H1, what it does, the tool, then the
 * supporting material a reader actually needs — formats, how it works, limits,
 * FAQ, related tools. All of it is present in the initial HTML, so a crawler
 * and an answer engine both see a page that explains itself without clicking
 * anything.
 */
export default function ToolPage({ tool }: { tool: ToolDefinition }) {
  const category = CATEGORY_BY_ID.get(tool.category);
  const siblings = siblingTools(tool, 8);
  const related = relatedTools(tool, 6);
  const categoryCount = toolsByCategory(tool.category).length;
  const local = (tool.mode ?? 'local') === 'local';

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
            <li>
              <a href={`/tools/${category?.segment}`}>{category?.name}</a>
            </li>
            <li aria-current="page">{tool.name}</li>
          </ol>
        </nav>

        <header className="page-head anim-rise">
          <div className="tool-head-row">
            <span className="tool-head-icon">
              <Icon name={tool.icon} size={24} />
            </span>
            <div>
              <span className="section-kicker">{category?.name} TOOL</span>
              <h1>{tool.name}</h1>
            </div>
          </div>
          <p className="anim-rise-1">{tool.description}</p>

          <p className={`${local ? 'privacy-banner' : 'privacy-banner is-hybrid'} anim-rise-2`}>
            <Icon name={local ? 'lock' : 'shield'} size={13} />
            {local
              ? 'Processed locally in your browser — your file is never uploaded'
              : 'Partly processed on our servers — see the privacy note below'}
          </p>
        </header>

        <div className="tool-layout">
          <div className="anim-rise-3">
            <ToolWorkspace tool={tool} />

            <div className="prose">
              {tool.howItWorks && tool.howItWorks.length > 0 && (
                <section aria-labelledby="how-it-works">
                  <h2 id="how-it-works">How {tool.name.toLowerCase()} works</h2>
                  <ol className="steps">
                    {tool.howItWorks.map((step) => (
                      <li key={step.title}>
                        <strong>{step.title}</strong>
                        <span>{step.body}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              <section aria-labelledby="what-you-get">
                <h2 id="what-you-get">What you get</h2>
                <p>
                  {tool.summary} {local
                    ? 'Everything happens inside this page: the file is read by your browser, transformed in memory and handed straight back to you as a download. There is no upload queue, no waiting for a server, and nothing left behind when you close the tab.'
                    : 'The heavy lifting happens on your device; the parts that cannot run locally are clearly flagged on the tool itself.'}
                </p>
                <h3>Supported formats</h3>
                {tool.input ? (
                  <>
                    <p>
                      Furtu accepts {tool.input.extensions.join(', ')} files up to{' '}
                      {formatBytes(tool.input.maxBytes, 0)} each
                      {tool.input.multiple
                        ? `, and processes up to ${tool.limits.maxFiles} files in one run.`
                        : ' — one file at a time.'}
                    </p>
                    <ul>
                      <li>
                        Every file is checked against its real file signature, not just its name, so a
                        renamed or corrupt file is rejected with an explanation instead of failing halfway
                        through.
                      </li>
                      <li>Files over the limit are refused up front rather than after a long wait.</li>
                    </ul>
                  </>
                ) : (
                  <p>
                    This tool works on text you paste or type, so there is no file format to worry about.
                    Nothing you type is sent anywhere.
                  </p>
                )}

                {tool.limitations && tool.limitations.length > 0 && (
                  <>
                    <h3>Limitations, stated up front</h3>
                    <ul className="limitations">
                      {tool.limitations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              {tool.notes?.map((note) => (
                <section key={note.title} aria-labelledby={`note-${note.title.replace(/\W+/g, '-').toLowerCase()}`}>
                  <h2 id={`note-${note.title.replace(/\W+/g, '-').toLowerCase()}`}>{note.title}</h2>
                  <p>{note.body}</p>
                </section>
              ))}

              {tool.faq.length > 0 && (
                <section aria-labelledby="faq">
                  <h2 id="faq">Frequently asked questions</h2>
                  <div className="faq">
                    {tool.faq.map((entry) => (
                      <details key={entry.q}>
                        <summary>{entry.q}</summary>
                        <p>{entry.a}</p>
                      </details>
                    ))}
                  </div>
                </section>
              )}

              {related.length > 0 && (
                <section aria-labelledby="related">
                  <h2 id="related">Related tools</h2>
                  <div className="related-grid">
                    {related.map((item) => (
                      <a className="related-card" href={toolPath(item)} key={item.slug}>
                        <span className="tool-icon mini">
                          <Icon name={item.icon} size={17} />
                        </span>
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.summary}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* Last thing on the page, after the content a visitor came for.
                  Deliberately not beside the tool and not above it: someone
                  with a file half-processed should not be looking at an
                  advert, and an ad beside the workspace is what makes a tool
                  site feel like a content site. */}
              <AdSlot placement={ADS.tool} />
            </div>
          </div>

          <aside className="tool-aside" aria-label="Tool information">
            <div className="aside-block">
              <h2>Privacy</h2>
              <p className="limit-note">
                {local ? (
                  <>
                    <Icon name="lock" size={13} /> This tool runs entirely in your browser. Your file is
                    never sent to a server, never written to disk on ours, and never seen by anyone but you.
                  </>
                ) : (
                  <>
                    <Icon name="shield" size={13} /> Parts of this tool need a server. Anything uploaded is
                    deleted immediately after processing.
                  </>
                )}
              </p>
            </div>

            {tool.input && (
              <div className="aside-block">
                <h2>Formats</h2>
                <ul className="fmt-list">
                  {tool.input.extensions.map((extension) => (
                    <li key={extension}>{extension.replace('.', '')}</li>
                  ))}
                </ul>
                <p className="limit-note" style={{ marginTop: 10 }}>
                  Up to {formatBytes(tool.input.maxBytes, 0)} per file
                  {tool.input.multiple ? `, ${tool.limits.maxFiles} files per run.` : '.'}
                </p>
              </div>
            )}

            {siblings.length > 0 && (
              <div className="aside-block">
                <h2>More {category?.name.toLowerCase()} tools</h2>
                <ul className="aside-list">
                  {siblings.map((item) => (
                    <li key={item.slug}>
                      <a href={toolPath(item)}>
                        <span className="tool-icon mini">
                          <Icon name={item.icon} size={15} />
                        </span>
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="limit-note" style={{ marginTop: 12 }}>
                  <a href={`/tools/${category?.segment}`} style={{ color: 'var(--brand)' }}>
                    All {categoryCount} {category?.name.toLowerCase()} tools →
                  </a>
                </p>
              </div>
            )}

            <div className="aside-block">
              <h2>About {SITE.name}</h2>
              <p className="limit-note">
                {SITE.name} is a local-first toolbox. Every tool here processes your data on your own
                device, because the files people most need to compress, convert and clean up are usually
                the ones they should not upload.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
