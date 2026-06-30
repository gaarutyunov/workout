import { describe, expect, it } from 'vitest';
import { validateAgainstSchema } from './jsonSchema';

describe('eval-free JSON Schema validator', () => {
  it('accepts integer|null unions and rejects wrong types', () => {
    const schema = { type: 'object', properties: { reps: { type: ['integer', 'null'] } } };
    expect(validateAgainstSchema(schema, { reps: 10 })).toHaveLength(0);
    expect(validateAgainstSchema(schema, { reps: null })).toHaveLength(0);
    expect(validateAgainstSchema(schema, { reps: 1.5 }).length).toBeGreaterThan(0);
    expect(validateAgainstSchema(schema, { reps: 'x' }).length).toBeGreaterThan(0);
  });

  it('enforces required, enum, date format and maxLength', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 4 },
        date: { type: 'string', format: 'date' },
        slot: { type: 'string', enum: ['lunch', 'dinner'] },
      },
      required: ['id', 'date'],
    };
    expect(validateAgainstSchema(schema, { id: 'ab', date: '2026-06-30', slot: 'lunch' })).toHaveLength(0);
    expect(validateAgainstSchema(schema, { date: '2026-06-30' })[0]).toContain("required 'id'");
    expect(validateAgainstSchema(schema, { id: 'toolong', date: '2026-06-30' })[0]).toContain('maxLength');
    expect(validateAgainstSchema(schema, { id: 'a', date: '30-06-2026' })[0]).toContain('date');
    expect(validateAgainstSchema(schema, { id: 'a', date: '2026-06-30', slot: 'brunch' })[0]).toContain('one of');
  });

  it('validates nested objects, arrays and date-time', () => {
    const schema = {
      type: 'object',
      properties: {
        updatedAt: { type: 'string', format: 'date-time' },
        sets: {
          type: 'array',
          items: { type: 'object', properties: { set: { type: 'integer' } }, required: ['set'] },
        },
      },
    };
    expect(
      validateAgainstSchema(schema, { updatedAt: '2026-06-30T17:00:00.000Z', sets: [{ set: 1 }] }),
    ).toHaveLength(0);
    expect(validateAgainstSchema(schema, { sets: [{ reps: 1 }] })[0]).toContain("required 'set'");
  });
});
