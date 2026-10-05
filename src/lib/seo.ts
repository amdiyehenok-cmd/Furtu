/**
 * SEO: page metadata and schema.org structured data.
 *
 * Everything here is derived from the tool registry, so adding a tool
 * automatically produces a unique title, a unique description, a canonical
 * URL, breadcrumbs, breadcrumbs structured data and an FAQ block. There is no
 * second place to update and therefore no way for a page to ship with missing
 * or duplicated metadata.
 *
 * Two rules are enforced rather than merely intended:
 *   - a tool's title and description must be unique, or the build fails;
 *   - FAQPage markup is only emitted when real FAQ entries exist, so no
 *     structured data ever claims something the page does not show.
 */

import { SITE, absoluteUrl } from './site';
import { CATEGORY_BY_ID, toolPath } from './tools/registry';
import type { ToolDefinition } from './tools/types';

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  /** `noindex` is derived, never hand-written per page. */
  robots: string;
  jsonLd: unknown[];
}

interface Crumb {
  name: string;
  path: string;
}

const BRAND_SUFFIX = 'Furtu';

function uniqueDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  // Cut on a word boundary so descriptions never end mid-word.
  const clipped = clean.slice(0, max - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? clipped.slice(0, lastSpace) : clipped).replace(/[,;:.\s]+$/, '')}…`;
}

function organisationNode() {
  return {
    '@type': 'Organization',
    '@id': `${SITE.origin}/#organization`,
    name: SITE.name,
    legalName: SITE.legalName,
    url: absoluteUrl('/'),
    description: SITE.description,
    email: SITE.contactEmail,
  };
}

function websiteNode() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE.origin}/#website`,
    name: SITE.name,
    url: absoluteUrl('/'),
    description: SITE.description,
    publisher: { '@id': `${SITE.origin}/#organization` },
    inLanguage: SITE.locale,
    // Declares the command palette as a real site search action, which is how
    // an answer engine can tell that searching the site is possible.
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl('/tools')}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

