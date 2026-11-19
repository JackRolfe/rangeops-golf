import { describe, expect, it } from 'vitest';
import { demoSetup } from '../api/seed';
import { nextBay, validateBays, validateSetup } from './setup';

describe('validateSetup', () => {
  it('accepts the demo range', () => {
    expect(validateSetup(demoSetup())).toEqual([]);
  });

  it('refuses duplicate bay numbers and empty names', () => {
    const bays = demoSetup().bays.slice(0, 2);
    bays[1] = { ...bays[1], number: 1, name: ' ' };
    expect(validateBays(bays)).toEqual(['Two bays are numbered 1.', 'Bay 1 needs a name.']);
  });

  it('refuses a public app URL that is not https', () => {
    const setup = demoSetup();
    setup.range.publicAppUrl = 'http://rangeops.example/app/';
    expect(validateSetup(setup)).toEqual(['The public app URL must be https.']);
  });

  it('includes pricing errors', () => {
    const setup = demoSetup();
    setup.prices.bands.premium.peak = 100;
    expect(validateSetup(setup)).toEqual(['Premium peak ($1.00) is below its floor ($26.00).']);
  });
});

describe('nextBay', () => {
  it('numbers a new bay one past the highest', () => {
    expect(nextBay(demoSetup().bays)).toEqual({ id: 'bay-21', number: 21, name: 'Bay 21', band: 'standard', inService: true });
  });
});
