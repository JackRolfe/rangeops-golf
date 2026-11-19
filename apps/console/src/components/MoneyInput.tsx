import { useEffect, useState } from 'react';
import { centsToDollars, dollarsToCents } from '../domain/money';
import type { Cents } from '../domain/types';

/** A dollars field that reports cents. Anything that isn't a price reports NaN, which validation refuses. */
export function MoneyInput({ label, value, onChange }: { label: string; value: Cents; onChange: (cents: Cents) => void }) {
  const [text, setText] = useState(() => (Number.isNaN(value) ? '' : centsToDollars(value)));
  useEffect(() => {
    if (dollarsToCents(text) !== value && !Number.isNaN(value)) setText(centsToDollars(value));
    // Only follow outside changes to the value, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="money-input">
        <span aria-hidden="true">$</span>
        <input
          className="input input--money"
          inputMode="decimal"
          value={text}
          aria-label={label}
          onChange={(event) => {
            setText(event.target.value);
            onChange(dollarsToCents(event.target.value));
          }}
        />
      </span>
    </label>
  );
}

export function NumberInput({ label, value, onChange, min = 0, max }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input input--hour"
        type="number"
        min={min}
        max={max}
        step={1}
        value={Number.isNaN(value) ? '' : value}
        onChange={(event) => onChange(event.target.value === '' ? Number.NaN : Number(event.target.value))}
      />
    </label>
  );
}
