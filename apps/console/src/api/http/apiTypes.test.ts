/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PATHS_USED } from './apiTypes';

// The API's OpenAPI file, as committed in apps/api. If the API drops or renames a route the console
// calls, this fails before the console does.
const openapi = JSON.parse(readFileSync(new URL('../../../../api/openapi.json', import.meta.url), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, Schema> };
};

interface Schema {
  properties?: Record<string, unknown>;
  allOf?: (Schema & { $ref?: string })[];
}

/** A schema's property names, following allOf and $ref. */
function fields(schema: Schema & { $ref?: string }): string[] {
  if (schema.$ref) return fields(openapi.components.schemas[schema.$ref.split('/').pop()!]!);
  return [...Object.keys(schema.properties ?? {}), ...(schema.allOf ?? []).flatMap(fields)];
}

describe('the API the console calls', () => {
  it.each(PATHS_USED)('has %s', (call) => {
    const [method, path] = call.split(' ');
    expect(openapi.paths[path!]?.[method!.toLowerCase()], call).toBeDefined();
  });

  it('reports the fields the adapter maps', () => {
    const schemas = openapi.components.schemas;
    expect(fields(schemas.StaffBay!)).toEqual(expect.arrayContaining(['checkInUrl', 'active', 'offPeakCentsPerHour', 'peakCentsPerHour']));
    expect(fields(schemas.StaffOrder!)).toEqual(expect.arrayContaining(['bucketCode', 'paidAt', 'refundedAt', 'lines']));
    expect(fields(schemas.FleetRobot!)).toEqual(expect.arrayContaining(['status', 'currentHire']));
    expect(fields(schemas.Range!)).toEqual(expect.arrayContaining(['prices', 'openingHours', 'peakWindows', 'bucketProducts', 'passProducts']));
  });
});
