// A small, safe expression language for LivingScene: numbers, variables, arithmetic, comparisons, boolean logic,
// a fixed set of math functions and a conditional. No eval, no property access, no side effects. Deterministic,
// so the server verifier and the client renderer compute identical values.

export type Scope = Record<string, number>;
export type Compiled = { (scope: Scope): number; refs: string[]; source: string };

type Tok =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: '('; v: '(' } | { t: ')'; v: ')' } | { t: ','; v: ',' }
  | { t: 'end'; v: '' };

const OPS = ['<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '^', '<', '>', '!', '?', ':'];

export const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, true: 1, false: 0 };

export const FUNCTIONS: Record<string, { arity: number | [number, number]; fn: (...a: number[]) => number }> = {
  sin: { arity: 1, fn: Math.sin }, cos: { arity: 1, fn: Math.cos }, tan: { arity: 1, fn: Math.tan },
  asin: { arity: 1, fn: Math.asin }, acos: { arity: 1, fn: Math.acos }, atan: { arity: 1, fn: Math.atan },
  atan2: { arity: 2, fn: Math.atan2 }, sqrt: { arity: 1, fn: (x) => Math.sqrt(Math.max(0, x)) },
  abs: { arity: 1, fn: Math.abs }, sign: { arity: 1, fn: Math.sign },
  floor: { arity: 1, fn: Math.floor }, ceil: { arity: 1, fn: Math.ceil }, round: { arity: 1, fn: Math.round },
  exp: { arity: 1, fn: Math.exp }, log: { arity: 1, fn: (x) => Math.log(Math.max(1e-300, x)) }, log10: { arity: 1, fn: (x) => Math.log10(Math.max(1e-300, x)) },
  pow: { arity: 2, fn: Math.pow }, min: { arity: [1, 8], fn: Math.min }, max: { arity: [1, 8], fn: Math.max },
  clamp: { arity: 3, fn: (x, a, b) => Math.min(Math.max(x, Math.min(a, b)), Math.max(a, b)) },
  lerp: { arity: 3, fn: (a, b, t) => a + (b - a) * t },
  step: { arity: 2, fn: (edge, x) => (x < edge ? 0 : 1) },
  smoothstep: { arity: 3, fn: (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a || 1e-9), 0), 1); return t * t * (3 - 2 * t); } },
  mod: { arity: 2, fn: (a, b) => (b === 0 ? 0 : ((a % b) + b) % b) },
  deg: { arity: 1, fn: (r) => (r * 180) / Math.PI }, rad: { arity: 1, fn: (d) => (d * Math.PI) / 180 },
  if: { arity: 3, fn: (c, a, b) => (c ? a : b) },
  noise: { arity: 1, fn: (x) => { const s = Math.sin(x * 12.9898) * 43758.5453; return s - Math.floor(s); } },
};

export class ExprError extends Error {}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1]! >= '0' && src[i + 1]! <= '9')) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i))!;
      out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0] }); i += m[0].length; continue;
    }
    if (c === '(' || c === ')' || c === ',') { out.push({ t: c, v: c } as Tok); i++; continue; }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) { out.push({ t: 'op', v: op }); i += op.length; continue; }
    if (c === '×') { out.push({ t: 'op', v: '*' }); i++; continue; }
    if (c === '÷') { out.push({ t: 'op', v: '/' }); i++; continue; }
    if (c === '²') { out.push({ t: 'op', v: '^' }); out.push({ t: 'num', v: 2 }); i++; continue; }
    if (c === '³') { out.push({ t: 'op', v: '^' }); out.push({ t: 'num', v: 3 }); i++; continue; }
    throw new ExprError(`Unexpected character '${c}' at ${i} in "${src}"`);
  }
  out.push({ t: 'end', v: '' });
  return out;
}

type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'cond'; c: Node; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] };

// precedence climbing
const BIN_PREC: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 8 };

class Parser {
  i = 0;
  constructor(private toks: Tok[], private src: string) {}
  peek() { return this.toks[this.i]!; }
  next() { return this.toks[this.i++]!; }
  expect(t: string) { const tok = this.next(); if (tok.t !== t && tok.v !== t) throw new ExprError(`Expected '${t}' in "${this.src}"`); return tok; }
  parseExpr(minPrec = 0): Node {
    let left = this.parseUnary();
    for (;;) {
      const tok = this.peek();
      if (tok.t === 'op' && tok.v === '?' && minPrec === 0) {
        this.next();
        const a = this.parseExpr(0);
        this.expect(':');
        const b = this.parseExpr(0);
        left = { k: 'cond', c: left, a, b };
        continue;
      }
      if (tok.t !== 'op' || !(tok.v in BIN_PREC)) break;
      const prec = BIN_PREC[tok.v]!;
      if (prec < minPrec) break;
      this.next();
      const right = this.parseExpr(tok.v === '^' ? prec : prec + 1); // ^ is right-associative
      left = { k: 'bin', op: tok.v, a: left, b: right };
    }
    return left;
  }
  parseUnary(): Node {
    const tok = this.peek();
    if (tok.t === 'op' && (tok.v === '-' || tok.v === '+' || tok.v === '!')) { this.next(); return { k: 'un', op: tok.v, a: this.parseExpr(7) }; }
    return this.parsePrimary();
  }
  parsePrimary(): Node {
    const tok = this.next();
    if (tok.t === 'num') return { k: 'num', v: tok.v };
    if (tok.t === '(') { const e = this.parseExpr(0); this.expect(')'); return e; }
    if (tok.t === 'id') {
      if (this.peek().t === '(') {
        this.next();
        const args: Node[] = [];
        if (this.peek().t !== ')') { for (;;) { args.push(this.parseExpr(0)); if (this.peek().t === ',') { this.next(); continue; } break; } }
        this.expect(')');
        const f = FUNCTIONS[tok.v];
        if (!f) throw new ExprError(`Unknown function '${tok.v}' in "${this.src}"`);
        const [lo, hi] = Array.isArray(f.arity) ? f.arity : [f.arity, f.arity];
        if (args.length < lo || args.length > hi) throw new ExprError(`'${tok.v}' takes ${lo === hi ? lo : `${lo}-${hi}`} argument(s) in "${this.src}"`);
        return { k: 'call', name: tok.v, args };
      }
      return { k: 'var', name: tok.v };
    }
    throw new ExprError(`Unexpected '${tok.v || 'end of expression'}' in "${this.src}"`);
  }
}

