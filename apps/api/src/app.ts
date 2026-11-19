import { OpenAPIHono, z } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import type { Deps } from './deps.js';
import { ApiError } from './errors.js';
import { authRoutes } from './auth/routes.js';
import { ballRoutes } from './balls/routes.js';
import { bookingRoutes } from './bookings/routes.js';
import { checkInRoutes } from './checkin/routes.js';
import { staffCheckInRoutes } from './console/checkIn.js';
import { consoleRoutes } from './console/routes.js';
import { fleetRoutes } from './fleet/routes.js';
import { healthRoutes } from './health.js';
import { hireRoutes } from './hires/routes.js';
import { rangeRoutes } from './ranges/routes.js';

export type Api = OpenAPIHono;

export const API_INFO = {
  title: 'RangeOps API',
  version: '0.1.0',
  description:
    'Bookings, payments, bucket codes, passes, robot hires and the fleet for RangeOps ranges. ' +
    'Runs locally only for now. See docs/PLAN.md and .scratch/backend-api/spec.md.',
};

export function createApp(deps: Deps): Api {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          { error: { code: 'bad_request', message: z.prettifyError(result.error) } },
          400,
        );
      }
    },
  });

  app.use('*', cors());

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Something went wrong.' } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'No such route.' } }, 404));

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    description: 'A session token from POST /auth/verify.',
  });

  healthRoutes(app, deps);
  rangeRoutes(app, deps);
  authRoutes(app, deps);
  bookingRoutes(app, deps);
  hireRoutes(app, deps);
  ballRoutes(app, deps);
  checkInRoutes(app, deps);
  fleetRoutes(app, deps);
  consoleRoutes(app, deps);
  staffCheckInRoutes(app, deps);

  app.doc31('/openapi.json', openApiConfig);
  return app;
}

export const openApiConfig = {
  openapi: '3.1.0',
  info: API_INFO,
  servers: [{ url: 'http://localhost:8787', description: 'Local dev server' }],
};

export function openApiDocument(app: Api) {
  return app.getOpenAPI31Document(openApiConfig);
}
