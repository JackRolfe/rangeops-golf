import { describe, expect, it } from 'vitest'
import {
  SHRINK_FACTOR,
  SHRINK_FLOOR_RATIO,
  SHRINK_STREAK,
  playRing,
  ringForNextShot,
} from './games'

const hits = (pattern: string): boolean[] => [...pattern].map((c) => c === 'x')

describe('playRing', () => {
  it('never changes the ring in bullseye', () => {
    const ring = playRing('bullseye', 0.2, hits('xxxxxxxxx'))
    expect(ring.radius).toBe(0.2)
    expect(ring.streak).toBe(9)
    expect(ring.onTarget).toBe(9)
    expect(ring.shrinks).toBe(0)
  })

  it('shrinks by a fifth on every third hit in a row', () => {
    expect(SHRINK_STREAK).toBe(3)
    expect(SHRINK_FACTOR).toBe(0.8)
    expect(playRing('shrink', 0.2, hits('xx')).radius).toBe(0.2)
    expect(playRing('shrink', 0.2, hits('xxx')).radius).toBeCloseTo(0.16)
    expect(playRing('shrink', 0.2, hits('xxxxxx')).radius).toBeCloseTo(0.128)
    expect(playRing('shrink', 0.2, hits('xxxxxxxxx')).radius).toBeCloseTo(0.1024)
    expect(playRing('shrink', 0.2, hits('xxxxxxxxx')).shrinks).toBe(3)
  })

  it('resets the streak on a miss but keeps the ring it has reached', () => {
    const ring = playRing('shrink', 0.2, hits('xxx.xx'))
    expect(ring.radius).toBeCloseTo(0.16)
    expect(ring.streak).toBe(2)
    expect(ring.onTarget).toBe(5)
    expect(playRing('shrink', 0.2, hits('xx.xx.xx')).radius).toBe(0.2)
  })

  it('stops at a floor of one third of the starting ring', () => {
    expect(SHRINK_FLOOR_RATIO).toBeCloseTo(1 / 3)
    const ring = playRing('shrink', 0.3, hits('x'.repeat(60)))
    expect(ring.radius).toBeCloseTo(0.1)
    expect(ring.minRadius).toBeCloseTo(0.1)
  })

  it('matches the site demo, which starts at 36 and floors at 12', () => {
    // replay() in apps/site/index.html: r = Math.max(12, r * 0.8) on streak % 3 === 0
    let demo = 36
    const pattern = hits('xxx.xxxxxx.xxxxxxxxxxxx')
    let streak = 0
    for (const hit of pattern) {
      if (hit) {
        streak++
        if (streak % 3 === 0) demo = Math.max(12, demo * 0.8)
      } else streak = 0
    }
    expect(playRing('shrink', 36, pattern).radius).toBeCloseTo(demo)
  })
})

describe('ringForNextShot', () => {
  const dimensions = { width: 1000, height: 1000 }
  const target = { cx: 0.5, cy: 0.5, radius: 0.1 }
  const on = (radius: number) => ({ x: 0.5, y: 0.5, radius })
  const off = (radius: number) => ({ x: 0.95, y: 0.95, radius })

  it('judges each shot against the ring it was played at', () => {
    // 0.09 from the centre: on target at 0.1, a miss once the ring is 0.08.
    const edge = (radius: number) => ({ x: 0.59, y: 0.5, radius })
    const session = { mode: 'shrink' as const, target, shots: [on(0.1), on(0.1), edge(0.1), edge(0.08)] }
    const ring = ringForNextShot(session, dimensions)
    expect(ring.radius).toBeCloseTo(0.08)
    expect(ring.streak).toBe(0)
  })

  it('starts from the session target', () => {
    expect(ringForNextShot({ mode: 'shrink', target, shots: [] }, dimensions)).toMatchObject({
      radius: 0.1,
      streak: 0,
      onTarget: 0,
    })
    expect(ringForNextShot({ mode: 'bullseye', target, shots: [on(0.1), off(0.1)] }, dimensions).onTarget).toBe(1)
  })
})