function collectRefs(n: Node, out: Set<string>) {
  switch (n.k) {
    case 'var': if (!(n.name in CONSTANTS)) out.add(n.name); break;
    case 'un': collectRefs(n.a, out); break;
    case 'bin': collectRefs(n.a, out); collectRefs(n.b, out); break;
    case 'cond': collectRefs(n.c, out); collectRefs(n.a, out); collectRefs(n.b, out); break;
    case 'call': n.args.forEach((a) => collectRefs(a, out)); break;
  }
}

function evalNode(n: Node, s: Scope): number {
  switch (n.k) {
    case 'num': return n.v;
    case 'var': { const v = s[n.name]; if (v !== undefined) return v; const c = CONSTANTS[n.name]; return c === undefined ? 0 : c; }
    case 'un': { const a = evalNode(n.a, s); return n.op === '-' ? -a : n.op === '!' ? (a ? 0 : 1) : a; }
    case 'cond': return evalNode(n.c, s) ? evalNode(n.a, s) : evalNode(n.b, s);
    case 'call': return FUNCTIONS[n.name]!.fn(...n.args.map((a) => evalNode(a, s)));
    case 'bin': {
      const a = evalNode(n.a, s);
      if (n.op === '&&') return a ? (evalNode(n.b, s) ? 1 : 0) : 0;
      if (n.op === '||') return a ? 1 : (evalNode(n.b, s) ? 1 : 0);
      const b = evalNode(n.b, s);
      switch (n.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': return b === 0 ? 0 : a / b; case '%': return b === 0 ? 0 : a % b; case '^': return Math.pow(a, b);
        case '<': return a < b ? 1 : 0; case '<=': return a <= b ? 1 : 0; case '>': return a > b ? 1 : 0; case '>=': return a >= b ? 1 : 0;
        case '==': return Math.abs(a - b) < 1e-9 ? 1 : 0; case '!=': return Math.abs(a - b) < 1e-9 ? 0 : 1;
      }
    }
  }
  return 0;
}

/** Parse and compile an expression. Throws ExprError on syntax errors or unknown functions. */
export function compile(source: string): Compiled {
  const src = String(source).trim();
  if (!src) throw new ExprError('Empty expression');
  const p = new Parser(tokenize(src), src);
  const ast = p.parseExpr(0);
  if (p.peek().t !== 'end') throw new ExprError(`Unexpected '${p.peek().v}' in "${src}"`);
  const refs = new Set<string>();
  collectRefs(ast, refs);
  const fn = ((scope: Scope) => { const v = evalNode(ast, scope); return Number.isFinite(v) ? v : 0; }) as Compiled;
  fn.refs = [...refs];
  fn.source = src;
  return fn;
}

/** Evaluate once; returns 0 for invalid expressions instead of throwing (use `compile` to detect errors). */
export function evaluate(source: string, scope: Scope = {}): number {
  try { return compile(source)(scope); } catch { return 0; }
}

/** Is this a plain number literal (so callers can skip the expression engine)? */
export function isNumeric(source: unknown): source is number {
  return typeof source === 'number' && Number.isFinite(source);
}

/** Format a number for labels: `fmt` like "0.1" (one decimal), "0" (integer), "0.01" (two decimals). */
export function formatNumber(v: number, fmt = '0.1'): string {
  const decimals = fmt.includes('.') ? fmt.split('.')[1]!.length : 0;
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(decimals || 2);
  return v.toFixed(decimals);
}

/** Replace `{expr}` and `{expr:fmt}` templates inside label text, e.g. "h = {0.5*g*t^2:0.1} m". */
export function renderTemplate(text: string, scope: Scope): string {
  return text.replace(/\{([^{}:]+)(?::([^{}]+))?\}/g, (_m, expr: string, fmt?: string) => {
    try { return formatNumber(compile(expr)(scope), fmt?.trim() || '0.1'); } catch { return `{${expr}}`; }
  });
}
