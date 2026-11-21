/**
 * A bay's QR code scanned while signed out. Kept for half an hour, in
 * localStorage because the sign-in link may open in a new tab, so the check-in
 * can go ahead once the player is signed in.
 */
const KEY = 'rangeops.pendingCheckIn'
const KEEP_MS = 30 * 60_000

export function savePendingCheckIn(code: string, now = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: now }))
  } catch {
    // Not kept; the player can scan again.
  }
}

export function takePendingCheckIn(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const { code, at } = JSON.parse(raw) as { code: string; at: number }
    return now - at <= KEEP_MS ? code : null
  } catch {
    return null
  }
}

export function clearPendingCheckIn(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
