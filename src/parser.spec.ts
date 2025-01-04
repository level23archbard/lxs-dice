import { DiceParser } from './parser';

describe('DiceParser', () => {
  let parser: DiceParser;

  beforeEach(() => {
    parser = new DiceParser();
  });

  test('compiles', () => {
    expect(parser).toBeTruthy();
  });

  test('parses number', () => {
    expect(parser.parse('42').roll().value).toBe(42);
  });

  test('does not parse garbage letters', () => {
    expect(() => parser.parse('asdf')).toThrow();
  });

  test('does not parse empty', () => {
    expect(() => parser.parse('')).toThrow();
  });

  test('parses d20', () => {
    const exp = parser.parse('d20');
    expect(exp.roll()).toBeTruthy();
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      const res = exp.roll();
      seen.add(res.value);
      expect(res.value).toBeGreaterThanOrEqual(1);
      expect(res.value).toBeLessThanOrEqual(20);
      expect(res.diceRolled.length).toBe(1);
      expect(res.diceRolled[0].size).toBe(20);
      expect(res.diceRolled[0].value).toBe(res.value);
    }
    for (let i = 1; i <= 20; i++) {
      expect(seen.has(i)).toBe(true);
    }
  });

  test('does not accept d alone', () => {
    expect(() => parser.parse('d')).toThrow();
  });

  test('does not accept d prefixed with numbers', () => {
    expect(() => parser.parse('20d')).toThrow();
  });

  test('parses 1d20 like d20', () => {
    const exp = parser.parse('1d20');
    expect(exp.roll()).toBeTruthy();
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      const res = exp.roll();
      seen.add(res.value);
      expect(res.value).toBeGreaterThanOrEqual(1);
      expect(res.value).toBeLessThanOrEqual(20);
    }
    for (let i = 1; i <= 20; i++) {
      expect(seen.has(i)).toBe(true);
    }
  });

  test('parses d1', () => {
    const exp = parser.parse('d1');
    for (let i = 0; i < 10000; i++) {
      const res = exp.roll();
      expect(res.value).toBe(1);
    }
  });

  test('parses 2d20', () => {
    const exp = parser.parse('2d20');
    expect(exp.roll()).toBeTruthy();
    const seen: Record<number, number> = {};
    for (let i = 0; i < 10000; i++) {
      const res = exp.roll();
      expect(res.value).toBeGreaterThanOrEqual(2);
      expect(res.value).toBeLessThanOrEqual(40);
      expect(res.diceRolled.length).toBe(2);
      expect(res.diceRolled[0].size).toBe(20);
      expect(res.diceRolled[1].size).toBe(20);
      expect(res.diceRolled[0].value + res.diceRolled[1].value).toBe(res.value);
      seen[res.value] = (seen[res.value] ?? 0) + 1;
    }
    for (let i = 2; i <= 40; i++) {
      expect(seen[i]).toBeGreaterThan(1);
    }
    // Loose expectation of bell curve? Average of ends should be ~30 per 10,000, average of middle should be ~500 per 10,000
    // Take a save bet that it this bell curve if up to twice variance occurs
    expect(seen[2]).toBeLessThan(seen[21] / 6);
    expect(seen[40]).toBeLessThan(seen[21] / 6);
  });

  test('parses large count of dice', () => {
    const exp = parser.parse('1000d1');
    for (let i = 0; i < 100; i++) {
      const res = exp.roll();
      expect(res.value).toBe(1000);
      expect(res.diceRolled.length).toBe(1000);
      res.diceRolled.forEach(dice => {
        expect(dice.size).toBe(1);
        expect(dice.value).toBe(1);
      });
    }
  });

  test('parses complex expressions', () => {
    const strExp = '32 + -4 * (8d2 + -5)+7-2 * -14';
    const minRolledExp = 55; // Actually larger due to negative on roll
    const maxRolledExp = 23; // Actually smaller due to negative on roll

    const exp = parser.parse(strExp);
    for (let i = 0; i < 10000; i++) {
      const res = exp.roll();
      expect(res.value).toBeGreaterThanOrEqual(maxRolledExp);
      expect(res.value).toBeLessThanOrEqual(minRolledExp);
      expect(res.diceRolled.length).toBe(8);
    }
  });
});