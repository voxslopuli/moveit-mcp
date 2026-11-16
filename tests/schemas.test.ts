import { describe, expect, it } from 'vitest';
import {
  HostListParamsSchema,
  IdParamsSchema,
  ListParamsSchema,
  PgpListParamsSchema,
  ReportQuerySchema,
} from '../src/schemas.js';
import { jsonResult } from '../src/tools/util.js';

describe('ListParamsSchema', () => {
  it('accepts valid pagination params', () => {
    expect(ListParamsSchema.safeParse({ page: 1, perPage: 25 }).success).toBe(
      true
    );
  });

  it('rejects perPage: 0', () => {
    expect(ListParamsSchema.safeParse({ perPage: 0 }).success).toBe(false);
  });

  it('rejects page: -1', () => {
    expect(ListParamsSchema.safeParse({ page: -1 }).success).toBe(false);
  });

  it('accepts empty object', () => {
    expect(ListParamsSchema.safeParse({}).success).toBe(true);
  });
});

describe('HostListParamsSchema', () => {
  it('accepts a valid host type', () => {
    expect(HostListParamsSchema.safeParse({ type: 'FTP' }).success).toBe(true);
  });

  it('rejects an invalid host type', () => {
    expect(HostListParamsSchema.safeParse({ type: 'Gopher' }).success).toBe(
      false
    );
  });

  it('inherits pagination rejection from ListParamsSchema', () => {
    expect(HostListParamsSchema.safeParse({ page: -1 }).success).toBe(false);
  });
});

describe('PgpListParamsSchema', () => {
  it('accepts uid', () => {
    expect(
      PgpListParamsSchema.safeParse({ uid: 'user@example.com' }).success
    ).toBe(true);
  });

  it('rejects negative page', () => {
    expect(PgpListParamsSchema.safeParse({ page: -1 }).success).toBe(false);
  });
});

describe('IdParamsSchema', () => {
  it('accepts non-empty id', () => {
    expect(IdParamsSchema.safeParse({ id: '1234' }).success).toBe(true);
  });

  it('rejects empty id', () => {
    expect(IdParamsSchema.safeParse({ id: '' }).success).toBe(false);
  });
});

describe('ReportQuerySchema', () => {
  it('rejects missing predicate', () => {
    expect(ReportQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejects empty predicate', () => {
    expect(ReportQuerySchema.safeParse({ predicate: '' }).success).toBe(false);
  });

  it('rejects maxCount 10001', () => {
    expect(
      ReportQuerySchema.safeParse({
        predicate: "Status = 'x'",
        maxCount: 10_001,
      }).success
    ).toBe(false);
  });

  it('accepts maxCount 10000', () => {
    expect(
      ReportQuerySchema.safeParse({
        predicate: "Status = 'x'",
        maxCount: 10_000,
      }).success
    ).toBe(true);
  });
});

describe('jsonResult', () => {
  it('returns text content with pretty-printed JSON', () => {
    const result = jsonResult({ a: 1 });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('{\n  "a": 1\n}');
  });

  it('round-trips through JSON.parse', () => {
    const data = { items: [1, 2, 3], nested: { ok: true } };
    const result = jsonResult(data);
    expect(JSON.parse(result.content[0].text)).toEqual(data);
  });
});
