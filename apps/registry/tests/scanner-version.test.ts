import { describe, expect, it } from 'vitest';
import { extractScannerVersion } from '../src/utils/scanner-version.js';

describe('extractScannerVersion', () => {
  it('extracts version from report with scan metadata', () => {
    const report = {
      scan: {
        timestamp: '2025-01-01T00:00:00Z',
        scanner: 'mpak-scanner',
        scanner_version: '0.4.2',
        duration_ms: 1234,
      },
    };
    expect(extractScannerVersion(report)).toBe('0.4.2');
  });

  it('returns null when report is undefined', () => {
    expect(extractScannerVersion(undefined)).toBeNull();
  });

  it('returns null when report is null', () => {
    expect(extractScannerVersion(null)).toBeNull();
  });

  it('returns null when report has no scan key', () => {
    expect(extractScannerVersion({ findings: [] })).toBeNull();
  });

  it('returns null when scan metadata has no scanner_version', () => {
    const report = {
      scan: {
        timestamp: '2025-01-01T00:00:00Z',
        scanner: 'mpak-scanner',
      },
    };
    expect(extractScannerVersion(report)).toBeNull();
  });

  it('returns null for empty report object', () => {
    expect(extractScannerVersion({})).toBeNull();
  });
});
