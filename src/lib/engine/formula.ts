// Tiny safe expression engine for blended / custom metrics, e.g.
//   ({fb_ads:conversion_value} + {gads:conversion_value}) / ({fb_ads:spend} + {gads:spend})
// No eval: a hand-written tokenizer + recursive-descent parser. Division by zero yields 0.

type Node =
  | { t: 'num'; v: number }
  | { t: 'ref'; key: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; a: Node; b: Node }
  | { t: 'fn'; name: string; args: Node[] };

class Parser {
  private i = 0;
  constructor(private s: string) {}
  private ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }
  private peek() {
    this.ws();
    return this.s[this.i];
  }
  parse(): Node {
    const n = this.expr();
    if (this.peek() !== undefined) throw new Error(`Unexpected "${this.peek()}" at ${this.i}`);
    return n;
  }
  private expr(): Node {
    let a = this.term();
    for (;;) {
      const c = this.peek();
      if (c === '+' || c === '-') {
        this.i++;
        a = { t: 'bin', op: c, a, b: this.term() };
      } else return a;
    }
  }
  private term(): Node {
    let a = this.unary();
    for (;;) {
      const c = this.peek();
      if (c === '*' || c === '/') {
        this.i++;
        a = { t: 'bin', op: c, a, b: this.unary() };
      } else return a;
    }
  }
  private unary(): Node {
    if (this.peek() === '-') {
      this.i++;
      return { t: 'neg', a: this.unary() };
    }
    return this.atom();
  }
  private atom(): Node {
    const c = this.peek();
    if (c === '(') {
      this.i++;
      const n = this.expr();
      if (this.peek() !== ')') throw new Error('Missing )');
      this.i++;
      return n;
    }
    if (c === '{') {
      const end = this.s.indexOf('}', this.i);
      if (end < 0) throw new Error('Missing }');
      const key = this.s.slice(this.i + 1, end).trim();
      this.i = end + 1;
      return { t: 'ref', key };
    }
    const m = /^(\d+(\.\d+)?|\.\d+)/.exec(this.s.slice(this.i));
    if (m) {
      this.i += m[0].length;
      return { t: 'num', v: Number(m[0]) };
    }
    const f = /^[a-z]+/i.exec(this.s.slice(this.i));
    if (f) {
      this.i += f[0].length;
      if (this.peek() !== '(') throw new Error(`Expected ( after ${f[0]}`);
      this.i++;
      const args: Node[] = [];
      if (this.peek() !== ')') {
        for (;;) {
          args.push(this.expr());
          if (this.peek() === ',') this.i++;
          else break;
        }
      }
      if (this.peek() !== ')') throw new Error('Missing )');
      this.i++;
      return { t: 'fn', name: f[0].toLowerCase(), args };
    }
    throw new Error(`Unexpected "${c ?? 'end'}"`);
  }
}

export function parseFormula(src: string): Node {
  return new Parser(src).parse();
}
export function formulaRefs(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    if (n.t === 'ref') out.add(n.key);
    else if (n.t === 'neg') walk(n.a);
    else if (n.t === 'bin') (walk(n.a), walk(n.b));
    else if (n.t === 'fn') n.args.forEach(walk);
  };
  walk(parseFormula(src));
  return [...out];
}
export function evalFormula(src: string, lookup: (key: string) => number | null): number | null {
  const ev = (n: Node): number | null => {
    switch (n.t) {
      case 'num':
        return n.v;
      case 'ref':
        return lookup(n.key);
      case 'neg': {
        const v = ev(n.a);
        return v == null ? null : -v;
      }
      case 'bin': {
        const a = ev(n.a);
        const b = ev(n.b);
        if (a == null || b == null) return null;
        if (n.op === '+') return a + b;
        if (n.op === '-') return a - b;
        if (n.op === '*') return a * b;
        return b === 0 ? 0 : a / b;
      }
      case 'fn': {
        const vals = n.args.map(ev);
        if (vals.some((v) => v == null)) return null;
        const xs = vals as number[];
        if (n.name === 'sum') return xs.reduce((a, b) => a + b, 0);
        if (n.name === 'avg') return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
        if (n.name === 'min') return Math.min(...xs);
        if (n.name === 'max') return Math.max(...xs);
        if (n.name === 'abs') return Math.abs(xs[0]);
        if (n.name === 'round') return Math.round(xs[0]);
        throw new Error(`Unknown function ${n.name}`);
      }
    }
  };
  const v = ev(parseFormula(src));
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 10000) / 10000;
}
