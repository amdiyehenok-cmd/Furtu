/**
 * The tool registry.
 *
 * Every URL, card, command-palette entry, sitemap row, breadcrumb and internal
 * link is derived from this array. Nothing in the application hardcodes a list
 * of tools, so adding one is: append a definition to the right file in this
 * directory, implement its operation in `engines/ops`, and the routing, search,
 * SEO, sitemap and related-links all follow automatically.
 *
 * `assertRegistryIntegrity` in `tests/registry.test.ts` fails the build if a
 * definition is broken, so a bad tool cannot ship.
 */

import { CATEGORIES, CATEGORY_BY_ID, CATEGORY_BY_SEGMENT } from './categories';
import type { ToolCategoryId, ToolDefinition } from './types';

import { PDF_TOOLS } from './pdf';
import { IMAGE_TOOLS } from './image';
import { DOCUMENT_TOOLS } from './document';
import { DEVELOPER_TOOLS } from './developer';
import { UTILITY_TOOLS } from './utility';

export const TOOLS: ToolDefinition[] = [
  ...PDF_TOOLS,
  ...IMAGE_TOOLS,
  ...DOCUMENT_TOOLS,
  ...DEVELOPER_TOOLS,
  ...UTILITY_TOOLS,
];

const BY_SLUG = new Map<string, ToolDefinition>();
for (const tool of TOOLS) {
  if (BY_SLUG.has(tool.slug)) {
    throw new Error(`Furtu: duplicate tool slug "${tool.slug}". Slugs must be unique and stable.`);
  }
  BY_SLUG.set(tool.slug, tool);
}

/** Canonical tool URL. Lower-case, hyphenated, permanent. */
export function toolPath(tool: ToolDefinition): string {
  const category = CATEGORY_BY_ID.get(tool.category);
  return `/tools/${category?.segment ?? tool.category}/${tool.slug}`;
}

export function toolPathBySlug(slug: string): string | null {
  const tool = BY_SLUG.get(slug);
  return tool ? toolPath(tool) : null;
}

export function getTool(slug: string): ToolDefinition | null {
  return BY_SLUG.get(slug) ?? null;
}

export function getToolByPath(pathname: string): ToolDefinition | null {
  const normalized = normalizePath(pathname);
  const match = /^\/tools\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/.exec(normalized);
  if (!match) return null;
  const tool = BY_SLUG.get(match[2]);
  if (!tool) return null;
  const category = CATEGORY_BY_ID.get(tool.category);
  return category?.segment === match[1] ? tool : null;
}

export function normalizePath(pathname: string): string {
  const clean = pathname.split('?')[0].split('#')[0];
  if (clean.length > 1 && clean.endsWith('/')) return clean.slice(0, -1);
  return clean || '/';
}

export function toolsByCategory(categoryId: ToolCategoryId): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.category === categoryId);
}

export function isIndexable(tool: ToolDefinition): boolean {
  return tool.index !== false;
}

/** Tools that are allowed into the sitemap and the internal link graph. */
export function indexableTools(): ToolDefinition[] {
  return TOOLS.filter(isIndexable);
}

export function popularTools(limit?: number): ToolDefinition[] {
  const popular = TOOLS.filter((tool) => tool.popular);
  const list = popular.length > 0 ? popular : TOOLS;
  return limit ? list.slice(0, limit) : list;
}

export function recentTools(limit = 6): ToolDefinition[] {
  const recent = TOOLS.filter((tool) => tool.recent);
  const list = recent.length > 0 ? recent : TOOLS;
  return list.slice(0, limit);
}

export function categoryPath(segment: string): string {
  return `/tools/${segment}`;
}

export function getCategoryBySegment(segment: string) {
  return CATEGORY_BY_SEGMENT.get(segment) ?? null;
}

/**
 * Related tools for a tool page.
 *
 * Order of preference: the author's explicit list, then other tools in the same
 * category, then anything from other categories. Explicit entries are listed
 * first because they encode real user journeys — compress JPG → JPG to WebP is a
 * sensible next step, and a purely alphabetical sibling list is not.
 */
export function relatedTools(tool: ToolDefinition, limit = 6): ToolDefinition[] {
  const picked: ToolDefinition[] = [];
  const seen = new Set<string>([tool.slug]);

  const push = (candidate: ToolDefinition | null | undefined) => {
    if (!candidate || seen.has(candidate.slug) || !isIndexable(candidate)) return;
    seen.add(candidate.slug);
    picked.push(candidate);
  };

  for (const slug of tool.related ?? []) push(BY_SLUG.get(slug));

  for (const candidate of toolsByCategory(tool.category)) push(candidate);

  for (const category of CATEGORIES) {
    for (const candidate of toolsByCategory(category.id)) push(candidate);
  }

  return picked.slice(0, limit);
}

/** Sibling tools for the sidebar, excluding the current page. */
export function siblingTools(tool: ToolDefinition, limit = 8): ToolDefinition[] {
  return toolsByCategory(tool.category)
    .filter((candidate) => candidate.slug !== tool.slug)
    .slice(0, limit);
}

/** Every internal route the application should prerender. */
export function allRoutes(): { path: string; tool?: ToolDefinition; category?: string }[] {
  const routes: { path: string; tool?: ToolDefinition; category?: string }[] = [
    { path: '/' },
    { path: '/tools' },
    { path: '/guides' },
    { path: '/pricing' },
    { path: '/about' },
    { path: '/privacy' },
    { path: '/security' },
    { path: '/terms' },
    { path: '/contact' },
    { path: '/changelog' },
  ];

  for (const category of CATEGORIES) {
    routes.push({ path: categoryPath(category.segment), category: category.segment });
  }

  for (const tool of indexableTools()) {
    routes.push({ path: toolPath(tool), tool });
  }

  return routes;
}

export { CATEGORIES, CATEGORY_BY_ID, CATEGORY_BY_SEGMENT };
export type { ToolDefinition, ToolCategoryId };