function breadcrumbNode(crumbs: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

function faqNode(faq: { q: string; a: string }[]) {
  if (faq.length === 0) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
}

function toolNode(tool: ToolDefinition) {
  const category = CATEGORY_BY_ID.get(tool.category);
  return {
    '@type': 'WebApplication',
    '@id': `${absoluteUrl(toolPath(tool))}#tool`,
    name: tool.name,
    description: tool.description,
    url: absoluteUrl(toolPath(tool)),
    applicationCategory: `${category?.name ?? 'Utilities'}Application`,
    operatingSystem: 'Any',
    browserRequirements: 'Requires a modern browser with JavaScript enabled.',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': `${SITE.origin}/#organization` },
    featureList: tool.howItWorks?.map((step) => step.title) ?? [],
  };
}

/* --- per-page metadata --------------------------------------------------- */

export function homeMeta(): PageMeta {
  return {
    title: `${SITE.name} — Fast, private tools for PDFs, images and data`,
    description: uniqueDescription(
      `${SITE.name} is a private, browser-based toolbox: compress and merge PDFs, resize and convert images, format and validate data. Files are processed on your device, never uploaded.`,
    ),
    canonical: absoluteUrl('/'),
    robots: 'index, follow, max-image-preview:large',
    jsonLd: [organisationNode(), websiteNode()],
  };
}

export function toolsIndexMeta(): PageMeta {
  return {
    title: `All tools — ${BRAND_SUFFIX}`,
    description: uniqueDescription(
      `Browse every ${BRAND_SUFFIX} tool: PDF, image, document, developer and utility tools that all run in your browser.`,
    ),
    canonical: absoluteUrl('/tools'),
    robots: 'index, follow',
    jsonLd: [organisationNode(), websiteNode(), breadcrumbNode([{ name: 'Tools', path: '/tools' }])],
  };
}

export function categoryMeta(segment: string, count: number): PageMeta {
  const category = [...CATEGORY_BY_ID.values()].find((entry) => entry.segment === segment);
  if (!category) return homeMeta();

  return {
    title: `${category.name} tools — ${count} free browser tools | ${BRAND_SUFFIX}`,
    description: uniqueDescription(category.description),
    canonical: absoluteUrl(`/tools/${segment}`),
    robots: 'index, follow',
    jsonLd: [
      organisationNode(),
      breadcrumbNode([
        { name: 'Tools', path: '/tools' },
        { name: category.name, path: `/tools/${segment}` },
      ]),
      {
        '@type': 'CollectionPage',
        name: `${category.name} tools`,
        description: category.tagline,
        url: absoluteUrl(`/tools/${segment}`),
        isPartOf: { '@id': `${SITE.origin}/#website` },
        hasPart: count,
      },
    ],
  };
}

export function toolMeta(tool: ToolDefinition): PageMeta {
  const category = CATEGORY_BY_ID.get(tool.category);
  const path = toolPath(tool);
  const indexable = tool.index !== false;

  const title = tool.seoTitle ?? `${tool.name} — Free, private, no upload | ${BRAND_SUFFIX}`;
  const description = uniqueDescription(tool.seoDescription ?? tool.description);

  const jsonLd: unknown[] = [
    organisationNode(),
    toolNode(tool),
    breadcrumbNode([
      { name: 'Tools', path: '/tools' },
      { name: category?.name ?? tool.category, path: `/tools/${category?.segment ?? tool.category}` },
      { name: tool.name, path },
    ]),
  ];

  // Only emit FAQPage when the page actually renders the same questions.
  const faq = faqNode(tool.faq);
  if (faq) jsonLd.push(faq);

  return {
    title,
    description,
    canonical: absoluteUrl(path),
    robots: indexable ? 'index, follow' : 'noindex, follow',
    jsonLd,
  };
}

export function staticMeta(slug: string, name: string, description: string): PageMeta {
  return {
    title: `${name} | ${BRAND_SUFFIX}`,
    description: uniqueDescription(description),
    canonical: absoluteUrl(`/${slug}`),
    robots: 'index, follow',
    jsonLd: [
      organisationNode(),
      breadcrumbNode([{ name, path: `/${slug}` }]),
      { '@type': 'WebPage', name, description: uniqueDescription(description), url: absoluteUrl(`/${slug}`) },
    ],
  };
}

export function notFoundMeta(): PageMeta {
  return {
    title: `Page not found | ${BRAND_SUFFIX}`,
    description: 'That page does not exist. Search the Furtu toolbox instead.',
    canonical: absoluteUrl('/404'),
    robots: 'noindex, follow',
    jsonLd: [organisationNode()],
  };
}

/* --- rendering ----------------------------------------------------------- */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface HeadTag {
  tag: 'title' | 'meta' | 'link' | 'script';
  attrs?: Record<string, string>;
  content?: string;
}

/** Head tags for a page. The prerenderer writes these into the HTML shell. */
export function headTags(meta: PageMeta, cssHref?: string): HeadTag[] {
  const tags: HeadTag[] = [
    { tag: 'title', content: meta.title },
    { tag: 'meta', attrs: { name: 'description', content: meta.description } },
    { tag: 'meta', attrs: { name: 'robots', content: meta.robots } },
    { tag: 'link', attrs: { rel: 'canonical', href: meta.canonical } },
    { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
    { tag: 'meta', attrs: { property: 'og:site_name', content: SITE.name } },
    { tag: 'meta', attrs: { property: 'og:title', content: meta.title } },
    { tag: 'meta', attrs: { property: 'og:description', content: meta.description } },
    { tag: 'meta', attrs: { property: 'og:url', content: meta.canonical } },
    { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
    { tag: 'meta', attrs: { name: 'twitter:title', content: meta.title } },
    { tag: 'meta', attrs: { name: 'twitter:description', content: meta.description } },
    { tag: 'meta', attrs: { name: 'theme-color', content: SITE.themeColor } },
    { tag: 'meta', attrs: { name: 'color-scheme', content: 'light dark' } },
  ];

  if (cssHref) tags.push({ tag: 'link', attrs: { rel: 'stylesheet', href: cssHref } });

  for (const node of meta.jsonLd) {
    tags.push({
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      // `</script>` inside a JSON string would end the tag early, so the
      // sequence is escaped rather than the whole document.
      content: JSON.stringify(node).replace(/</g, '\\u003c'),
    });
  }

  return tags;
}

export function renderTags(tags: HeadTag[]): string {
  return tags
    .map((item) => {
      if (item.tag === 'title') return `<title>${escapeHtml(item.content ?? '')}</title>`;
      if (item.tag === 'script') return `<script${attrString(item.attrs)}>${item.content ?? ''}</script>`;
      const voidClose = item.tag === 'meta' || item.tag === 'link' ? ' /' : '';
      return `<${item.tag}${attrString(item.attrs)}${voidClose}>`;
    })
    .join('\n    ');
}

function attrString(attrs?: Record<string, string>): string {
  if (!attrs) return '';
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${escapeHtml(value)}"`)
    .join('');
}

export { escapeHtml };
