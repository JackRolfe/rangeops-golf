import { useId } from 'react';

export interface AccuracyPoint {
  label: string;
  value: number;
}

export interface AccuracyChartProps {
  points: readonly AccuracyPoint[];
  ariaLabel?: string;
  emptyMessage?: string;
  compact?: boolean;
  className?: string;
}

const VIEWBOX_WIDTH = 360;
const VIEWBOX_HEIGHT = 196;
const PLOT_LEFT = 38;
const PLOT_RIGHT = 14;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 42;
const GRID_VALUES = [100, 75, 50, 25, 0] as const;

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function formatPercentage(value: number): string {
  return `${Math.round(value)}%`;
}

export function AccuracyChart({
  points,
  ariaLabel = 'Accuracy by practice session',
  emptyMessage = 'Complete a session to see your trend',
  compact = false,
  className,
}: AccuracyChartProps) {
  const gradientId = useId().replace(/:/g, '');
  const viewboxHeight = compact ? 164 : VIEWBOX_HEIGHT;
  const plotBottom = compact ? 30 : PLOT_BOTTOM;
  const plotWidth = VIEWBOX_WIDTH - PLOT_LEFT - PLOT_RIGHT;
  const plotHeight = viewboxHeight - PLOT_TOP - plotBottom;
  const normalizedPoints = points.map((point) => ({
    ...point,
    value: clampPercentage(point.value),
  }));
  const xForIndex = (index: number) =>
    normalizedPoints.length <= 1
      ? PLOT_LEFT + plotWidth / 2
      : PLOT_LEFT + (index / (normalizedPoints.length - 1)) * plotWidth;
  const yForValue = (value: number) =>
    PLOT_TOP + ((100 - value) / 100) * plotHeight;

  const coordinates = normalizedPoints.map((point, index) => ({
    ...point,
    x: xForIndex(index),
    y: yForValue(point.value),
  }));
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const areaPath =
    coordinates.length > 1
      ? `${linePath} L ${coordinates[coordinates.length - 1].x.toFixed(2)} ${(PLOT_TOP + plotHeight).toFixed(2)} L ${coordinates[0].x.toFixed(2)} ${(PLOT_TOP + plotHeight).toFixed(2)} Z`
      : '';
  const labelInterval = Math.max(1, Math.ceil(normalizedPoints.length / 5));

  return (
    <svg
      className={className}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${viewboxHeight}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
      style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}
    >
      <title>{ariaLabel}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#064f36" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#064f36" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {GRID_VALUES.map((value) => {
        const y = yForValue(value);
        return (
          <g key={value} aria-hidden="true">
            <line
              x1={PLOT_LEFT}
              x2={PLOT_LEFT + plotWidth}
              y1={y}
              y2={y}
              stroke={value === 0 ? '#bcc5bc' : '#dfe4de'}
              strokeWidth={value === 0 ? 1.25 : 1}
              strokeDasharray={value === 0 ? undefined : '3 5'}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PLOT_LEFT - 8}
              y={y + 3.5}
              fill="#6c766e"
              fontSize="9"
              fontWeight="600"
              textAnchor="end"
            >
              {value}
            </text>
          </g>
        );
      })}

      {coordinates.length === 0 ? (
        <g aria-hidden="true">
          <circle
            cx={PLOT_LEFT + plotWidth / 2}
            cy={PLOT_TOP + plotHeight / 2 - 9}
            r="3"
            fill="#064f36"
          />
          <text
            x={PLOT_LEFT + plotWidth / 2}
            y={PLOT_TOP + plotHeight / 2 + 15}
            fill="#68736b"
            fontSize="11"
            fontWeight="600"
            textAnchor="middle"
          >
            {emptyMessage}
          </text>
        </g>
      ) : (
        <>
          {areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} aria-hidden="true" /> : null}
          {linePath ? (
            <path
              d={linePath}
              fill="none"
              stroke="#064f36"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              aria-hidden="true"
            />
          ) : null}

          {coordinates.map((point, index) => {
            const shouldShowLabel =
              coordinates.length <= 5 ||
              index === 0 ||
              index === coordinates.length - 1 ||
              index % labelInterval === 0;
            const pointLabel = `${point.label}: ${formatPercentage(point.value)} accuracy`;

            return (
              <g key={`${point.label}-${index}`} role="img" aria-label={pointLabel}>
                <title>{pointLabel}</title>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="5.5"
                  fill="#fffdf7"
                  stroke="#064f36"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={point.x} cy={point.y} r="2" fill="#064f36" />
                {shouldShowLabel ? (
                  <text
                    x={point.x}
                    y={PLOT_TOP + plotHeight + 19}
                    fill="#536058"
                    fontSize="9.5"
                    fontWeight="600"
                    textAnchor={
                      index === 0 && coordinates.length > 1
                        ? 'start'
                        : index === coordinates.length - 1 && coordinates.length > 1
                          ? 'end'
                          : 'middle'
                    }
                    aria-hidden="true"
                  >
                    {point.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </>
      )}
    </svg>
  );
}
