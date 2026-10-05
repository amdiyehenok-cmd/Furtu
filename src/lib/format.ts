/** Formatting helpers. Pure functions, shared by UI and engines. */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 ? 0 : fractionDigits;
  return `${value.toFixed(digits)} ${UNITS[exponent]}`;
}

export function formatSavings(before: number, after: number): string {
  if (before <= 0) return '—';
  const saved = ((before - after) / before) * 100;
  if (saved <= 0) return 'No change';
  return `${saved.toFixed(saved >= 10 ? 0 : 1)}% smaller`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

/** `report.pdf` -> `report` */
export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > -1 ? name.slice(dot).toLowerCase() : '';
}

/** `report` + `pdf` -> `report.pdf`, without doubling an existing extension. */
export function withExtension(name: string, extension: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  if (fileExtension(name) === ext.toLowerCase()) return name;
  return `${name}${ext}`;
}

/** Builds a slug-safe download name from an original file name. */
export function safeDownloadName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 180);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
