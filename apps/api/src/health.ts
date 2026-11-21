import { createRoute, z } from '@hono/zod-openapi';
import type { Api } from './app.js';
import type { Deps } from './deps.js';

const health = createRoute({
  method: 'get',
  path: '/health',
  tags: ['Meta'],
  summary: 'Is the API up?',
  responses: {
    200: {
      description: 'The API and its database answer',
      content: {
        'application/json': {
          schema: z.object({ ok: z.literal(true), time: z.string().datetime() }).openapi('Health'),
        },
      },
    },
  },
});

export function healthRoutes(app: Api, deps: Deps) {
  app.openapi(health, async (c) => {
    await deps.db.one('select 1 as one');
    return c.json({ ok: true as const, time: deps.now().toISOString() }, 200);
  });
}
