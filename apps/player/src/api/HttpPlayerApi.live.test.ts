// The PlayerApi contract against a running API. Skipped unless RANGEOPS_API_URL
// is set; RANGEOPS_API_LOG must be the file the API's output goes to, because
// that's where its sign-in links are written. For example:
//   (cd apps/api && DATA_DIR=$(mktemp -d) npm start > /tmp/api.log 2>&1 &)
//   RANGEOPS_API_URL=http://localhost:8787 RANGEOPS_API_LOG=/tmp/api.log npx vitest run src/api/HttpPlayerApi.live
import { describe, it } from 'vitest'
import { HttpPlayerApi } from './HttpPlayerApi'
import { playerApiContract } from './playerApi.contract'

// The app's tsconfig has no Node types, so reach Node's env and fs untyped.
const env: Record<string, string | undefined> = (globalThis as { process?: { env: Record<string, string> } }).process?.env ?? {}
const url = env.RANGEOPS_API_URL
const log = env.RANGEOPS_API_LOG
const nodeFs = 'node:fs'

/** The newest sign-in token the API logged for `email`. */
export async function tokenFromLog(logPath: string, email: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (path: string, encoding: string) => string }
    const text = readFileSync(logPath, 'utf8')
    const at = text.lastIndexOf(`Mail to ${email}`)
    const match = at >= 0 ? /signin\?token=([A-Za-z0-9_-]+)/.exec(text.slice(at)) : null
    if (match) return match[1]
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`No sign-in link for ${email} in ${logPath}.`)
}

if (url && log) {
  playerApiContract('HttpPlayerApi against a live API', () => {
    let token: string | null = null
    const api = new HttpPlayerApi(url, { getToken: () => token })
    return {
      api,
      async signIn() {
        const email = `contract-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`
        await api.requestSignInLink(email)
        token = (await api.verifySignIn(await tokenFromLog(log, email))).sessionToken
      },
      signOut() {
        token = null
      },
    }
  })
} else {
  describe.skip('HttpPlayerApi against a live API (set RANGEOPS_API_URL and RANGEOPS_API_LOG)', () => {
    it('is skipped', () => {})
  })
}
