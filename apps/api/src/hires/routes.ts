import { createRoute, z } from '@hono/zod-openapi';
import type { Api } from '../app.js';
import type { Deps } from '../deps.js';

const publicKey = createRoute({
  method: 'get',
  path: '/hire-keys/public-key',
  tags: ['Robots'],
  summary: 'The public key robots check hire keys against',
  description: 'Flash these 32 bytes into the firmware. Hire keys are Ed25519-signed; see robot/README.md.',
  responses: {
    200: {
      description: 'The raw Ed25519 public key',
      content: {
        'application/json': {
          schema: z
            .object({ algorithm: z.literal('Ed25519'), hex: z.string(), base64: z.string(), keyVersion: z.literal(1) })
            .openapi('HireKeyPublicKey'),
        },
      },
    },
  },
});

export function hireRoutes(app: Api, deps: Deps) {
  app.openapi(publicKey, (c) =>
    c.json(
      {
        algorithm: 'Ed25519' as const,
        hex: deps.signer.publicKey.toString('hex'),
        base64: deps.signer.publicKey.toString('base64'),
        keyVersion: 1 as const,
      },
      200,
    ),
  );
}
