import { z } from '@hono/zod-openapi';
import type { AccountRow } from './auth.js';

export const AccountSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .openapi('Account');

export const accountOut = (a: AccountRow): z.infer<typeof AccountSchema> => ({
  id: a.id,
  email: a.email,
  name: a.name,
  createdAt: a.created_at.toISOString(),
});

export const bearer = [{ bearerAuth: [] }];
