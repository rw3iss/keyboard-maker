/**
 * 3D Keyboard Viewer — development HTTP server.
 *
 * Serves the viewer HTML/JS and build artifacts so the keyboard can be
 * visualised in a browser with Three.js.  Started via:
 *   keyboard-maker viewer --dir <build-dir>
 */

import { createServer } from 'http';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, extname, resolve } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const VIEWER_DIR = resolve(__filename, '..');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.stl': 'application/octet-stream',
  '.step': 'application/octet-stream',
  '.dxf': 'text/plain',
};

export async function startViewer(buildDir: string, port: number): Promise<void> {
  const resolvedBuildDir = resolve(buildDir);

  if (!existsSync(resolvedBuildDir)) {
    throw new Error(`Build directory not found: ${resolvedBuildDir}`);
  }

  const server = createServer((req, res) => {
    const url = req.url ?? '/';

    // ---- API: build metadata -------------------------------------------
    if (url === '/api/build-info') {
      const configPath = join(resolvedBuildDir, '..', 'build-config.json');
      const config = existsSync(configPath)
        ? JSON.parse(readFileSync(configPath, 'utf-8'))
        : {};
      const files = readdirSync(resolvedBuildDir, { recursive: true }).map(String);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ config, files, buildDir: resolvedBuildDir }));
      return;
    }

    // ---- Build artifacts (/build/*) ------------------------------------
    if (url.startsWith('/build/')) {
      const filePath = join(resolvedBuildDir, url.replace('/build/', ''));
      if (existsSync(filePath)) {
        const ext = extname(filePath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        });
        res.end(readFileSync(filePath));
        return;
      }
    }

    // ---- Viewer static files -------------------------------------------
    const filePath = join(VIEWER_DIR, url === '/' ? 'index.html' : url);
    if (existsSync(filePath)) {
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'text/plain' });
      res.end(readFileSync(filePath));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(chalk.bold.cyan('\n  3D Keyboard Viewer'));
    console.log(`  ${chalk.green('Running at:')} ${url}`);
    console.log(`  ${chalk.dim('Build dir:')} ${resolvedBuildDir}\n`);

    // Best-effort browser open
    try {
      const cmd =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';
      execSync(`${cmd} ${url}`, { stdio: 'ignore' });
    } catch {
      /* browser open is best-effort */
    }
  });
}
