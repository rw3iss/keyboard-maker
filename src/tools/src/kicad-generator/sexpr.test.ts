import { describe, it, expect } from 'vitest';
import { serialize, prop, at, genUUID, resetUUID } from './sexpr.js';

describe('S-expression serializer', () => {
  it('serializes a simple expression', () => {
    const result = serialize(['version', 20231120]);
    expect(result).toContain('(version 20231120)');
  });

  it('serializes nested expressions', () => {
    const result = serialize(['at', 10.5, 20.3, 0]);
    expect(result).toContain('(at 10.5 20.3 0)');
  });

  it('quotes strings with spaces', () => {
    const result = serialize(['property', 'Reference', 'Hello World']);
    expect(result).toContain('"Hello World"');
  });

  it('does not quote simple strings', () => {
    const result = serialize(['property', 'Reference', 'SW1']);
    expect(result).not.toContain('"SW1"');
    expect(result).toContain('SW1');
  });

  it('handles empty lists', () => {
    expect(serialize([])).toBe('()');
  });

  it('handles deeply nested structures', () => {
    const expr = ['effects', ['font', ['size', 1.27, 1.27], ['thickness', 0.15]]];
    const result = serialize(expr);
    expect(result).toContain('effects');
    expect(result).toContain('font');
    expect(result).toContain('1.27');
  });

  it('formats numbers without unnecessary trailing zeros', () => {
    const result = serialize(['at', 10.0, 20.50]);
    expect(result).toContain('10');
    expect(result).toContain('20.5');
  });

  it('handles strings with parentheses by quoting them', () => {
    const result = serialize(['property', 'Value', '(empty)']);
    expect(result).toContain('"(empty)"');
  });
});

describe('prop helper', () => {
  it('builds a basic property expression', () => {
    const result = serialize(prop('Reference', 'U1'));
    expect(result).toContain('property');
    expect(result).toContain('Reference');
    expect(result).toContain('U1');
  });

  it('includes position when specified', () => {
    const result = serialize(prop('Reference', 'U1', { at: [10, 20] }));
    expect(result).toContain('at');
    expect(result).toContain('10');
    expect(result).toContain('20');
  });

  it('includes effects when specified', () => {
    const result = serialize(prop('Reference', 'U1', { effects: true }));
    expect(result).toContain('effects');
    expect(result).toContain('font');
  });
});

describe('at helper', () => {
  it('builds position without angle', () => {
    const result = serialize(at(10, 20));
    expect(result).toBe('(at 10 20)');
  });

  it('includes angle when non-zero', () => {
    const result = serialize(at(10, 20, 90));
    expect(result).toBe('(at 10 20 90)');
  });

  it('omits angle when zero', () => {
    const result = serialize(at(10, 20, 0));
    expect(result).toBe('(at 10 20)');
  });
});

describe('genUUID', () => {
  it('generates unique UUIDs', () => {
    resetUUID();
    const a = genUUID();
    const b = genUUID();
    expect(a).not.toBe(b);
  });

  it('generates string UUIDs', () => {
    const uuid = genUUID();
    expect(typeof uuid).toBe('string');
    expect(uuid.length).toBeGreaterThan(10);
  });
});
