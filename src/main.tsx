import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';

import App from './App';
import './index.css';

/**
 * Client entry.
 *
 * `hydrateRoot`, not `createRoot`: the markup in the HTML file was rendered on
 * the server for this exact URL, so React adopts it rather than throwing it
 * away and rebuilding the page. That is what makes the first paint free.
 *
 * The prerenderer replaces the contents of `#root` with the server markup, and
 * leaves a comment here. If the comment is still present there was no
 * prerendered HTML to adopt, so a full client render is the correct fallback
 * rather than a hydration mismatch.
 */
const container = document.getElementById('root');

if (container) {
  const prerendered = container.innerHTML.trim().length > 0;

  if (prerendered) {
    hydrateRoot(container, <StrictMode><App /></StrictMode>);
  } else {
    container.textContent = '';
    hydrateRoot(container, <StrictMode><App /></StrictMode>);
  }
}
