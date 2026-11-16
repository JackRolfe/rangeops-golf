import type { ImageDimensions, Shot, Target } from './types'

export interface NormalizedPoint {
  x: number
  y: number
}

export interface ClientRectLike {
  left: number
  top: number
  width: number
  height: number
}

export type ShotClassification = 'on-target' | 'off-target'

const isFinitePositive = (value: number): boolean =>
  Number.isFinite(value) && value > 0

export function assertValidDimensions(dimensions: ImageDimensions): void {
  if (!isFinitePositive(dimensions.width) || !isFinitePositive(dimensions.height)) {
    throw new RangeError('Image dimensions must be positive finite numbers.')
  }
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** Convert a pointer location in a rendered image rectangle into 0–1 values. */
export function clientPointToNormalized(
  clientX: number,
  clientY: number,
  rect: ClientRectLike,
): NormalizedPoint {
  if (!isFinitePositive(rect.width) || !isFinitePositive(rect.height)) {
    throw new RangeError('Rendered image dimensions must be positive.')
  }

  return {
    x: clampUnit((clientX - rect.left) / rect.width),
    y: clampUnit((clientY - rect.top) / rect.height),
  }
}

/** Convert normalized image coordinates into intrinsic image pixels. */
export function normalizedPointToImage(
  point: NormalizedPoint,
  dimensions: ImageDimensions,
): NormalizedPoint {
  assertValidDimensions(dimensions)
  return {
    x: point.x * dimensions.width,
    y: point.y * dimensions.height,
  }
}

/**
 * Distance between two normalized positions, expressed in units of the
 * image's shorter edge. This keeps a target visually circular on any aspect
 * ratio instead of treating normalized x and y as equal physical distances.
 */
export function distanceInShortEdges(
  first: NormalizedPoint,
  second: NormalizedPoint,
  dimensions: ImageDimensions,
): number {
  assertValidDimensions(dimensions)
  const shortEdge = Math.min(dimensions.width, dimensions.height)
  const dx = ((first.x - second.x) * dimensions.width) / shortEdge
  const dy = ((first.y - second.y) * dimensions.height) / shortEdge
  return Math.hypot(dx, dy)
}

/** The target boundary counts as on target. */
export function isShotOnTarget(
  shot: Pick<Shot, 'x' | 'y'>,
  target: Target,
  dimensions: ImageDimensions,
): boolean {
  if (!Number.isFinite(target.radius) || target.radius < 0) return false
  return distanceInShortEdges(shot, { x: target.cx, y: target.cy }, dimensions) <= target.radius
}

export function classifyShot(
  shot: Pick<Shot, 'x' | 'y'>,
  target: Target,
  dimensions: ImageDimensions,
): ShotClassification {
  return isShotOnTarget(shot, target, dimensions) ? 'on-target' : 'off-target'
}

/** Radius in normalized SVG x/y units for rendering an actual circle. */
export function targetRadii(
  target: Pick<Target, 'radius'>,
  dimensions: ImageDimensions,
): { rx: number; ry: number } {
  assertValidDimensions(dimensions)
  const shortEdge = Math.min(dimensions.width, dimensions.height)
  return {
    rx: (target.radius * shortEdge) / dimensions.width,
    ry: (target.radius * shortEdge) / dimensions.height,
  }
}
