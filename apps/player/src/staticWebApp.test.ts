import { describe, expect, it } from 'vitest'
import config from '../../site/staticwebapp.config.json'
import { parseLink } from './routes'
import { bytesToBase64url } from './robot/protocol'

/**
 * On Azure the app is served from the site's Static Web App at /app/, and
 * Static Web Apps only read staticwebapp.config.json from the deployed root,
 * which is built from apps/site. Every link the app handles must be rewritten
 * to /app/index.html there, or opening it from an email or QR code is a 404.
 * The rewrites name only those paths, so the app's own files are served as they are.
 */
const routes = (config as { routes: { route: string; rewrite?: string }[] }).routes

function rewritten(path: string): boolean {
  return routes.some(
    (item) =>
      item.rewrite === '/app/index.html' &&
      (item.route.endsWith('/*') ? path.startsWith(item.route.slice(0, -1)) : path === item.route),
  )
}

describe('the site’s Static Web App config', () => {
  const hire = bytesToBase64url(new Uint8Array(78))
  const links = [
    ['/app/signin', '?token=abc', 'signin'],
    ['/app/drive', `?hire=${hire}`, 'drive'],
    ['/app/check-in/9f2c1a', '', 'check-in'],
  ] as const

  it.each(links)('sends %s to the app, which reads it', (path, search, kind) => {
    expect(rewritten(path)).toBe(true)
    expect(parseLink(path, search, '/app/').kind).toBe(kind)
  })

  it('leaves the app’s own files and the site alone', () => {
    for (const path of ['/app/assets/index-abc123.js', '/app/sw.js', '/app/manifest.webmanifest', '/app/favicon.svg', '/index.html', '/brand/tokens.css']) {
      expect(rewritten(path), path).toBe(false)
    }
  })
})
