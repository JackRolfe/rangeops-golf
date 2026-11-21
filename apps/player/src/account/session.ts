import type { Session } from '../api/types'

/** The signed-in session, kept on this device. Practice data never depends on it. */
export const SESSION_KEY = 'rangeops.session'

export function loadSession(now = new Date()): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    if (!session.sessionToken || !session.account?.email) return null
    if (Date.parse(session.expiresAt) <= now.getTime()) {
      clearSession()
      return null
    }
    return session
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Private mode or storage blocked: the session lasts until the page closes.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // Nothing to clear.
  }
}
