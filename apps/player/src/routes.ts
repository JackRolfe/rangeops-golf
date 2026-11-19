import { base64urlToBytes, HIRE_KEY_LENGTH } from './robot/protocol'

/**
 * The links the backend sends people to, under the app's base path:
 *   signin?token=…         a sign-in link from an email
 *   drive?hire=<base64url>  a hire key, from a booking or a check-in
 *   check-in/<code>         a bay's QR code
 */
export type AppLink =
  | { kind: 'home' }
  | { kind: 'signin'; token: string }
  | { kind: 'drive'; hireKey: Uint8Array }
  | { kind: 'bad-hire-link' }
  | { kind: 'check-in'; code: string }

/**
 * `base` is Vite's base: `/` in development, `/app/` in the site build. A
 * leading `app/` is also accepted, so the API's default APP_URL
 * (http://localhost:5173/app) works with `npm run dev`.
 */
export function parseLink(pathname: string, search: string, base: string): AppLink {
  let path = pathname
  const prefix = base.endsWith('/') ? base : `${base}/`
  if (path.startsWith(prefix)) path = path.slice(prefix.length)
  else if (`${path}/` === prefix) path = ''
  path = path.replace(/^\/+/, '')
  if (path === 'app' || path.startsWith('app/')) path = path.slice(4)
  const segments = path.split('/').filter(Boolean)
  const query = new URLSearchParams(search)

  if (segments[0] === 'signin' && segments.length === 1) {
    const token = query.get('token')
    return token ? { kind: 'signin', token } : { kind: 'home' }
  }
  if (segments[0] === 'drive' && segments.length === 1) {
    const hire = query.get('hire')
    if (hire === null) return { kind: 'home' }
    const hireKey = base64urlToBytes(hire)
    return hireKey && hireKey.length === HIRE_KEY_LENGTH ? { kind: 'drive', hireKey } : { kind: 'bad-hire-link' }
  }
  if (segments[0] === 'check-in' && segments.length === 2) {
    return { kind: 'check-in', code: decodeURIComponent(segments[1]) }
  }
  return { kind: 'home' }
}
