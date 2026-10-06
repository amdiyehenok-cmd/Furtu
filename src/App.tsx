import { Suspense, useEffect, useState } from 'react';

import { CommandPalette } from './components/CommandPalette';
import { SiteFooter, SiteHeader } from './components/SiteChrome';
import { matchRoute, currentPath, routeComponent, startRouter, subscribe, type Route } from './lib/router';
import {
  categoryMeta,
  homeMeta,
  notFoundMeta,
  staticMeta,
  toolMeta,
  toolsIndexMeta,
  type PageMeta,
} from './lib/seo';
import { CATEGORY_BY_SEGMENT, toolsByCategory } from './lib/tools/registry';

function RouteFallback() {
  return (
    <div className="notfound" aria-busy="true">
      <div>
        <span className="spinner" style={{ display: 'inline-block' }} />
        <p>Loading…</p>
      </div>
    </div>
  );
}

function metaForRoute(route: Route): PageMeta {
  if (route.kind === 'home') return homeMeta();
  if (route.kind === 'tools-index') return toolsIndexMeta();
  if (route.kind === 'category' && route.categorySegment) {
    const category = CATEGORY_BY_SEGMENT.get(route.categorySegment);
    return categoryMeta(route.categorySegment, category ? toolsByCategory(category.id).length : 0);
  }
  if (route.kind === 'tool' && route.tool) return toolMeta(route.tool);
  if (route.kind === 'static' && route.staticPage) {
    const [name, description] = STATIC_PAGES[route.staticPage] ?? ['Furtu', 'Furtu tools.'];
    return staticMeta(route.staticPage, name, description);
  }
  return notFoundMeta();
}

/**
 * Applies document-level metadata after a client-side navigation.
 *
 * The initial HTML is fully prerendered with correct head tags, so this only
 * needs to run on subsequent navigations. Doing it in one place means no page
 * component can forget to update the title.
 */
function useClientMeta(route: Route) {
  useEffect(() => {
    const meta = metaForRoute(route);

    document.title = meta.title;
    setMeta('description', meta.description);
    setMeta('robots', meta.robots);
    setCanonical(meta.canonical);

    // Only the JSON-LD this hook owns is replaced, so nothing injected by
    // anything else in the head is disturbed.
    for (const node of document.head.querySelectorAll('script[data-furtu-jsonld]')) {
      node.remove();
    }
    for (const node of meta.jsonLd) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.furtuJsonld = 'current';
      script.textContent = JSON.stringify(node).replace(/</g, '\\u003c');
      document.head.appendChild(script);
    }
  }, [route]);
}

function setMeta(name: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = name;
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setCanonical(href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement('link');
    tag.rel = 'canonical';
    document.head.appendChild(tag);
  }
  tag.href = href;
}

const STATIC_PAGES: Record<string, [string, string]> = {
  guides: ['Guides', 'Practical, accurate guides to file formats, sizes, privacy and everyday digital tasks.'],
  pricing: ['Pricing', 'Every Furtu tool is free to use with no account. Higher limits and team features are planned.'],
  about: ['About Furtu', 'Furtu is a local-first toolbox for PDFs, images, documents and developer utilities.'],
  privacy: ['Privacy', 'Furtu processes your files inside your browser. This page explains exactly what that means.'],
  security: ['Security', 'How Furtu validates files, isolates processing and handles untrusted input.'],
  terms: ['Terms', 'The terms that apply when you use Furtu tools.'],
  contact: ['Contact', 'How to reach the Furtu team about a bug, a tool request or a security report.'],
  changelog: ['Changelog', 'What has changed in Furtu, and when.'],
};

export default function App() {
  const [route, setRoute] = useState<Route>(() => matchRoute(currentPath()));
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => startRouter(), []);
  useEffect(() => subscribe(setRoute), []);
  useClientMeta(route);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') setSearchOpen(false);
      // "/" focuses search, the convention people expect from a docs site.
      if (event.key === '/' && !isTypingTarget(event.target)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const Page = routeComponent(route);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader onOpenSearch={() => setSearchOpen(true)} />

      <main id="main" tabIndex={-1}>
        <Suspense fallback={<RouteFallback />}>
          <Page />
        </Suspense>
      </main>

      <SiteFooter />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
