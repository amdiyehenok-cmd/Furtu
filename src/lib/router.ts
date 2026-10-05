/**
 * Routing.
 *
 * A small typed table maps a URL to a page component. It is used identically on
 * the client and during prerendering, which is what keeps a statically
 * generated tool page and its hydrated version from drifting apart.
 *
 * This is deliberately not a router library. The application has ten route
 * shapes, all of them literal or two-segment, so a table plus a History API
 * listener is smaller, faster and easier to reason about than a general
 * solution — and the whole thing is under a hundred lines and fully testable.
 */

import { createElement, lazy, type ComponentType, type LazyExoticComponent } from 'react';

import { getToolByPath, getCategoryBySegment, normalizePath } from './tools/registry';
import { GUIDE_BY_SLUG } from './guides';
import type { ToolDefinition } from './tools/types';

export type PageKind =
  | 'home'
  | 'tools-index'
  | 'category'
  | 'tool'
  | 'guide'
  | 'static'
  | 'not-found';

export interface Route {
  kind: PageKind;
  path: string;
  tool?: ToolDefinition;
  categorySegment?: string;
  staticPage?: string;
  guideSlug?: string;
}

/** Static pages are one component each so they can be code-split per page. */
const STATIC_PAGES: Record<string, () => Promise<{ default: ComponentType }>> = {
  guides: () => import('../pages/GuidesPage'),
  pricing: () => import('../pages/PricingPage'),
  about: () => import('../pages/AboutPage'),
  privacy: () => import('../pages/PrivacyPage'),
  security: () => import('../pages/SecurityPage'),
  terms: () => import('../pages/TermsPage'),
  contact: () => import('../pages/ContactPage'),
  changelog: () => import('../pages/ChangelogPage'),
};

