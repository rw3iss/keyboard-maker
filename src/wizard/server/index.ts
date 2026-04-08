import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'fs';
import { config } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { projectRoutes } from './routes/projects.routes.js';
import { componentRoutes } from './routes/components.routes.js';
import { generateRoutes } from './routes/generate.routes.js';
import { buildRoutes } from './routes/build.routes.js';
import { configRoutes } from './routes/config.routes.js';

// Increase listener limit to avoid warnings from dynamic imports and SSE connections
process.setMaxListeners(30);

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // CORS
  await app.register(fastifyCors, {
    origin: true,
  });

  // Global error handler
  app.setErrorHandler(errorHandler);

  // API routes
  await app.register(projectRoutes);
  await app.register(componentRoutes);
  await app.register(generateRoutes);
  await app.register(buildRoutes);
  await app.register(configRoutes);

  // In production, serve the client SPA
  if (process.env.NODE_ENV === 'production' && existsSync(config.clientDist)) {
    await app.register(fastifyStatic, {
      root: config.clientDist,
      prefix: '/',
      wildcard: false,
    });

    // SPA fallback: serve index.html for non-API routes
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({
          error: true,
          code: 'E0404',
          message: 'API route not found',
          details: null,
        });
      }
      return reply.sendFile('index.html');
    });
  } else {
    // Register @fastify/static for build file serving even in dev mode
    // Use a dummy root; actual serving is done via reply.sendFile with explicit root
    await app.register(fastifyStatic, {
      root: config.projectsDir,
      prefix: '/static-dummy/',
      serve: false,
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({
          error: true,
          code: 'E0404',
          message: 'API route not found',
          details: null,
        });
      }
      return reply.status(404).send({ error: true, message: 'Not found' });
    });
  }

  // Start server
  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`Keybuild server listening on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Immediate shutdown — don't wait for open connections (SSE streams hang forever)
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, exiting.`);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
