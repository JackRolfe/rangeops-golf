const SHORT_DATE = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const CHART_DATE = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
});

export function formatDate(value: string): string {
  return SHORT_DATE.format(new Date(value));
}

export function formatChartDate(value: string): string {
  return CHART_DATE.format(new Date(value));
}

export function formatPercent(value: number): number {
  return Math.round(value);
}

export function pluralShots(count: number): string {
  return `${count} ${count === 1 ? 'shot' : 'shots'}`;
}
