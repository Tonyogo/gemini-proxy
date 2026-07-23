import { Request } from 'express';
import config from '../config/default';
import { extractTimeoutMs } from '../src/utils/requestHelper';

describe('extractTimeoutMs', () => {
  const originalTimeout = config.upstreamTimeoutMs;

  afterEach(() => {
    config.upstreamTimeoutMs = originalTimeout;
  });

  it('returns default configured timeout when header is missing', () => {
    config.upstreamTimeoutMs = 180000;
    const req = { headers: {} } as Request;
    expect(extractTimeoutMs(req)).toBe(180000);
  });

  it('parses valid x-timeout-ms header', () => {
    const req = {
      headers: { 'x-timeout-ms': '30000' }
    } as unknown as Request;
    expect(extractTimeoutMs(req)).toBe(30000);
  });

  it('allows x-timeout-ms to be 0 to disable timeout', () => {
    const req = {
      headers: { 'x-timeout-ms': '0' }
    } as unknown as Request;
    expect(extractTimeoutMs(req)).toBe(0);
  });

  it('falls back to default when x-timeout-ms is invalid or non-numeric', () => {
    config.upstreamTimeoutMs = 180000;
    const req = {
      headers: { 'x-timeout-ms': 'invalid' }
    } as unknown as Request;
    expect(extractTimeoutMs(req)).toBe(180000);
  });

  it('falls back to default when x-timeout-ms is negative', () => {
    config.upstreamTimeoutMs = 180000;
    const req = {
      headers: { 'x-timeout-ms': '-5000' }
    } as unknown as Request;
    expect(extractTimeoutMs(req)).toBe(180000);
  });
});
