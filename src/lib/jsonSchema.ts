// A tiny, dependency-free JSON Schema validator covering exactly the subset used by
// the §6 collection schemas (type / union-with-null, enum, required, properties,
// items, format date|date-time, maxLength, minimum/maximum/multipleOf).
//
// Why not Ajv (the SPEC's stated choice)? Ajv compiles schemas with `new Function`,
// which the app's strict CSP (`script-src 'self'`, no `unsafe-eval` — also a SPEC
// requirement, §11) forbids in the browser. This validator interprets the schema at
// runtime, so it needs no eval and keeps the CSP strict. The schemas themselves are
// unchanged JSON Schema.

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  format?: string;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

function kindOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v; // 'object' | 'string' | 'number' | 'boolean' | 'undefined'
}

function matchesType(value: unknown, type: string | string[]): boolean {
  const types = Array.isArray(type) ? type : [type];
  const k = kindOf(value);
  for (const want of types) {
    if (want === 'integer') {
      if (typeof value === 'number' && Number.isInteger(value)) return true;
    } else if (want === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) return true;
    } else if (want === k) {
      return true;
    }
  }
  return false;
}

function isMultiple(value: number, multipleOf: number): boolean {
  if (multipleOf === 0) return true;
  const ratio = value / multipleOf;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}

function walk(schema: JsonSchema, data: unknown, path: string, errors: string[]): void {
  if (!schema || typeof schema !== 'object') return;
  const p = path || '/';

  if (schema.type && !matchesType(data, schema.type)) {
    const want = Array.isArray(schema.type) ? schema.type.join('|') : schema.type;
    errors.push(`${p} must be ${want}`);
    return; // downstream checks would be noise once the type is wrong
  }

  if (schema.enum && !schema.enum.some((e) => e === data)) {
    errors.push(`${p} must be one of ${JSON.stringify(schema.enum)}`);
  }

  if (typeof data === 'string') {
    if (schema.maxLength != null && data.length > schema.maxLength) {
      errors.push(`${p} exceeds maxLength ${schema.maxLength}`);
    }
    if (schema.format === 'date' && !DATE_RE.test(data)) {
      errors.push(`${p} must be a date (YYYY-MM-DD)`);
    }
    if (schema.format === 'date-time' && !DATETIME_RE.test(data)) {
      errors.push(`${p} must be an ISO date-time`);
    }
  }

  if (typeof data === 'number') {
    if (schema.minimum != null && data < schema.minimum) errors.push(`${p} must be >= ${schema.minimum}`);
    if (schema.maximum != null && data > schema.maximum) errors.push(`${p} must be <= ${schema.maximum}`);
    if (schema.multipleOf != null && !isMultiple(data, schema.multipleOf)) {
      errors.push(`${p} must be a multiple of ${schema.multipleOf}`);
    }
  }

  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(schema.required)) {
      for (const req of schema.required) {
        if (obj[req] === undefined) errors.push(`${p} missing required '${req}'`);
      }
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (obj[key] !== undefined) walk(sub, obj[key], `${path}/${key}`, errors);
      }
    }
  }

  if (Array.isArray(data) && schema.items) {
    data.forEach((item, i) => walk(schema.items as JsonSchema, item, `${path}/${i}`, errors));
  }
}

/** Validate `data` against a JSON Schema; returns a list of error strings (empty = valid). */
export function validateAgainstSchema(schema: unknown, data: unknown): string[] {
  const errors: string[] = [];
  walk(schema as JsonSchema, data, '', errors);
  return errors;
}
