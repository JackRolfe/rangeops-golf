import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { clientPointToNormalized, isShotOnTarget } from '../domain/geometry';
import type { Shot, Target } from '../domain/types';

export type RangeMapMode = 'setup' | 'record' | 'review';

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface RangeMapCanvasProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  target: Target;
  shots?: readonly Shot[];
  mode: RangeMapMode;
  onTargetChange?: (target: Target) => void;
  onShot?: (point: NormalizedPoint) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  ariaLabel?: string;
}

type DragKind = 'move' | 'resize';

interface DragState {
  kind: DragKind;
  pointerId: number;
}

interface PendingShotPointer {
  pointerId: number;
  clientX: number;
  clientY: number;
}

const MIN_TARGET_RADIUS = 0.035;
const MAX_TARGET_RADIUS = 0.48;
const KEYBOARD_STEP = 0.01;
const KEYBOARD_LARGE_STEP = 0.04;
const TAP_MOVEMENT_TOLERANCE = 10;

const visuallyHiddenStyle = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampTargetCenter(
  point: NormalizedPoint,
  radius: number,
  width: number,
  height: number,
): NormalizedPoint {
  const shortEdge = Math.min(width, height);
  const radiusPixels = radius * shortEdge;
  const xMargin = Math.min(0.5, radiusPixels / width);
  const yMargin = Math.min(0.5, radiusPixels / height);

  return {
    x: clamp(point.x, xMargin, 1 - xMargin),
    y: clamp(point.y, yMargin, 1 - yMargin),
  };
}

function maximumRadiusAt(target: Target, width: number, height: number): number {
  const shortEdge = Math.min(width, height);
  const distanceToEdge = Math.min(
    target.cx * width,
    (1 - target.cx) * width,
    target.cy * height,
    (1 - target.cy) * height,
  );

  return Math.max(
    MIN_TARGET_RADIUS,
    Math.min(MAX_TARGET_RADIUS, distanceToEdge / shortEdge),
  );
}

function markerLabel(shot: Shot, index: number, onTarget: boolean): string {
  const result = onTarget ? 'on target' : 'miss';
  return `Shot ${index + 1}: ${result}, ${Math.round(shot.x * 100)}% across and ${Math.round(shot.y * 100)}% down the range`;
}

function getRenderedImageRect(
  svg: SVGSVGElement,
  imageWidth: number,
  imageHeight: number,
) {
  const bounds = svg.getBoundingClientRect();
  const imageAspectRatio = imageWidth / imageHeight;
  const boundsAspectRatio = bounds.width / bounds.height;

  if (boundsAspectRatio > imageAspectRatio) {
    const width = bounds.height * imageAspectRatio;
    return {
      left: bounds.left + (bounds.width - width) / 2,
      top: bounds.top,
      width,
      height: bounds.height,
    };
  }

  const height = bounds.width / imageAspectRatio;
  return {
    left: bounds.left,
    top: bounds.top + (bounds.height - height) / 2,
    width: bounds.width,
    height,
  };
}

function pointIsInsideRect(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): boolean {
  return (
    clientX >= rect.left &&
    clientX <= rect.left + rect.width &&
    clientY >= rect.top &&
    clientY <= rect.top + rect.height
  );
}

