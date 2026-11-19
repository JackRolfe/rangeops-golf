import type { Cents } from './types';

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

export function formatMoney(cents: Cents): string {
  return aud.format(cents / 100);
}

/** Dollars as typed into a form, to cents. Returns NaN for anything that isn't a number. */
export function dollarsToCents(value: string): Cents {
  const trimmed = value.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return Number.NaN;
  return Math.round(Number(trimmed) * 100);
}

export function centsToDollars(cents: Cents): string {
  return (cents / 100).toFixed(2);
}
