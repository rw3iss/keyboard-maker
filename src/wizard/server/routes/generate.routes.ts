import type { FastifyInstance } from 'fastify';
import { getProject } from '../services/project.service.js';
import {
  executeBuild,
  isBuildActive,
  type BuildOutputSelections,
} from '../services/execution-engine.js';
import { AppError, ErrorCodes } from '../types/errors.js';
import type { BuildEvent } from '../types/events.js';

/** In-memory event buffers for active/recent builds. */
const buildEventBuffers = new Map<string, BuildEvent[]>();
/** Pending SSE listeners waiting for events. */
const sseListeners = new Map<string, Set<(event: BuildEvent) => void>>();

export async function generateRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Params: { name: string };
    Body: { outputs?: BuildOutputSelections; routingTimeoutMinutes?: number; maxPasses?: number };
  }>('/api/generate/:name', async (request, reply) => {
    const { name } = request.params;
    const outputs = request.body?.outputs ?? {};
    const routingTimeoutMinutes = request.body?.routingTimeoutMinutes ?? 10;
    const maxPasses = request.body?.maxPasses ?? 25;

    if (isBuildActive(name)) {
      throw new AppError(
        409,
        ErrorCodes.BUILD_ALREADY_RUNNING,
        `A build is already running for "${name}"`,
      );
    }

    const project = await getProject(name);
    if (!project.config) {
      throw new AppError(
        400,
        ErrorCodes.PROJECT_NO_CONFIG,
        `Project "${name}" has no build config`,
      );
    }

    // Initialize event buffer
    buildEventBuffers.set(name, []);

    // Emitter pushes events to buffer and notifies SSE listeners
    const emitter = (event: BuildEvent) => {
      const buffer = buildEventBuffers.get(name);
      if (buffer) buffer.push(event);

      const listeners = sseListeners.get(name);
      if (listeners) {
        for (const listener of listeners) {
          listener(event);
        }
      }
    };

    // Start build asynchronously - don't await
    executeBuild(name, project.config, outputs, emitter, routingTimeoutMinutes, maxPasses).catch((err) => {
      console.error(`Build failed for ${name}:`, err);
    });

    return reply.status(202).send({ started: true, project: name });
  });

  app.get<{ Params: { name: string } }>(
    '/api/generate/:name/stream',
    async (request, reply) => {
      const { name } = request.params;

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Send any buffered events first
      const buffer = buildEventBuffers.get(name);
      if (buffer) {
        for (const event of buffer) {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      }

      // Check if build already finished
      const lastEvent = buffer?.[buffer.length - 1];
      if (
        lastEvent &&
        (lastEvent.type === 'build:complete' || lastEvent.type === 'build:error')
      ) {
        reply.raw.end();
        return reply;
      }

      // Register listener for new events
      const listener = (event: BuildEvent) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
          if (event.type === 'build:complete' || event.type === 'build:error') {
            reply.raw.end();
            cleanup();
          }
        } catch {
          cleanup();
        }
      };

      if (!sseListeners.has(name)) {
        sseListeners.set(name, new Set());
      }
      sseListeners.get(name)!.add(listener);

      const cleanup = () => {
        sseListeners.get(name)?.delete(listener);
        if (sseListeners.get(name)?.size === 0) {
          sseListeners.delete(name);
        }
      };

      // Clean up on disconnect
      request.raw.on('close', cleanup);

      // Keep the reply open (don't return a value that triggers send)
      return reply;
    },
  );
}
