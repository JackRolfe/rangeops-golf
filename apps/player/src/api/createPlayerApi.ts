import { FakePlayerApi } from './FakePlayerApi'
import { HttpPlayerApi } from './HttpPlayerApi'
import type { AuthHooks, PlayerApi } from './PlayerApi'

/**
 * The app's API: the real one at VITE_API_URL, or, with none set, the
 * in-memory fake in demo mode, where nothing is booked or charged.
 */
export function createPlayerApi(auth: AuthHooks, apiUrl: string | undefined = import.meta.env.VITE_API_URL): PlayerApi {
  return apiUrl ? new HttpPlayerApi(apiUrl, auth) : new FakePlayerApi({ auth })
}
