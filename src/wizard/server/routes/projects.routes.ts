import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import {
  listProjects,
  getProject,
  createProject,
  saveConfig,
} from '../services/project.service.js';
import { config as serverConfig } from '../config.js';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', async () => {
    return listProjects();
  });

  app.get<{ Params: { name: string } }>('/api/projects/:name', async (request) => {
    const { name } = request.params;
    return getProject(name);
  });

  app.post<{ Body: { name: string } }>('/api/projects', async (request, reply) => {
    const { name } = request.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.status(400).send({
        error: true,
        code: 'E0000',
        message: 'Project name is required',
        details: null,
      });
    }
    const project = await createProject(name.trim());
    return reply.status(201).send(project);
  });

  app.put<{ Params: { name: string }; Body: Record<string, unknown> }>(
    '/api/projects/:name/config',
    async (request) => {
      const { name } = request.params;
      const config = request.body;
      await saveConfig(name, config);
      return { success: true };
    },
  );

  app.post<{ Params: { name: string } }>(
    '/api/projects/:name/render-layout',
    async (request, reply) => {
      const { name } = request.params;
      const projectDir = join(serverConfig.projectsDir, name);
      if (!existsSync(projectDir)) {
        return reply.status(404).send({ error: true, message: `Project "${name}" not found` });
      }

      const configPath = join(projectDir, 'build-config.json');
      if (!existsSync(configPath)) {
        return reply.status(400).send({ error: true, message: 'Project has no build config' });
      }

      try {
        const buildConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

        // Resolve the KLE layout file
        let klePath = buildConfig.layout?.path;
        if (!klePath) {
          // Fall back to project's kle.json
          klePath = join(projectDir, 'kle.json');
        } else {
          // Resolve relative paths against the project root (not CWD)
          // Config paths may be relative to src/tools/ (e.g. "../../projects/x/kle.json")
          // or absolute, or relative to project dir
          if (!klePath.startsWith('/')) {
            // Try resolving relative to project dir first
            const fromProject = resolve(projectDir, klePath);
            // Then relative to src/tools/ (where CLI runs)
            const fromTools = resolve(serverConfig.toolsDir, klePath);
            // Then relative to project root
            const fromRoot = resolve(serverConfig.projectRoot, klePath);
            if (existsSync(fromProject)) klePath = fromProject;
            else if (existsSync(fromTools)) klePath = fromTools;
            else if (existsSync(fromRoot)) klePath = fromRoot;
            else klePath = fromProject; // will fail with clear error below
          }
        }
        if (!existsSync(klePath)) {
          return reply.status(400).send({ error: true, message: `Layout file not found: ${klePath}` });
        }

        // Dynamically import the tools
        const { parseKLE } = await import(
          resolve(serverConfig.toolsDir, 'src', 'kle-parser', 'index.js')
        );
        const { renderLayoutImage } = await import(
          resolve(serverConfig.toolsDir, 'src', 'kle-renderer', 'index.js')
        );

        const kleData = JSON.parse(readFileSync(klePath, 'utf-8'));
        const layout = parseKLE(kleData);

        const imagesDir = join(projectDir, 'build', 'images');
        mkdirSync(imagesDir, { recursive: true });

        const outputPath = join(imagesDir, 'kle-layout.png');
        const finalPath = await renderLayoutImage(
          layout,
          buildConfig.switches?.model || buildConfig.switches?.type || '',
          outputPath,
        );
        const relativePath = finalPath.startsWith(join(projectDir, 'build'))
          ? finalPath.slice(join(projectDir, 'build').length + 1)
          : finalPath;

        return { path: relativePath };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: true, message: `Render failed: ${msg}` });
      }
    },
  );

  // GET /api/projects/:name/kle-keys — parse KLE layout and return simplified key array
  app.get<{ Params: { name: string } }>(
    '/api/projects/:name/kle-keys',
    async (request, reply) => {
      const { name } = request.params;
      const projectDir = join(serverConfig.projectsDir, name);
      if (!existsSync(projectDir)) {
        return reply.status(404).send({ error: true, message: `Project "${name}" not found` });
      }

      // Find the KLE layout file
      const configPath = join(projectDir, 'build-config.json');
      let klePath = join(projectDir, 'kle.json');

      if (existsSync(configPath)) {
        try {
          const buildConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
          const cfgPath = buildConfig.layout?.path;
          if (cfgPath) {
            const fromProject = resolve(projectDir, cfgPath);
            const fromTools = resolve(serverConfig.toolsDir, cfgPath);
            const fromRoot = resolve(serverConfig.projectRoot, cfgPath);
            if (existsSync(fromProject)) klePath = fromProject;
            else if (existsSync(fromTools)) klePath = fromTools;
            else if (existsSync(fromRoot)) klePath = fromRoot;
          }
        } catch { /* use default kle.json */ }
      }

      if (!existsSync(klePath)) {
        return reply.status(404).send({ error: true, message: 'No KLE layout file found' });
      }

      try {
        const raw = JSON.parse(readFileSync(klePath, 'utf-8'));

        // Simple KLE parser — extract key positions
        const keys: Array<{ x: number; y: number; w: number; h: number; label: string }> = [];
        let startIdx = 0;
        let layoutName = 'Untitled';
        if (raw.length > 0 && !Array.isArray(raw[0])) {
          layoutName = raw[0].name || 'Untitled';
          startIdx = 1;
        }

        let curY = 0;
        for (let i = startIdx; i < raw.length; i++) {
          const row = raw[i];
          if (!Array.isArray(row)) continue;
          let curX = 0, nw = 1, nh = 1, nx = 0, ny = 0;
          for (const item of row) {
            if (typeof item === 'object' && item !== null) {
              if (item.x !== undefined) nx = item.x;
              if (item.y !== undefined) ny = item.y;
              if (item.w !== undefined) nw = item.w;
              if (item.h !== undefined) nh = item.h;
              continue;
            }
            curX += nx;
            curY += ny;
            keys.push({ x: curX, y: curY, w: nw, h: nh, label: String(item).split('\n')[0] });
            curX += nw;
            nx = 0; ny = 0; nw = 1; nh = 1;
          }
          curY += 1;
        }

        return { keys, name: layoutName, keyCount: keys.length };
      } catch (err: any) {
        return reply.status(500).send({ error: true, message: `Failed to parse KLE: ${err.message}` });
      }
    },
  );
}
