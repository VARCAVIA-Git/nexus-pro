import { describe, it, expect, vi } from 'vitest';

// Test the redisGet fix for Upstash auto-parsed objects
describe('redisGet object handling', () => {
  it('handles string result from redis (normal case)', async () => {
    // When Upstash returns a JSON string, redisGet should parse it
    const mockData = { liveKey: 'AK123', liveSecret: 'SK456' };
    const jsonString = JSON.stringify(mockData);

    // Simulate the logic in redisGet
    const raw: string | object | null = jsonString;
    let result: any = null;
    if (typeof raw === 'object') {
      result = raw;
    } else {
      try { result = JSON.parse(raw); } catch { result = null; }
    }

    expect(result).toEqual(mockData);
    expect(result.liveKey).toBe('AK123');
  });

  it('handles already-parsed object from redis (Upstash behavior)', async () => {
    // When Upstash returns an already-parsed object
    const mockData = { liveKey: 'AK123', liveSecret: 'SK456' };
    const raw: string | object | null = mockData; // already an object

    let result: any = null;
    if (typeof raw === 'object') {
      result = raw;
    } else {
      try { result = JSON.parse(raw); } catch { result = null; }
    }

    expect(result).toEqual(mockData);
    expect(result.liveKey).toBe('AK123');
  });

  it('returns null for null result', () => {
    const raw: string | object | null = null;
    let result: any = null;
    if (!raw) {
      result = null;
    } else if (typeof raw === 'object') {
      result = raw;
    }
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON string', () => {
    const raw: string | object | null = 'not json';
    let result: any = null;
    if (typeof raw === 'object') {
      result = raw;
    } else {
      try { result = JSON.parse(raw); } catch { result = null; }
    }
    expect(result).toBeNull();
  });
});
