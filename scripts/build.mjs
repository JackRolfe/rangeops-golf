// Builds the whole RangeOps web property into dist/:
//   dist/          the site (apps/site)
//   dist/brand/    the brand tokens the site links to (packages/brand)
//   dist/app/      the practice app (apps/player)
//
// RANGEOPS_BASE sets the path the site is served from when it is not the domain root,
// for example RANGEOPS_BASE=/rangeops-golf/ for a GitHub Pages project site.
// --site-only refreshes the site and brand files without rebuilding the app.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const siteOnly = process.argv.includes('--site-only');

let base = process.env.RANGEOPS_BASE || '/';
if (!base.startsWith('/')) base = `/${base}`;
if (!base.endsWith('/')) base = `${base}/`;

if (!siteOnly) rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'brand'), { recursive: true });

cpSync(join(root, 'apps/site'), dist, { recursive: true });
cpSync(join(root, 'packages/brand/tokens.css'), join(dist, 'brand/tokens.css'));
cpSync(join(root, 'apps/player/public/favicon.svg'), join(dist, 'favicon.svg'));
console.log('Built the site into dist/');

if (!siteOnly) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(
    npm,
    ['run', 'build', '-w', '@rangeops/player', '--', `--base=${base}app/`, '--outDir', join(dist, 'app'), '--emptyOutDir'],
    { cwd: root, stdio: 'inherit' },
  );
  console.log(`Built the practice app into dist/app/ (served from ${base}app/)`);
}
