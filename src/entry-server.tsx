/**
 * Server-side entry point.
 *
 * The prerenderer imports this module, calls `render(url)` for every route in
 * the registry and writes the result to disk as a static HTML file. That is how
 * a tool page arrives with its title, meta description, canonical URL,
 * breadcrumb, FAQ and structured data already in the HTML, rather than
 * appearing only after JavaScript has run.
 *
 * It renders the same `AppShell` the client renders, so the markup React
 * hydrates is the markup the crawler and the browser already have.
 */

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { AppShell } from './components/AppShell';
import { matchRoute, loadRouteComponent, type Route } from './lib/router';
import {
  categoryMeta,
  headTags,
  homeMeta,
  notFoundMeta,
  renderTags,
  staticMeta,
  toolMeta,
  toolsIndexMeta,
  type HeadTag,
  type PageMeta,
} from './lib/seo';
import {
  CATEGORY_BY_SEGMENT,
  indexableTools,
  toolPath,
  toolsByCategory,
} from './lib/tools/registry';
import { GUIDE_BY_SLUG, guideMeta, guidePath, sortedGuides } from './lib/guides';
import { SITE } from './lib/site';

const STATIC_PAGE_COPY: Record<string, [string, string]> = {
  guides: ['Guides', 'Practical, accurate guides to file formats, sizes, privacy and everyday digital tasks.'],
  pricing: ['Pricing', 'Every Furtu tool is free to use with no account. Higher limits and team features are planned.'],
  about: ['About Furtu', 'Furtu is a local-first toolbox for PDFs, images, documents and developer utilities.'],
  privacy: ['Privacy', 'Furtu processes your files inside your browser. This page explains exactly what that means.'],
  security: ['Security', 'How Furtu validates files, isolates processing and handles untrusted input.'],
  terms: ['Terms', 'The terms that apply when you use Furtu tools.'],
  contact: ['Contact', 'How to reach the Furtu team about a bug, a tool request or a security report.'],
  changelog: ['Changelog', 'What has changed in Furtu, and when.'],
};

export function metaFor(route: Route): PageMeta {
  switch (route.kind) {
    case 'home':
      return homeMeta();
    case 'tools-index':
      return toolsIndexMeta();
    case 'category': {
      const segment = route.categorySegment ?? '';
      const category = CATEGORY_BY_SEGMENT.get(segment);
      return categoryMeta(segment, category ? toolsByCategory(category.id).length : 0);
    }
    case 'tool':
      return route.tool ? toolMeta(route.tool) : notFoundMeta();
    case 'guide': {
      const guide = route.guideSlug ? GUIDE_BY_SLUG.get(route.guideSlug) : undefined;
      return guide ? (guideMeta(guide) as PageMeta) : notFoundMeta();
    }
    case 'static': {
      const copy = STATIC_PAGE_COPY[route.staticPage ?? ''];
      return copy ? staticMeta(route.staticPage!, copy[0], copy[1]) : notFoundMeta();
    }
    default:
      return notFoundMeta();
  }
}

/** Every URL to prerender. Derived from the registry, so it never drifts. */
export function prerenderRoutes(): string[] {
  // The three top-level entry points come first: they are the routes a visitor
  // lands on, and they must not be left as the bare Vite shell.
  const paths = ['/', '/tools', '/guides', '/404'];

  for (const segment of CATEGORY_BY_SEGMENT.keys()) paths.push(`/tools/${segment}`);
  for (const guide of sortedGuides()) paths.push(guidePath(guide.slug));
  for (const tool of indexableTools()) paths.push(toolPath(tool));
  for (const slug of Object.keys(STATIC_PAGE_COPY)) paths.push(`/${slug}`);

  return [...new Set(paths)];
}

export interface RenderResult {
  /** Inner HTML for the `#root` element. */
  html: string;
  head: HeadTag[];
  status: number;
}

export async function render(url: string): Promise<RenderResult> {
  const route = matchRoute(url);
  const meta = metaFor(route);
  const Page = await loadRouteComponent(route);

  // `searchOpen` is deliberately omitted: the palette is closed on the server
  // and on first client render, which is what keeps hydration clean.
  const page = createElement(Page, (route.kind === 'tool' ? { tool: route.tool } : {}) as never);
  const html = renderToString(createElement(AppShell, { route, children: page }));

  return { html, head: headTags(meta), status: route.kind === 'not-found' ? 404 : 200 };
}

export { headTags, renderTags, SITE };
export type { HeadTag };
