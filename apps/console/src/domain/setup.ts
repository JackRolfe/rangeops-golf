import { validateOpeningHours, validatePrices } from './pricing';
import type { Bay, RangeSetup } from './types';

export function validateBays(bays: Bay[]): string[] {
  const errors: string[] = [];
  if (bays.length === 0) errors.push('A range needs at least one bay.');
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const bay of bays) {
    if (!Number.isInteger(bay.number) || bay.number < 1) errors.push(`Bay numbers start at 1 (found ${bay.number}).`);
    else if (numbers.has(bay.number)) errors.push(`Two bays are numbered ${bay.number}.`);
    numbers.add(bay.number);
    if (ids.has(bay.id)) errors.push(`Bay id ${bay.id} is used twice.`);
    ids.add(bay.id);
    if (!bay.name.trim()) errors.push(`Bay ${bay.number} needs a name.`);
  }
  return errors;
}

export function validateSetup(setup: RangeSetup): string[] {
  const errors: string[] = [];
  if (!setup.range.name.trim()) errors.push('The range needs a name.');
  try {
    const url = new URL(setup.range.publicAppUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') errors.push('The public app URL must be https.');
  } catch {
    errors.push('The public app URL is not a valid web address.');
  }
  return [
    ...errors,
    ...validateBays(setup.bays),
    ...validateOpeningHours(setup.openingHours),
    ...validatePrices(setup.prices, setup.openingHours),
  ];
}

/** The next free bay, numbered one past the highest. */
export function nextBay(bays: Bay[]): Bay {
  const number = Math.max(0, ...bays.map((b) => b.number)) + 1;
  let id = `bay-${number}`;
  while (bays.some((b) => b.id === id)) id += 'b';
  return { id, number, name: `Bay ${number}`, band: 'standard', inService: true };
}
