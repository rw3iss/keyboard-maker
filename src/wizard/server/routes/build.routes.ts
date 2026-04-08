import type { FastifyInstance } from 'fastify';
import { join } from 'path';
import { existsSync, statSync, createReadStream, unlinkSync, readdirSync } from 'fs';
import { scanBuild } from '../services/file-scanner.service.js';
import { config } from '../config.js';
import { AppError, ErrorCodes } from '../types/errors.js';
import { safePath } from '../utils/safe-path.js';
import archiver from 'archiver';

/** Name of the cached zip archive inside the build folder */
const ZIP_NAME = 'build-archive.zip';

export async function buildRoutes(app: FastifyInstance): Promise<void> {
  /** Server capabilities — tells the client what's enabled */
  app.get('/api/config/server', async () => {
    return {
      enableAutoRouting: config.enableAutoRouting,
    };
  });

  /** List build files grouped by category */
  app.get<{ Params: { name: string } }>('/api/build/:name', async (request) => {
    const { name } = request.params;
    return scanBuild(name);
  });

  /** Serve individual build files */
  app.get<{ Params: { name: string; '*': string } }>(
    '/api/build/:name/files/*',
    async (request, reply) => {
      const { name } = request.params;
      const filePath = request.params['*'];
      const buildDir = join(config.projectsDir, name, 'build');
      const fullPath = safePath(buildDir, filePath);

      if (!existsSync(fullPath)) {
        throw new AppError(
          404,
          ErrorCodes.FILE_NOT_FOUND,
          `File not found: ${filePath}`,
        );
      }

      const relative = filePath.replace(/\.\./g, '').replace(/^\/+/, '');
      return reply.sendFile(relative, buildDir);
    },
  );

  /** Download all build files as a zip archive */
  app.get<{ Params: { name: string } }>(
    '/api/build/:name/download',
    async (request, reply) => {
      const { name } = request.params;
      const buildDir = join(config.projectsDir, name, 'build');

      if (!existsSync(buildDir)) {
        throw new AppError(404, ErrorCodes.FILE_NOT_FOUND, 'Build directory not found');
      }

      const zipPath = join(buildDir, ZIP_NAME);

      // If a cached zip exists and is newer than all build files, serve it
      if (existsSync(zipPath)) {
        const zipMtime = statSync(zipPath).mtimeMs;
        const buildFiles = getAllFiles(buildDir);
        const newestFile = buildFiles.reduce((max, f) => {
          if (f === zipPath) return max;
          const mt = statSync(f).mtimeMs;
          return mt > max ? mt : max;
        }, 0);

        if (zipMtime >= newestFile) {
          reply.header('Content-Type', 'application/zip');
          reply.header('Content-Disposition', `attachment; filename="${name}-build.zip"`);
          return reply.send(createReadStream(zipPath));
        }
        // Stale — delete and regenerate
        try { unlinkSync(zipPath); } catch { /* ignore */ }
      }

      // Generate zip
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${name}-build.zip"`);
      reply.raw.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${name}-build.zip"`,
      });

      const archive = archiver('zip', { zlib: { level: 6 } });
      const { createWriteStream } = await import('fs');
      const cacheStream = createWriteStream(zipPath);

      // Pipe to both the response and the cache file
      archive.pipe(reply.raw);
      archive.pipe(cacheStream);

      // Add all files except the zip archive itself
      addDirectoryToArchive(archive, buildDir, '', buildDir);

      await archive.finalize();
      return reply;
    },
  );

  /** Delete cached zip when a new build starts (called from execution engine) */
  app.delete<{ Params: { name: string } }>(
    '/api/build/:name/archive',
    async (request) => {
      const { name } = request.params;
      const zipPath = join(config.projectsDir, name, 'build', ZIP_NAME);
      if (existsSync(zipPath)) {
        try { unlinkSync(zipPath); } catch { /* ignore */ }
      }
      return { ok: true };
    },
  );
}

/** Recursively get all file paths in a directory */
function getAllFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

/** Add directory contents to archive, excluding the zip itself */
function addDirectoryToArchive(archive: archiver.Archiver, baseDir: string, prefix: string, buildDir: string): void {
  for (const entry of readdirSync(join(baseDir, prefix), { withFileTypes: true })) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = join(baseDir, relPath);

    // Skip the cached archive itself
    if (entry.name === ZIP_NAME) continue;

    if (entry.isDirectory()) {
      addDirectoryToArchive(archive, baseDir, relPath, buildDir);
    } else {
      archive.file(fullPath, { name: relPath });
    }
  }
}