const HomePage = lazy(() => import('../pages/HomePage'));
const ToolsIndexPage = lazy(() => import('../pages/ToolsIndexPage'));
const CategoryPage = lazy(() => import('../pages/CategoryPage'));
const ToolPage = lazy(() => import('../pages/ToolPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

export function matchRoute(rawPath: string): Route {
  const path = normalizePath(rawPath);

  if (path === '/') return { kind: 'home', path };
  if (path === '/tools') return { kind: 'tools-index', path };

  const tool = getToolByPath(path);
  if (tool) return { kind: 'tool', path, tool };

  const categoryMatch = /^\/tools\/([a-z0-9-]+)$/.exec(path);
  if (categoryMatch) {
    const category = getCategoryBySegment(categoryMatch[1]);
    if (category) {
      return { kind: 'category', path, categorySegment: categoryMatch[1] };
    }
  }

  const staticPage = path.replace(/^\//, '');
  if (Object.prototype.hasOwnProperty.call(STATIC_PAGES, staticPage)) {
    return { kind: 'static', path, staticPage };
  }

  // Guides get their own article route so each one is independently indexable,
  // rather than everything living on one list page.
  const guideMatch = /^\/guides\/([a-z0-9-]+)$/.exec(path);
  if (guideMatch && GUIDE_BY_SLUG.has(guideMatch[1])) {
    return { kind: 'guide', path, guideSlug: guideMatch[1] };
  }

  return { kind: 'not-found', path };
}

/**
 * The page component for a route, wrapped in `lazy` where the page is not part
 * of the initial bundle.
 *
 * Pages that take props are wrapped so the component always accepts an empty
 * props object; the required value is bound by the route at render time.
 */
export function routeComponent(route: Route): LazyExoticComponent<ComponentType<Record<string, unknown>>> {
  switch (route.kind) {
    case 'home':
      return HomePage;
    case 'tools-index':
      return ToolsIndexPage;
    case 'category': {
      const segment = route.categorySegment ?? '';
      return lazy(async () => {
        const module = await import('../pages/CategoryPage');
        return {
          default: function CategoryRoute() {
            return createElement(module.default, { segment });
          },
        };
      });
    }
    case 'tool': {
      const tool = route.tool;
      if (!tool) return NotFoundPage;
      return lazy(async () => {
        const module = await import('../pages/ToolPage');
        return {
          default: function ToolRoute() {
            return createElement(module.default, { tool });
          },
        };
      });
    }
    case 'not-found':
      return NotFoundPage;
    case 'guide': {
      const slug = route.guideSlug;
      return lazy(async () => {
        const module = await import('../pages/GuidePage');
        const guide = slug ? GUIDE_BY_SLUG.get(slug) : undefined;
        if (!guide) {
          const notFound = (await import('../pages/NotFoundPage')).default;
          return { default: notFound as ComponentType<Record<string, unknown>> };
        }
        // A tiny wrapper so the guide is passed as a prop rather than read
        // from the router again inside the component.
        return {
          default: function GuideRoute() {
            return createElement(module.default, { guide });
          },
        };
      });
    }
    case 'static': {
      const loader = STATIC_PAGES[route.staticPage ?? ''];
      if (!loader) return NotFoundPage;
      return lazy(async () => {
        const module = await loader();
        return { default: module.default as ComponentType<Record<string, unknown>> };
      });
    }
  }
}

/* --- client-side history ------------------------------------------------ */

type Listener = (route: Route) => void;

const listeners = new Set<Listener>();

export function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname;
}

export function notifyListeners(): void {
  const route = matchRoute(currentPath());
  for (const listener of listeners) listener(route);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let started = false;

export function startRouter(): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;

  const onPopState = () => notifyListeners();
  const onClick = (event: MouseEvent) => {
    // Let the browser handle modified clicks and non-left buttons.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = (event.target as Element | null)?.closest('a');
    if (!target) return;

    const href = target.getAttribute('href');
    if (!href) return;
    // Same-origin paths only, and leave hash links and downloads alone.
    if (!href.startsWith('/') || href.startsWith('//')) return;
    if (target.hasAttribute('download') || target.getAttribute('target') === '_blank') return;

    const destination = normalizePath(href);
    if (destination === normalizePath(currentPath())) return;

    event.preventDefault();
    window.history.pushState({}, '', destination);
    notifyListeners();
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  window.addEventListener('popstate', onPopState);
  document.addEventListener('click', onClick);

  return () => {
    window.removeEventListener('popstate', onPopState);
    document.removeEventListener('click', onClick);
    started = false;
  };
}

/** Site-wide URL, so internal links are never hand-written. */
export function href(path: string): string {
  return path;
}

export { STATIC_PAGES };

/**
 * Resolves a route to a real component, awaiting the code split.
 *
 * The client uses `routeComponent` and a `Suspense` boundary; the prerenderer
 * uses this instead, because `renderToString` cannot wait for a lazy component
 * and would silently emit the loading fallback into the static HTML.
 */
export async function loadRouteComponent(route: Route): Promise<ComponentType<Record<string, unknown>>> {
  switch (route.kind) {
    case 'home':
      return (await import('../pages/HomePage')).default;
    case 'tools-index':
      return (await import('../pages/ToolsIndexPage')).default;
    case 'category': {
      const module = await import('../pages/CategoryPage');
      const segment = route.categorySegment ?? '';
      return function CategoryRoute() {
        return createElement(module.default, { segment });
      };
    }
    case 'tool': {
      const module = await import('../pages/ToolPage');
      const tool = route.tool;
      if (!tool) return (await import('../pages/NotFoundPage')).default;
      return function ToolRoute() {
        return createElement(module.default, { tool });
      };
    }
    case 'guide': {
      const module = await import('../pages/GuidePage');
      const guide = route.guideSlug ? GUIDE_BY_SLUG.get(route.guideSlug) : undefined;
      if (!guide) return (await import('../pages/NotFoundPage')).default;
      return function GuideRoute() {
        return createElement(module.default, { guide });
      };
    }
    case 'static': {
      const loader = STATIC_PAGES[route.staticPage ?? ''];
      if (!loader) return (await import('../pages/NotFoundPage')).default;
      return (await loader()).default;
    }
    case 'not-found':
    default:
      return (await import('../pages/NotFoundPage')).default;
  }
}
