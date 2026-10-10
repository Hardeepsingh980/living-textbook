import { describe, it, expect } from 'vitest';
import { compile, evaluate, renderTemplate, formatNumber, ExprError } from '../src/expr.js';

describe('expression engine', () => {
  it('evaluates arithmetic with precedence and right-associative power', () => {
    expect(evaluate('1 + 2 * 3')).toBe(7);
    expect(evaluate('(1 + 2) * 3')).toBe(9);
    expect(evaluate('2 ^ 3 ^ 2')).toBe(512);
    expect(evaluate('-2 ^ 2')).toBe(-4);
    expect(evaluate('10 % 4')).toBe(2);
    expect(evaluate('7 / 0')).toBe(0);
  });
  it('uses variables, constants and unicode operators', () => {
    expect(evaluate('0.5 * g * t^2', { g: 9.8, t: 2 })).toBeCloseTo(19.6);
    expect(evaluate('0.5 × g × t²', { g: 9.8, t: 2 })).toBeCloseTo(19.6);
    expect(evaluate('2 * pi')).toBeCloseTo(Math.PI * 2);
    expect(evaluate('missing + 1')).toBe(1);
  });
  it('supports functions, comparisons, logic and conditionals', () => {
    expect(evaluate('sqrt(2 * h / g)', { h: 20, g: 9.8 })).toBeCloseTo(2.02, 2);
    expect(evaluate('clamp(15, 0, 10)')).toBe(10);
    expect(evaluate('t > 1 && t < 3', { t: 2 })).toBe(1);
    expect(evaluate('t > 1 ? 100 : 5', { t: 0 })).toBe(5);
    expect(evaluate('if(x >= 3, 1, 0)', { x: 3 })).toBe(1);
    expect(evaluate('max(1, 5, 3)')).toBe(5);
    expect(evaluate('smoothstep(0, 1, 0.5)')).toBe(0.5);
  });
  it('reports references and rejects bad syntax or unknown functions', () => {
    expect(compile('0.5 * g * t^2 + pi').refs.sort()).toEqual(['g', 't']);
    expect(() => compile('1 +')).toThrow(ExprError);
    expect(() => compile('foo(1)')).toThrow(/Unknown function/);
    expect(() => compile('sin(1, 2)')).toThrow(/argument/);
    expect(() => compile('a.b')).toThrow(ExprError);
  });
  it('renders label templates and formats numbers', () => {
    expect(renderTemplate('h = {0.5*g*t^2:0.1} m after {t:0} s', { g: 9.8, t: 2 })).toBe('h = 19.6 m after 2 s');
    expect(renderTemplate('bad {1 +} ok', {})).toBe('bad {1 +} ok');
    expect(formatNumber(1234567, '0.1')).toBe('1.2e+6');
    expect(formatNumber(0.5, '0.01')).toBe('0.50');
  });
});
