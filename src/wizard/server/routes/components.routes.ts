import type { FastifyInstance } from 'fastify';
import {
  listCategories,
  listComponents,
  getComponent,
} from '../services/component-db.service.js';

export async function componentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/components', async () => {
    return listCategories();
  });

  app.get<{ Params: { category: string } }>(
    '/api/components/:category',
    async (request) => {
      const { category } = request.params;
      return listComponents(category);
    },
  );

  app.get<{ Params: { category: string; id: string } }>(
    '/api/components/:category/:id',
    async (request) => {
      const { category, id } = request.params;
      return getComponent(category, id);
    },
  );
}
