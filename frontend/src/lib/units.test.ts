import { describe, it, expect } from 'vitest';
import {
  convertWeightInput,
  formatNumber,
  formatWeightInput,
  formatWeightWithUnit,
  isUnit,
  kgToUnit,
  parseDecimalInput,
  parseRepsInput,
  unitToKg,
  weightInputToKg,
  weightStep,
} from './units';

describe('conversion', () => {
  it('leaves kilograms untouched', () => {
    expect(kgToUnit(62.5, 'kg')).toBe(62.5);
    expect(unitToKg(62.5, 'kg')).toBe(62.5);
  });

  it('converts using the exact pound definition', () => {
    expect(unitToKg(1, 'lb')).toBeCloseTo(0.45359237, 10);
    expect(kgToUnit(1, 'lb')).toBeCloseTo(2.2046226218, 8);
  });

  it('round-trips a typed pound value back to the same display value', () => {
    // The case that matters: someone enters 135 lb, it is stored as kg, and it
    // must read back as 135 — not 134.99 — or every reopened session drifts.
    const kg = weightInputToKg('135', 'lb');
    expect(kg).toBeDefined();
    expect(formatWeightInput(kg, 'lb')).toBe('135');
  });

  it('round-trips across a unit switch and back', () => {
    const there = convertWeightInput('100', 'kg', 'lb');
    expect(convertWeightInput(there, 'lb', 'kg')).toBe('100');
  });
});

describe('formatNumber', () => {
  it.each([
    [62.5, '62.5'],
    [60, '60'],
    [61.234, '61.23'],
    [0, '0'],
    [-0.001, '0'],
  ])('formats %s as %s without trailing zeros', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });
});

describe('parseDecimalInput', () => {
  it('accepts a comma as the decimal separator', () => {
    expect(parseDecimalInput('62,5')).toBe(62.5);
  });

  it('accepts a dot and surrounding whitespace', () => {
    expect(parseDecimalInput('  62.5 ')).toBe(62.5);
  });

  it.each(['', '   ', 'abc', '1,2,3', '--5'])('returns undefined for %o', (raw) => {
    expect(parseDecimalInput(raw)).toBeUndefined();
  });

  it('distinguishes blank from zero', () => {
    expect(parseDecimalInput('')).toBeUndefined();
    expect(parseDecimalInput('0')).toBe(0);
  });
});

describe('parseRepsInput', () => {
  it('accepts whole numbers including zero', () => {
    expect(parseRepsInput('8')).toBe(8);
    expect(parseRepsInput('0')).toBe(0);
  });

  it.each(['8.5', '-3', '', 'many'])('rejects %o', (raw) => {
    expect(parseRepsInput(raw)).toBeUndefined();
  });
});

describe('weightInputToKg', () => {
  it('converts from the display unit', () => {
    expect(weightInputToKg('62,5', 'kg')).toBe(62.5);
    expect(weightInputToKg('10', 'lb')).toBeCloseTo(4.5359237, 7);
  });

  it('rejects negative weights', () => {
    expect(weightInputToKg('-5', 'kg')).toBeUndefined();
  });

  it('returns undefined for blank input rather than zero', () => {
    expect(weightInputToKg('', 'kg')).toBeUndefined();
  });
});

describe('formatWeightInput', () => {
  it('renders an empty string for an unset weight', () => {
    expect(formatWeightInput(undefined, 'kg')).toBe('');
  });

  it('renders kilograms as stored', () => {
    expect(formatWeightInput(62.5, 'kg')).toBe('62.5');
  });
});

describe('convertWeightInput', () => {
  it('is a no-op when the unit is unchanged', () => {
    expect(convertWeightInput('62,5', 'kg', 'kg')).toBe('62,5');
  });

  it('hands back half-typed input untouched instead of blanking it', () => {
    // Switching units while someone is mid-keystroke must not eat their entry.
    expect(convertWeightInput('6,', 'kg', 'lb')).toBe('6,');
    expect(convertWeightInput('', 'kg', 'lb')).toBe('');
  });
});

describe('weightStep', () => {
  it('matches the smallest jump a standard pair of plates makes', () => {
    expect(weightStep('kg')).toBe(2.5);
    expect(weightStep('lb')).toBe(5);
  });
});

describe('isUnit', () => {
  it.each(['kg', 'lb'])('accepts %s', (value) => {
    expect(isUnit(value)).toBe(true);
  });

  it.each(['KG', 'stone', '', null, undefined, 0])('rejects %o', (value) => {
    expect(isUnit(value)).toBe(false);
  });
});

describe('formatWeightWithUnit', () => {
  it('labels the converted value', () => {
    expect(formatWeightWithUnit(62.5, 'kg')).toBe('62.5 kg');
    expect(formatWeightWithUnit(45.359237, 'lb')).toBe('100 lb');
  });
});
