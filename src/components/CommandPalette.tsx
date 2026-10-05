import { useCallback, useEffect, useRef, useState } from 'react';

import { Icon } from './Icon';
import { searchTools, suggestedQueries } from '@/lib/search';
import { toolPath } from '@/lib/tools/registry';

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hits = searchTools(query, 8);
  const suggestions = query ? [] : suggestedQueries().slice(0, 5);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after the element exists, otherwise the dialog steals the scroll.
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    row?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const go = useCallback(
    (path: string) => {
      onClose();
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.scrollTo({ top: 0 });
    },
    [onClose],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    const total = hits.length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((value) => (total === 0 ? 0 : (value + 1) % total));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) => (total === 0 ? 0 : (value - 1 + total) % total));
    } else if (event.key === 'Enter') {
      const hit = hits[active];
      if (hit) {
        event.preventDefault();
        go(toolPath(hit.tool));
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search Furtu tools"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="What do you want to do?"
            aria-label="Search tools"
            aria-activedescendant={hits[active] ? `command-result-${hits[active].tool.slug}` : undefined}
            aria-controls="command-results"
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={onClose}>ESC</button>
        </div>

        <div className="command-body" ref={listRef} id="command-results" role="listbox" aria-label="Search results">
          {query ? (
            <>
              <span className="command-label">
                {hits.length > 0 ? `RESULTS · ${hits.length}` : 'NO RESULTS'}
              </span>
              {hits.map((hit, index) => (
                <a
                  key={hit.tool.slug}
                  id={`command-result-${hit.tool.slug}`}
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active}
                  className="command-result"
                  href={toolPath(hit.tool)}
                  onMouseEnter={() => setActive(index)}
                  onClick={(event) => {
                    event.preventDefault();
                    go(toolPath(hit.tool));
                  }}
                >
                  <span className="tool-icon mini">
                    <Icon name={hit.tool.icon} size={17} />
                  </span>
                  <div>
                    <strong>{hit.tool.name}</strong>
                    <small>{hit.reason ? `${hit.reason} · ${hit.tool.summary}` : hit.tool.summary}</small>
                  </div>
                  <span className="result-category">{hit.tool.category}</span>
                  {index === active && <kbd>↵</kbd>}
                </a>
              ))}
              {hits.length === 0 && (
                <div className="no-results">
                  No tools matched “{query}”. Try a plainer phrase such as “compress pdf” or “json formatter”.
                </div>
              )}
            </>
          ) : (
            <>
              <span className="command-label">TRY ONE OF THESE</span>
              {suggestions.map((suggestion) => {
                const first = searchTools(suggestion, 1)[0];
                return (
                  <a
                    key={suggestion}
                    className="command-result"
                    href={first ? toolPath(first.tool) : '/tools'}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.preventDefault();
                      go(first ? toolPath(first.tool) : '/tools');
                    }}
                  >
                    <span className="tool-icon mini">
                      <Icon name={first?.tool.icon ?? 'search'} size={17} />
                    </span>
                    <div>
                      <strong>{suggestion}</strong>
                      <small>{first ? first.tool.name : 'Browse all tools'}</small>
                    </div>
                    <Icon name="chevron" size={15} />
                  </a>
                );
              })}
            </>
          )}
        </div>

        <div className="command-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navigate
          </span>
          <span>
            <kbd>↵</kbd> Open
          </span>
          <span>
            <kbd>esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
