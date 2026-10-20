import { describe, expect, it } from 'vitest';
import { bound, dayOf, dayStart, isoInZone, offsetMinutes, validZone } from '../../src/core/agent/time.ts';

const LA = 'America/Los_Angeles';

describe('agent time: isoInZone', () => {
  it('formats with the zone offset at that instant (PDT, PST)', () => {
    expect(isoInZone('2026-10-25T06:59:00Z', LA)).toBe('2026-10-24T23:59:00-07:00');
    expect(isoInZone('2026-12-01T08:00:00Z', LA)).toBe('2026-12-01T00:00:00-08:00');
  });

  it('handles DST changes, half-hour and positive offsets, UTC', () => {
    // US fall-back 2026-11-01 09:00Z: 01:59:59 PDT then 01:00 PST.
    expect(isoInZone('2026-11-01T08:59:59Z', LA)).toBe('2026-11-01T01:59:59-07:00');
    expect(isoInZone('2026-11-01T09:00:00Z', LA)).toBe('2026-11-01T01:00:00-08:00');
    expect(isoInZone('2026-10-20T00:00:00Z', 'Asia/Kolkata')).toBe('2026-10-20T05:30:00+05:30');
    expect(isoInZone('2026-10-20T00:00:00Z', 'America/St_Johns')).toBe('2026-10-19T21:30:00-02:30');
    expect(isoInZone('2026-10-20T00:00:00Z', 'UTC')).toBe('2026-10-20T00:00:00+00:00');
  });

  it('midnight is 00, not 24', () => {
    expect(isoInZone('2026-10-21T07:00:00Z', LA)).toBe('2026-10-21T00:00:00-07:00');
  });

  it('missing or invalid → null, never ""', () => {
    expect(isoInZone(null, LA)).toBeNull();
    expect(isoInZone(undefined, LA)).toBeNull();
    expect(isoInZone('', LA)).toBeNull();
    expect(isoInZone('not a date', LA)).toBeNull();
  });

  it('round-trips: the string parses back to the same instant', () => {
    for (const t of ['2026-03-08T10:30:00Z', '2026-07-04T19:00:00Z', '2027-01-01T00:00:00Z']) {
      expect(Date.parse(isoInZone(t, LA)!)).toBe(Date.parse(t));
    }
  });

  it('offsetMinutes', () => {
    expect(offsetMinutes(Date.parse('2026-10-21T17:00:00Z'), LA)).toBe(-420);
    expect(offsetMinutes(Date.parse('2026-12-21T17:00:00Z'), LA)).toBe(-480);
  });
});

describe('agent time: day bounds', () => {
  it('dayStart / dayOf in the zone', () => {
    expect(new Date(dayStart('2026-10-13', LA)).toISOString()).toBe('2026-10-13T07:00:00.000Z');
    expect(new Date(dayStart('2026-11-01', LA)).toISOString()).toBe('2026-11-01T07:00:00.000Z');
    expect(new Date(dayStart('2026-11-02', LA)).toISOString()).toBe('2026-11-02T08:00:00.000Z');
    expect(dayOf(Date.parse('2026-10-22T06:59:00Z'), LA)).toBe('2026-10-21');
  });

  it('bound: a bare "to" day is inclusive (ends at the next day start); timestamps pass through', () => {
    expect(new Date(bound('2026-10-13', LA, 'from')!).toISOString()).toBe('2026-10-13T07:00:00.000Z');
    expect(new Date(bound('2026-11-01', LA, 'to')!).toISOString()).toBe('2026-11-02T08:00:00.000Z');
    expect(bound('2026-10-20T10:00:00-07:00', LA, 'from')).toBe(Date.parse('2026-10-20T17:00:00Z'));
    expect(bound(undefined, LA, 'from')).toBeNull();
    expect(bound('garbage', LA, 'to')).toBeNull();
  });

  it('validZone falls back for an unknown zone', () => {
    expect(validZone(LA)).toBe(LA);
    expect(validZone('Not/AZone')).toBeTruthy();
    expect(validZone('Not/AZone')).not.toBe('Not/AZone');
  });
});
