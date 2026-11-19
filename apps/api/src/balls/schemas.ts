import { z } from '@hono/zod-openapi';
import { Instant } from '../ranges/schemas.js';
import { showCode } from './codes.js';

export interface BucketCodeRow {
  id: string;
  range_id: string;
  order_id: string;
  account_id: string | null;
  bucket_product_id: string;
  name: string;
  balls: number;
  code: string;
  created_at: Date;
  redeemed_at: Date | null;
  redeemed_by: string | null;
}

export const BucketCodeSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().openapi({ example: 'K7QM-4XRT', description: 'Show this at the counter, or to the ball machine' }),
    rangeId: z.string().uuid(),
    bucket: z.object({ productId: z.string().uuid(), name: z.string(), balls: z.number().int() }),
    orderId: z.string().uuid(),
    accountId: z.string().uuid().nullable(),
    createdAt: Instant,
    redeemedAt: Instant.nullable(),
    redeemedBy: z.string().uuid().nullable().openapi({ description: 'The staff account that handed it over' }),
  })
  .openapi('BucketCode');

export const bucketCodeOut = (b: BucketCodeRow): z.infer<typeof BucketCodeSchema> => ({
  id: b.id,
  code: showCode(b.code),
  rangeId: b.range_id,
  bucket: { productId: b.bucket_product_id, name: b.name, balls: b.balls },
  orderId: b.order_id,
  accountId: b.account_id,
  createdAt: b.created_at.toISOString(),
  redeemedAt: b.redeemed_at?.toISOString() ?? null,
  redeemedBy: b.redeemed_by,
});
