/**
 * Diffs the prerendered markup against what React renders on the client.
 *
 * The production build reports only "Minified React error #418", and the
 * development build has no prerendered markup to compare against, so neither
 * says what actually differs. Loading the same URL twice — once with scripting
 * disabled to capture the server's HTML, once with it enabled to capture the
 * client's — and walking both trees together shows the first node where they
 * disagree.
 */
import { chromium } from 'playwright';

const base = process.env.FURTU_BASE ?? 'http://localhost:4173';
const route = process.argv[2] ?? '/tools';

const browser = await chromium.launch();

/** A structural signature per node: tag, classes and direct text. */
const SIGNATURE = `(el) => {
  const tag = el.tagName.toLowerCase();
  const cls = el.getAttribute && el.getAttribute('class');
  return tag + (cls ? '.' + cls.trim().split(/\\s+/).join('.') : '');
}`;

const noJs = await browser.newContext({ javaScriptEnabled: false });
const serverPage = await noJs.newPage();
await serverPage.goto(base + route, { waitUntil: 'domcontentloaded' });
const serverHtml = await serverPage.evaluate("document.querySelector('#root').innerHTML");
await serverPage.close();
await noJs.close();

const withJs = await browser.newContext();
const clientPage = await withJs.newPage();
await clientPage.goto(base + route, { waitUntil: 'networkidle' });
await clientPage.waitForTimeout(800);

const clientHtml = await clientPage.evaluate("document.querySelector('#root').innerHTML");

await clientPage.close();
await withJs.close();
await browser.close();

if (serverHtml === clientHtml) {
  console.log(`${route}: markup is identical after hydration`);
  process.exit(0);
}

console.log(`${route}: MISMATCH\n`);

/** First differing character, with a little context on each side. */
let i = 0;
while (i < serverHtml.length && i < clientHtml.length && serverHtml[i] === clientHtml[i]) i += 1;

const from = Math.max(0, i - 160);
console.log(`first difference at character ${i}\n`);
console.log('--- server ---');
console.log(serverHtml.slice(from, i + 200).replace(/\s+/g, ' '));
console.log('\n--- client ---');
console.log(clientHtml.slice(from, i + 200).replace(/\s+/g, ' '));

void SIGNATURE;
process.exitCode = 1;