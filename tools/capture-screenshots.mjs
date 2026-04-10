import http from 'node:http';
import { createReadStream } from 'node:fs';
import { access, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const currentFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFilePath), '..');
const outputDir = path.join(projectRoot, 'screenshots');
const port = 4173;
const host = '127.0.0.1';

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.jfif', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf']
]);

function sendNotFound(response) {
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
}

function safeResolve(requestPath) {
  const normalizedPath = decodeURIComponent(requestPath.split('?')[0].split('#')[0]);
  const resolvedPath = path.normalize(path.join(projectRoot, normalizedPath));
  if (!resolvedPath.startsWith(projectRoot)) {
    return null;
  }
  return resolvedPath;
}

const server = http.createServer(async (request, response) => {
  const urlPath = request.url === '/' ? '/index.html' : request.url;
  const filePath = safeResolve(urlPath);

  if (!filePath) {
    sendNotFound(response);
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      await access(indexPath);
      const stream = createReadStream(indexPath);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      stream.pipe(response);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes.get(ext) ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType });
    createReadStream(filePath).pipe(response);
  } catch {
    sendNotFound(response);
  }
});

await mkdir(outputDir, { recursive: true });

await new Promise((resolve) => {
  server.listen(port, host, resolve);
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1200 },
  deviceScaleFactor: 1
});

await page.goto(`http://${host}:${port}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const captures = [
  ['hero', '#hero'],
  ['about', '#about'],
  ['planning', '#section_4'],
  ['menu', '#menu'],
  ['testimonials', '#testimonials'],
  ['contact', '#contact']
];

for (const [name, selector] of captures) {
  const section = page.locator(selector);
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await section.screenshot({
    path: path.join(outputDir, `${name}.png`),
    animations: 'disabled'
  });
}

await browser.close();
server.close();
