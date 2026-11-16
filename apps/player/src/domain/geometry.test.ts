import { describe, expect, it } from 'vitest'
import {
  classifyShot,
  clientPointToNormalized,
  distanceInShortEdges,
  isShotOnTarget,
  targetRadii,
} from './geometry'

describe('range geometry', () => {
  it('counts the circle boundary as on target', () => {
    const target = { cx: 0.5, cy: 0.5, radius: 0.25 }
    const dimensions = { width: 1000, height: 1000 }

    expect(isShotOnTarget({ x: 0.75, y: 0.5 }, target, dimensions)).toBe(true)
    expect(isShotOnTarget({ x: 0.750001, y: 0.5 }, target, dimensions)).toBe(false)
    expect(classifyShot({ x: 0.5, y: 0.5 }, target, dimensions)).toBe('on-target')
  })

  it('measures radius against the short edge of landscape images', () => {
    const dimensions = { width: 2000, height: 1000 }
    const target = { cx: 0.5, cy: 0.5, radius: 0.25 }

    // Both points are 250 intrinsic pixels from the centre.
    expect(isShotOnTarget({ x: 0.625, y: 0.5 }, target, dimensions)).toBe(true)
    expect(isShotOnTarget({ x: 0.5, y: 0.75 }, target, dimensions)).toBe(true)
    // A normalized x delta of .25 is 500px, not 250px, on this image.
    expect(isShotOnTarget({ x: 0.75, y: 0.5 }, target, dimensions)).toBe(false)
    expect(targetRadii(target, dimensions)).toEqual({ rx: 0.125, ry: 0.25 })
  })

  it('measures radius against the short edge of portrait images', () => {
    const dimensions = { width: 800, height: 1600 }
    const target = { cx: 0.5, cy: 0.5, radius: 0.1 }

    const centre = { x: target.cx, y: target.cy }
    expect(distanceInShortEdges({ x: 0.6, y: 0.5 }, centre, dimensions)).toBeCloseTo(0.1)
    expect(distanceInShortEdges({ x: 0.5, y: 0.55 }, centre, dimensions)).toBeCloseTo(0.1)
    expect(targetRadii(target, dimensions)).toEqual({ rx: 0.1, ry: 0.05 })
  })

  it('converts and clamps client coordinates', () => {
    const rect = { left: 20, top: 100, width: 200, height: 400 }

    expect(clientPointToNormalized(120, 300, rect)).toEqual({ x: 0.5, y: 0.5 })
    expect(clientPointToNormalized(-50, 800, rect)).toEqual({ x: 0, y: 1 })
    expect(() => clientPointToNormalized(0, 0, { ...rect, width: 0 })).toThrow(
      /positive/,
    )
  })
})
