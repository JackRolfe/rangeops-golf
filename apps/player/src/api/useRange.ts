import { useCallback, useEffect, useState } from 'react'
import { apiErrorMessage, useAccount } from '../account/AccountContext'
import type { Range, RangeSummary } from './types'

const RANGE_KEY = 'rangeops.range'

function rememberedRange(): string | null {
  try {
    return localStorage.getItem(RANGE_KEY)
  } catch {
    return null
  }
}

/**
 * The range Book and Balls work with: the only one, or the one the player
 * picked last time.
 */
export function useRange() {
  const { api } = useAccount()
  const [ranges, setRanges] = useState<RangeSummary[]>([])
  const [range, setRange] = useState<Range | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    async (wanted?: string) => {
      setLoading(true)
      setError(null)
      try {
        const all = await api.listRanges()
        setRanges(all)
        const pick = all.find((item) => item.id === (wanted ?? rememberedRange())) ?? all[0]
        setRange(pick ? await api.getRange(pick.slug) : null)
      } catch (loadError) {
        setError(apiErrorMessage(loadError))
      } finally {
        setLoading(false)
      }
    },
    [api],
  )

  useEffect(() => {
    void load()
  }, [load])

  const chooseRange = useCallback(
    (rangeId: string) => {
      try {
        localStorage.setItem(RANGE_KEY, rangeId)
      } catch {
        // Not remembered; still used now.
      }
      void load(rangeId)
    },
    [load],
  )

  return { ranges, range, error, loading, chooseRange, reload: load }
}
