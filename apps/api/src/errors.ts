import { z } from '@hono/zod-openapi';

export type ErrorStatus = 400 | 401 | 402 | 403 | 404 | 409 | 422 | 500;

/** Thrown anywhere in a handler; `app.onError` turns it into `{error: {code, message}}`. */
export class ApiError extends Error {
  constructor(
    readonly status: ErrorStatus,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'bad_request') => new ApiError(400, code, message);
export const unauthorized = (message = 'Sign in first.') => new ApiError(401, 'unauthorized', message);
export const paymentDeclined = (message: string) => new ApiError(402, 'payment_declined', message);
export const forbidden = (message = 'Not allowed.') => new ApiError(403, 'forbidden', message);
export const notFound = (message: string, code = 'not_found') => new ApiError(404, code, message);
export const conflict = (message: string, code = 'conflict') => new ApiError(409, code, message);
export const unprocessable = (message: string, code = 'rule_broken') => new ApiError(422, code, message);

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'not_found' }),
      message: z.string(),
    }),
  })
  .openapi('Error');

const descriptions: Record<ErrorStatus, string> = {
  400: 'The request did not match the schema',
  401: 'Not signed in, or the session has expired',
  402: 'The payment was declined',
  403: 'Signed in, but not allowed to do this',
  404: 'Not found',
  409: 'Conflicts with something that already exists',
  422: 'Well-formed, but breaks a booking or pricing rule',
  500: 'Unexpected server error',
};

/** The error responses a route can give, for its OpenAPI description. */
export function errors<const S extends ErrorStatus>(...statuses: S[]) {
  const out = {} as Record<S, { description: string; content: { 'application/json': { schema: typeof ErrorSchema } } }>;
  for (const s of statuses) {
    out[s] = { description: descriptions[s], content: { 'application/json': { schema: ErrorSchema } } };
  }
  return out;
}
