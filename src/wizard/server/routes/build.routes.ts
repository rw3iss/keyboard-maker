import type { FastifyInstance } from 'fastify';
import { join } from 'path';
import { existsSync } from 'fs';
import { scanBuild } from '../services/file-scanner.service.js';
import { config } from '../config.js';
import { AppError, ErrorCodes } from '../types/errors.js';

export async function buildRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { name: string } }>('/api/build/:name', async (request) => {
    const { name } = request.params;
    return scanBuild(name);
  });

  app.get<{ Params: { name: string; '*': string } }>(
    '/api/build/:name/files/*',
    async (request, reply) => {
      const { name } = request.params;
      const filePath = request.params['*'];

      if (!filePath) {
        throw new AppError(400, ErrorCodes.FILE_NOT_FOUND, 'File path is required');
      }

      // Prevent path traversal
      const normalized = filePath.replace(/\.\./g, '');
      const fullPath = join(config.projectsDir, name, 'build', normalized);

      if (!fullPath.startsWith(join(config.projectsDir, name, 'build'))) {
        throw new AppError(403, ErrorCodes.FILE_NOT_FOUND, 'Access denied');
      }

      if (!existsSync(fullPath)) {
        throw new AppError(
          404,
          ErrorCodes.FILE_NOT_FOUND,
          `File not found: ${filePath}`,
        );
      }

      return reply.sendFile(normalized, join(config.projectsDir, name, 'build'));
    },
  );
}