export function RangeMapCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  target,
  shots = [],
  mode,
  onTargetChange,
  onShot,
  disabled = false,
  readOnly = false,
  className,
  ariaLabel,
}: RangeMapCanvasProps) {
  const descriptionId = useId();
  const dragState = useRef<DragState | null>(null);
  const pendingShotPointer = useRef<PendingShotPointer | null>(null);
  const [keyboardPoint, setKeyboardPoint] = useState<NormalizedPoint>({
    x: target.cx,
    y: target.cy,
  });
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);

  const width = imageWidth > 0 ? imageWidth : 1;
  const height = imageHeight > 0 ? imageHeight : 1;
  const shortEdge = Math.min(width, height);
  const targetRadius = clamp(target.radius, MIN_TARGET_RADIUS, MAX_TARGET_RADIUS);
  const targetRadiusPixels = targetRadius * shortEdge;
  const targetX = clamp(target.cx) * width;
  const targetY = clamp(target.cy) * height;
  const markerRadius = Math.max(7, shortEdge * 0.016);
  const handleRadius = Math.max(7, shortEdge * 0.011);
  const handleHitRadius = Math.max(handleRadius * 2.5, shortEdge * 0.06);

  const canEditTarget =
    mode === 'setup' && !disabled && !readOnly && onTargetChange !== undefined;
  const canRecordShot =
    mode === 'record' && !disabled && !readOnly && onShot !== undefined;
  const isInteractive = canEditTarget || canRecordShot;

  const instructions = canEditTarget
    ? 'Drag the target to move it. Drag the eastern handle to resize it. With the map focused, use arrow keys to move and plus or minus to resize.'
    : canRecordShot
      ? 'Tap where the ball landed. With the map focused, use arrow keys to position the focus marker and press Enter to record.'
      : 'Read-only shot map. Green ring markers are on target; clay circle and X markers are misses.';

  const getNormalizedPoint = (
    event: PointerEvent<SVGSVGElement>,
  ): NormalizedPoint => {
    const imageRect = getRenderedImageRect(event.currentTarget, width, height);
    return clientPointToNormalized(event.clientX, event.clientY, imageRect);
  };

  const updateTargetCenter = (point: NormalizedPoint) => {
    if (!canEditTarget) return;

    const center = clampTargetCenter(point, targetRadius, width, height);
    onTargetChange({ ...target, cx: center.x, cy: center.y });
  };

  const updateTargetRadius = (point: NormalizedPoint) => {
    if (!canEditTarget) return;

    const dx = point.x * width - targetX;
    const dy = point.y * height - targetY;
    const nextRadius = Math.hypot(dx, dy) / shortEdge;
    onTargetChange({
      ...target,
      radius: clamp(
        nextRadius,
        MIN_TARGET_RADIUS,
        maximumRadiusAt(target, width, height),
      ),
    });
  };

  const startTargetDrag = (
    event: PointerEvent<SVGElement>,
    kind: DragKind,
  ) => {
    if (!canEditTarget || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = { kind, pointerId: event.pointerId };
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!canRecordShot || event.button !== 0) return;
    pendingShotPointer.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const currentDrag = dragState.current;
    if (currentDrag?.pointerId === event.pointerId) {
      event.preventDefault();
      const point = getNormalizedPoint(event);
      if (currentDrag.kind === 'move') updateTargetCenter(point);
      else updateTargetRadius(point);
      return;
    }

    if (canRecordShot && hasKeyboardFocus) {
      setKeyboardPoint(getNormalizedPoint(event));
    }
  };

  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
      return;
    }

    const pending = pendingShotPointer.current;
    pendingShotPointer.current = null;
    if (!canRecordShot || pending?.pointerId !== event.pointerId) return;

    const imageRect = getRenderedImageRect(event.currentTarget, width, height);
    if (!pointIsInsideRect(event.clientX, event.clientY, imageRect)) return;

    const movement = Math.hypot(
      event.clientX - pending.clientX,
      event.clientY - pending.clientY,
    );
    if (movement <= TAP_MOVEMENT_TOLERANCE) {
      const point = getNormalizedPoint(event);
      setKeyboardPoint(point);
      onShot(point);
    }
  };

  const handlePointerCancel = (event: PointerEvent<SVGSVGElement>) => {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
    }
    if (pendingShotPointer.current?.pointerId === event.pointerId) {
      pendingShotPointer.current = null;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!isInteractive) return;

    const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
    const horizontal =
      event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const vertical =
      event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;

    if (horizontal !== 0 || vertical !== 0) {
      event.preventDefault();
      if (canEditTarget) {
        updateTargetCenter({ x: target.cx + horizontal, y: target.cy + vertical });
      } else {
        setKeyboardPoint((current) => ({
          x: clamp(current.x + horizontal),
          y: clamp(current.y + vertical),
        }));
      }
      return;
    }

    if (canEditTarget && ['+', '=', '-', '_'].includes(event.key)) {
      event.preventDefault();
      const direction = event.key === '+' || event.key === '=' ? 1 : -1;
      onTargetChange({
        ...target,
        radius: clamp(
          targetRadius + direction * step,
          MIN_TARGET_RADIUS,
          maximumRadiusAt(target, width, height),
        ),
      });
      return;
    }

    if (
      canRecordShot &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      onShot(keyboardPoint);
    }
  };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        borderRadius: 'inherit',
        background: '#20352c',
      }}
    >
      <span id={descriptionId} style={visuallyHiddenStyle}>
        {instructions}
      </span>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        role={isInteractive ? 'application' : 'img'}
        aria-label={ariaLabel ?? 'Driving range shot map'}
        aria-describedby={descriptionId}
        aria-disabled={disabled || undefined}
        aria-readonly={readOnly || undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onFocus={() => setHasKeyboardFocus(true)}
        onBlur={() => setHasKeyboardFocus(false)}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          opacity: disabled ? 0.62 : 1,
          cursor: canEditTarget ? 'move' : canRecordShot ? 'pointer' : 'default',
          touchAction: isInteractive ? 'none' : 'auto',
          userSelect: 'none',
          outlineOffset: -4,
        }}
      >
        <image
          href={imageUrl}
          x={0}
          y={0}
          width={width}
          height={height}
          preserveAspectRatio="none"
          aria-hidden="true"
        />

        <circle
          cx={targetX}
          cy={targetY}
          r={targetRadiusPixels}
          fill="rgba(228, 246, 54, 0.14)"
          stroke="#e4f636"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
          pointerEvents={canEditTarget ? 'all' : 'none'}
          onPointerDown={(event) => startTargetDrag(event, 'move')}
        />
        <circle
          cx={targetX}
          cy={targetY}
          r={Math.max(handleRadius * 0.34, 3)}
          fill="#fff8dd"
          stroke="#263c32"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />

        {canEditTarget ? (
          <g
            aria-hidden="true"
            data-target-resize-handle="true"
            style={{ cursor: 'ew-resize' }}
            onPointerDown={(event) => startTargetDrag(event, 'resize')}
          >
            <circle
              cx={targetX + targetRadiusPixels}
              cy={targetY}
              r={handleHitRadius}
              fill="#ffffff"
              fillOpacity={0.001}
            />
            <circle
              cx={targetX + targetRadiusPixels}
              cy={targetY}
              r={handleRadius}
              fill="#fff8dd"
              stroke="#263c32"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <path
              d={`M ${targetX + targetRadiusPixels - handleRadius * 0.45} ${targetY} H ${targetX + targetRadiusPixels + handleRadius * 0.45}`}
              stroke="#263c32"
              strokeWidth={2}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          </g>
        ) : null}

        {shots.map((shot, index) => {
          const onTarget = isShotOnTarget(shot, target, { width, height });
          const x = clamp(shot.x) * width;
          const y = clamp(shot.y) * height;
          const label = markerLabel(shot, index, onTarget);

          return onTarget ? (
            <g
              key={shot.id}
              role="img"
              aria-label={label}
              data-shot-id={shot.id}
              data-status="on-target"
              pointerEvents="none"
            >
              <title>{label}</title>
              <circle
                cx={x}
                cy={y}
                r={markerRadius}
                fill="rgba(15, 42, 33, 0.76)"
                stroke="#f8fff7"
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={x}
                cy={y}
                r={markerRadius * 0.54}
                fill="#73e6a5"
              />
            </g>
          ) : (
            <g
              key={shot.id}
              role="img"
              aria-label={label}
              data-shot-id={shot.id}
              data-status="off-target"
              pointerEvents="none"
            >
              <title>{label}</title>
              <circle
                cx={x}
                cy={y}
                r={markerRadius}
                fill="#b9624f"
                stroke="#fff7ee"
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={`M ${x - markerRadius * 0.42} ${y - markerRadius * 0.42} L ${x + markerRadius * 0.42} ${y + markerRadius * 0.42} M ${x + markerRadius * 0.42} ${y - markerRadius * 0.42} L ${x - markerRadius * 0.42} ${y + markerRadius * 0.42}`}
                fill="none"
                stroke="#fff8ef"
                strokeWidth={2}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}

        {canRecordShot && hasKeyboardFocus ? (
          <g pointerEvents="none" aria-hidden="true">
            <circle
              cx={keyboardPoint.x * width}
              cy={keyboardPoint.y * height}
              r={markerRadius * 1.16}
              fill="rgba(228, 246, 54, 0.08)"
              stroke="#e4f636"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={keyboardPoint.x * width}
              cy={keyboardPoint.y * height}
              r={Math.max(2.5, markerRadius * 0.22)}
              fill="#e4f636"
            />
          </g>
        ) : null}
      </svg>
    </div>
  );
}
