// `ajv` in the browser build. The login avatar's library compiles one JSON schema at load to check its own built-in
// avatar packs; Ajv compiles with `new Function`, which a Claude page's CSP forbids (no 'unsafe-eval'). The packs are
// fixed and valid, so the demo's validator accepts them.
type Validate = ((data: unknown) => boolean) & { errors: null };

export default class Ajv {
  constructor(_options?: unknown) {}
  compile(_schema: unknown): Validate {
    const v = ((_data: unknown) => true) as Validate;
    v.errors = null;
    return v;
  }
  validate(_schema: unknown, _data: unknown): boolean {
    return true;
  }
  addSchema(): this {
    return this;
  }
  addFormat(): this {
    return this;
  }
  addKeyword(): this {
    return this;
  }
}
