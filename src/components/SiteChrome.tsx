import { useEffect, useState } from 'react';

import { Icon, Mark } from './Icon';
import { CATEGORIES, categoryPath } from '@/lib/tools/registry';

const NAV = [
  { label: 'Tools', path: '/tools' },
  ...CATEGORIES.map((category) => ({ label: category.name, path: categoryPath(category.segment) })),
  { label: 'Pricing', path: '/pricing' },
];

const THEME_KEY = 'furtu:theme';

function readInitialTheme(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function SiteHeader({ onOpenSearch }: { onOpenSearch: () => void }) {
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // The server renders the light theme to avoid a flash and a hydration
  // mismatch, so the stored preference is applied after mount.
  useEffect(() => setDark(readInitialTheme()), []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    window.localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <header className="site-header">
      <div className="nav-container">
        <a className="brand" href="/" aria-label="Furtu home">
          <Mark />
          <span>FURTU</span>
        </a>

        <nav className="desktop-nav" aria-label="Main navigation">
          {NAV.map((item) => (
            <a href={item.path} key={item.path}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="nav-actions">
          <button className="icon-button search-trigger" onClick={onOpenSearch} aria-label="Search tools (Control K)">
            <Icon name="search" size={18} />
            <span>Search</span>
            <kbd aria-hidden="true">⌘K</kbd>
          </button>
          <button
            className="icon-button"
            onClick={() => setDark((value) => !value)}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <Icon name={dark ? 'sun' : 'moon'} size={18} />
          </button>
          <a className="button primary compact nav-cta" href="/tools">
            All tools
          </a>
          <button
            className="icon-button mobile-menu-button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          >
            <Icon name={menuOpen ? 'x' : 'menu'} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="mobile-nav" id="mobile-nav" aria-label="Mobile navigation">
          {NAV.map((item) => (
            <a href={item.path} onClick={() => setMenuOpen(false)} key={item.path}>
              {item.label}
              <Icon name="chevron" size={16} />
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className="footer-brand">
        <a className="brand" href="/">
          <Mark />
          <span>FURTU</span>
        </a>
        <p>Powerful tools without unnecessary complexity.</p>
      </div>
      <div className="footer-links">
        <div>
          <strong>Product</strong>
          <a href="/tools">All tools</a>
          <a href="/tools/developer">Developer tools</a>
          <a href="/tools/image">Image tools</a>
          <a href="/pricing">Pricing</a>
          <a href="/changelog">Changelog</a>
        </div>
        <div>
          <strong>Resources</strong>
          <a href="/guides">Guides</a>
          <a href="/privacy">Privacy</a>
          <a href="/security">Security</a>
          <a href="/contact">Support</a>
        </div>
        <div>
          <strong>Company</strong>
          <a href="/about">About</a>
          <a href="/terms">Terms</a>
          <a href="/contact">Contact</a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Furtu</span>
        <span>Fast. Private. Simple. Powerful.</span>
      </div>
    </footer>
  );
}
