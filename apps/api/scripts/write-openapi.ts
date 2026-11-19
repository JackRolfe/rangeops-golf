// Writes openapi.json from the route definitions. The test in test/openapi.test.ts
// fails if the committed file is out of date, so run this after changing a route.
import { writeFile } from 'node:fs/promises';
import { openApiDocument } from '../src/app.js';
import { makeTestApp } from '../test/helpers.js';

const { app, close } = await makeTestApp();
const file = new URL('../openapi.json', import.meta.url);
await writeFile(file, JSON.stringify(openApiDocument(app), null, 2) + '\n');
await close();
console.log('Wrote openapi.json');
